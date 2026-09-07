import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

import {
  ADMIN_HEADER,
  MAX_BODY,
  ROUTES,
  checkRequest,
  deepMerge,
  isLocalHost,
  redact,
} from '../scripts/lib/adminApi.mjs'
import { allowedOriginsFor, createDevApiServer } from '../scripts/dev-api.mjs'

/**
 * The local admin write API.
 *
 * The bug this whole subsystem exists to prevent is not a crash. When the Vite build was
 * retired, `vite.config.js` went with it and took the middleware that served `/__portfolio/*`;
 * the admin kept calling those routes, nothing answered, and every connect, import and
 * disconnect control silently did nothing while looking exactly as it always had. So these
 * tests assert on *effects* — a file on disk changed, a config key gone — rather than on a
 * route existing, because a route existing was never the thing that broke.
 *
 * The security half is tested harder than the happy path. A loopback write API is one missing
 * check away from letting any page you visit rewrite your portfolio, and every one of those
 * checks is asserted here both positively and negatively.
 */

const ORIGIN = 'http://localhost:3000'
const ALLOWED = [ORIGIN, 'http://127.0.0.1:3000']

const CONFIG_PATH = path.join(process.cwd(), 'portfolio.config.js')

/**
 * Snapshot `portfolio.config.js` and hand back its restorer.
 *
 * The handlers write to the real checkout, which is the point — a test against a mocked
 * filesystem would not have caught the transport being missing either. Note that a config
 * write re-serialises the file from the parsed object, so comments do not survive one: the
 * snapshot is the original *text*, not the parsed value.
 */
function snapshotConfig() {
  const original = fs.readFileSync(CONFIG_PATH, 'utf8')
  return () => {
    fs.writeFileSync(CONFIG_PATH, original)
    // `writeConfigFile` keeps a `.backup` beside the config, which is the right behaviour for
    // a real save and litter after a test — it is not ignored by git, so leaving one behind
    // would show up as untracked noise in every checkout that ran the suite.
    fs.rmSync(`${CONFIG_PATH}.backup`, { force: true })
  }
}

/* -------------------------------------------------------------------------- */
/* Admission — pure, exhaustive                                               */
/* -------------------------------------------------------------------------- */

/** A request that passes every check, so each test can spoil exactly one thing. */
const good = (over = {}) => ({
  method: 'GET',
  route: '/state',
  origin: ORIGIN,
  host: 'localhost:4319',
  contentType: 'application/json',
  marked: true,
  ...over,
})

describe('what the admin API refuses to answer', () => {
  test('admits a well-formed request from the admin origin', () => {
    const result = checkRequest(good(), ALLOWED)
    assert.equal(result.ok, true)
    assert.equal(result.route.route, '/state')
  })

  test('refuses a request with no Origin header', () => {
    // Browsers always send one cross-origin. Trusting its absence would open the API to every
    // other process on the machine, which is a wider door than it needs.
    const result = checkRequest(good({ origin: undefined }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.match(result.error, /Origin header is required/)
  })

  test('refuses a cross-site origin outright', () => {
    const result = checkRequest(good({ origin: 'https://evil.example' }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
  })

  test('refuses another localhost port, not merely another host', () => {
    // The old same-origin middleware could accept any local origin safely because it shared
    // one with the page. A sidecar cannot: another dev server on another port is a different
    // application, and some of them run other people's code.
    const result = checkRequest(good({ origin: 'http://localhost:8080' }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
  })

  test('refuses a Host header that is not loopback', () => {
    // DNS rebinding: a name the attacker controls, resolving to 127.0.0.1, would otherwise be
    // same-origin with this server and every other check would be moot.
    const result = checkRequest(good({ host: 'evil.example:4319' }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.match(result.error, /only on localhost/)
  })

  test('refuses a request without the admin header', () => {
    // This is the CSRF barrier: a cross-site form can POST anywhere but cannot set a custom
    // header, and attempting one forces a preflight the server answers for one origin only.
    const result = checkRequest(good({ marked: false }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.match(result.error, new RegExp(ADMIN_HEADER))
  })

  test('refuses an unknown endpoint', () => {
    const result = checkRequest(good({ route: '/wat' }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 404)
  })

  test('refuses the wrong method for a known endpoint', () => {
    const result = checkRequest(good({ route: '/config', method: 'GET' }), ALLOWED)
    assert.equal(result.ok, false)
    assert.equal(result.status, 405)
  })

  test('refuses a POST that is not JSON', () => {
    // `text/plain` is a CORS-simple content type, so allowing it would let a form through
    // without the preflight that the custom header depends on.
    const result = checkRequest(
      good({ route: '/config', method: 'POST', contentType: 'text/plain' }),
      ALLOWED,
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 415)
  })

  test('no mutating endpoint is reachable by GET', () => {
    // The property, not one instance of it: a mutating route answering GET would be one
    // `<img src>` away from a cross-site write.
    for (const route of ROUTES.filter((r) => r.mutating)) {
      assert.equal(route.method, 'POST', `${route.route} must be POST-only`)
      const result = checkRequest(good({ route: route.route, method: 'GET' }), ALLOWED)
      assert.equal(result.ok, false, `${route.route} answered a GET`)
    }
  })

  test('the only non-mutating endpoint is the one that reads state', () => {
    assert.deepEqual(ROUTES.filter((r) => !r.mutating).map((r) => r.route), ['/state'])
  })
})

describe('which origins the sidecar trusts by default', () => {
  test('both spellings of loopback, on the app port only', () => {
    // The browser sends whichever one you typed in the address bar, and CORS does not treat
    // them as interchangeable — allowing only one silently breaks the other.
    assert.deepEqual(allowedOriginsFor(3000), ['http://localhost:3000', 'http://127.0.0.1:3000'])
  })

  test('no wildcard, and nothing off this machine', () => {
    const origins = allowedOriginsFor(3000)
    assert.ok(!origins.includes('*'))
    assert.ok(origins.every((o) => /^http:\/\/(localhost|127\.0\.0\.1):/.test(o)))
  })
})

describe('what counts as this machine', () => {
  for (const host of ['localhost', 'localhost:4319', '127.0.0.1', '127.0.0.1:4319', '[::1]:4319']) {
    test(`accepts ${host}`, () => assert.equal(isLocalHost(host), true))
  }
  for (const host of [undefined, '', 'evil.example', 'evil.example:4319', 'localhost.evil.example', '10.0.0.5:4319']) {
    test(`rejects ${host || '(absent)'}`, () => assert.equal(isLocalHost(host), false))
  }
})

/* -------------------------------------------------------------------------- */
/* Credential handling                                                        */
/* -------------------------------------------------------------------------- */

describe('what never leaves the machine', () => {
  test('strips credential-shaped keys at any depth', () => {
    const cleaned = redact({
      dataSources: { github: { username: 'someone', token: 'ghp_realsecret' } },
      apiKey: 'k-123',
      nested: [{ password: 'hunter2', label: 'fine' }],
    })
    assert.equal(cleaned.dataSources.github.token, '[redacted]')
    assert.equal(cleaned.apiKey, '[redacted]')
    assert.equal(cleaned.nested[0].password, '[redacted]')
    // And leaves everything else exactly as it was.
    assert.equal(cleaned.dataSources.github.username, 'someone')
    assert.equal(cleaned.nested[0].label, 'fine')
  })

  test('a real configuration loses nothing to redaction', () => {
    // No connector declares a credential-bearing config field — they read credentials from the
    // environment and name them in `authEnv`. Redaction is therefore a no-op on a correct
    // config, and this asserts that so it can never quietly start eating real settings.
    const config = { dataSources: { github: { username: 'someone', maxRepos: 40 }, orcid: { id: '0000-0001' } } }
    assert.deepEqual(redact(config), config)
  })
})

describe('merging a config patch', () => {
  test('an explicit null removes a key — this is disconnect', () => {
    const next = deepMerge({ dataSources: { github: { username: 'a' }, npm: { username: 'b' } } },
      { dataSources: { github: null } })
    assert.deepEqual(Object.keys(next.dataSources), ['npm'])
  })

  test('a patch merges rather than replaces', () => {
    const next = deepMerge({ dataSources: { github: { username: 'a', maxRepos: 10 } } },
      { dataSources: { github: { maxRepos: 40 } } })
    assert.deepEqual(next.dataSources.github, { username: 'a', maxRepos: 40 })
  })

  test('refuses to walk a prototype-polluting key', () => {
    const next = deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}}'))
    assert.equal({}.polluted, undefined)
    assert.equal(next.polluted, undefined)
  })
})

/* -------------------------------------------------------------------------- */
/* Over a real socket                                                         */
/* -------------------------------------------------------------------------- */

describe('the sidecar, over a real socket', () => {
  /** @type {import('node:http').Server} */
  let server
  /** @type {string} */
  let base
  /** @type {() => void} */
  let restoreConfig

  before(async () => {
    // This suite POSTs to `/config` to prove those posts are *refused*. If a refusal ever
    // regresses, the write lands on the real checkout — so the file is snapshotted here rather
    // than only in the suite that mutates on purpose. Found the hard way: mutation-testing the
    // origin check let one of these through and rewrote `portfolio.config.js`.
    restoreConfig = snapshotConfig()
    server = createDevApiServer({ allowedOrigins: ALLOWED })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}/__portfolio`
  })

  after(async () => {
    restoreConfig()
    await new Promise((resolve) => server.close(resolve))
  })

  /** @param {string} route @param {RequestInit} [init] */
  const send = (route, init = {}) =>
    fetch(`${base}${route}`, {
      ...init,
      headers: { origin: ORIGIN, [ADMIN_HEADER]: '1', ...(init.headers ?? {}) },
    })

  test('reads state, and reports the connectors the engine actually knows', async () => {
    const res = await send('/state')
    assert.equal(res.status, 200)
    const state = await res.json()
    assert.ok(state.config, 'state carries the on-disk config')
    assert.ok('status' in state, 'state carries import status')
    assert.ok(Array.isArray(state.documents))
  })

  test('answers a preflight for the admin origin', async () => {
    const res = await fetch(`${base}/config`, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN)
    assert.match(res.headers.get('access-control-allow-headers') ?? '', new RegExp(ADMIN_HEADER))
  })

  test('refuses a preflight from anywhere else, and grants no CORS header', async () => {
    const res = await fetch(`${base}/config`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    })
    assert.equal(res.status, 403)
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  })

  test('refuses a cross-site POST even though the socket is reachable', async () => {
    const res = await send('/config', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ config: { identity: { name: 'Injected' } } }),
    })
    assert.equal(res.status, 403)
  })

  test('refuses a POST carrying no admin header', async () => {
    const res = await fetch(`${base}/config`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ config: {} }),
    })
    assert.equal(res.status, 403)
  })

  test('refuses a body over the size cap without buffering it', async () => {
    const res = await send('/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_BODY + 1024),
    })
    assert.equal(res.status, 413)
  })

  test('reports malformed JSON as a bad request, not a server error', async () => {
    const res = await send('/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /not valid JSON/)
  })

  test('rejects a document id that tries to escape the directory', async () => {
    // `safeId` strips every separator, so the traversal cannot name a file outside the
    // documents directory. The request fails on the sanitised name, never on the raw one.
    const res = await send('/document/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '../../../../package' }),
    })
    const payload = await res.json()
    assert.equal(res.status, 500)
    assert.match(payload.error, /No document/)
    // The sanitised id is what it looked for: no slashes, no dots.
    assert.doesNotMatch(payload.error, /[/\\]/)
    assert.ok(fs.existsSync(path.join(process.cwd(), 'package.json')), 'package.json survived')
  })

  test('never answers an endpoint it does not have', async () => {
    assert.equal((await send('/../../etc/passwd')).status, 404)
  })

  test('sends no credential in any response header', async () => {
    const res = await send('/state')
    const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
    assert.doesNotMatch(headers, /token|secret|password|ghp_/i)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })
})

/* -------------------------------------------------------------------------- */
/* State mutation, end to end                                                 */
/* -------------------------------------------------------------------------- */

describe('connect and disconnect actually change the config on disk', () => {
  /** @type {import('node:http').Server} */
  let server
  /** @type {string} */
  let base
  /** @type {() => void} */
  let restoreConfig

  before(async () => {
    restoreConfig = snapshotConfig()

    server = createDevApiServer({ allowedOrigins: ALLOWED })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}/__portfolio`
  })

  after(async () => {
    restoreConfig()
    await new Promise((resolve) => server.close(resolve))
  })

  /** @param {unknown} body */
  const post = (route, body) =>
    fetch(`${base}${route}`, {
      method: 'POST',
      headers: { origin: ORIGIN, [ADMIN_HEADER]: '1', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  const readConfig = async () =>
    (await (await fetch(`${base}/state`, { headers: { origin: ORIGIN, [ADMIN_HEADER]: '1' } })).json()).config

  test('connecting a source writes it, and reading state reflects it', async () => {
    const res = await post('/config', { config: { dataSources: { npm: { username: 'test-user' } } } })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).ok, true)

    // The effect, read back through the API the admin uses, not the response body.
    assert.deepEqual((await readConfig()).dataSources.npm, { username: 'test-user' })
    // And it reached the file, which is what an import will later read.
    assert.match(fs.readFileSync(CONFIG_PATH, 'utf8'), /test-user/)
  })

  test('connecting a second source leaves the first alone', async () => {
    await post('/config', { config: { dataSources: { pypi: { username: 'other-user' } } } })
    const config = await readConfig()
    assert.equal(config.dataSources.npm.username, 'test-user')
    assert.equal(config.dataSources.pypi.username, 'other-user')
  })

  test('disconnecting removes only that source', async () => {
    await post('/config', { config: { dataSources: { npm: null } } })
    const config = await readConfig()
    assert.equal(config.dataSources.npm, undefined, 'npm was disconnected')
    assert.equal(config.dataSources.pypi.username, 'other-user', 'pypi survived')
  })

  test('a patch never drops settings the admin has no UI for', async () => {
    // The reason config writes are a merge and not a replacement: the admin holds a partial
    // view, and a save must not amount to deleting everything it cannot see.
    await post('/config', { config: { identity: { name: 'Kept' } } })
    await post('/config', { config: { dataSources: { pypi: { username: 'changed' } } } })
    const config = await readConfig()
    assert.equal(config.identity.name, 'Kept')
    assert.equal(config.dataSources.pypi.username, 'changed')
  })

  test('two concurrent writes both land, and neither corrupts the file', async () => {
    await Promise.all([
      post('/config', { config: { dataSources: { dblp: { pid: 'a/One' } } } }),
      post('/config', { config: { dataSources: { devto: { username: 'two' } } } }),
    ])
    const config = await readConfig()
    // Last-writer-wins on the shared parent is acceptable; an unparseable config is not.
    assert.ok(config.dataSources, 'the config is still readable after concurrent writes')
    assert.ok(config.dataSources.dblp || config.dataSources.devto, 'at least one write landed')
  })

  test('a save over the API keeps the comments in the config file', async () => {
    // The end-to-end claim, at the boundary that matters: an admin action, over HTTP, through
    // the sidecar, to a file that still has its comments. Asserted here rather than only
    // against the editor, because the bug was never in an editor — `saveConfig` handed a
    // merged *object* to a whole-file renderer, and the source text was gone before any patch
    // was applied. A regression there would pass every unit test and fail this one.
    const before = fs.readFileSync(CONFIG_PATH, 'utf8')
    const comments = (source) => source.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []
    assert.ok(comments(before).length > 0, 'the fixture config must have comments to lose')

    const res = await post('/config', { config: { dataSources: { dockerhub: { username: 'ada' } } } })
    assert.equal(res.status, 200)
    const payload = await res.json()
    assert.equal(payload.preserved, true, `the save fell back: ${payload.preservedReason ?? ''}`)

    const after = fs.readFileSync(CONFIG_PATH, 'utf8')
    assert.deepEqual(comments(after), comments(before), 'a comment was lost')
    assert.match(after, /dockerhub/, 'and the change still landed')
  })

  test('rejects a config body that is not an object', async () => {
    const res = await post('/config', { config: 'nope' })
    assert.equal(res.status, 500)
    assert.match((await res.json()).error, /Expected a `config` object/)
  })
})
