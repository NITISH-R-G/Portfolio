/**
 * Everything that touches GitHub, and nothing that does not.
 *
 * Two credentials live in here and neither one ever leaves the Worker:
 *
 *   - The **App private key**, used to mint a ten-minute JWT that identifies the App itself.
 *     It can do nothing to a repository on its own.
 *   - The **installation token**, minted from that JWT for one installation, scoped to
 *     `contents: write`, and expiring in an hour. This is the thing that actually commits.
 *
 * The browser receives neither. What it gets is a signed session cookie that says who it is
 * and which repository it may write to; the Worker mints a fresh installation token per
 * request. So there is no long-lived repository token anywhere in the system — not in
 * localStorage, not in a cookie, not in the client bundle.
 *
 * A GitHub App rather than an OAuth App because an OAuth App's `repo` scope is all-or-nothing:
 * the user would be granting write access to every repository they own in order to edit one
 * portfolio. An App is installed per repository and cannot see the rest.
 *
 * @module workers/admin/github
 */

const API = 'https://api.github.com'
const UA = 'portfolio-engine-admin'

/** GitHub rejects requests without a User-Agent, and errors are clearer with an Accept header. */
const headers = (token, extra = {}) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'user-agent': UA,
  'x-github-api-version': '2022-11-28',
  ...extra,
})

/** A GitHub call that failed in a way worth telling the user about. */
export class GitHubError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status = 502) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

/**
 * @param {Response} response
 * @param {string} what
 */
async function json(response, what) {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // GitHub's own message is included because "failed to commit" without a reason sends the
    // user to the Worker logs, and the useful half is almost always in the response.
    throw new GitHubError(
      `${what} failed (${response.status}): ${body.slice(0, 300) || response.statusText}`,
      response.status === 401 || response.status === 403 ? 502 : response.status,
    )
  }
  return response.json()
}

/* App authentication ------------------------------------------------------------ */

const encoder = new TextEncoder()
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * Turn a PEM private key into something WebCrypto will sign with.
 *
 * GitHub issues PKCS#1 (`BEGIN RSA PRIVATE KEY`); WebCrypto only imports PKCS#8. Rather than
 * ship an ASN.1 converter, the setup docs tell the user to convert once with `openssl` — a
 * single command at setup time beats a hundred lines of DER parsing running on every request.
 *
 * @param {string} pem
 * @returns {Promise<CryptoKey>}
 */
async function importPrivateKey(pem) {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '')
  if (!body) throw new GitHubError('GITHUB_PRIVATE_KEY is empty.', 500)
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) {
    throw new GitHubError(
      'GITHUB_PRIVATE_KEY is PKCS#1. Convert it once: ' +
      'openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key.pkcs8.pem',
      500,
    )
  }
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
}

/**
 * A short-lived JWT identifying the App.
 *
 * `iat` is backdated by a minute because GitHub rejects tokens issued in its own future, and
 * a Worker's clock and GitHub's are not the same clock.
 *
 * @param {{appId: string, privateKey: string}} app
 * @param {number} [now]
 * @returns {Promise<string>}
 */
export async function appJwt(app, now = Date.now()) {
  const seconds = Math.floor(now / 1000)
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = b64url(encoder.encode(JSON.stringify({
    iat: seconds - 60,
    exp: seconds + 540,
    iss: app.appId,
  })))
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', await importPrivateKey(app.privateKey), encoder.encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(signature)}`
}

/**
 * Find the App's installation on a repository, or `null` if it is not installed there.
 *
 * This is the authorization check that matters: "is this App installed on this repository"
 * is the only question whose answer the App itself controls. Everything else — who the user
 * is, what the session says — is downstream of it.
 *
 * @param {{appId: string, privateKey: string}} app
 * @param {string} owner
 * @param {string} repo
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{id: number}|null>}
 */
export async function findInstallation(app, owner, repo, fetchImpl = fetch) {
  const jwt = await appJwt(app)
  const response = await fetchImpl(`${API}/repos/${owner}/${repo}/installation`, {
    headers: headers(jwt),
  })
  if (response.status === 404) return null
  return json(response, 'Installation lookup')
}

/**
 * Mint a token scoped to one installation and one repository.
 *
 * `repositories` narrows it further than the installation itself: even if the owner installed
 * the App across their whole account, the token this Worker holds during a request can only
 * touch the repository being edited.
 *
 * @param {{appId: string, privateKey: string}} app
 * @param {number|string} installationId
 * @param {string} repo Bare repository name, not `owner/repo`.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function installationToken(app, installationId, repo, fetchImpl = fetch) {
  const jwt = await appJwt(app)
  const response = await fetchImpl(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: headers(jwt, { 'content-type': 'application/json' }),
    body: JSON.stringify({ repositories: [repo], permissions: { contents: 'write' } }),
  })
  const body = await json(response, 'Token exchange')
  return body.token
}

/* Reading and writing ----------------------------------------------------------- */

/**
 * @param {string} token
 * @param {string} owner @param {string} repo @param {string} ref
 * @param {typeof fetch} [fetchImpl]
 */
export async function headCommit(token, owner, repo, ref, fetchImpl = fetch) {
  const body = await json(
    await fetchImpl(`${API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(ref)}`, {
      headers: headers(token),
    }),
    'Branch lookup',
  )
  return body.object.sha
}

/**
 * Read a file at a ref, or `null` if it is not there yet.
 *
 * A fresh clone has no `overrides.json`, and the admin has to be able to create it — so a 404
 * is an expected state rather than an error.
 *
 * @param {string} token
 * @param {string} owner @param {string} repo @param {string} path @param {string} ref
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string|null>}
 */
export async function readFile(token, owner, repo, path, ref, fetchImpl = fetch) {
  const url = `${API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
  const response = await fetchImpl(url, { headers: headers(token, { accept: 'application/vnd.github.raw' }) })
  if (response.status === 404) return null
  if (!response.ok) throw new GitHubError(`Could not read ${path} (${response.status}).`, 502)
  return response.text()
}

/**
 * Commit a set of files as one commit.
 *
 * Built out of the git data API — blobs, a tree, a commit, a ref update — rather than the
 * contents API, for two reasons. The contents API writes one file per call, so a two-file save
 * would land as two commits and two deploys, and a failure between them leaves the repository
 * in a state that was never intended. And the ref update is conditional on `expectedHead`,
 * which is what makes concurrent saves safe: if anything else moved the branch since the admin
 * loaded, the update is refused rather than silently discarding the other change.
 *
 * @param {object} options
 * @param {string} options.token
 * @param {string} options.owner
 * @param {string} options.repo
 * @param {string} options.branch
 * @param {{path: string, content: string}[]} options.files
 * @param {string} options.message
 * @param {string} [options.expectedHead] Refuse if the branch has moved past this commit.
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{commit: string, url: string, unchanged?: boolean}>}
 */
export async function commitFiles({
  token, owner, repo, branch, files, message, expectedHead, fetchImpl = fetch,
}) {
  const base = `${API}/repos/${owner}/${repo}`
  const head = await headCommit(token, owner, repo, branch, fetchImpl)

  if (expectedHead && expectedHead !== head) {
    throw new GitHubError(
      'The repository changed since you opened the editor. Reload to pick up the newer version before saving.',
      409,
    )
  }

  const commit = await json(
    await fetchImpl(`${base}/git/commits/${head}`, { headers: headers(token) }),
    'Commit lookup',
  )

  const blobs = await Promise.all(files.map(async (file) => {
    // base64 rather than utf-8 so a résumé containing an emoji or a Turkish dotless ı is
    // committed byte-for-byte instead of relying on GitHub's encoding guess.
    const blob = await json(
      await fetchImpl(`${base}/git/blobs`, {
        method: 'POST',
        headers: headers(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ content: toBase64(file.content), encoding: 'base64' }),
      }),
      'Blob upload',
    )
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha }
  }))

  const tree = await json(
    await fetchImpl(`${base}/git/trees`, {
      method: 'POST',
      headers: headers(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ base_tree: commit.tree.sha, tree: blobs }),
    }),
    'Tree creation',
  )

  // A save that changes nothing would otherwise produce an empty commit and a pointless
  // deploy — and the user would watch a build run for no reason and wonder what it did.
  if (tree.sha === commit.tree.sha) {
    return { commit: head, url: `https://github.com/${owner}/${repo}/commit/${head}`, unchanged: true }
  }

  const created = await json(
    await fetchImpl(`${base}/git/commits`, {
      method: 'POST',
      headers: headers(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
    }),
    'Commit creation',
  )

  // `force: false` is the second half of the concurrency guarantee: GitHub itself rejects the
  // update if the branch moved between the check above and this call.
  await json(
    await fetchImpl(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers: headers(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ sha: created.sha, force: false }),
    }),
    'Branch update',
  )

  return { commit: created.sha, url: `https://github.com/${owner}/${repo}/commit/${created.sha}` }
}

/* OAuth --------------------------------------------------------------------------- */

/**
 * Exchange an OAuth callback code for the identity of the person who just signed in.
 *
 * The user token this obtains is used once, to ask "who are you", and then dropped. It is
 * never stored and never returned to the browser — the session carries the *answer*, not the
 * credential.
 *
 * @param {{clientId: string, clientSecret: string}} app
 * @param {string} code
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{login: string, id: number}>}
 */
export async function identify(app, code, fetchImpl = fetch) {
  const exchange = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code }),
  })
  const body = await json(exchange, 'Sign-in')
  if (!body.access_token) {
    // GitHub answers a bad or replayed code with HTTP 200 and an `error` field, so a status
    // check alone would treat a failed sign-in as a successful one.
    throw new GitHubError(`Sign-in failed: ${body.error_description ?? body.error ?? 'no token returned'}`, 401)
  }
  const user = await json(
    await fetchImpl(`${API}/user`, { headers: headers(body.access_token) }),
    'User lookup',
  )
  return { login: user.login, id: user.id }
}

/** @param {string} text */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // Chunked: spreading a few hundred kilobytes into `fromCharCode` exceeds the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
