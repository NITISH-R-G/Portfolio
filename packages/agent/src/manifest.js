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

  /** @param {string} candidate */
  const tryLoad = async (candidate) => {
    if (attempted.has(candidate)) return null
    attempted.add(candidate)

    let response
    try {
      response = await withTimeout(
        fetchImpl(candidate, { headers: { accept: `${MANIFEST_TYPE}, application/json` }, redirect: 'follow' }),
        options.timeoutMs ?? 10_000,
        candidate,
      )
    } catch (error) {
      issues.push({ level: 'info', message: `Could not reach ${candidate}: ${error.message}` })
      return null
    }

    if (!response.ok) {
      issues.push({ level: 'info', message: `${candidate} returned ${response.status}.` })
      return null
    }

    const contentType = response.headers?.get?.('content-type') ?? ''
    const body = await response.text()

    // An HTML response is a page, not a manifest — read its link tag and follow it.
    if (contentType.includes('html') || /^\s*<(?:!doctype|html)/i.test(body)) {
      const declared = linkedManifest(body, candidate)
      if (declared) return tryLoad(declared)
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
    const found = await tryLoad(candidate)
    if (found) {
      const validation = validateManifest(found.manifest)
      return { ...found, issues: [...issues, ...validation.issues] }
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

  if (!manifest.person || typeof manifest.person !== 'object') {
    issues.push({ level: 'error', message: 'Manifest has no `person`.' })
  } else if (!manifest.person.name) {
    issues.push({ level: 'warning', message: 'Manifest names no person.' })
  }

  return { valid: !issues.some((i) => i.level === 'error'), issues }
}

/**
 * @template T
 * @param {Promise<T>} promise @param {number} ms @param {string} what
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, what) {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms)
    }),
  ]).catch((error) => { throw new Error(`${what}: ${error.message}`) })
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
 */
