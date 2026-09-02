/**
 * The admin publishing API.
 *
 * A Cloudflare Worker with four routes and no database, sitting between a static admin page
 * and a GitHub repository. It exists because the alternative — putting a repository token in
 * the browser — is not a thing anyone should ship, and because everything else that solves
 * this problem wants a subscription.
 *
 * ## The flow
 *
 *   GET  /auth/login     → redirect to GitHub with a signed, expiring `state`
 *   GET  /auth/callback  → verify state, identify the user, check the App installation,
 *                          set a signed session cookie, redirect back to the admin
 *   GET  /api/session    → who am I, and what may I write
 *   POST /api/save       → validate, commit, return the commit URL
 *   POST /auth/logout    → clear the cookie
 *
 * ## What is deliberately absent
 *
 * No storage binding, no KV, no D1, no queue. Sessions are signed cookies and installation
 * tokens are minted per request, so this Worker holds no state between requests at all. That
 * keeps it inside Cloudflare's free tier — 100,000 requests a day against an admin one person
 * uses occasionally — and it means there is no store to leak, expire wrongly, or pay for.
 *
 * GitHub stays the source of truth. This Worker is a transport, not a database.
 *
 * @module workers/admin
 */

import {
  SESSION_TTL_SECONDS, STATE_TTL_SECONDS, WRITABLE_PATHS,
  sign, verify, mayWrite, validateSave, originAllowed,
} from './security.js'
import { identify, findInstallation, installationToken, commitFiles, headCommit, readFile, GitHubError } from './github.js'

const COOKIE = '__Host-portfolio_admin'

export default {
  /**
   * @param {Request} request
   * @param {Record<string, string>} env
   */
  async fetch(request, env) {
    const url = new URL(request.url)

    // The admin page is served from GitHub Pages and the Worker from workers.dev, so this is
    // genuinely cross-origin and needs CORS. It is pinned to one origin — never `*` — because
    // the responses carry credentials.
    if (request.method === 'OPTIONS') return preflight(env)

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /auth/login': return await login(request, env, url)
        case 'GET /auth/callback': return await callback(request, env, url)
        case 'POST /auth/logout': return logout(env)
        case 'GET /api/session': return await session(request, env)
        case 'POST /api/save': return await save(request, env)
        default: return json({ error: 'Not found' }, 404, env)
      }
    } catch (error) {
      const status = error instanceof GitHubError ? error.status : 500
      // The message is safe to surface: GitHubError messages are composed here, and anything
      // else is reported generically rather than leaking an internal stack.
      const message = error instanceof GitHubError ? error.message : 'Something went wrong.'
      if (!(error instanceof GitHubError)) console.error(error)
      return json({ error: message }, status, env)
    }
  },
}

/* Configuration ------------------------------------------------------------------ */

/**
 * Read and check the Worker's configuration once per request.
 *
 * Missing configuration is reported as a configuration problem rather than surfacing later as
 * a confusing GitHub error — the most likely time for this to be wrong is the first five
 * minutes of someone's setup, and that is exactly when a clear message is worth most.
 *
 * @param {Record<string, string>} env
 */
function settings(env) {
  const missing = ['GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY', 'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'ADMIN_ORIGIN', 'REPOSITORY']
    .filter((key) => !env[key])
  if (missing.length) throw new GitHubError(`Worker is not configured: missing ${missing.join(', ')}.`, 500)

  const [owner, repo] = env.REPOSITORY.split('/')
  if (!owner || !repo) throw new GitHubError('REPOSITORY must be "owner/name".', 500)

  return {
    app: {
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_PRIVATE_KEY,
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
    secret: env.SESSION_SECRET,
    origin: env.ADMIN_ORIGIN,
    owner,
    repo,
    repository: env.REPOSITORY,
    branch: env.BRANCH || 'main',
    // Optional. When set, only these GitHub logins may sign in — belt and braces alongside
    // the installation check, and the answer to "someone else installed my App on their fork".
    allowedLogins: (env.ALLOWED_LOGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // See `cookie()` for why this defaults to the weaker-looking value.
    sameSite: env.SAMESITE === 'Lax' || env.SAMESITE === 'Strict' ? env.SAMESITE : 'None',
  }
}

/* Routes -------------------------------------------------------------------------- */

/**
 * Start the sign-in.
 *
 * `state` is a signed, expiring token rather than a random string kept in a store — same
 * reasoning as the session. It carries a nonce so two sign-ins started in two tabs produce
 * different values, and an expiry so a callback URL captured from a browser history cannot be
 * replayed a week later.
 */
async function login(request, env, url) {
  const config = settings(env)
  const state = await sign(
    { n: crypto.randomUUID(), r: returnPath(url.searchParams.get('return')) },
    config.secret, STATE_TTL_SECONDS,
  )

  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', config.app.clientId)
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('redirect_uri', `${url.origin}/auth/callback`)

  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      // The state also rides in a short cookie, so a callback that arrives in a *different*
      // browser than the one that started the sign-in is refused. A signed state alone proves
      // this Worker issued it, not that this browser asked for it.
      'set-cookie': cookie('__Host-portfolio_state', state, STATE_TTL_SECONDS, config.sameSite),
    },
  })
}

/**
 * Finish the sign-in.
 *
 * Order matters here, and it is: prove the callback belongs to this browser, prove the code is
 * real, then prove the person is allowed. Identifying the user before checking `state` would
 * mean a forged callback could still burn a code and reach GitHub.
 */
async function callback(request, env, url) {
  const config = settings(env)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const cookieState = readCookie(request, '__Host-portfolio_state')
  if (!code || !state || state !== cookieState) return fail(config, 'invalid_state')

  const payload = await verify(state, config.secret)
  if (!payload) return fail(config, 'expired_state')

  const user = await identify(config.app, code)

  if (config.allowedLogins.length && !config.allowedLogins.includes(user.login)) {
    return fail(config, 'not_allowed')
  }

  // The real authorization check. Not "is this a GitHub user" — anyone is — but "is this App
  // installed on the repository this Worker is configured for".
  const installation = await findInstallation(config.app, config.owner, config.repo)
  if (!installation) return fail(config, 'not_installed')

  const token = await sign(
    { sub: user.login, uid: user.id, repo: config.repository, installation: installation.id },
    config.secret, SESSION_TTL_SECONDS,
  )

  return new Response(null, {
    status: 302,
    headers: [
      ['location', `${config.origin}${payload.r || '/admin.html'}`],
      ['set-cookie', cookie(COOKIE, token, SESSION_TTL_SECONDS, config.sameSite)],
      // The state cookie has done its job; leaving it set would let a stale one be reused.
      ['set-cookie', cookie('__Host-portfolio_state', '', 0, config.sameSite)],
    ],
  })
}

/** @param {Record<string, string>} env */
function logout(env) {
  return json({ ok: true }, 200, env, { 'set-cookie': cookie(COOKIE, '', 0, settings(env).sameSite) })
}

/**
 * Who is signed in, and what does the editor need to know before it can save.
 *
 * Also returns the current branch head, which the client sends back with a save. That is the
 * optimistic-concurrency handshake: the editor says "I was looking at this commit", and the
 * Worker refuses if the branch has moved.
 */
async function session(request, env) {
  const config = settings(env)
  const claims = await verify(readCookie(request, COOKIE), config.secret)

  if (!mayWrite(claims, config.repository)) {
    return json({ authenticated: false, loginUrl: '/auth/login' }, 200, env)
  }

  let head = null
  let files = {}
  try {
    const token = await installationToken(config.app, claims.installation, config.repo)
    head = await headCommit(token, config.owner, config.repo, config.branch)
    // The committed state of every writable file, so the editor starts from what is actually
    // in the repository rather than from whatever this browser last had in localStorage.
    files = Object.fromEntries(await Promise.all(WRITABLE_PATHS.map(async (path) => (
      [path, await readFile(token, config.owner, config.repo, path, config.branch)]
    ))))
  } catch (error) {
    // Being unable to reach GitHub does not mean the session is invalid, and reporting it as
    // "signed out" would send the user round a sign-in loop that cannot fix anything.
    if (!(error instanceof GitHubError)) throw error
    return json({
      authenticated: true, user: claims.sub, repository: config.repository,
      branch: config.branch, writable: WRITABLE_PATHS, degraded: error.message,
    }, 200, env)
  }

  return json({
    authenticated: true,
    user: claims.sub,
    repository: config.repository,
    branch: config.branch,
    writable: WRITABLE_PATHS,
    head,
    files,
    expiresAt: claims.exp * 1000,
  }, 200, env)
}

/**
 * Commit the editor's changes.
 *
 * Every check that can be made without spending a GitHub call is made first, in increasing
 * order of cost: origin, then session, then payload shape, then — only then — the network.
 */
async function save(request, env) {
  const config = settings(env)

  if (!originAllowed(request, config.origin)) return json({ error: 'Bad origin.' }, 403, env)

  const claims = await verify(readCookie(request, COOKIE), config.secret)
  if (!mayWrite(claims, config.repository)) return json({ error: 'Not signed in.' }, 401, env)

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 1_000_000) return json({ error: 'Payload too large.' }, 413, env)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Malformed request.' }, 400, env)
  }

  const validated = validateSave(body)
  if (!validated.ok) return json({ error: validated.error }, 400, env)

  const token = await installationToken(config.app, claims.installation, config.repo)
  const result = await commitFiles({
    token,
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    files: validated.files,
    // The commit message names the person, because a repository with a publishing API should
    // not have an audit trail that says "someone changed something".
    message: `content: update via admin (${claims.sub})\n\n${validated.files.map((f) => `- ${f.path}`).join('\n')}`,
    // Absent when the editor could not read a head, in which case the ref update's own
    // `force: false` is still the backstop.
    expectedHead: typeof body.head === 'string' ? body.head : undefined,
  })

  return json({ ok: true, ...result }, 200, env)
}

/* Plumbing ------------------------------------------------------------------------ */

/**
 * `__Host-` is not decoration: the prefix is enforced by the browser and means the cookie must
 * be Secure, must be host-only, and must be path `/`. A subdomain cannot set it, which removes
 * the whole class of session fixation that starts with a compromised sibling host.
 *
 * ## Why SameSite defaults to None
 *
 * The obvious answer is `Strict`, and it is wrong here for a reason worth writing down. In the
 * default deployment the admin page is on `*.github.io` and this Worker is on `*.workers.dev`
 * — different registrable domains, so *every* call from the editor is cross-site. `Strict` and
 * `Lax` both withhold cookies from cross-site `fetch`, which would mean the session cookie is
 * set at sign-in and never sent again: signed in, permanently unable to save.
 *
 * So `None` is not laxity, it is the only value under which this topology functions. What
 * `Strict` would have bought is bought instead by the mandatory `Origin`/`Referer` check on
 * the one state-changing route, which a cross-site attacker cannot forge from a browser.
 *
 * A user who puts both halves on one registrable domain — `me.dev` and `api.me.dev` — should
 * set `SAMESITE = "Lax"` and get the browser-level protection back on top.
 *
 * @param {string} name @param {string} value @param {number} maxAge @param {string} sameSite
 */
const cookie = (name, value, maxAge, sameSite = 'None') =>
  `${name}=${value}; HttpOnly; Secure; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}`

/** @param {Request} request @param {string} name */
function readCookie(request, name) {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

/**
 * Only same-origin paths, so `?return=https://evil.example` cannot turn the sign-in flow into
 * an open redirect that borrows this Worker's credibility.
 *
 * @param {string|null} value
 */
function returnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/admin.html'
  return value
}

const corsHeaders = (env) => ({
  'access-control-allow-origin': env.ADMIN_ORIGIN ?? '',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  vary: 'origin',
})

const preflight = (env) => new Response(null, { status: 204, headers: corsHeaders(env) })

const json = (body, status, env, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', ...corsHeaders(env), ...extra },
})

/**
 * Send a failed sign-in back to the admin with a reason in the URL rather than rendering an
 * error page here. The admin knows how to explain these; the Worker has no UI and should not
 * grow one.
 */
const fail = (config, reason) => new Response(null, {
  status: 302,
  headers: {
    location: `${config.origin}/admin.html?error=${reason}`,
    'set-cookie': cookie('__Host-portfolio_state', '', 0, config.sameSite),
  },
})
