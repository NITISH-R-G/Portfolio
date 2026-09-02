/**
 * How a machine finds the manifest.
 *
 * ## Why not `/.well-known/portfolio.json`
 *
 * That was the first instinct, and it is wrong for this project. RFC 8615 defines
 * `.well-known` relative to the **origin root** — `https://example.com/.well-known/…`. The
 * default deployment target here is a GitHub Pages *project* site, which is mounted at
 * `https://<user>.github.io/<repo>/`. The origin root belongs to the user's account, not to
 * the repository, so a project site physically cannot serve a `.well-known` path. Adopting it
 * would mean the discovery mechanism failed for the primary deployment target and for every
 * fork that deploys the same way — which is most of them.
 *
 * So the manifest is base-relative: it sits next to `index.html`, wherever the site is
 * mounted. A portfolio at `example.com/` serves `example.com/portfolio.json`; one at
 * `user.github.io/repo/` serves `user.github.io/repo/portfolio.json`. Both work, with no
 * configuration and no assumption about mount point.
 *
 * ## The link tag is the authority
 *
 * Path conventions are a fallback, not a contract. The authoritative pointer is a `<link>` in
 * the document head — the same mechanism RSS autodiscovery has used since 2002, and the
 * reason a feed reader can be handed any blog URL and find the feed. An agent handed a
 * portfolio URL parses the HTML, reads the link, and follows it. That keeps working if a
 * consumer mounts the manifest somewhere this project never anticipated.
 *
 * Nothing here is invented: `rel="alternate"` with a JSON media type is exactly what the HTML
 * spec's alternate-representation link is for.
 *
 * @module core/standard/discovery
 */

/** Where the build writes the manifest, relative to the site base. */
export const MANIFEST_FILENAME = 'portfolio.json'

/**
 * The `rel` token. Namespaced by the spec URL rather than squatting a bare word like
 * `portfolio`, because unregistered single-word rel values collide — and a reader that does
 * not know this project should still be able to tell what the link is.
 */
export const MANIFEST_REL = 'alternate'

/** The media type. `+json` structured-suffix so generic JSON tooling still handles it. */
export const MANIFEST_TYPE = 'application/portfolio+json'

/**
 * The head link that makes a portfolio self-describing.
 *
 * @param {string} href
 * @returns {string}
 */
export function manifestLinkTag(href) {
  const safe = String(href).replace(/[<>"&]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c] ?? c
  ))
  return `<link rel="${MANIFEST_REL}" type="${MANIFEST_TYPE}" href="${safe}" title="Portfolio manifest">`
}

/**
 * Where to look for a manifest, given a URL someone pasted.
 *
 * Ordered by how much it proves. A URL that already ends in `.json` is taken at its word; a
 * page URL is resolved against its own directory *and* the origin root, because a person is
 * as likely to paste `example.com/portfolio/` as `example.com/portfolio/index.html`.
 *
 * This is only the fallback path — a consumer should read the `<link>` tag first and use this
 * when the page could not be parsed, or did not declare one.
 *
 * @param {string} url
 * @returns {string[]}
 */
export function manifestCandidates(url) {
  let base
  try {
    base = new URL(url)
  } catch {
    return []
  }

  if (base.pathname.endsWith('.json')) return [base.href]

  /** @type {string[]} */
  const candidates = []
  const push = (href) => { if (!candidates.includes(href)) candidates.push(href) }

  // Directory of the given URL: `/a/b/` for `/a/b/`, `/a/` for `/a/b.html`.
  const directory = base.pathname.endsWith('/')
    ? base.pathname
    : base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1)

  push(new URL(`${directory}${MANIFEST_FILENAME}`, base).href)
  push(new URL(`/${MANIFEST_FILENAME}`, base).href)

  return candidates
}
