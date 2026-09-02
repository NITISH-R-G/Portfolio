/**
 * The parts of the admin backend that must not be wrong.
 *
 * Everything here is a pure function over strings and objects: no Worker runtime, no network,
 * no environment. That is deliberate. The security boundary of this system is a handful of
 * decisions — is this session real, is this person allowed, is this path writable, is this
 * payload sane — and decisions buried inside a `fetch` handler get tested by deploying and
 * hoping. Factored out, they get tested by `node --test`.
 *
 * ## The threat this design exists to stop
 *
 * The admin UI runs in a browser and asks a server to commit to a GitHub repository. If that
 * server is careless, a forged request becomes an arbitrary write to someone's repository —
 * and the token doing the writing has more authority than the person making the request. So
 * the rule is: **a browser request can never name the thing it writes.** The path is chosen
 * from a fixed allowlist, the repository comes from the session rather than the payload, and
 * the token never leaves the server.
 *
 * ## Why there is no database
 *
 * Sessions are signed, self-describing and expiring. A session cookie carries the subject, the
 * repository, and an expiry, authenticated with HMAC-SHA256 — so the server can verify it
 * without storing anything. That removes the one component of this design that would otherwise
 * have to be paid for, and removes session storage as a thing that can leak.
 *
 * @module workers/admin/security
 */

/** How long a session is good for. Short enough that a stolen cookie is a small window. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8

/** How long an OAuth `state` value stays valid. Long enough to sign in, short enough to matter. */
export const STATE_TTL_SECONDS = 60 * 10

/**
 * The only files the admin may write.
 *
 * An allowlist rather than a denylist, and literal paths rather than a prefix or a pattern.
 * A prefix like `src/data/` looks equivalent and is not: `src/data/../../.github/workflows/
 * deploy.yml` has that prefix, and a workflow file is remote code execution on every future
 * push. Exact strings cannot be traversed out of.
 *
 * Every entry is JSON, and that is a rule rather than a coincidence. `portfolio.config.js` is
 * imported by the build, so a write to it is arbitrary code execution on the next deploy — no
 * amount of payload validation makes that safe. The admin therefore writes `src/data/config.json`
 * instead, which the config loader deep-merges over the JavaScript file. Same schema, same merge
 * position the unsaved browser draft already occupies; it is that draft made durable, not a
 * second CMS.
 *
 * These are also precisely the files the engine already treats as user-owned — the same layer
 * the local builder writes — so the admin is not a second way to change the portfolio, it is
 * the same way with a different transport.
 */
export const WRITABLE_PATHS = Object.freeze([
  'src/data/manual.json',
  'src/data/overrides.json',
  'src/data/config.json',
])

/** Payload ceiling. A portfolio is text; anything larger is a mistake or an attack. */
export const MAX_PAYLOAD_BYTES = 512 * 1024

/**
 * Is this a path the admin is allowed to write?
 *
 * @param {unknown} path
 * @returns {boolean}
 */
export function isWritablePath(path) {
  return typeof path === 'string' && WRITABLE_PATHS.includes(path)
}

/* Signing --------------------------------------------------------------------- */

const encoder = new TextEncoder()

/**
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function hmacKey(secret) {
  if (!secret || secret.length < 32) {
    throw new SecurityError('SESSION_SECRET must be at least 32 characters.', 'misconfigured')
  }
  return crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  )
}

/** URL-safe base64 without padding, so a token survives a cookie and a query string alike. */
const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), (c) => c.charCodeAt(0))
}

/**
 * Sign a payload into a self-describing token.
 *
 * @param {Record<string, unknown>} payload
 * @param {string} secret
 * @param {number} ttlSeconds
 * @param {number} [now] Injectable so expiry is testable without waiting.
 * @returns {Promise<string>}
 */
export async function sign(payload, secret, ttlSeconds, now = Date.now()) {
  const body = { ...payload, exp: Math.floor(now / 1000) + ttlSeconds }
  const encoded = toBase64Url(encoder.encode(JSON.stringify(body)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(encoded))
  return `${encoded}.${toBase64Url(signature)}`
}

/**
 * Verify and decode a token.
 *
 * Returns `null` for every failure rather than throwing or distinguishing between them: a
 * caller that can tell "bad signature" from "expired" from "malformed" gives an attacker a
 * signal, and there is nothing useful for the caller to do differently anyway.
 *
 * @param {unknown} token
 * @param {string} secret
 * @param {number} [now]
 * @returns {Promise<Record<string, any>|null>}
 */
export async function verify(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null

  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null

  let valid
  try {
    valid = await crypto.subtle.verify(
      'HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(encoded),
    )
  } catch {
    return null
  }
  // `crypto.subtle.verify` is constant-time, which is the reason to use it rather than
  // recomputing the signature and comparing strings.
  if (!valid) return null

  let payload
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)))
  } catch {
    return null
  }

  if (typeof payload?.exp !== 'number' || payload.exp * 1000 <= now) return null
  return payload
}

/* Authorization ---------------------------------------------------------------- */

/**
 * May this session write to this repository?
 *
 * The repository is read from the *session*, never from the request body. A request that could
 * name its own target would let any signed-in user write to any repository the installation can
 * reach — which, for a GitHub App installed on an organisation, can be a great many.
 *
 * @param {Record<string, any>|null} session
 * @param {string} repository `owner/name`
 * @returns {boolean}
 */
export function mayWrite(session, repository) {
  if (!session || typeof session.repo !== 'string' || !session.repo) return false
  if (session.repo !== repository) return false
  // An installation id is proof the App was actually installed on that repository. Without it
  // a session is an identity and not an authorization.
  return Boolean(session.sub) && Boolean(session.installation)
}

/* Payload validation ------------------------------------------------------------ */

/**
 * Check a save request before anything touches GitHub.
 *
 * Structural only — it does not decide whether the *content* is a valid portfolio, because
 * `normalizeProfile` already owns that and duplicating it here would create a second schema to
 * keep in sync. What this stops is the class of request that should never reach the normalizer:
 * a wrong shape, an unwritable path, an oversized body, a duplicate target.
 *
 * @param {unknown} payload
 * @returns {{ok: true, files: {path: string, content: string}[]} | {ok: false, error: string}}
 */
export function validateSave(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Expected an object.' }

  const files = /** @type {any} */ (payload).files
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'No files to write.' }
  if (files.length > WRITABLE_PATHS.length) return { ok: false, error: 'Too many files.' }

  const seen = new Set()
  let total = 0

  for (const file of files) {
    if (!file || typeof file !== 'object') return { ok: false, error: 'Malformed file entry.' }
    if (!isWritablePath(file.path)) return { ok: false, error: `Refusing to write ${String(file.path)}.` }
    // Two entries for one path make the result order-dependent, which is a bug waiting to be
    // an exploit.
    if (seen.has(file.path)) return { ok: false, error: `Duplicate entry for ${file.path}.` }
    seen.add(file.path)

    if (typeof file.content !== 'string') return { ok: false, error: 'File content must be a string.' }
    total += file.content.length
    if (total > MAX_PAYLOAD_BYTES) return { ok: false, error: 'Payload too large.' }

    // Every writable path is JSON, so unparseable content is a bug on the client — and
    // committing it would break the build for a site the user cannot then get back into the
    // admin to fix. Cheaper to refuse here than to deploy a broken portfolio.
    let parsed
    try {
      parsed = JSON.parse(file.content)
    } catch {
      return { ok: false, error: `${file.path} is not valid JSON.` }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: `${file.path} must contain a JSON object.` }
    }
  }

  return { ok: true, files: files.map((f) => ({ path: f.path, content: f.content })) }
}

/**
 * Is this request coming from somewhere we expect?
 *
 * `SameSite=Strict` on the session cookie is the real defence; this is the second lock. Both
 * are cheap, and CSRF on an endpoint that commits to a repository is not a failure anyone wants
 * to be relying on a single mechanism for.
 *
 * @param {Request} request
 * @param {string} allowedOrigin
 * @returns {boolean}
 */
export function originAllowed(request, allowedOrigin) {
  const origin = request.headers.get('origin')
  // A same-origin form post may omit Origin entirely; Referer is the fallback, and a request
  // with neither is refused rather than trusted.
  if (origin) return origin === allowedOrigin
  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === allowedOrigin
  } catch {
    return false
  }
}

/** A failure that is safe to describe to the caller. */
export class SecurityError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code = 'forbidden') {
    super(message)
    this.name = 'SecurityError'
    this.code = code
  }
}
