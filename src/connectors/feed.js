/**
 * A small RSS / Atom reader.
 *
 * Several platforms with no public API (Medium, Substack, YouTube channels, most blog
 * engines) publish a perfectly good feed, and a feed is a *supported* public interface
 * rather than scraping — it exists to be read by programs. That makes it the honest way to
 * integrate with them.
 *
 * This deliberately does not pull in an XML parser. Feeds are the only XML this project
 * reads, the fields wanted are few, and the extraction below is tolerant of the
 * malformed-but-common shapes real feeds ship (unescaped ampersands, CDATA everywhere,
 * namespace prefixes) in a way a strict parser is not.
 *
 * @module connectors/feed
 */

/**
 * @typedef {object} FeedItem
 * @property {string} title
 * @property {string} [url]
 * @property {string} [date]         ISO date, when the feed gave a parseable one.
 * @property {string} [excerpt}      Plain text, HTML stripped, truncated.
 * @property {string[]} [tags]
 * @property {string} [author]
 * @property {string} [thumbnail]
 * @property {number} [views]
 */

/**
 * @typedef {object} ParsedFeed
 * @property {string} [title]
 * @property {string} [link]
 * @property {string} [description]
 * @property {FeedItem[]} items
 */

/**
 * Parse an RSS 2.0 or Atom document.
 *
 * Never throws: a feed that turns out to be an HTML error page yields zero items, which
 * the calling connector reports as `empty` rather than crashing the import.
 *
 * @param {string} xml
 * @param {{limit?: number}} [options]
 * @returns {ParsedFeed}
 */
export function parseFeed(xml, options = {}) {
  const limit = options.limit ?? 50
  if (typeof xml !== 'string' || !xml.trim()) return { items: [] }

  const channel = xml.replace(/<(item|entry)\b[\s\S]*$/i, '')

  /** @type {FeedItem[]} */
  const items = []
  for (const block of blocks(xml, 'item').concat(blocks(xml, 'entry'))) {
    const item = parseItem(block)
    if (item) items.push(item)
    if (items.length >= limit) break
  }

  return {
    title: tag(channel, 'title'),
    link: tag(channel, 'link') || attr(channel, 'link', 'href'),
    description: tag(channel, 'description') ?? tag(channel, 'subtitle'),
    items,
  }
}

/**
 * @param {string} block
 * @returns {FeedItem|null}
 */
function parseItem(block) {
  const title = tag(block, 'title')
  if (!title) return null

  // Atom puts the URL in an attribute; RSS puts it in the element body. YouTube's feed
  // uses a media namespace for the thumbnail and view count.
  const url = tag(block, 'link') || attr(block, 'link', 'href') || tag(block, 'guid')
  const rawDate =
    tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ??
    tag(block, 'dc:date') ?? tag(block, 'date')

  const body =
    tag(block, 'content:encoded') ?? tag(block, 'description') ??
    tag(block, 'summary') ?? tag(block, 'media:description') ?? tag(block, 'content')

  const tags = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)]
    .map((m) => decode(m[1]).trim())
    .concat([...block.matchAll(/<category\b[^>]*\bterm=["']([^"']+)["']/gi)].map((m) => decode(m[1])))
    .filter(Boolean)

  const views = Number(attrIn(block, /<media:statistics\b[^>]*\bviews=["'](\d+)["']/i))

  return compact({
    title,
    url: httpOnly(url),
    date: isoDate(rawDate),
    excerpt: excerpt(body),
    tags: tags.length ? [...new Set(tags)].slice(0, 8) : undefined,
    author: tag(block, 'dc:creator') ?? tag(block, 'author') ?? tag(block, 'name'),
    thumbnail: httpOnly(attrIn(block, /<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i)),
    views: Number.isFinite(views) && views > 0 ? views : undefined,
  })
}

/**
 * Extract every `<name>…</name>` block. Written as a scan rather than a regex with a
 * backreference so that nested same-named elements do not truncate the block.
 *
 * @param {string} xml
 * @param {string} name
 * @returns {string[]}
 */
function blocks(xml, name) {
  const out = []
  const open = new RegExp(`<${name}(\\s[^>]*)?>`, 'gi')
  const close = `</${name}>`
  let match
  while ((match = open.exec(xml))) {
    const start = match.index + match[0].length
    const end = xml.indexOf(close, start)
    if (end === -1) break
    out.push(xml.slice(start, end))
    open.lastIndex = end + close.length
  }
  return out
}

/**
 * First text value of an element. Prefers CDATA content when present.
 *
 * @param {string} xml
 * @param {string} name
 * @returns {string|undefined}
 */
function tag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i').exec(xml)
  if (!match) return undefined
  const value = decode(match[1]).trim()
  return value || undefined
}

/** @param {string} xml @param {string} name @param {string} attribute */
function attr(xml, name, attribute) {
  const re = new RegExp(`<${name}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`, 'i')
  return attrIn(xml, re)
}

/** @param {string} xml @param {RegExp} re */
function attrIn(xml, re) {
  const match = re.exec(xml)
  return match ? decode(match[1]).trim() : undefined
}

/**
 * Strip markup and collapse whitespace, then truncate on a word boundary.
 * @param {string|undefined} html
 * @returns {string|undefined}
 */
export function excerpt(html, max = 280) {
  if (!html) return undefined
  const text = decode(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Resolve the handful of entities that actually appear in feeds. */
function decode(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, entity) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }
      const lower = entity.toLowerCase()
      if (named[lower]) return named[lower]
      if (lower.startsWith('#x')) {
        const code = parseInt(lower.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      if (lower.startsWith('#')) {
        const code = parseInt(lower.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      return whole
    })
}

/** Feeds occasionally carry `javascript:` or relative hrefs; only absolute http(s) is usable. */
function httpOnly(value) {
  if (!value) return undefined
  return /^https?:\/\//i.test(value) ? value : undefined
}

/** @param {string|undefined} raw @returns {string|undefined} */
function isoDate(raw) {
  if (!raw) return undefined
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString().slice(0, 10)
}

/** @template {Record<string, unknown>} T @param {T} obj @returns {T} */
function compact(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k]
  return obj
}

export { isoDate }
