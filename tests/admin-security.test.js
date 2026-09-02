import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  WRITABLE_PATHS, MAX_PAYLOAD_BYTES, SESSION_TTL_SECONDS,
  isWritablePath, sign, verify, mayWrite, validateSave, originAllowed,
} from '../workers/admin/src/security.js'
import { appJwt, commitFiles, identify, GitHubError } from '../workers/admin/src/github.js'
import { filesToPublish } from '../src/admin/publish.js'

/**
 * The admin API's threat model, as executable assertions.
 *
 * This is the suite that matters most in the repository. Everything else here decides how a
 * portfolio looks; this decides whether a stranger can commit to it. Each `describe` below
 * maps to a threat rather than to a function, because the question worth answering is not
 * "does `verify` work" but "can an unauthenticated request write a file".
 *
 * Nothing here reaches the network. The GitHub client takes an injectable `fetch`, so the
 * commit path — including the concurrency guard and the ordering of blob/tree/commit/ref — is
 * exercised against a scripted API rather than a real repository.
 */

const SECRET = 'a'.repeat(48)
const OTHER_SECRET = 'b'.repeat(48)
const SESSION = { sub: 'ada', uid: 1, repo: 'ada/portfolio', installation: 42 }

const request = (headers = {}) => new Request('https://api.test/api/save', { method: 'POST', headers })

describe('the writable path allowlist', () => {
  test('accepts exactly the three data files and nothing else', () => {
    assert.deepEqual([...WRITABLE_PATHS], [
      'src/data/manual.json', 'src/data/overrides.json', 'src/data/config.json',
    ])
  })

  test('never accepts a file the build executes', () => {
    // The distinction the allowlist exists to enforce: JSON is data the build reads, and
    // JavaScript is code the build runs. A write to the latter is a deploy-time RCE.
    for (const path of WRITABLE_PATHS) assert.match(path, /\.json$/)
    assert.equal(isWritablePath('portfolio.config.js'), false)
    assert.equal(isWritablePath('vite.config.js'), false)
    assert.equal(isWritablePath('.github/workflows/deploy.yml'), false)
    assert.equal(isWritablePath('package.json'), false)
  })

  test('cannot be traversed out of', () => {
    for (const attempt of [
      'src/data/../../.github/workflows/deploy.yml',
      'src/data/./overrides.json',
      '/src/data/overrides.json',
      'src/data/overrides.json/../../../etc/passwd',
      '../overrides.json',
      'src\\data\\overrides.json',
      'SRC/DATA/OVERRIDES.JSON',
    ]) {
      assert.equal(isWritablePath(attempt), false, attempt)
    }
  })

  test('rejects non-strings rather than coercing them', () => {
    for (const value of [null, undefined, 0, {}, [], ['src/data/overrides.json']]) {
      assert.equal(isWritablePath(value), false)
    }
  })
})

describe('sessions', () => {
  test('a signed session round-trips', async () => {
    const token = await sign(SESSION, SECRET, SESSION_TTL_SECONDS)
    const claims = await verify(token, SECRET)
    assert.equal(claims.sub, 'ada')
    assert.equal(claims.repo, 'ada/portfolio')
  })

  test('a session signed with another secret is rejected', async () => {
    const token = await sign(SESSION, OTHER_SECRET, SESSION_TTL_SECONDS)
    assert.equal(await verify(token, SECRET), null)
  })

  test('an expired session is rejected', async () => {
    const issued = Date.now()
    const token = await sign(SESSION, SECRET, 60, issued)
    assert.ok(await verify(token, SECRET, issued + 30_000))
    assert.equal(await verify(token, SECRET, issued + 61_000), null)
  })

  test('a session whose payload was edited is rejected', async () => {
    const token = await sign(SESSION, SECRET, SESSION_TTL_SECONDS)
    const [, signature] = token.split('.')
    // Re-encode the payload with a different repository and keep the original signature —
    // the exact move an attacker makes when a token is only base64 and not authenticated.
    const forged = Buffer.from(JSON.stringify({ ...SESSION, repo: 'attacker/evil', exp: 2 ** 40 }))
      .toString('base64url')
    assert.equal(await verify(`${forged}.${signature}`, SECRET), null)
  })

  test('garbage is rejected without throwing', async () => {
    for (const value of [null, undefined, '', 'nodot', 'a.b', '.', '..', 'x'.repeat(5000), 42, {}]) {
      assert.equal(await verify(value, SECRET), null, String(value))
    }
  })

  test('a payload with no expiry is rejected even when correctly signed', async () => {
    // `sign` always adds one, so this can only arrive from a caller that built a token by hand.
    const encoded = Buffer.from(JSON.stringify({ sub: 'ada' })).toString('base64url')
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded))
    const token = `${encoded}.${Buffer.from(sig).toString('base64url')}`
    assert.equal(await verify(token, SECRET), null)
  })

  test('a weak secret is refused at signing time rather than accepted quietly', async () => {
    await assert.rejects(() => sign(SESSION, 'short', 60))
  })
})

describe('authorization', () => {
  test('a valid session may write only its own repository', () => {
    assert.equal(mayWrite(SESSION, 'ada/portfolio'), true)
    assert.equal(mayWrite(SESSION, 'ada/other'), false)
    assert.equal(mayWrite(SESSION, 'attacker/evil'), false)
  })

  test('no session means no write', () => {
    assert.equal(mayWrite(null, 'ada/portfolio'), false)
    assert.equal(mayWrite(undefined, 'ada/portfolio'), false)
    assert.equal(mayWrite({}, 'ada/portfolio'), false)
  })

  test('an identity without an installation is not an authorization', () => {
    // Anyone can sign in with GitHub. Only someone who installed the App on the repository
    // can write to it, and the installation id is the only proof of that.
    const { installation, ...identityOnly } = SESSION
    assert.equal(mayWrite(identityOnly, 'ada/portfolio'), false)
  })

  test('a repository named in the request cannot override the one in the session', () => {
    // Guarding the shape of the check itself: `mayWrite` takes the repository from the
    // Worker's configuration, and there is no code path that passes a request-supplied value.
    const source = readWorkerSource()
    assert.match(source, /mayWrite\(claims, config\.repository\)/)
    assert.doesNotMatch(source, /mayWrite\([^,]+,\s*body\./)
  })
})

describe('payload validation', () => {
  const file = (path, content = '{}') => ({ files: [{ path, content }] })

  test('accepts a well-formed save', () => {
    const result = validateSave(file('src/data/overrides.json', '{"hidden":{}}'))
    assert.equal(result.ok, true)
    assert.equal(result.files.length, 1)
  })

  test('refuses any path outside the allowlist', () => {
    for (const path of ['portfolio.config.js', '.github/workflows/deploy.yml', 'src/data/../x.json']) {
      assert.equal(validateSave(file(path)).ok, false, path)
    }
  })

  test('refuses malformed envelopes', () => {
    for (const payload of [null, undefined, 'string', 42, [], {}, { files: {} }, { files: [] }, { files: [null] }]) {
      assert.equal(validateSave(payload).ok, false, JSON.stringify(payload))
    }
  })

  test('refuses content that is not a JSON object', () => {
    assert.equal(validateSave(file('src/data/manual.json', 'not json')).ok, false)
    assert.equal(validateSave(file('src/data/manual.json', '[1,2,3]')).ok, false)
    assert.equal(validateSave(file('src/data/manual.json', 'null')).ok, false)
    assert.equal(validateSave(file('src/data/manual.json', '"a string"')).ok, false)
    assert.equal(validateSave(file('src/data/manual.json', 42)).ok, false)
  })

  test('refuses an oversized payload', () => {
    const huge = `{"a":"${'x'.repeat(MAX_PAYLOAD_BYTES + 10)}"}`
    assert.equal(validateSave(file('src/data/manual.json', huge)).ok, false)
  })

  test('measures size across the whole request, not per file', () => {
    // Three files each just under the limit would otherwise pass and commit 1.5 MB.
    const each = `{"a":"${'x'.repeat(Math.floor(MAX_PAYLOAD_BYTES * 0.4))}"}`
    const result = validateSave({ files: WRITABLE_PATHS.map((path) => ({ path, content: each })) })
    assert.equal(result.ok, false)
  })

  test('refuses duplicate targets', () => {
    const result = validateSave({
      files: [
        { path: 'src/data/manual.json', content: '{"a":1}' },
        { path: 'src/data/manual.json', content: '{"a":2}' },
      ],
    })
    assert.equal(result.ok, false)
  })

  test('refuses more files than there are writable paths', () => {
    const files = [...WRITABLE_PATHS, 'src/data/overrides.json'].map((path) => ({ path, content: '{}' }))
    assert.equal(validateSave({ files }).ok, false)
  })

  test('a prototype-pollution attempt is data, not behaviour', () => {
    const result = validateSave(file('src/data/overrides.json', '{"__proto__":{"admin":true}}'))
    // It is allowed through — it is valid JSON, and `JSON.parse` does not pollute. What
    // matters is that parsing the payload did not change this process.
    assert.equal(result.ok, true)
    assert.equal({}.admin, undefined)
  })
})

describe('CSRF', () => {
  test('a matching Origin is allowed', () => {
    assert.equal(originAllowed(request({ origin: 'https://ada.github.io' }), 'https://ada.github.io'), true)
  })

  test('a foreign Origin is refused', () => {
    assert.equal(originAllowed(request({ origin: 'https://evil.example' }), 'https://ada.github.io'), false)
  })

  test('a lookalike Origin is refused', () => {
    for (const origin of [
      'https://ada.github.io.evil.example',
      'http://ada.github.io',
      'https://ada.github.io:8443',
      'null',
    ]) {
      assert.equal(originAllowed(request({ origin }), 'https://ada.github.io'), false, origin)
    }
  })

  test('a request with neither Origin nor Referer is refused', () => {
    assert.equal(originAllowed(request(), 'https://ada.github.io'), false)
  })

  test('Referer is the fallback and is compared by origin, not prefix', () => {
    assert.equal(originAllowed(request({ referer: 'https://ada.github.io/admin.html' }), 'https://ada.github.io'), true)
    assert.equal(originAllowed(request({ referer: 'https://evil.example/?https://ada.github.io' }), 'https://ada.github.io'), false)
    assert.equal(originAllowed(request({ referer: 'not a url' }), 'https://ada.github.io'), false)
  })
})

describe('the Worker never leaks a credential', () => {
  test('no route returns a token, a secret, or a private key', () => {
    const source = readWorkerSource()
    // Every `json(...)` response body in the handler, checked for the words that would mean a
    // credential reached the browser.
    for (const forbidden of [/GITHUB_PRIVATE_KEY[^)]*\)\s*}/, /token:\s*token/, /secret:\s*config\.secret/]) {
      assert.doesNotMatch(source, forbidden)
    }
    // The session response is enumerated explicitly rather than spread from `claims`, so a
    // future field added to the session cannot silently become a public one.
    assert.doesNotMatch(source, /\.\.\.claims/)
  })

  test('the client bundle contains no credential names at all', () => {
    const client = readFileText('src/admin/publish.js')
    for (const name of ['client_secret', 'GITHUB_PRIVATE_KEY', 'SESSION_SECRET', 'installationToken']) {
      assert.ok(!client.includes(name), `${name} must not appear in the browser client`)
    }
  })
})

describe('committing', () => {
  /** A scripted GitHub, so the commit sequence can be asserted without a repository. */
  function fakeGitHub({ head = 'HEAD1', treeSha = 'TREE_NEW', baseTree = 'TREE_OLD' } = {}) {
    const calls = []
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null })
      const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' })

      if (url.includes('/git/ref/heads/')) return ok({ object: { sha: head } })
      if (url.includes('/git/commits/HEAD')) return ok({ tree: { sha: baseTree } })
      if (url.endsWith('/git/blobs')) return ok({ sha: `BLOB${calls.length}` })
      if (url.endsWith('/git/trees')) return ok({ sha: treeSha })
      if (url.endsWith('/git/commits')) return ok({ sha: 'COMMIT_NEW' })
      if (url.includes('/git/refs/heads/')) return ok({})
      throw new Error(`unexpected ${url}`)
    }
    return { fetchImpl, calls }
  }

  const files = [{ path: 'src/data/overrides.json', content: '{"a":1}' }]
  const base = { token: 't', owner: 'ada', repo: 'portfolio', branch: 'main', files, message: 'm' }

  test('writes every file in a single commit', async () => {
    const { fetchImpl, calls } = fakeGitHub()
    const result = await commitFiles({
      ...base,
      files: [
        { path: 'src/data/overrides.json', content: '{"a":1}' },
        { path: 'src/data/config.json', content: '{"b":2}' },
      ],
      fetchImpl,
    })
    assert.equal(result.commit, 'COMMIT_NEW')
    assert.equal(calls.filter((c) => c.url.endsWith('/git/commits') && c.method === 'POST').length, 1)
    assert.equal(calls.filter((c) => c.url.endsWith('/git/blobs')).length, 2)
  })

  test('refuses when the branch moved since the editor loaded', async () => {
    const { fetchImpl, calls } = fakeGitHub({ head: 'HEAD_MOVED' })
    await assert.rejects(
      () => commitFiles({ ...base, expectedHead: 'HEAD1', fetchImpl }),
      (error) => error instanceof GitHubError && error.status === 409,
    )
    // And it stopped before writing anything.
    assert.equal(calls.filter((c) => c.method === 'POST').length, 0)
  })

  test('never force-updates the branch', async () => {
    const { fetchImpl, calls } = fakeGitHub()
    await commitFiles({ ...base, fetchImpl })
    const update = calls.find((c) => c.url.includes('/git/refs/heads/'))
    assert.equal(update.body.force, false)
  })

  test('an unchanged tree produces no commit', async () => {
    const { fetchImpl, calls } = fakeGitHub({ treeSha: 'TREE_OLD', baseTree: 'TREE_OLD' })
    const result = await commitFiles({ ...base, fetchImpl })
    assert.equal(result.unchanged, true)
    assert.equal(calls.filter((c) => c.url.endsWith('/git/commits') && c.method === 'POST').length, 0)
  })

  test('content is uploaded base64-encoded so non-ASCII survives', async () => {
    const { fetchImpl, calls } = fakeGitHub()
    await commitFiles({ ...base, files: [{ path: 'src/data/manual.json', content: '{"n":"İpek Yıldırım"}' }], fetchImpl })
    const blob = calls.find((c) => c.url.endsWith('/git/blobs'))
    assert.equal(blob.body.encoding, 'base64')
    assert.equal(Buffer.from(blob.body.content, 'base64').toString('utf8'), '{"n":"İpek Yıldırım"}')
  })

  test('a GitHub failure surfaces as a GitHubError, not a crash', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'down' })
    await assert.rejects(() => commitFiles({ ...base, fetchImpl }), GitHubError)
  })

  test('a 200 response with an OAuth error is a failed sign-in, not a successful one', async () => {
    // GitHub answers a replayed or expired code with HTTP 200 and an `error` field.
    const fetchImpl = async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ error: 'bad_verification_code', error_description: 'The code is incorrect.' }),
    })
    await assert.rejects(
      () => identify({ clientId: 'c', clientSecret: 's' }, 'code', fetchImpl),
      (error) => error instanceof GitHubError && error.status === 401,
    )
  })
})

describe('App authentication', () => {
  test('a PKCS#1 key is refused with the command that fixes it', async () => {
    await assert.rejects(
      () => appJwt({ appId: '1', privateKey: '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----' }),
      (error) => error instanceof GitHubError && /openssl pkcs8/.test(error.message),
    )
  })

  test('an empty key is refused rather than producing an unsigned JWT', async () => {
    await assert.rejects(() => appJwt({ appId: '1', privateKey: '' }), GitHubError)
  })
})

describe('the client only ever asks for allowed paths', () => {
  const builder = { overrides: { hidden: { projects: ['x'] } }, configDraft: { theme: { accent: '#f00' } } }

  test('every file it proposes is on the allowlist', () => {
    for (const file of filesToPublish(builder)) assert.ok(isWritablePath(file.path), file.path)
  })

  test('unchanged files are not proposed', () => {
    const committed = {
      'src/data/overrides.json': `${JSON.stringify(builder.overrides, null, 2)}\n`,
      'src/data/config.json': `${JSON.stringify(builder.configDraft, null, 2)}\n`,
    }
    assert.deepEqual(filesToPublish(builder, committed), [])
  })

  test('reformatting is not a change', () => {
    // Same values, different key order and indentation — publishing this would show the user
    // a diff they did not create.
    const committed = {
      'src/data/overrides.json': JSON.stringify({ hidden: { projects: ['x'] } }),
      'src/data/config.json': JSON.stringify({ theme: { accent: '#f00' } }),
    }
    assert.deepEqual(filesToPublish(builder, committed), [])
  })

  test('a file that is malformed on disk is proposed, so publishing repairs it', () => {
    const committed = { 'src/data/overrides.json': '{ broken', 'src/data/config.json': null }
    assert.equal(filesToPublish(builder, committed).length, 2)
  })

  test('what it produces passes the Worker\'s own validation', () => {
    assert.equal(validateSave({ files: filesToPublish(builder) }).ok, true)
  })

  test('a draft extends what is committed rather than replacing it', () => {
    // The draft is only what *this* browser changed. Publishing it verbatim would delete an
    // accent colour set from a laptop the moment anything was changed from a phone.
    const committed = {
      'src/data/config.json': JSON.stringify({ theme: { accent: '#00f' }, layout: { shell: 'stacked' } }),
    }
    const onlyTheme = { overrides: {}, configDraft: { theme: { accent: '#f00' } } }
    const [config] = filesToPublish(onlyTheme, committed)
      .filter((f) => f.path === 'src/data/config.json')

    const published = JSON.parse(config.content)
    assert.equal(published.theme.accent, '#f00', 'the edit must win')
    assert.equal(published.layout.shell, 'stacked', 'the untouched setting must survive')
  })

  test('override buckets merge rather than overwrite', () => {
    const committed = {
      'src/data/overrides.json': JSON.stringify({ hidden: { projects: ['old'] }, identity: { name: 'Ada' } }),
    }
    const draft = { overrides: { hidden: { projects: ['new'] } }, configDraft: {} }
    const [file] = filesToPublish(draft, committed).filter((f) => f.path === 'src/data/overrides.json')

    const published = JSON.parse(file.content)
    assert.deepEqual(published.hidden.projects.sort(), ['new', 'old'])
    assert.equal(published.identity.name, 'Ada', 'an untouched bucket must survive')
  })
})

/* -------------------------------------------------------------------------- */

// Read rather than imported: these assertions are about the source text, and importing a
// Worker module for its behaviour would not catch a credential added to a template string.
const readFileText = (relative) => readFileSync(join(import.meta.dirname, '..', relative), 'utf8')

const readWorkerSource = () => readFileText('workers/admin/src/index.js')
