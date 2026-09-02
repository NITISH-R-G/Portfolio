import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import worker from '../workers/admin/src/index.js'
import { sign, SESSION_TTL_SECONDS, MAX_PAYLOAD_BYTES } from '../workers/admin/src/security.js'

/**
 * The Worker's security boundary, exercised through its actual `fetch` handler.
 *
 * `admin-security.test.js` tests the decisions; this tests the *server*. Requests go in as real
 * `Request` objects and responses come back as real `Response` objects, through the same
 * routing, cookie parsing, ordering and error handling that runs in production. Everything the
 * handler needs — `crypto.subtle`, `Request`, `Response`, `btoa` — is a Web API that Node has,
 * so no emulator is involved and nothing is stubbed except the network.
 *
 * The distinction matters because a boundary can be correct in its parts and wrong in its
 * assembly: a check that exists but runs after the write, an error path that leaks a field, a
 * route that forgets to look at the cookie at all. Those only show up end to end.
 *
 * ## What this cannot cover
 *
 * Anything requiring a real GitHub App: the OAuth code exchange, the installation lookup, token
 * minting, and the commit itself. `globalThis.fetch` is replaced with a stub that fails loudly,
 * so a request that unexpectedly reached the network fails the test rather than passing
 * quietly — every case below is asserted to be refused *before* GitHub is touched.
 */

const SECRET = 'x'.repeat(48)
const ORIGIN = 'https://ada.github.io'

/**
 * A throwaway RSA key, in the format GitHub's would be in after the documented `openssl`
 * conversion.
 *
 * Generated rather than faked because one case below needs the Worker to get far enough to
 * actually sign a JWT and reach for a GitHub URL — which is the only way to assert *which*
 * repository it reached for. A placeholder string fails at key import, and a test that stops
 * there proves nothing about routing.
 */
async function generatePkcs8Pem() {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )
  const der = await crypto.subtle.exportKey('pkcs8', privateKey)
  const body = Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

const ENV = {
  GITHUB_APP_ID: '123',
  // Filled in by `before`, since generating a key is asynchronous.
  GITHUB_PRIVATE_KEY: '',
  GITHUB_CLIENT_ID: 'Iv1.test',
  GITHUB_CLIENT_SECRET: 'shh',
  SESSION_SECRET: SECRET,
  ADMIN_ORIGIN: ORIGIN,
  REPOSITORY: 'ada/portfolio',
  BRANCH: 'main',
}

/** Every network call is a test failure unless a case opts into one. */
let networkCalls = []
let realFetch

before(async () => {
  ENV.GITHUB_PRIVATE_KEY = await generatePkcs8Pem()
  realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    networkCalls.push(String(url))
    throw new Error(`unexpected network call to ${url}`)
  }
})

after(() => { globalThis.fetch = realFetch })

const session = (overrides = {}) => sign(
  { sub: 'ada', uid: 1, repo: 'ada/portfolio', installation: 42, ...overrides },
  SECRET, SESSION_TTL_SECONDS,
)

/**
 * @param {object} options
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
async function call({ path = '/api/save', method = 'POST', cookie, origin = ORIGIN, body, raw, headers = {} }) {
  networkCalls = []
  const request = new Request(`https://admin.workers.dev${path}`, {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(method === 'GET' ? {} : { body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }),
  })

  const response = await worker.fetch(request, ENV)
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: response.status, body: parsed, headers: response.headers, text }
}

const validSave = { files: [{ path: 'src/data/overrides.json', content: '{"hidden":{}}' }] }

/** Asserts a rejection happened without GitHub being contacted. */
function refusedBeforeGitHub(result, status) {
  assert.equal(result.status, status, `body: ${JSON.stringify(result.body)}`)
  assert.deepEqual(networkCalls, [], 'the request must be refused before any GitHub call')
}

describe('a request with no session cannot write', () => {
  test('POST /api/save with no cookie is 401', async () => {
    refusedBeforeGitHub(await call({ body: validSave }), 401)
  })

  test('a session signed with the wrong secret is 401', async () => {
    const forged = await sign({ sub: 'mallory', repo: 'ada/portfolio', installation: 42 }, 'y'.repeat(48), 3600)
    refusedBeforeGitHub(await call({ cookie: `__Host-portfolio_admin=${forged}`, body: validSave }), 401)
  })

  test('an expired session is 401', async () => {
    const stale = await sign(
      { sub: 'ada', repo: 'ada/portfolio', installation: 42 }, SECRET, 60, Date.now() - 120_000,
    )
    refusedBeforeGitHub(await call({ cookie: `__Host-portfolio_admin=${stale}`, body: validSave }), 401)
  })

  test('a session for another repository is 401', async () => {
    const other = await session({ repo: 'mallory/evil' })
    refusedBeforeGitHub(await call({ cookie: `__Host-portfolio_admin=${other}`, body: validSave }), 401)
  })

  test('a signed-in user with no installation is 401', async () => {
    // Anyone can complete a GitHub sign-in. Only an installation makes it an authorization.
    const identityOnly = await sign({ sub: 'mallory', uid: 9, repo: 'ada/portfolio' }, SECRET, 3600)
    refusedBeforeGitHub(await call({ cookie: `__Host-portfolio_admin=${identityOnly}`, body: validSave }), 401)
  })

  test('GET /api/session reports signed-out rather than erroring', async () => {
    const result = await call({ path: '/api/session', method: 'GET' })
    assert.equal(result.status, 200)
    assert.equal(result.body.authenticated, false)
    assert.deepEqual(networkCalls, [], 'no session means no reason to ask GitHub anything')
  })
})

describe('CSRF', () => {
  test('a cross-site POST is refused even with a valid session', async () => {
    const cookie = `__Host-portfolio_admin=${await session()}`
    refusedBeforeGitHub(await call({ cookie, origin: 'https://evil.example', body: validSave }), 403)
  })

  test('a request with no Origin and no Referer is refused', async () => {
    const cookie = `__Host-portfolio_admin=${await session()}`
    refusedBeforeGitHub(await call({ cookie, origin: null, body: validSave }), 403)
  })

  test('the origin check runs before the session check', async () => {
    // Ordering, not just presence: a foreign origin must be turned away without the Worker
    // doing any work on its behalf.
    const result = await call({ origin: 'https://evil.example', body: validSave })
    assert.equal(result.status, 403)
    assert.match(String(result.body.error), /origin/i)
  })

  test('a lookalike origin is refused', async () => {
    const cookie = `__Host-portfolio_admin=${await session()}`
    for (const origin of ['https://ada.github.io.evil.example', 'http://ada.github.io', 'null']) {
      refusedBeforeGitHub(await call({ cookie, origin, body: validSave }), 403)
    }
  })
})

describe('the write boundary', () => {
  let cookie
  before(async () => { cookie = `__Host-portfolio_admin=${await session()}` })

  test('a traversal path is refused', async () => {
    for (const path of [
      'src/data/../../.github/workflows/deploy.yml',
      '../../.github/workflows/deploy.yml',
      'src/data/./overrides.json',
      '/src/data/overrides.json',
      'src/data/overrides.json/../../../etc/passwd',
    ]) {
      const result = await call({ cookie, body: { files: [{ path, content: '{}' }] } })
      refusedBeforeGitHub(result, 400)
      assert.match(String(result.body.error), /Refusing to write/)
    }
  })

  test('an executable file is refused', async () => {
    for (const path of ['portfolio.config.js', 'vite.config.js', 'package.json', '.github/workflows/deploy.yml']) {
      refusedBeforeGitHub(await call({ cookie, body: { files: [{ path, content: '{}' }] } }), 400)
    }
  })

  test('malformed JSON in the request body is refused', async () => {
    refusedBeforeGitHub(await call({ cookie, raw: '{ not json' }), 400)
  })

  test('content that is not a JSON object is refused', async () => {
    for (const content of ['not json', '[1,2,3]', 'null', '"a string"']) {
      refusedBeforeGitHub(await call({ cookie, body: { files: [{ path: 'src/data/manual.json', content }] } }), 400)
    }
  })

  test('an oversized payload is refused', async () => {
    const huge = `{"a":"${'x'.repeat(MAX_PAYLOAD_BYTES + 100)}"}`
    const result = await call({ cookie, body: { files: [{ path: 'src/data/manual.json', content: huge }] } })
    // 413 from the content-length guard or 400 from the validator; either is a refusal, and
    // both happen before GitHub.
    assert.ok([400, 413].includes(result.status), `got ${result.status}`)
    assert.deepEqual(networkCalls, [])
  })

  test('an empty or malformed envelope is refused', async () => {
    for (const body of [{}, { files: [] }, { files: 'x' }, { files: [null] }, []]) {
      refusedBeforeGitHub(await call({ cookie, body }), 400)
    }
  })

  test('duplicate targets are refused', async () => {
    refusedBeforeGitHub(await call({
      cookie,
      body: { files: [
        { path: 'src/data/manual.json', content: '{"a":1}' },
        { path: 'src/data/manual.json', content: '{"a":2}' },
      ] },
    }), 400)
  })

  test('a save with no head is refused before GitHub', async () => {
    // `commitFiles` skips the precondition entirely when `expectedHead` is absent, so a client
    // that omitted it would have silently opted out of stale-write protection. The ref update's
    // own `force: false` only covers the milliseconds between this Worker's read and its write,
    // not the minutes since the editor loaded.
    const result = await call({ cookie, body: validSave })
    refusedBeforeGitHub(result, 400)
    assert.match(String(result.body.error), /which commit it was made against/)
  })

  test('a blank or non-string head is refused too', async () => {
    for (const head of ['', '   ', null, 42, {}, true]) {
      refusedBeforeGitHub(await call({ cookie, body: { ...validSave, head } }), 400)
    }
  })

  test('a valid head is passed through to the commit', async () => {
    const result = await call({ cookie, body: { ...validSave, head: 'HEAD1' } })
    assert.ok(networkCalls.length > 0, 'a save with a head should reach GitHub')
    // The stub throws, so this is a 500 — the point is that it got past validation.
    assert.notEqual(result.status, 400)
  })

  test('a repository named in the body does not redirect the write', async () => {
    // The body is allowed to carry anything; the Worker reads the repository from the session.
    // This one is *valid*, so it proceeds to GitHub — and the assertion is that the URL it
    // reaches for is the session's repository, not the body's.
    const result = await call({
      cookie,
      body: { ...validSave, head: 'HEAD1', repository: 'mallory/evil', owner: 'mallory', repo: 'evil' },
    })
    assert.ok(networkCalls.length > 0, 'a valid request should have reached GitHub')
    for (const url of networkCalls) {
      assert.ok(!url.includes('mallory'), `request body steered the write: ${url}`)
      assert.ok(url.includes('ada/portfolio') || url.includes('/app/installations'), url)
    }
    // The stubbed network throws, so the handler reports a failure rather than a success.
    assert.notEqual(result.status, 200)
  })
})

describe('no route hands a credential to the browser', () => {
  test('every response body is free of the Worker\'s secrets', async () => {
    const cookie = `__Host-portfolio_admin=${await session()}`
    const responses = [
      await call({ path: '/api/session', method: 'GET' }),
      await call({ path: '/api/session', method: 'GET', cookie }),
      await call({ path: '/nope', method: 'GET' }),
      await call({ cookie, raw: '{ bad' }),
      await call({ cookie, body: { files: [{ path: 'portfolio.config.js', content: '{}' }] } }),
      await call({ origin: 'https://evil.example', body: validSave }),
    ]

    for (const response of responses) {
      const text = response.text
      for (const secret of [ENV.GITHUB_PRIVATE_KEY, ENV.GITHUB_CLIENT_SECRET, ENV.SESSION_SECRET, 'PRIVATE KEY']) {
        assert.ok(!text.includes(secret), `a response leaked ${secret.slice(0, 20)}: ${text.slice(0, 200)}`)
      }
    }
  })

  test('an unexpected failure is reported generically, not as a stack trace', async () => {
    // The GitHub stub throws a plain Error carrying a URL. If that reached the client it would
    // describe the Worker's internals to anyone who could provoke it.
    const cookie = `__Host-portfolio_admin=${await session()}`
    const result = await call({ cookie, body: { ...validSave, head: 'HEAD1' } })
    assert.equal(result.status, 500)
    assert.equal(result.body.error, 'Something went wrong.')
    assert.ok(!result.text.includes('api.github.com'))
  })
})

describe('cookies', () => {
  test('the session cookie is HttpOnly, Secure and host-locked', async () => {
    const result = await call({ path: '/auth/logout', method: 'POST' })
    const cookie = result.headers.get('set-cookie')
    assert.match(cookie, /^__Host-portfolio_admin=/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /Secure/)
    assert.match(cookie, /Path=\/(;|$)/)
    // `__Host-` forbids Domain; a cookie carrying one would be silently dropped by the browser.
    assert.ok(!/Domain=/i.test(cookie))
  })

  test('no JSON response may be cached anywhere', async () => {
    // `/api/session` is literally an identity document, and an error body differs between a
    // signed-in and a signed-out caller. `no-store` rather than `no-cache`: the latter still
    // lets a shared cache keep a copy.
    const cookie = `__Host-portfolio_admin=${await session()}`
    for (const result of [
      await call({ path: '/api/session', method: 'GET' }),
      await call({ path: '/api/session', method: 'GET', cookie }),
      await call({ path: '/nope', method: 'GET' }),
      await call({ cookie, body: validSave }),
      await call({ path: '/auth/logout', method: 'POST' }),
    ]) {
      assert.equal(result.headers.get('cache-control'), 'no-store')
    }
  })

  test('CORS names one origin and never a wildcard, because responses carry credentials', async () => {
    const result = await call({ path: '/api/session', method: 'GET' })
    assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN)
    assert.equal(result.headers.get('access-control-allow-credentials'), 'true')
  })
})

describe('misconfiguration fails closed and says what is missing', () => {
  test('a Worker with no secrets refuses rather than defaulting', async () => {
    const request = new Request('https://admin.workers.dev/api/session', { method: 'GET' })
    const response = await worker.fetch(request, { ADMIN_ORIGIN: ORIGIN })
    assert.equal(response.status, 500)
    const body = await response.json()
    assert.match(body.error, /not configured: missing/)
    assert.match(body.error, /SESSION_SECRET/)
  })

  test('a too-short session secret cannot be used to sign anything', async () => {
    const request = new Request('https://admin.workers.dev/auth/login', { method: 'GET' })
    const response = await worker.fetch(request, { ...ENV, SESSION_SECRET: 'short' })
    assert.notEqual(response.status, 302)
  })
})

describe('ADMIN_ORIGIN carrying a project-site path still works', () => {
  // The production failure this exists to prevent. `ADMIN_ORIGIN` was configured as
  // `https://you.github.io/Portfolio` — the URL of the admin, which is the natural thing to
  // enter and is not an origin. Every credentialed request from the deployed admin was then
  // blocked by the browser before the Worker's own checks ran, while a manual `/auth/login`
  // test passed, because the default return path `/admin.html` concatenated onto the stray
  // `/Portfolio` happened to land correctly. The one test a person runs by hand was the one
  // case the bug could not break.
  // A function, not a constant: `ENV.GITHUB_PRIVATE_KEY` is filled in by `before()`, and
  // spreading ENV while the describe body evaluates would capture it empty — every request
  // would then fail as "not configured" and prove nothing about origins.
  const pathed = () => ({ ...ENV, ADMIN_ORIGIN: `${ORIGIN}/Portfolio` })

  const callWith = async (env, { path = '/api/session', method = 'GET', cookie, origin = ORIGIN, body } = {}) => {
    networkCalls = []
    const request = new Request(`https://admin.workers.dev${path}`, {
      method,
      headers: {
        ...(origin ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(method === 'GET' ? {} : { body: body === undefined ? undefined : JSON.stringify(body) }),
    })
    const response = await worker.fetch(request, env)
    return { status: response.status, headers: response.headers, text: await response.text() }
  }

  test('the CORS header is an origin, never the configured path', async () => {
    // A browser compares this against `Origin`, which never carries a path. Any mismatch and
    // the request never reaches the Worker at all.
    const result = await callWith(pathed())
    assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN)
  })

  test('a preflight answers with the same normalised origin', async () => {
    const result = await callWith(pathed(), { method: 'OPTIONS' })
    assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN)
  })

  test('a save from the admin page is not rejected as a foreign origin', async () => {
    const cookie = `__Host-portfolio_admin=${await session()}`
    const result = await callWith(pathed(), {
      path: '/api/save', method: 'POST', cookie,
      body: { ...validSave, head: 'HEAD1' },
    })
    // 403 would mean the CSRF check compared an origin against a path and refused its own UI.
    assert.notEqual(result.status, 403)
  })

  test('a foreign origin is still refused with a path-shaped config', async () => {
    // Normalising must not have widened what counts as allowed.
    const cookie = `__Host-portfolio_admin=${await session()}`
    for (const origin of ['https://evil.example', `${ORIGIN}.evil.example`, 'http://ada.github.io']) {
      const result = await callWith(pathed(), {
        path: '/api/save', method: 'POST', cookie, origin,
        body: { ...validSave, head: 'HEAD1' },
      })
      assert.equal(result.status, 403, origin)
      assert.deepEqual(networkCalls, [], 'refused before GitHub')
    }
  })

  test('the default sign-in landing keeps the base path', async () => {
    // `${origin}${base}/admin.html`. Dropping the base would send a project site to an
    // `/admin.html` that does not exist.
    const state = await sign({ n: 'x' }, SECRET, 600)
    const request = new Request('https://admin.workers.dev/auth/callback?code=c&state=' + encodeURIComponent(state), {
      headers: { cookie: `__Host-portfolio_state=${state}` },
    })
    const response = await worker.fetch(request, pathed())
    // The code exchange fails against the stubbed network; what matters is that any redirect
    // this Worker composes is built from origin + base, which the error redirect also uses.
    const location = response.headers.get('location')
    if (location) assert.match(location, /^https:\/\/ada\.github\.io\/Portfolio\/admin\.html/)
  })

  test('a plain origin with no path still behaves exactly as before', async () => {
    const result = await callWith(ENV)
    assert.equal(result.headers.get('access-control-allow-origin'), ORIGIN)
    assert.equal(JSON.parse(result.text).authenticated, false)
  })

  test('a malformed ADMIN_ORIGIN fails closed, and says so', async () => {
    const result = await callWith({ ...ENV, ADMIN_ORIGIN: 'not-a-url' })
    assert.equal(result.status, 500)
    assert.match(JSON.parse(result.text).error, /ADMIN_ORIGIN must be an absolute URL/)
    // No credential in the diagnosis.
    for (const secret of [ENV.GITHUB_CLIENT_SECRET, ENV.SESSION_SECRET]) {
      assert.ok(!result.text.includes(secret))
    }
  })
})
