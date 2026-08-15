/**
 * What a page says about itself, before anyone interprets it.
 *
 * Five signals, deliberately kept separate and un-merged:
 *
 *   1. **JSON-LD**   — schema.org in a script tag. Structured, explicit, unambiguous.
 *   2. **Microdata** — schema.org woven into the markup. Same vocabulary, worse ergonomics.
 *   3. **Meta**      — OpenGraph, Twitter cards, plain `<meta name>`. Shallow but universal.
 *   4. **Outline**   — headings and the content beneath them. Unstructured but always there.
 *   5. **Links**     — every outbound URL, which the existing detector turns into socials.
 *
 * They are returned side by side rather than combined because they *disagree*, and which
 * one to believe is a resolution decision, not a parsing one. A page's `og:title` is written
 * for a link preview and is routinely a marketing line ("Jane Doe | Portfolio · Built with
 * Next.js"); its JSON-LD `name` is the actual name. Merging at this layer would throw away
 * the distinction that lets the next layer prefer correctly and report a confidence.
 *
 * Every function here is total: a page with no structured data yields empty collections,
 * never an error. Extraction failure is a *measurement*, not an exception — see
 * `benchmarks/` for what is done with it.
 *
 * @module core/extraction/signals
 */

import { byTag, classId, find, findAll, linesOf, textOf } from './html.js'

/** @typedef {import('./html.js').Element} Element */

/**
 * @typedef {object} PageSignals
 * @property {Record<string, any>[]} jsonLd     Flattened: `@graph` expanded, arrays spread.
 * @property {MicrodataItem[]} microdata
 * @property {Record<string, string>} meta      `og:title`, `twitter:card`, `description`, …
 * @property {OutlineSection[]} outline
 * @property {PageLink[]} links
 * @property {string} title                     `<title>`, trimmed.
 * @property {string} text                      Whole-page text, whitespace-collapsed.
 * @property {string} lines                     Whole-page text with line structure kept.
 * @property {string} [lang]
 */

/**
 * @typedef {object} MicrodataItem
 * @property {string} [type]                    Bare schema.org type, e.g. `"Person"`.
 * @property {Record<string, (string|MicrodataItem)[]>} props
 */

/**
 * @typedef {object} OutlineSection
 * @property {number} level                     1–6.
 * @property {string} heading
 * @property {string} text                      Content until the next heading of ≤ level.
 * @property {string} lines                     The same, with block boundaries preserved.
 * @property {string[]} items                   `<li>` text within, which is where profiles
 *                                              put the things worth extracting.
 */

/**
 * @typedef {object} PageLink
 * @property {string} href
 * @property {string} text
 * @property {string} [rel]
 */

/**
 * Read every signal from a parsed page.
 *
 * @param {Element} root
 * @returns {PageSignals}
 */
export function readSignals(root) {
  const html = find(root, byTag('html'))
  return {
    jsonLd: readJsonLd(root),
    microdata: readMicrodata(root),
    meta: readMeta(root),
    outline: readOutline(root),
    links: readLinks(root),
    title: textOf(find(root, byTag('title')) ?? { type: 'text', value: '', parent: null }),
    text: textOf(find(root, byTag('body')) ?? root),
    lines: linesOf(find(root, byTag('body')) ?? root),
    ...(html?.attrs.lang ? { lang: html.attrs.lang } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* JSON-LD                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every JSON-LD object on the page, flattened.
 *
 * Three shapes are all common and all valid — a bare object, an array of objects, and a
 * `@graph` wrapper — so the caller is spared having to handle each. Nested objects stay
 * nested: a `Person` with `worksFor` is one item, not two, and splitting it would lose the
 * relationship that makes it an employment record.
 *
 * A malformed block is skipped rather than fatal. Pages ship broken JSON-LD constantly
 * (trailing commas from a templating engine, an unescaped quote in a job title), and one
 * bad block must not cost the page every other signal.
 *
 * @param {Element} root
 * @returns {Record<string, any>[]}
 */
export function readJsonLd(root) {
  /** @type {Record<string, any>[]} */
  const out = []

  for (const script of findAll(root, byTag('script'))) {
    const type = (script.attrs.type ?? '').toLowerCase()
    if (!type.includes('ld+json')) continue

    const raw = script.children.map((c) => (c.type === 'text' ? c.value : '')).join('').trim()
    if (!raw) continue

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Some CMSs wrap the payload in CDATA or an HTML comment. One cheap retry, because
      // it is a common enough emission bug to be worth recovering rather than discarding.
      try {
        parsed = JSON.parse(raw.replace(/^\s*(?:\/\*)?\s*<!\[CDATA\[|\]\]>\s*(?:\*\/)?\s*$|^<!--|-->$/g, '').trim())
      } catch {
        continue
      }
    }
    collectLd(parsed, out)
  }

  return out
}

/** @param {unknown} value @param {Record<string, any>[]} out */
function collectLd(value, out) {
  if (Array.isArray(value)) {
    for (const entry of value) collectLd(entry, out)
    return
  }
  if (!value || typeof value !== 'object') return

  const object = /** @type {Record<string, any>} */ (value)
  if (Array.isArray(object['@graph'])) {
    for (const entry of object['@graph']) collectLd(entry, out)
    // A wrapper may also carry its own type alongside the graph, in which case it is a real
    // node too and dropping it would lose the page's primary entity.
    if (!object['@type']) return
  }
  out.push(object)
}

/* -------------------------------------------------------------------------- */
/* Microdata                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Top-level microdata items.
 *
 * Only items that are not themselves a property of another item are returned; nested ones
 * appear inside their parent's `props`, which preserves the structure that makes
 * `Person → worksFor → Organization` readable as employment rather than as three unrelated
 * items.
 *
 * @param {Element} root
 * @returns {MicrodataItem[]}
 */
export function readMicrodata(root) {
  const scopes = findAll(root, (el) => el.attrs.itemscope !== undefined)
  const nested = new Set(scopes.filter((el) => el.attrs.itemprop !== undefined))
  return scopes.filter((el) => !nested.has(el)).map(readItem)
}

/** @param {Element} scope @returns {MicrodataItem} */
function readItem(scope) {
  /** @type {MicrodataItem} */
  const item = { props: {} }
  const type = scope.attrs.itemtype
  if (type) item.type = bareType(type)

  for (const el of propertyElements(scope)) {
    const names = (el.attrs.itemprop ?? '').split(/\s+/).filter(Boolean)
    const value = el.attrs.itemscope !== undefined ? readItem(el) : propertyValue(el)
    if (value === '' || value === undefined) continue
    for (const name of names) (item.props[name] ??= []).push(value)
  }

  return item
}

/**
 * Property elements belonging to this scope, not to a nested one.
 *
 * The subtlety: a nested `itemscope` *is* a property of its parent, but everything inside
 * it belongs to the child. Descending blindly would hoist a job title from a nested
 * Organization onto the Person and produce a confidently wrong record.
 *
 * @param {Element} scope
 * @returns {Element[]}
 */
function propertyElements(scope) {
  /** @type {Element[]} */
  const out = []

  const descend = (/** @type {Element} */ node) => {
    for (const child of node.children) {
      if (child.type !== 'element') continue
      const isProp = child.attrs.itemprop !== undefined
      if (isProp) out.push(child)
      // Stop at a nested scope: its interior is the child's business.
      if (child.attrs.itemscope === undefined) descend(child)
    }
  }

  descend(scope)
  return out
}

/**
 * A microdata property's value.
 *
 * The element type decides where the value lives — the spec's rule, and it matters: reading
 * the *text* of `<img itemprop="image">` yields the empty string, and reading the *src* of
 * `<span itemprop="name">` yields nothing at all.
 *
 * @param {Element} el
 * @returns {string}
 */
function propertyValue(el) {
  const { attrs, tag } = el
  if (attrs.content !== undefined) return attrs.content.trim()

  switch (tag) {
    case 'a': case 'area': case 'link':
      return (attrs.href ?? '').trim()
    case 'img': case 'audio': case 'embed': case 'iframe':
    case 'source': case 'track': case 'video':
      return (attrs.src ?? '').trim()
    case 'object':
      return (attrs.data ?? '').trim()
    case 'data': case 'meter':
      return (attrs.value ?? '').trim()
    case 'time':
      // The machine-readable form when present; `<time>Jan 2024</time>` has no datetime and
      // its text is the only thing on offer.
      return (attrs.datetime ?? textOf(el)).trim()
    default:
      return textOf(el)
  }
}

/**
 * `https://schema.org/Person` → `Person`.
 *
 * @param {string} url
 * @returns {string}
 */
export function bareType(url) {
  const last = String(url).split(/[/#]/).filter(Boolean).pop() ?? ''
  return last.trim()
}

/* -------------------------------------------------------------------------- */
/* Meta                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Every `<meta>` as a flat map, keyed by whichever of `property`, `name` or `itemprop`
 * it used.
 *
 * First value wins. Pages emit duplicate `og:image` tags routinely, and the first is the
 * one crawlers use — matching that behaviour keeps the baseline honest about what a
 * consumer of this page would actually see.
 *
 * @param {Element} root
 * @returns {Record<string, string>}
 */
export function readMeta(root) {
  /** @type {Record<string, string>} */
  const out = {}

  for (const el of findAll(root, byTag('meta'))) {
    const key = (el.attrs.property ?? el.attrs.name ?? el.attrs.itemprop ?? '').trim().toLowerCase()
    const value = (el.attrs.content ?? '').trim()
    if (!key || !value || key in out) continue
    out[key] = value
  }

  return out
}

/* -------------------------------------------------------------------------- */
/* Outline                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The page's heading structure and the content under each heading.
 *
 * This is the fallback that carries pages with no structured data at all — which, for
 * hand-built personal sites, is most of them. A section headed "Experience" containing five
 * list items is not schema.org, but it is not nothing either, and treating it as nothing is
 * how an extractor scores zero on a page a human reads fine.
 *
 * Content is gathered by *document order* rather than by DOM containment, because headings
 * are usually siblings of their content, not ancestors of it.
 *
 * @param {Element} root
 * @returns {OutlineSection[]}
 */
export function readOutline(root) {
  const body = find(root, byTag('body')) ?? root
  /** @type {{level: number, heading: string, nodes: Element[]}[]} */
  const sections = []

  const isHeading = (/** @type {Element} */ el) => /^h[1-6]$/.test(el.tag)

  const visit = (/** @type {Element} */ node) => {
    for (const child of node.children) {
      if (child.type !== 'element') continue

      if (isHeading(child)) {
        sections.push({ level: Number(child.tag[1]), heading: textOf(child), nodes: [] })
        continue
      }

      // A container holding a heading is descended into so the heading is found; one that
      // holds none is content, and recording it whole avoids fragmenting a paragraph into
      // its inline spans.
      if (find(child, isHeading)) visit(child)
      else if (sections.length) sections[sections.length - 1].nodes.push(child)
    }
  }

  visit(body)

  return sections
    .filter((s) => s.heading)
    .map((s) => ({
      level: s.level,
      heading: s.heading,
      text: s.nodes.map((n) => textOf(n)).filter(Boolean).join(' ').trim(),
      // The same content with its block boundaries intact. Collapsing a header's
      // `<p>headline</p><p>location</p>` into one string fuses two facts into one — the
      // headline comes out as "Site Reliability Engineer Casablanca, Morocco" — and no
      // downstream reader can separate them again.
      lines: s.nodes.map((n) => linesOf(n)).filter(Boolean).join('\n').trim(),
      items: s.nodes.flatMap((n) => findAll(n, byTag('li')).map(itemText)).filter(Boolean),
    }))
}

/**
 * One list item, with its internal structure kept as lines.
 *
 * The single highest-value fix the benchmark produced. A profile's Experience section is
 * almost always shaped like this:
 *
 *     <li><strong>Staff Engineer, Kestrel Data</strong>
 *         <span class="dates">Jun 2021 – Present</span>
 *         <p>Led the rewrite of the write-ahead log.</p></li>
 *
 * Read as one collapsed string, the role, the dates and the description fuse into
 * `"Staff Engineer, Kestrel Data Jun 2021 – Present Led the rewrite…"`, and every downstream
 * reader then has to guess where each ends — which is how a company name comes out as
 * "Kestrel Data Led the rewrite of the write-ahead log". Giving each child element its own
 * line preserves the boundaries the page's author already drew, and costs nothing on items
 * that have no internal structure.
 *
 * Inline elements are treated the same as block ones here, deliberately: `<strong>` and
 * `<span>` are precisely what these layouts use to separate the parts.
 *
 * @param {Element} li
 * @returns {string}
 */
function itemText(li) {
  /** @type {string[]} */
  const parts = []

  for (const child of li.children) {
    const text = child.type === 'text' ? child.value.replace(/\s+/g, ' ').trim() : textOf(child)
    if (text) parts.push(text)
  }

  return parts.join('\n')
}

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every outbound link, de-duplicated.
 *
 * The most valuable signal on a personal site, and the one that needs the least
 * interpretation: `core/sources/detect.js` already knows what 30 platforms' profile URLs
 * look like, so a page's link list converts into `socials` with no new platform knowledge
 * here. That reuse is the point — this module never learns what GitHub is.
 *
 * `mailto:` is kept because it is how a contact email is published; `javascript:` and
 * fragment-only links are dropped as navigation.
 *
 * @param {Element} root
 * @returns {PageLink[]}
 */
export function readLinks(root) {
  /** @type {Map<string, PageLink>} */
  const seen = new Map()

  for (const el of [...findAll(root, byTag('a')), ...findAll(root, byTag('link'))]) {
    const href = (el.attrs.href ?? '').trim()
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue
    if (seen.has(href)) continue

    seen.set(href, {
      href,
      text: textOf(el) || classId(el).trim(),
      ...(el.attrs.rel ? { rel: el.attrs.rel } : {}),
    })
  }

  return [...seen.values()]
}
