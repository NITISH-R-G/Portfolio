/**
 * Signals in, claims-ready profile out.
 *
 * The rule this module exists to enforce: **extraction never writes a profile.** It produces
 * a *fragment* plus per-value evidence, which `core/identity/claims.js` turns into claims and
 * the resolver then weighs against everything else. So a scraper that reads "2022 – Present"
 * as ending in 2022 produces a claim that loses to the user's own — and shows up as a
 * conflict — rather than silently rewriting someone's employment history.
 *
 * Signals are consulted strongest-first and never overwrite a value an earlier tier already
 * supplied:
 *
 *     JSON-LD      exact      the page declared it in a machine-readable vocabulary
 *     microdata    exact      same vocabulary, expressed in markup
 *     links        strong     a URL matched a known platform — deterministic, not a guess
 *     meta         moderate   OpenGraph and friends; written for crawlers, often marketing
 *     outline      moderate   headings and lists, read by the résumé reader
 *     prose        weak       segmented out of running text
 *
 * The tiers are the named ones from `core/documents/types.js`, reused rather than reinvented
 * so a value extracted from an HTML page and one extracted from a PDF are comparable. That
 * matters for the benchmark: "how confident" must mean the same thing across providers, or
 * the confidence column measures nothing.
 *
 * @module core/extraction/normalize
 */

import { EXTRACTION_CONFIDENCE } from '../documents/types.js'
import { parseResumeLines } from '../documents/resume-text.js'
import { detectSource } from '../sources/detect.js'
import { parseDate, parseRange } from '../schema/date.js'
import { normalizeProfile } from '../schema/profile.js'
import { bareType } from './signals.js'

/** @typedef {import('./signals.js').PageSignals} PageSignals */
/** @typedef {keyof typeof EXTRACTION_CONFIDENCE} Tier */

/**
 * @typedef {object} Extraction
 * @property {Record<string, any>} profile      A partial profile. Never a complete one.
 * @property {Record<string, {confidence: number, section?: string, text?: string}>} evidence
 *   Keyed `subject|attribute`, matching what the claim collector reads.
 * @property {string[]} warnings
 * @property {Record<Tier, number>} tiers       How many values each tier supplied.
 */

/**
 * schema.org types that mean "this is the person the page is about".
 */
const PERSON_TYPES = new Set(['Person', 'ProfilePage'])

/**
 * schema.org types worth reading, mapped to the collection they belong in.
 *
 * Structural accuracy — a publication landing in `publications` rather than `projects` — is
 * one of the benchmark's metrics, and this table is where it is won or lost. Anything not
 * listed is ignored rather than guessed at: a `BreadcrumbList` is not a portfolio record,
 * and inventing one from it would score as a precision failure, correctly.
 *
 * @type {Record<string, string>}
 */
const TYPE_COLLECTION = {
  SoftwareSourceCode: 'projects',
  SoftwareApplication: 'projects',
  WebApplication: 'projects',
  MobileApplication: 'projects',
  CreativeWork: 'projects',

  ScholarlyArticle: 'publications',
  Thesis: 'publications',
  Book: 'publications',
  Chapter: 'publications',

  Article: 'posts',
  BlogPosting: 'posts',
  TechArticle: 'posts',
  NewsArticle: 'posts',
  SocialMediaPosting: 'posts',

  EducationalOccupationalCredential: 'certifications',
  Course: 'education',
  VideoObject: 'videos',
}

/**
 * Legal-form suffixes stripped when comparing organization names.
 *
 * "Google", "Google LLC" and "Google, Inc." are the same employer, and treating them as
 * three would fragment one job into three records and report a conflict nobody has. This is
 * the entity-resolution the benchmark measures — deliberately conservative, since collapsing
 * two genuinely different organizations is the worse error.
 */
const LEGAL_SUFFIX = /[\s,]+(?:llc|l\.l\.c\.?|inc|inc\.|incorporated|ltd|ltd\.|limited|plc|gmbh|ag|s\.?a\.?|s\.?a\.?s\.?|b\.?v\.?|n\.?v\.?|pty|pvt|pvt\.|private limited|corp|corp\.|corporation|co|co\.|company|group|holdings?)$/i

/**
 * A comparable form of an organization or institution name.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function canonicalOrg(name) {
  if (typeof name !== 'string') return ''
  let out = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim()

  // Applied repeatedly: "Acme Holdings Ltd." carries two.
  let previous
  do {
    previous = out
    out = out.replace(LEGAL_SUFFIX, '')
  } while (out !== previous)

  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|of|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Turn a page's signals into an extraction.
 *
 * @param {PageSignals} signals
 * @param {{url?: string, sourceId?: string}} [context]
 * @returns {Extraction}
 */
export function normalizeSignals(signals, context = {}) {
  const sourceId = context.sourceId ?? 'web'

  /** @type {Record<string, any>} */
  const profile = {}
  /** @type {Extraction['evidence']} */
  const evidence = {}
  /** @type {string[]} */
  const warnings = []
  /** @type {Record<Tier, number>} */
  const tiers = { exact: 0, strong: 0, moderate: 0, weak: 0 }

  /**
   * Record a scalar, strongest tier wins.
   *
   * Silently declining to overwrite is the whole precedence mechanism: tiers are visited in
   * order, so the first writer is by construction the most trustworthy one available.
   *
   * @param {string} path   Dotted, relative to the profile root.
   * @param {unknown} value
   * @param {Tier} tier
   * @param {{section?: string, text?: string}} [where]
   */
  const set = (path, value, tier, where = {}) => {
    const clean = typeof value === 'string' ? value.trim() : value
    if (clean === undefined || clean === null || clean === '') return
    if (Array.isArray(clean) && !clean.length) return

    const parts = path.split('.')
    let node = profile
    for (const part of parts.slice(0, -1)) node = node[part] ??= {}
    const leaf = parts[parts.length - 1]
    if (node[leaf] !== undefined) return

    node[leaf] = clean
    tiers[tier] += 1

    // Evidence is keyed by the claim subject, which for identity and socials is the group
    // name rather than a record id.
    const subject = parts[0] === 'identity' || parts[0] === 'socials' ? parts[0] : path
    const attribute = parts[0] === 'socials' ? leaf : parts.slice(1).join('.') || leaf
    evidence[`${subject}|${attribute}`] = {
      confidence: EXTRACTION_CONFIDENCE[tier],
      ...(where.section ? { section: where.section } : {}),
      ...(where.text ? { text: where.text.slice(0, 200) } : {}),
    }
  }

  /**
   * Add records to a collection, de-duplicated.
   *
   * @param {string} collection
   * @param {Record<string, any>[]} records
   * @param {Tier} tier
   */
  const add = (collection, records, tier) => {
    if (!records.length) return
    const bucket = (profile[collection] ??= [])

    for (const record of records) {
      if (!record) continue
      const key = dedupeKey(collection, record)
      const existing = bucket.find((/** @type {any} */ r) => dedupeKey(collection, r) === key)

      if (existing) {
        // The same record seen through a second signal. Fill gaps, never overwrite — the
        // earlier tier was the stronger one.
        for (const [k, v] of Object.entries(record)) {
          if (existing[k] === undefined && v !== undefined && v !== '') existing[k] = v
        }
        continue
      }

      record.source = { connector: sourceId, ...(context.url ? { url: context.url } : {}), confidence: EXTRACTION_CONFIDENCE[tier] }
      bucket.push(record)
      tiers[tier] += 1
      evidence[`${collection}/${key}|@exists`] = { confidence: EXTRACTION_CONFIDENCE[tier] }
    }
  }

  /* 1. JSON-LD and microdata — the page's own declarations -------------------- */

  const structured = [
    ...signals.jsonLd.map((node) => ({ node, tier: /** @type {Tier} */ ('exact') })),
    ...signals.microdata.map((item) => ({ node: microdataToObject(item), tier: /** @type {Tier} */ ('exact') })),
  ]

  const people = structured.filter(({ node }) => PERSON_TYPES.has(typeOf(node)))
  const person = people.map(({ node }) => (typeOf(node) === 'ProfilePage' ? node.mainEntity ?? node : node))
    .find((node) => typeOf(node) === 'Person')

  if (person) readPerson(person, set, add, 'exact', context.url)

  for (const { node, tier } of structured) {
    const collection = TYPE_COLLECTION[typeOf(node)]
    if (collection) add(collection, [readWork(node, collection)].filter(Boolean), tier)
  }

  /* 2. Links — deterministic platform recognition ---------------------------- */

  for (const link of signals.links) {
    if (link.href.startsWith('mailto:')) {
      set('identity.contact.email', link.href.slice(7).split('?')[0], 'strong', { text: link.text })
      continue
    }
    const detection = detectSource(link.href)
    if (detection.outcome !== 'matched') continue
    set(`socials.${detection.connector}`, canonicalUrl(link.href, context.url), 'strong', { text: link.text })
  }

  /* 3. Meta — universal, shallow, and written for crawlers -------------------- */

  const meta = signals.meta
  set('identity.name', meta['profile:first_name'] && meta['profile:last_name']
    ? `${meta['profile:first_name']} ${meta['profile:last_name']}`
    : undefined, 'moderate')
  // `og:title` is a page title, not a name — "Jane Doe — Portfolio" is typical. It is used
  // for a name only after the structured tiers had their chance, and only after the
  // decoration is stripped.
  set('identity.name', titleName(meta['og:title'] ?? signals.title), 'weak')
  set('identity.summary', meta['og:description'] ?? meta.description, 'moderate')
  // Only once somebody has been identified. `og:image` is whatever the page wants in a link
  // preview — a logo, a hero shot, a screenshot — and on a page with no person on it,
  // calling that "their avatar" is inventing a subject to hang it on.
  if (profile.identity?.name) {
    set('identity.avatar', absolute(meta['og:image'] ?? meta['twitter:image'], context.url), 'moderate')
  }

  /* 4. Outline — the résumé reader, pointed at a web page --------------------- */

  // A personal site with "Experience" and "Education" headings is a résumé that happens to
  // be HTML. Rather than write a second heading-and-list reader, the existing one is fed
  // line-structured text with the headings marked — so both formats share one set of
  // section synonyms, one date parser and one set of bugs.
  if (signals.outline.length) {
    const lines = outlineToLines(signals)
    const parsed = parseResumeLines(lines, { documentId: sourceId })

    for (const [key, value] of Object.entries(parsed.profile.identity ?? {})) {
      if (typeof value === 'object' && value !== null) {
        for (const [inner, innerValue] of Object.entries(value)) set(`identity.${key}.${inner}`, innerValue, 'moderate')
      } else {
        set(`identity.${key}`, value, 'moderate')
      }
    }

    for (const [collection, records] of Object.entries(parsed.profile)) {
      if (collection === 'identity' || !Array.isArray(records)) continue
      add(collection, records, 'moderate')
    }

    warnings.push(...parsed.warnings)
  }

  if (!profile.identity?.name) {
    warnings.push('No name could be read from this page. Nothing here identifies whose profile it is.')
  }

  // Through the same normalizer every other layer uses, in partial mode.
  //
  // Not a formality: the résumé reader emits `startDate`/`endDate`, and it is `normalizeProfile`
  // that folds those into a `dates` range, parses every date to its true precision, and
  // sanitizes URLs. Skipping it would leave extraction as the one source producing records in
  // a shape nothing else speaks — and the benchmark caught exactly that, scoring a correctly
  // read date range as two invented fields.
  return { profile: normalizeProfile(profile, { partial: true }), evidence, warnings, tiers }
}

/* -------------------------------------------------------------------------- */
/* schema.org                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Read a `Person` node.
 *
 * @param {Record<string, any>} node
 * @param {(path: string, value: unknown, tier: Tier, where?: {section?: string, text?: string}) => void} set
 * @param {(collection: string, records: Record<string, any>[], tier: Tier) => void} add
 * @param {Tier} tier
 * @param {string} [base] The page's own URL, for resolving relative links.
 */
function readPerson(node, set, add, tier, base) {
  set('identity.name', str(node.name) || [str(node.givenName), str(node.familyName)].filter(Boolean).join(' '), tier)
  set('identity.headline', str(node.jobTitle) || str(node.hasOccupation?.name), tier)
  set('identity.summary', str(node.description), tier)
  set('identity.location', placeName(node.address ?? node.homeLocation ?? node.workLocation), tier)
  // Structured data routinely carries a site-relative image path. Left relative it is
  // useless to every consumer of the profile, which is not a detail the export or the
  // rendered page can recover later.
  set('identity.avatar', absolute(str(node.image?.url ?? node.image ?? node.photo) || undefined, base), tier)
  set('identity.pronouns', str(node.pronouns), tier)
  set('identity.contact.email', str(node.email).replace(/^mailto:/, ''), tier)
  set('identity.contact.website', str(node.url), tier)

  // `sameAs` is the schema.org idiom for "my other profiles", and running it through the
  // same detector as page links means a platform recognised in one place is recognised in
  // both.
  for (const url of list(node.sameAs)) {
    const detection = detectSource(str(url))
    if (detection.outcome === 'matched') set(`socials.${detection.connector}`, str(url), tier)
  }

  add('experience', list(node.worksFor).map((org) => employment(org, node)).filter(Boolean), tier)
  add('education', list(node.alumniOf).map(schooling).filter(Boolean), tier)
  add('skills', list(node.knowsAbout).map((s) => (str(s) || str(s?.name) ? { name: str(s) || str(s.name) } : null)).filter(Boolean), tier)
  add('achievements', list(node.award).map((a) => (str(a) ? { title: str(a) } : null)).filter(Boolean), tier)
  add('languages', list(node.knowsLanguage).map((l) => (str(l) || str(l?.name) ? { name: str(l) || str(l.name) } : null)).filter(Boolean), tier)
}

/**
 * `worksFor` → an experience record.
 *
 * @param {any} org @param {Record<string, any>} person
 */
function employment(org, person) {
  const company = str(org?.name) || str(org)
  if (!company) return null

  const dates = parseRange(org?.startDate ? { start: org.startDate, end: org.endDate, current: !org.endDate } : undefined)
  return {
    company,
    ...(str(org?.roleName ?? person.jobTitle) ? { role: str(org.roleName ?? person.jobTitle) } : {}),
    ...(dates ? { dates } : {}),
    ...(str(org?.description) ? { description: str(org.description) } : {}),
    ...(placeName(org?.location) ? { location: placeName(org.location) } : {}),
  }
}

/** @param {any} org */
function schooling(org) {
  const institution = str(org?.name) || str(org)
  if (!institution) return null

  const dates = parseRange(org?.startDate ? { start: org.startDate, end: org.endDate, current: !org.endDate } : undefined)
  return {
    institution,
    ...(str(org?.degree ?? org?.educationalCredentialAwarded) ? { degree: str(org.degree ?? org.educationalCredentialAwarded) } : {}),
    ...(dates ? { dates } : {}),
  }
}

/**
 * A creative work → a record in whichever collection its type maps to.
 *
 * @param {Record<string, any>} node
 * @param {string} collection
 */
function readWork(node, collection) {
  const name = str(node.name ?? node.headline)
  if (!name) return null

  const date = parseDate(node.datePublished ?? node.dateCreated ?? node.dateModified)
  const url = str(node.url ?? node['@id'])

  switch (collection) {
    case 'projects':
      return {
        name,
        ...(str(node.description) ? { description: str(node.description) } : {}),
        ...(url ? { repository: /github\.com|gitlab\.com|bitbucket\.org/.test(url) ? url : undefined, liveUrl: /github\.com|gitlab\.com|bitbucket\.org/.test(url) ? undefined : url } : {}),
        ...(list(node.programmingLanguage).length ? { technologies: list(node.programmingLanguage).map(str).filter(Boolean) } : {}),
        ...(list(node.keywords ?? node.about).length ? { topics: list(node.keywords ?? node.about).map(str).filter(Boolean) } : {}),
        ...(date ? { date } : {}),
      }

    case 'publications':
      return {
        title: name,
        ...(list(node.author).length ? { authors: list(node.author).map((a) => str(a?.name) || str(a)).filter(Boolean) } : {}),
        ...(str(node.publisher?.name ?? node.isPartOf?.name ?? node.publication) ? { venue: str(node.publisher?.name ?? node.isPartOf?.name ?? node.publication) } : {}),
        ...(date ? { date } : {}),
        ...(url ? { url } : {}),
        ...(str(node.identifier).startsWith('10.') ? { doi: str(node.identifier) } : {}),
        ...(str(node.abstract) ? { abstract: str(node.abstract) } : {}),
      }

    case 'posts':
      return {
        title: name,
        ...(url ? { url } : {}),
        ...(date ? { date } : {}),
        ...(str(node.description ?? node.abstract) ? { excerpt: str(node.description ?? node.abstract) } : {}),
        ...(list(node.keywords).length ? { tags: list(node.keywords).map(str).filter(Boolean) } : {}),
      }

    case 'certifications':
      return {
        name,
        ...(str(node.recognizedBy?.name ?? node.issuedBy?.name) ? { issuer: str(node.recognizedBy?.name ?? node.issuedBy?.name) } : {}),
        ...(date ? { date } : {}),
        ...(url ? { credentialUrl: url } : {}),
      }

    case 'education':
      return {
        institution: str(node.provider?.name) || name,
        ...(str(node.provider?.name) ? { degree: name } : {}),
      }

    case 'videos':
      return { title: name, ...(url ? { url } : {}), ...(date ? { date } : {}) }

    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A node's schema.org type, as a bare string.
 *
 * `@type` is legally an array (`["Person", "Author"]`), and the first entry is the one that
 * matters for our purposes.
 *
 * @param {any} node
 * @returns {string}
 */
function typeOf(node) {
  const raw = node?.['@type'] ?? node?.type
  return bareType(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '')
}

/**
 * Microdata's `{type, props}` shape flattened into the plain-object shape JSON-LD uses, so
 * one set of readers handles both. Single-valued properties are unwrapped, because
 * `name: ["Jane"]` would otherwise have to be special-cased in every reader.
 *
 * @param {import('./signals.js').MicrodataItem} item
 * @returns {Record<string, any>}
 */
function microdataToObject(item) {
  /** @type {Record<string, any>} */
  const out = item.type ? { '@type': item.type } : {}
  for (const [key, values] of Object.entries(item.props)) {
    const mapped = values.map((v) => (typeof v === 'string' ? v : microdataToObject(v)))
    out[key] = mapped.length === 1 ? mapped[0] : mapped
  }
  return out
}

/** @param {unknown} value @returns {string} */
function str(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

/** @param {unknown} value @returns {any[]} */
function list(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * A place, however schema.org chose to express it this time — a string, a `PostalAddress`,
 * or a `Place` wrapping one.
 *
 * @param {any} value
 * @returns {string}
 */
function placeName(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (value.address) return placeName(value.address)

  const parts = [value.addressLocality, value.addressRegion, value.addressCountry]
    .map((p) => str(p?.name ?? p))
    .filter(Boolean)
  return parts.length ? parts.join(', ') : str(value.name)
}

/**
 * Strip the decoration a page title carries around a name.
 *
 * `"Jane Doe — Software Engineer | Portfolio"` → `"Jane Doe"`. Returns nothing when the
 * result does not look like a name, which is the common case and must not become a claim:
 * "Home", "About Me" and "Untitled" are all real `<title>` values.
 *
 * @param {string|undefined} title
 * @returns {string|undefined}
 */
function titleName(title) {
  if (!title) return undefined
  const head = title
    .split(/\s*[|—–\-·:]\s*/)[0]
    // An honorific is a title, not part of the name. Keeping it means "Dr. Hannah Whitfield"
    // never matches "Hannah Whitfield" from any other source, and one person becomes two.
    .replace(/^(?:dr|prof|professor|mr|mrs|ms|mx|sir|dame)\.?\s+/i, '')
    .trim()
  if (!head || head.length > 60) return undefined

  const words = head.split(/\s+/)
  if (words.length < 2 || words.length > 4) return undefined
  // Every word capitalised, none of them a stop word that betrays a page title.
  if (!words.every((w) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(w))) return undefined
  if (/\b(home|about|portfolio|resume|cv|blog|projects?|welcome)\b/i.test(head)) return undefined
  return head
}

/**
 * Resolve a possibly-relative URL against the page it was found on.
 *
 * @param {string|undefined} href @param {string|undefined} base
 * @returns {string|undefined}
 */
function absolute(href, base) {
  if (!href) return undefined
  try {
    return base ? new URL(href, base).href : new URL(href).href
  } catch {
    return href.startsWith('http') ? href : undefined
  }
}

/** @param {string} href @param {string|undefined} base */
function canonicalUrl(href, base) {
  return absolute(href, base) ?? href
}

/**
 * The key two records must share to be considered the same thing.
 *
 * Organization names go through `canonicalOrg` so "Google" and "Google LLC" merge; titles
 * are compared loosely for the same reason. Deliberately not `recordKey` from the merge
 * layer: that one is for records that have already been normalized, and these have not.
 *
 * @param {string} collection @param {Record<string, any>} record
 * @returns {string}
 */
function dedupeKey(collection, record) {
  switch (collection) {
    case 'experience':
      return `${canonicalOrg(record.company)}|${loose(record.role)}`
    case 'education':
      return `${canonicalOrg(record.institution)}|${loose(record.degree)}`
    case 'skills':
    case 'languages':
      return loose(record.name)
    case 'projects':
      return loose(record.name)
    case 'certifications':
      return `${loose(record.name)}|${canonicalOrg(record.issuer)}`
    default:
      return loose(record.title ?? record.name ?? JSON.stringify(record))
  }
}

/** @param {unknown} value */
const loose = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * The page outline as résumé-shaped lines.
 *
 * @param {PageSignals} signals
 * @returns {import('../documents/resume-text.js').Line[]}
 */
function outlineToLines(signals) {
  /** @type {any[]} */
  const lines = []
  let index = 0

  const push = (/** @type {string} */ text, /** @type {boolean} */ heading, /** @type {number} */ level, /** @type {boolean} */ boundary = false) => {
    let first = true
    for (const part of text.split('\n')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      // A page's `<title>` and its `<h1>` are usually the same words, and the résumé reader
      // takes the first preamble line as the name and the second as the headline — so the
      // duplicate costs the headline entirely, reading it as the name twice.
      if (lines[lines.length - 1]?.text === trimmed) continue
      lines.push({
        text: trimmed,
        index: index++,
        heading,
        ...(heading ? { level } : {}),
        // Only the first line of a list item begins an entry; the rest are its dates and
        // description. This is the structure the page's author already expressed by writing
        // one `<li>` per role, and passing it through spares the reader from re-deriving it
        // from date placement — which it cannot do when every date sits on its own line.
        ...(boundary && first ? { boundary: true } : {}),
      })
      first = false
    }
  }

  // The name usually sits above the first heading, and the résumé reader looks for it in the
  // preamble — so the title goes first, giving it something to find.
  if (signals.title) push(signals.title, false, 0)

  for (const section of signals.outline) {
    push(section.heading, true, section.level)
    // List items first: a profile's Experience section is a list far more often than prose,
    // and one item per line is exactly the shape the reader wants.
    if (section.items.length) for (const item of section.items) push(item, false, 0, true)
    else if (section.text) push(section.text, false, 0)
  }

  return lines
}

export { titleName, dedupeKey }
