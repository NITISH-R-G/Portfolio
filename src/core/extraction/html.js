/**
 * A small, forgiving HTML parser.
 *
 * Written rather than depended on, for one reason: this project's whole promise is that a
 * portfolio builds itself from a checkout with no build-time services and no API keys. A
 * parser dependency is cheap; a *browser* dependency — which is where `jsdom`, Playwright
 * and every headless-render provider lead — is 300 MB and a moving target. Before paying
 * that, it is worth knowing precisely how much of a professional profile is readable
 * without it. That question is what `benchmarks/` exists to answer, and this file is what
 * makes the honest baseline measurable.
 *
 * So the goals are narrow and deliberate:
 *
 *   - never throw on malformed input, because real pages are malformed
 *   - preserve enough nesting for microdata and heading structure
 *   - be fast enough to parse a corpus on every test run
 *
 * It is explicitly **not** a spec-compliant parser. It does not build an implicit `<tbody>`,
 * it does not reconstruct misnested formatting tags, and it will not reproduce what a
 * browser does with genuinely broken markup. Where a page needs that, the answer is a real
 * renderer, and the benchmark is what should decide whether one is worth its cost.
 *
 * @module core/extraction/html
 */

/**
 * Elements that never have children or a closing tag.
 */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Elements whose content is text, not markup.
 *
 * Everything up to the matching close tag is taken verbatim. Without this, a `<` inside a
 * script — `if (a < b)` — opens a phantom element and swallows the rest of the document.
 */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])

/**
 * Elements an unclosed tag of the same family implicitly closes.
 *
 * Enough to keep list and table structure from nesting into a staircase, which is the one
 * malformation common enough on real pages to matter for extraction. Anything subtler is
 * out of scope by design — see the module note.
 *
 * @type {Record<string, ReadonlySet<string>>}
 */
const IMPLICIT_CLOSE = {
  li: new Set(['li']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  p: new Set(['p', 'div', 'section', 'article', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
  option: new Set(['option']),
  tr: new Set(['tr']),
  td: new Set(['td', 'th', 'tr']),
  th: new Set(['td', 'th', 'tr']),
}

/**
 * @typedef {object} Element
 * @property {'element'} type
 * @property {string} tag                     Lower-cased.
 * @property {Record<string, string>} attrs   Lower-cased names; values entity-decoded.
 * @property {Node[]} children
 * @property {Element|null} parent
 */

/**
 * @typedef {object} TextNode
 * @property {'text'} type
 * @property {string} value      Entity-decoded.
 * @property {Element|null} parent
 */

/** @typedef {Element|TextNode} Node */

/**
 * Parse a document into a tree.
 *
 * @param {string} html
 * @returns {Element} A synthetic `#root` element.
 */
export function parseHtml(html) {
  /** @type {Element} */
  const root = { type: 'element', tag: '#root', attrs: {}, children: [], parent: null }
  if (typeof html !== 'string' || !html) return root

  /** @type {Element[]} */
  const stack = [root]
  const top = () => stack[stack.length - 1]

  let i = 0
  const len = html.length

  while (i < len) {
    const lt = html.indexOf('<', i)

    // Trailing text, or a document with no markup at all.
    if (lt === -1) {
      pushText(top(), html.slice(i))
      break
    }

    if (lt > i) pushText(top(), html.slice(i, lt))

    /* Comments, CDATA, doctype ------------------------------------------- */

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? len : end + 3
      continue
    }

    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt)
      i = end === -1 ? len : end + 1
      continue
    }

    /* Closing tag --------------------------------------------------------- */

    if (html.startsWith('</', lt)) {
      const end = html.indexOf('>', lt)
      if (end === -1) { i = len; break }
      const tag = html.slice(lt + 2, end).trim().toLowerCase()
      closeTag(stack, tag)
      i = end + 1
      continue
    }

    /* Opening tag --------------------------------------------------------- */

    const end = findTagEnd(html, lt)
    if (end === -1) {
      // A bare `<` in text. Treat it as text rather than losing the remainder.
      pushText(top(), html.slice(lt, lt + 1))
      i = lt + 1
      continue
    }

    const source = html.slice(lt + 1, end)
    const match = source.match(/^([a-zA-Z][^\s/>]*)/)
    if (!match) {
      pushText(top(), html.slice(lt, end + 1))
      i = end + 1
      continue
    }

    const tag = match[1].toLowerCase()
    const attrs = parseAttrs(source.slice(match[1].length))
    const selfClosing = source.trimEnd().endsWith('/')

    // An unclosed `<li>` is closed by the next one rather than nesting inside it.
    const closes = IMPLICIT_CLOSE[top().tag]
    if (closes?.has(tag)) stack.pop()

    /** @type {Element} */
    const element = { type: 'element', tag, attrs, children: [], parent: top() }
    top().children.push(element)

    i = end + 1

    if (VOID.has(tag) || selfClosing) continue

    if (RAW_TEXT.has(tag)) {
      // Everything to the matching close tag is text. The close is searched
      // case-insensitively because `</SCRIPT>` is legal and appears in the wild.
      const closeAt = indexOfClose(html, tag, i)
      const value = html.slice(i, closeAt === -1 ? len : closeAt)
      // Script and style content is never entity-decoded: `&amp;` inside JSON-LD is a
      // literal ampersand in the JSON, and decoding it would corrupt the payload.
      if (value) element.children.push({ type: 'text', value, parent: element })
      i = closeAt === -1 ? len : html.indexOf('>', closeAt) + 1 || len
      continue
    }

    stack.push(element)
  }

  return root
}

/**
 * The `>` that ends a tag, skipping any inside a quoted attribute value.
 *
 * `<a title="a > b">` is legal, and naively taking the first `>` truncates the tag and
 * loses every attribute after it.
 *
 * @param {string} html @param {number} from Index of the `<`.
 */
function findTagEnd(html, from) {
  let quote = ''
  for (let i = from + 1; i < html.length; i += 1) {
    const c = html[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '>') {
      return i
    }
  }
  return -1
}

/** @param {string} html @param {string} tag @param {number} from */
function indexOfClose(html, tag, from) {
  const needle = `</${tag}`
  const lower = html.toLowerCase()
  const at = lower.indexOf(needle, from)
  if (at === -1) return -1
  // Guard against `</scriptish>` matching `</script`.
  const after = lower[at + needle.length]
  return after === '>' || after === undefined || /\s/.test(after) ? at : indexOfClose(html, tag, at + 1)
}

/**
 * Parse an attribute list.
 *
 * @param {string} source Everything after the tag name, up to but excluding `>`.
 * @returns {Record<string, string>}
 */
function parseAttrs(source) {
  /** @type {Record<string, string>} */
  const attrs = {}
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g

  let m
  while ((m = re.exec(source)) !== null) {
    const name = m[1].toLowerCase()
    if (!name || name === '/') continue
    // A bare attribute (`hidden`, `itemscope`) gets its own name as its value, matching the
    // DOM. That is what lets `attrs.itemscope !== undefined` be the presence test.
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

/**
 * Close the nearest open element with this tag.
 *
 * Scans the stack rather than assuming the top matches: `<b><i></b>` should close `b`, and
 * popping blindly would close `i` and leave `b` open for the rest of the document. An
 * unmatched close tag is ignored, which is what browsers do.
 *
 * @param {Element[]} stack @param {string} tag
 */
function closeTag(stack, tag) {
  for (let i = stack.length - 1; i > 0; i -= 1) {
    if (stack[i].tag === tag) {
      stack.length = i
      return
    }
  }
}

/** @param {Element} parent @param {string} value */
function pushText(parent, value) {
  if (!value) return
  parent.children.push({ type: 'text', value: decodeEntities(value), parent })
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  middot: '·', bull: '•', deg: '°', euro: '€', pound: '£', yen: '¥',

  // Accented Latin letters, in full.
  //
  // Not optional, and learned from the benchmark: the first corpus run read a Danish name
  // as "Lena S&oslash;rensen". A name is the one field every downstream feature depends on,
  // and mangling it for anyone outside the ASCII range is not a rough edge — it is the
  // system failing exactly the people whose names it should be most careful with.
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ',
  Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ',
}

/**
 * Decode the entities that actually appear in professional profiles.
 *
 * Not the full HTML5 named-character table (2,231 entries): the long tail is emoji and
 * mathematical symbols that no employer's job title contains, and carrying it would be more
 * data than the rest of this module put together. Numeric references are handled in full,
 * which covers anything the named table would have.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  if (!text.includes('&')) return text

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      // Surrogates and out-of-range values would throw; an undecodable reference is left
      // alone rather than replaced with a replacement character.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      if (code >= 0xd800 && code <= 0xdfff) return whole
      return String.fromCodePoint(code)
    }
    // Exact first: `&Oslash;` (Ø) and `&oslash;` (ø) are different letters, and folding
    // case here would silently change how a name is spelled. The lower-cased fallback is
    // for the punctuation entities, where pages are careless about case and nothing is lost.
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? whole
  })
}

/* -------------------------------------------------------------------------- */
/* Traversal                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every element under `node`, in document order.
 *
 * @param {Element} node
 * @param {(el: Element) => boolean} [predicate]
 * @returns {Element[]}
 */
export function findAll(node, predicate) {
  /** @type {Element[]} */
  const out = []
  walk(node, (el) => {
    if (!predicate || predicate(el)) out.push(el)
  })
  return out
}

/**
 * The first element matching, or `undefined`.
 *
 * @param {Element} node
 * @param {(el: Element) => boolean} predicate
 * @returns {Element|undefined}
 */
export function find(node, predicate) {
  /** @type {Element|undefined} */
  let found
  walk(node, (el) => {
    if (!found && predicate(el)) found = el
  })
  return found
}

/** @param {Element} node @param {(el: Element) => void} visit */
function walk(node, visit) {
  for (const child of node.children) {
    if (child.type !== 'element') continue
    visit(child)
    walk(child, visit)
  }
}

/** @param {string} tag @returns {(el: Element) => boolean} */
export const byTag = (tag) => (el) => el.tag === tag

/**
 * All text under a node, whitespace-collapsed.
 *
 * Script and style content is excluded — it is code, not prose, and including it turns a
 * page's text into minified JavaScript. Block-level boundaries become spaces so that
 * `<li>A</li><li>B</li>` reads as `A B` rather than `AB`.
 *
 * @param {Node} node
 * @returns {string}
 */
export function textOf(node) {
  return collectText(node).replace(/\s+/g, ' ').trim()
}

/** @param {Node} node @returns {string} */
function collectText(node) {
  if (node.type === 'text') return node.value
  if (RAW_TEXT.has(node.tag) && node.tag !== 'title') return ''

  let out = ''
  for (const child of node.children) out += collectText(child)
  return BLOCK.has(node.tag) ? ` ${out} ` : out
}

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'div', 'dd', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'td', 'th', 'tr', 'ul',
])

/**
 * Text with line structure preserved.
 *
 * The résumé extractor in `core/documents/resume-text.js` reads line-oriented layout, and
 * feeding it whitespace-collapsed text would destroy exactly the structure it depends on.
 * This keeps one line per block element so an HTML CV can go through the same reader as a
 * PDF one.
 *
 * @param {Node} node
 * @returns {string}
 */
export function linesOf(node) {
  return collectLines(node)
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line, i, all) => line || all[i - 1])
    .join('\n')
    .trim()
}

/** @param {Node} node @returns {string} */
function collectLines(node) {
  if (node.type === 'text') return node.value
  if (RAW_TEXT.has(node.tag)) return ''
  if (node.tag === 'br') return '\n'

  let out = ''
  for (const child of node.children) out += collectLines(child)
  return BLOCK.has(node.tag) ? `\n${out}\n` : out
}

/**
 * An element's `id`/`class` as a single searchable string.
 *
 * Class names are a weak signal — they are presentational and vary by site — so they are
 * used only to *rank* candidates, never to decide a value alone.
 *
 * @param {Element} el
 * @returns {string}
 */
export function classId(el) {
  return `${el.attrs.id ?? ''} ${el.attrs.class ?? ''}`.toLowerCase()
}
