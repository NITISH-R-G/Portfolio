/**
 * Finding and reading a portfolio manifest.
 *
 * The contract this file exists to keep: **never scrape the rendered UI as the primary
 * mechanism.** HTML is fetched for exactly one purpose — to read the `<link>` tag that says
 * where the manifest is — and never to extract profile data. That keeps a consumer working
 * when the visual design changes completely, which is the whole reason the manifest exists.
 *
 * @module @portfolio-engine/agent/manifest
 */

/** Where a conforming portfolio publishes its manifest, relative to the site base. */
export const MANIFEST_FILENAME = 'portfolio.json'

/** The media type and rel used for autodiscovery. Mirrors `core/standard/discovery.js`. */
export const MANIFEST_TYPE = 'application/portfolio+json'

/** Schema major versions this package can read. */
export const SUPPORTED_MAJOR = ['1']

/** How many hops a chain of redirects may take before it is treated as a loop. */
export const MAX_REDIRECTS = 5

/* Where a fetch is allowed to go ------------------------------------------------- */

/**
 * Only these two. `file:`, `data:`, `blob:` and the rest are not places a portfolio lives, and
 * one of them reading a local file because a remote page said so is not a trade worth making.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Hostnames that resolve inside the network doing the fetching.
 *
 * Not a complete defence — only DNS resolution knows for certain where a name points, and this
 * package cannot resolve without a network dependency it refuses to take. It is the cheap half
 * that stops the attacks people actually run: the literal `169.254.169.254` cloud metadata
 * address, `localhost`, RFC1918 space, and `.internal` names.
 *
 * @param {string} hostname Already lower-cased by `URL`.
 * @returns {boolean}
 */
export function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true

  // IPv4, including the ::ffff: form an IPv6 literal can smuggle one in as.
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) {
    const [a, b] = v4.slice(1).map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true          // link-local, and cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
    return false
  }

  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true
    const prefix = host.slice(0, 4).toLowerCase()
    if (prefix.startsWith('fc') || prefix.startsWith('fd')) return true  // unique-local
    if (/^fe[89ab]/.test(prefix)) return true                            // link-local
  }

  return false
}

/**
 * Whether a fetch may be made to this URL.
 *
 * The distinction that makes this usable rather than merely strict: **the URL the caller passed
 * in is trusted, everything the network told us to fetch next is not.** A developer pointing the
 * agent at `http://localhost:5173/` has chosen that destination themselves and there is nothing
 * to protect them from. A page on the public internet answering with
 * `Location: http://169.254.169.254/latest/meta-data/`, or declaring it in a `<link>`, has
 * chosen it *for* them — and that is the request that turns a portfolio reader into an SSRF
 * primitive for whoever controls the page.
 *
 * So redirects and discovered links are held to a stricter rule than the entry point, and the
 * common case — reading a real portfolio over HTTPS — is unaffected either way.
 *
 * @param {URL} target
 * @param {{trusted?: boolean}} [context]
 * @returns {{allowed: true} | {allowed: false, reason: string}}
 */
export function defaultUrlPolicy(target, context = {}) {
  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return { allowed: false, reason: `scheme ${target.protocol} is not http or https` }
  }
  if (context.trusted) return { allowed: true }
  if (isPrivateHost(target.hostname)) {
    return { allowed: false, reason: `${target.hostname} is a private or loopback address` }
  }
  return { allowed: true }
}

/**
 * Locate and load a manifest from a URL.
 *
 * Resolution order, most authoritative first:
 *
 *   1. The URL is already a manifest (`…/portfolio.json`, or JSON content).
 *   2. The page declares one in a `<link rel="alternate" type="application/portfolio+json">`.
 *   3. Convention: `portfolio.json` beside the page, then at the origin root.
 *
 * @param {string} url
 * @param {LoadOptions} [options]
 * @returns {Promise<{manifest: Record<string, any>, url: string, issues: Issue[]}>}
 */
export async function discoverManifest(url, options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new PortfolioError('No fetch implementation available. Pass `{ fetch }` or run on Node 18+.', 'no-fetch')
  }

  /** @type {Issue[]} */
  const issues = []
  const attempted = new Set()
  const allowUrl = options.allowUrl ?? defaultUrlPolicy
  const timeoutMs = options.timeoutMs ?? 10_000

  /**
   * @param {string} candidate
   * @param {{trusted?: boolean, hops?: number}} [context]
   */
  const tryLoad = async (candidate, context = {}) => {
    if (attempted.has(candidate)) return null
    attempted.add(candidate)

    let target
    try {
      target = new URL(candidate)
    } catch {
      issues.push({ level: 'warning', message: `${candidate} is not a valid URL.` })
      return null
    }

    const verdict = allowUrl(target, { trusted: context.trusted === true })
    if (!verdict.allowed) {
      // A warning rather than info: this is a request that was deliberately not made, and a
      // caller debugging a portfolio that will not load needs to see why.
      issues.push({ level: 'warning', message: `Refused to fetch ${candidate}: ${verdict.reason}.` })
      return null
    }

    let result
    try {
      result = await fetchWithin(fetchImpl, candidate, timeoutMs)
    } catch (error) {
      issues.push({ level: 'info', message: `Could not reach ${candidate}: ${error.message}` })
      return null
    }

    const { response, body } = result

    // Redirects are followed by hand so each hop can be checked before it is requested.
    // `redirect: 'manual'` is what makes that possible; with 'follow' the fetch has already
    // reached the final destination by the time anything here could object.
    if (isRedirect(response)) {
      const hops = (context.hops ?? 0) + 1
      if (hops > MAX_REDIRECTS) {
        issues.push({ level: 'warning', message: `${candidate} redirected more than ${MAX_REDIRECTS} times.` })
        return null
      }

      const location = response.headers?.get?.('location')
      if (!location) {
        // A browser gives an opaque redirect with no readable headers. It has already applied
        // its own network boundary and cannot hand the body to a cross-origin caller anyway,
        // so there is nothing this code can add — but it must say so rather than look like a
        // missing manifest.
        issues.push({
          level: 'info',
          message: `${candidate} redirected somewhere this runtime will not disclose; skipped.`,
        })
        return null
      }

      let next
      try {
        next = new URL(location, candidate).href
      } catch {
        issues.push({ level: 'warning', message: `${candidate} redirected to an unusable location.` })
        return null
      }
      // Never trusted, however trusted the URL that redirected here: the whole point is that
      // the destination was chosen by the remote server.
      return tryLoad(next, { hops })
    }

    if (!response.ok) {
      issues.push({ level: 'info', message: `${candidate} returned ${response.status}.` })
      return null
    }

    const contentType = response.headers?.get?.('content-type') ?? ''

    // An HTML response is a page, not a manifest — read its link tag and follow it. Also
    // untrusted: the page names the destination, so it gets the same check a redirect does.
    if (contentType.includes('html') || /^\s*<(?:!doctype|html)/i.test(body)) {
      const declared = linkedManifest(body, candidate)
      if (declared) return tryLoad(declared, { hops: context.hops })
      issues.push({ level: 'info', message: `${candidate} is a page and declares no manifest link.` })
      return null
    }

    try {
      return { manifest: JSON.parse(body), url: candidate }
    } catch {
      issues.push({ level: 'warning', message: `${candidate} is not valid JSON.` })
      return null
    }
  }

  for (const candidate of candidates(url)) {
    // The caller named these: `candidates()` derives them from the URL that was passed in, so
    // no remote party influenced them.
    const found = await tryLoad(candidate, { trusted: true })
    if (found) {
      const validation = validateManifest(found.manifest)
      const merged = [...issues, ...validation.issues]
      if (!validation.valid) {
        // Returning it anyway would hand the caller a document this package has just said it
        // cannot read — a different major version, or one with no `person` — and let a wrong
        // answer about a real person come out the other end.
        throw new PortfolioError(
          `Manifest at ${found.url} is not usable: ` +
          `${validation.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ')}`,
          'invalid',
          merged,
        )
      }
      return { ...found, issues: merged }
    }
  }

  throw new PortfolioError(
    `No portfolio manifest found at ${url}. A conforming portfolio serves ${MANIFEST_FILENAME} ` +
    `or declares one with <link rel="alternate" type="${MANIFEST_TYPE}">.`,
    'not-found',
    issues,
  )
}

/**
 * Where to look, in order.
 *
 * @param {string} url
 * @returns {string[]}
 */
export function candidates(url) {
  let base
  try {
    base = new URL(url)
  } catch {
    throw new PortfolioError(`Not a valid URL: ${url}`, 'bad-url')
  }

  if (base.pathname.endsWith('.json')) return [base.href]

  const out = []
  const push = (href) => { if (!out.includes(href)) out.push(href) }

  // The page itself first: it may declare a manifest in a place convention would never find.
  push(base.href)

  const directory = base.pathname.endsWith('/')
    ? base.pathname
    : base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1)

  push(new URL(`${directory}${MANIFEST_FILENAME}`, base).href)
  push(new URL(`/${MANIFEST_FILENAME}`, base).href)
  return out
}

/**
 * Read the declared manifest URL out of a page.
 *
 * Regex rather than a DOM parser on purpose: this package must run in Node without pulling in
 * a parser dependency, and it is looking for exactly one well-defined tag rather than
 * interpreting the document. This is the *only* place HTML is touched, and it never reads
 * content — only the pointer.
 *
 * @param {string} html @param {string} baseUrl
 * @returns {string|undefined}
 */
export function linkedManifest(html, baseUrl) {
  const links = String(html).match(/<link\b[^>]*>/gi) ?? []
  for (const tag of links) {
    if (!tag.includes(MANIFEST_TYPE)) continue
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!href) continue
    try {
      return new URL(href, baseUrl).href
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Check a manifest without importing it.
 *
 * Forgiving in the direction that matters: a document from a newer *minor* version, or one
 * carrying fields this package has never heard of, loads with a note rather than being
 * rejected. A different *major* version is refused, because the shapes are not compatible and
 * guessing would produce silently wrong answers about a real person.
 *
 * @param {unknown} input
 * @returns {{valid: boolean, issues: Issue[]}}
 */
export function validateManifest(input) {
  /** @type {Issue[]} */
  const issues = []

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, issues: [{ level: 'error', message: 'Manifest is not a JSON object.' }] }
  }

  const manifest = /** @type {Record<string, any>} */ (input)
  const version = typeof manifest.schemaVersion === 'string' ? manifest.schemaVersion : undefined

  if (!version) {
    issues.push({ level: 'warning', message: 'Manifest declares no schemaVersion.' })
  } else {
    const [major] = version.split('.')
    if (!SUPPORTED_MAJOR.includes(major)) {
      issues.push({
        level: 'error',
        message: `Manifest is schema version ${version}; this package reads major version ${SUPPORTED_MAJOR.join(', ')}.`,
      })
    } else if (version !== '1.0') {
      issues.push({ level: 'info', message: `Manifest is version ${version}; unknown fields are preserved but ignored.` })
    }
  }

  // `typeof [] === 'object'`, so an array would otherwise pass as a person record and be
  // reported only as the softer "names no person" warning.
  if (!manifest.person || typeof manifest.person !== 'object' || Array.isArray(manifest.person)) {
    issues.push({ level: 'error', message: 'Manifest has no `person` object.' })
  } else if (!manifest.person.name) {
    issues.push({ level: 'warning', message: 'Manifest names no person.' })
  }

  return { valid: !issues.some((i) => i.level === 'error'), issues }
}

/** @param {Response} response */
const isRedirect = (response) =>
  response?.type === 'opaqueredirect' || [301, 302, 303, 307, 308].includes(response?.status)

/**
 * Fetch and read the body under one deadline.
 *
 * The timeout used to wrap only the call to `fetch`, which meant it expired when the *headers*
 * arrived. A server that answers instantly and then dribbles the body forever would hold the
 * connection open indefinitely — the slow-loris shape, and a denial of service against whoever
 * is running this package rather than against the portfolio.
 *
 * One `AbortController` now covers both halves. The signal is passed to the fetch, so aborting
 * tears down the socket rather than merely abandoning a promise that is still consuming it.
 *
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} url
 * @param {number} ms
 * @returns {Promise<{response: Response, body: string}>}
 */
async function fetchWithin(fetchImpl, url, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const expired = () => new Error(`${url}: timed out after ${Math.round(ms / 1000)}s`)

  try {
    const response = await fetchImpl(url, {
      headers: { accept: `${MANIFEST_TYPE}, application/json` },
      redirect: 'manual',
      signal: controller.signal,
    })

    // A redirect carries no body worth reading, and reading it would spend the deadline.
    const body = isRedirect(response) ? '' : await response.text()
    return { response, body }
  } catch (error) {
    if (controller.signal.aborted) throw expired()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** An error a caller can branch on rather than string-match. */
export class PortfolioError extends Error {
  /** @param {string} message @param {string} code @param {Issue[]} [issues] */
  constructor(message, code, issues = []) {
    super(message)
    this.name = 'PortfolioError'
    this.code = code
    this.issues = issues
  }
}

/**
 * @typedef {object} Issue
 * @property {'error'|'warning'|'info'} level
 * @property {string} message
 */

/**
 * @typedef {object} LoadOptions
 * @property {typeof globalThis.fetch} [fetch]
 * @property {number} [timeoutMs]
 * @property {(target: URL, context: {trusted: boolean}) => {allowed: boolean, reason?: string}} [allowUrl]
 *   Override where fetches may go. Defaults to `defaultUrlPolicy`, which permits any http(s)
 *   URL the caller named and refuses redirects or discovered links pointing at private,
 *   loopback or link-local addresses. Supply your own to widen or narrow that.
 */
