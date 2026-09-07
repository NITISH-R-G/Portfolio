/**
 * Ask each project's hosted URL whether it permits being framed, and cache the answer.
 *
 * This exists because the browser will not tell us. A site served with `X-Frame-Options: DENY`
 * or `Content-Security-Policy: frame-ancestors 'none'` is refused by the browser *silently*:
 * `load` fires on the refused frame exactly as on a real one, and reading the frame's
 * `location` throws `SecurityError` in both cases. Those were both tried; neither separates
 * them. The refusal is deliberately invisible to the embedding page, and no amount of
 * client-side cleverness changes that — the only honest way to know is to read the headers,
 * which requires a server, which is what this script is.
 *
 * It runs at build time against the same URLs the page will frame, records a boolean, and the
 * UI then offers a preview only where one can actually work. Nothing here bypasses a refusal;
 * it reads the site's own published policy and obeys it earlier.
 *
 * Results are cached in `src/data/generated/embeddable.json` and reused, so an ordinary build
 * makes no network calls. `--refresh` re-probes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const CACHE = join(process.cwd(), 'src/data/generated/embeddable.json')
const COMPOSED = join(process.cwd(), 'src/data/generated/portfolio.json')
const TIMEOUT_MS = 8000
const refresh = process.argv.includes('--refresh')

/**
 * Whether these headers permit *this* site to frame the response.
 *
 * Conservative by construction: anything not clearly permissive counts as refused, because a
 * preview that renders a browser error page is worse than one that was never offered.
 *
 * @param {Headers} headers
 * @returns {{embeddable: boolean, reason: string}}
 */
export function readFramePolicy(headers) {
  const xfo = (headers.get('x-frame-options') ?? '').trim().toLowerCase()
  if (xfo === 'deny') return { embeddable: false, reason: 'X-Frame-Options: deny' }
  if (xfo === 'sameorigin') return { embeddable: false, reason: 'X-Frame-Options: sameorigin' }
  // `ALLOW-FROM` is obsolete and ignored by every current browser, so it grants nothing.
  if (xfo.startsWith('allow-from')) {
    return { embeddable: false, reason: 'X-Frame-Options: allow-from (obsolete)' }
  }

  const csp = headers.get('content-security-policy') ?? ''
  const directive = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('frame-ancestors'))

  if (directive) {
    const sources = directive.split(/\s+/).slice(1).map((s) => s.toLowerCase())
    if (sources.includes("'none'")) {
      return { embeddable: false, reason: "frame-ancestors 'none'" }
    }
    // A host list might include us, but resolving that needs the deployed origin and a
    // matching implementation of CSP host syntax. Treated as refused: guessing wrong here
    // produces exactly the silent blank frame this whole script exists to avoid.
    if (!sources.includes('*')) {
      return { embeddable: false, reason: `frame-ancestors ${sources.join(' ')}` }
    }
  }

  return { embeddable: true, reason: 'no framing restriction advertised' }
}

/** @param {string} url */
async function probe(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    // HEAD first; some hosts refuse it, so fall back to a GET whose body is dropped.
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    if (!response.ok && response.status >= 400) {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    }
    const policy = readFramePolicy(response.headers)
    return { ...policy, status: response.status, checkedAt: new Date().toISOString() }
  } catch (error) {
    // Unreachable at build time says nothing about framing, but it does say the preview would
    // not have worked, so it is recorded as not embeddable with the reason preserved.
    return {
      embeddable: false,
      reason: `unreachable: ${/** @type {Error} */ (error).message}`,
      status: 0,
      checkedAt: new Date().toISOString(),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  if (!existsSync(COMPOSED)) {
    console.log('no composed portfolio yet — run `npm run compose` first')
    return
  }

  const { profile } = JSON.parse(readFileSync(COMPOSED, 'utf8'))
  /** @type {Record<string, any>} */
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}

  const urls = new Set(
    (profile.projects ?? [])
      .filter((p) => p.preview !== false)
      .map((p) => p.previewUrl || p.liveUrl)
      .filter(Boolean),
  )

  let checked = 0
  for (const url of urls) {
    if (cache[url] && !refresh) continue
    cache[url] = await probe(url)
    checked += 1
    console.log(`  ${cache[url].embeddable ? 'embeddable  ' : 'not embeddable'}  ${url}  (${cache[url].reason})`)
  }

  for (const url of Object.keys(cache)) {
    if (!urls.has(url)) delete cache[url]
  }

  mkdirSync(dirname(CACHE), { recursive: true })
  // Sorted by rebuilding the object, not with a replacer array: a replacer filters keys
  // at *every* level, so passing the URL list stripped `embeddable` and `reason` from each
  // entry, and the next read then saw every site as not embeddable.
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]))
  writeFileSync(CACHE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
  console.log(`probed ${checked} new of ${urls.size} preview URL(s)`)
}

// Run unconditionally: this file is only ever invoked as a script, and the usual
// `import.meta.url === argv[1]` guard does not match Windows paths.
await main()
