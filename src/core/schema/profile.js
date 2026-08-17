/**
 * Profile construction and coercion.
 *
 * `normalizeProfile` is the gate that every piece of data passes through before it reaches
 * the merge layer — connector output, hand-written JSON, imported résumés, admin drafts.
 * It is deliberately forgiving: unknown fields are dropped, malformed records are skipped,
 * and loose values are coerced to schema shape. It never throws. Anything genuinely wrong
 * is surfaced by `validate.js`, which reports without discarding.
 *
 * @module core/schema/profile
 */

import { COLLECTIONS } from './types.js'
import { parseDate, parseRange } from './date.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Link} Link */
/** @typedef {import('./types.js').Metric} Metric */
/** @typedef {import('./types.js').Provenance} Provenance */

/**
 * An empty but structurally complete profile. Every collection exists as an empty array so
 * consumers can iterate without guarding, and `identity.name` is the empty string rather
 * than undefined so rendering never prints "undefined".
 *
 * @returns {Profile}
 */
export function createEmptyProfile() {
  return {
    identity: { name: '' },
    education: [],
    experience: [],
    projects: [],
    skills: [],
    achievements: [],
    certifications: [],
    publications: [],
    posts: [],
    packages: [],
    videos: [],
    models: [],
    hackathons: [],
    talks: [],
    competitive: [],
    languages: [],
    custom: {},
    socials: {},
    stats: { entries: [] },
    meta: {},
  }
}

/* -------------------------------------------------------------------------- */
/* Primitive coercion                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Coerce to a trimmed non-empty string, or `undefined`.
 * @param {unknown} v
 * @returns {string|undefined}
 */
export function str(v) {
  if (typeof v === 'string') {
    const t = v.trim()
    return t || undefined
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

/**
 * Coerce to a finite number, or `undefined`. Accepts strings with separators ("1,250").
 * @param {unknown} v
 * @returns {number|undefined}
 */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const cleaned = v.replace(/[,\s_]/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Coerce to an array of trimmed, de-duplicated, non-empty strings.
 * Accepts an array or a comma/newline separated string.
 *
 * @param {unknown} v
 * @returns {string[]|undefined}
 */
export function strArray(v) {
  /** @type {string[]} */
  let list = []
  if (Array.isArray(v)) {
    list = v.map(str).filter(/** @returns {x is string} */ (x) => Boolean(x))
  } else if (typeof v === 'string') {
    list = v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  } else {
    return undefined
  }
  const seen = new Set()
  const out = []
  for (const item of list) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.length ? out : undefined
}

/**
 * Accept only `http:`, `https:` and `mailto:` URLs. This is a security boundary, not a
 * formatting nicety: imported data is untrusted, and rendering an attacker-supplied
 * `javascript:` URL into an `href` would be an XSS vector.
 *
 * A bare `example.com/x` is upgraded to `https://`; anything else is rejected.
 *
 * @param {unknown} v
 * @returns {string|undefined}
 */
export function url(v) {
  const s = str(v)
  if (!s) return undefined

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : `https://${s}`
  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
    return undefined
  }
  return parsed.href
}

/**
 * Like {@link url} but also permits site-relative paths (`/assets/me.png`, `assets/me.png`)
 * and `data:image/*` URIs, for images the user ships with the repo or pastes into the admin.
 *
 * @param {unknown} v
 * @returns {string|undefined}
 */
export function imageRef(v) {
  const s = str(v)
  if (!s) return undefined
  if (s.startsWith('data:image/')) return s
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return url(s)
  // Relative or root-relative path; reject protocol-relative `//host` which escapes the origin.
  if (s.startsWith('//')) return undefined
  return s
}

/**
 * @param {unknown} v
 * @returns {Link|undefined}
 */
export function link(v) {
  if (!v || typeof v !== 'object') return undefined
  const o = /** @type {Record<string, unknown>} */ (v)
  const href = url(o.url ?? o.href ?? o.link)
  if (!href) return undefined
  return {
    label: str(o.label) ?? str(o.name) ?? hostLabel(href),
    url: href,
    ...(str(o.rel) ? { rel: str(o.rel) } : {}),
  }
}

/** @param {string} href @returns {string} */
function hostLabel(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}

/**
 * @param {unknown} v
 * @returns {Link[]|undefined}
 */
export function links(v) {
  if (!Array.isArray(v)) return undefined
  const out = v.map(link).filter(/** @returns {x is Link} */ (x) => Boolean(x))
  return out.length ? out : undefined
}

/**
 * @param {unknown} v
 * @returns {Metric[]|undefined}
 */
export function metrics(v) {
  if (!Array.isArray(v)) return undefined
  const out = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = /** @type {Record<string, unknown>} */ (raw)
    const label = str(o.label)
    const value = str(o.value)
    if (!label || !value) continue
    const numeric = num(o.numeric) ?? num(o.value)
    out.push({
      label,
      value,
      ...(numeric !== undefined ? { numeric } : {}),
      ...(str(o.note) ? { note: str(o.note) } : {}),
      ...(provenance(o.source) ? { source: provenance(o.source) } : {}),
    })
  }
  return out.length ? out : undefined
}

/**
 * @param {unknown} v
 * @returns {Provenance|undefined}
 */
export function provenance(v) {
  if (!v || typeof v !== 'object') return undefined
  const o = /** @type {Record<string, unknown>} */ (v)
  const connector = str(o.connector)
  if (!connector) return undefined
  return compact({
    connector,
    url: url(o.url),
    fetchedAt: str(o.fetchedAt),
    document: documentEvidence(o.document),
    extraction: extractionProvenance(o.extraction),
    // Clamped rather than rejected: an extractor reporting 1.2 has a scaling bug, not a
    // meaningless answer. Anything non-numeric is dropped, because a confidence that
    // cannot be compared is worse than none — `validateIdentity` reports both cases.
    confidence: confidenceOf(o.confidence),
  })
}

/**
 * How a value was read, as opposed to who said it.
 *
 * A separate axis from `document`, and increasingly load-bearing. Claim provenance answers
 * *who asserted this and when*; this answers *by what mechanism did we come to believe it* —
 * which provider fetched the page, whether scripts ran, which signal on the page supplied the
 * value. Once a heading-derived reading and a model-inferred one can appear side by side in
 * the same conflict, that difference is the thing a person needs in order to choose.
 *
 * Only fields an extractor genuinely knows survive, on the same principle as document
 * evidence: a fabricated mechanism is worse than an absent one.
 *
 * @param {unknown} v
 */
function extractionProvenance(v) {
  if (!v || typeof v !== 'object') return undefined
  const o = /** @type {Record<string, unknown>} */ (v)
  const out = compact({
    provider: str(o.provider),
    method: str(o.method),
    model: str(o.model),
    rendered: typeof o.rendered === 'boolean' ? o.rendered : undefined,
    inferred: typeof o.inferred === 'boolean' ? o.inferred : undefined,
  })
  return out && Object.keys(out).length ? out : undefined
}

/**
 * Where in a document a value was found.
 *
 * Only fields the extractor actually knows survive. A Markdown résumé has headings but no
 * pages, and inventing a page number to fill the shape would make the evidence a lie in
 * exactly the place a person goes to check it.
 *
 * @param {unknown} v
 * @returns {import('./types.js').DocumentEvidence|undefined}
 */
export function documentEvidence(v) {
  if (!v || typeof v !== 'object') return undefined
  const o = /** @type {Record<string, unknown>} */ (v)
  const id = str(o.id)
  if (!id) return undefined

  const page = num(o.page)
  const line = num(o.line)

  return compact({
    id,
    versionId: str(o.versionId),
    filename: str(o.filename),
    page: page !== undefined && page > 0 ? Math.floor(page) : undefined,
    section: str(o.section),
    heading: str(o.heading),
    // Truncated: evidence is for checking a value, not for storing the document twice.
    text: truncateSpan(str(o.text)),
    line: line !== undefined && line > 0 ? Math.floor(line) : undefined,
  })
}

/** @param {unknown} v @returns {number|undefined} */
function confidenceOf(v) {
  const n = num(v)
  if (n === undefined) return undefined
  return Math.min(1, Math.max(0, n))
}

/** @param {string|undefined} text */
function truncateSpan(text, max = 300) {
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/**
 * Drop `undefined` values so serialized JSON stays small and diffs stay readable.
 * @template {Record<string, unknown>} T
 * @param {T} obj
 * @returns {T}
 */
function compact(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k]
  }
  return obj
}

/**
 * Build a stable, human-readable id from a string. Ids matter because the merge layer uses
 * them to match a user override to the record it overrides across re-imports.
 *
 * @param {...(string|undefined)} parts
 * @returns {string}
 */
export function slugify(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Transliterated before the strip below, which would otherwise reduce "C", "C++" and
    // "C#" to the same key and silently merge three distinct skills into one. Only these
    // two symbols actually distinguish real technology names, so only these are mapped.
    .replace(/\+\+/g, 'pp')
    .replace(/\+/g, 'p')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

/* -------------------------------------------------------------------------- */
/* Record normalizers                                                          */
/* -------------------------------------------------------------------------- */

/** @param {Record<string, unknown>} o */
const education = (o) => {
  const institution = str(o.institution) ?? str(o.school) ?? str(o.name)
  if (!institution) return null
  return compact({
    id: str(o.id) ?? slugify(institution, str(o.degree)),
    institution,
    degree: str(o.degree),
    field: str(o.field) ?? str(o.fieldOfStudy),
    location: str(o.location),
    dates: parseRange(o.dates ?? o.period ?? { start: o.startDate, end: o.endDate }),
    grade: str(o.grade) ?? str(o.gpa),
    description: str(o.description),
    courses: strArray(o.courses),
    achievements: strArray(o.achievements),
    links: links(o.links),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const experience = (o) => {
  const company = str(o.company) ?? str(o.organization) ?? str(o.employer)
  if (!company) return null
  return compact({
    id: str(o.id) ?? slugify(company, str(o.role)),
    company,
    role: str(o.role) ?? str(o.title) ?? str(o.position),
    location: str(o.location),
    employmentType: enumOf(o.employmentType, [
      'full-time', 'part-time', 'internship', 'contract', 'freelance', 'volunteer',
    ]),
    dates: parseRange(o.dates ?? o.period ?? { start: o.startDate, end: o.endDate }),
    description: str(o.description) ?? str(o.summary),
    highlights: strArray(o.highlights ?? o.responsibilities),
    technologies: strArray(o.technologies ?? o.tools ?? o.stack),
    metrics: metrics(o.metrics),
    links: links(o.links),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const project = (o) => {
  const name = str(o.name) ?? str(o.title)
  if (!name) return null
  return compact({
    id: str(o.id) ?? slugify(name),
    name,
    description: str(o.description),
    technologies: strArray(o.technologies ?? o.tools ?? o.tags ?? o.stack),
    repository: url(o.repository ?? o.repoLink ?? o.repoUrl),
    liveUrl: url(o.liveUrl ?? o.demo ?? o.homepage),
    image: imageRef(o.image ?? o.coverImage),
    imageAlt: str(o.imageAlt),
    stars: num(o.stars),
    forks: num(o.forks),
    watchers: num(o.watchers),
    primaryLanguage: str(o.primaryLanguage ?? o.language),
    topics: strArray(o.topics),
    featured: typeof o.featured === 'boolean' ? o.featured : undefined,
    featureScore: num(o.featureScore),
    date: parseDate(o.date ?? o.createdAt),
    updatedAt: parseDate(o.updatedAt ?? o.pushedAt),
    status: enumOf(o.status, ['active', 'completed', 'archived', 'wip']),
    isFork: typeof o.isFork === 'boolean' ? o.isFork : undefined,
    role: str(o.role),
    context: str(o.context),
    problem: str(o.problem),
    approach: str(o.approach),
    impact: str(o.impact),
    responsibilities: str(o.responsibilities),
    constraints: str(o.constraints),
    lessons: str(o.lessons),
    metrics: metrics(o.metrics),
    links: links(o.links),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const skill = (o) => {
  const name = str(o.name) ?? (typeof o === 'string' ? str(o) : undefined)
  if (!name) return null
  const proficiency = num(o.proficiency)
  return compact({
    name,
    category: str(o.category),
    proficiency: proficiency !== undefined ? clamp(proficiency, 1, 5) : undefined,
    evidence: evidenceList(o.evidence),
    weight: num(o.weight),
    source: provenance(o.source),
  })
}

/** @param {unknown} v */
function evidenceList(v) {
  if (!Array.isArray(v)) return undefined
  const out = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = /** @type {Record<string, unknown>} */ (raw)
    const label = str(o.label)
    if (!label) continue
    out.push(compact({
      label,
      count: num(o.count),
      connector: str(o.connector),
      url: url(o.url),
    }))
  }
  return out.length ? out : undefined
}

/** @param {Record<string, unknown>} o */
const achievement = (o) => {
  const title = str(o.title) ?? str(o.name)
  if (!title) return null
  return compact({
    id: str(o.id) ?? slugify(title),
    title,
    organization: str(o.organization) ?? str(o.issuer) ?? str(o.venue),
    rank: str(o.rank),
    date: parseDate(o.date),
    description: str(o.description),
    url: url(o.url),
    metrics: metrics(o.metrics),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const certification = (o) => {
  const name = str(o.name) ?? str(o.title)
  if (!name) return null
  return compact({
    id: str(o.id) ?? slugify(name, str(o.issuer)),
    name,
    issuer: str(o.issuer),
    date: parseDate(o.date),
    expires: parseDate(o.expires),
    credentialId: str(o.credentialId) ?? str(o.credential),
    credentialUrl: url(o.credentialUrl),
    image: imageRef(o.image),
    imageAlt: str(o.imageAlt),
    description: str(o.description),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const publication = (o) => {
  const title = str(o.title)
  if (!title) return null
  return compact({
    id: str(o.id) ?? slugify(title),
    title,
    authors: strArray(o.authors),
    venue: str(o.venue) ?? str(o.journal),
    type: enumOf(o.type, ['journal', 'conference', 'preprint', 'thesis', 'chapter', 'other']),
    date: parseDate(o.date),
    abstract: str(o.abstract),
    doi: str(o.doi),
    url: url(o.url),
    citations: num(o.citations),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const post = (o) => {
  const title = str(o.title)
  if (!title) return null
  return compact({
    id: str(o.id) ?? slugify(title),
    title,
    url: url(o.url),
    date: parseDate(o.date),
    excerpt: str(o.excerpt) ?? str(o.description),
    tags: strArray(o.tags),
    reactions: num(o.reactions),
    comments: num(o.comments),
    publication: str(o.publication),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const pkg = (o) => {
  const name = str(o.name)
  const registry = str(o.registry)
  if (!name || !registry) return null
  return compact({
    id: str(o.id) ?? slugify(registry, name),
    name,
    registry,
    description: str(o.description),
    version: str(o.version),
    url: url(o.url),
    repository: url(o.repository),
    downloads: num(o.downloads),
    downloadsPeriod: str(o.downloadsPeriod),
    keywords: strArray(o.keywords),
    updatedAt: parseDate(o.updatedAt),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const video = (o) => {
  const title = str(o.title)
  if (!title) return null
  return compact({
    id: str(o.id) ?? slugify(title),
    title,
    url: url(o.url),
    thumbnail: imageRef(o.thumbnail),
    date: parseDate(o.date),
    description: str(o.description),
    views: num(o.views),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const model = (o) => {
  const name = str(o.name)
  const kind = enumOf(o.kind, ['model', 'dataset', 'space'])
  if (!name || !kind) return null
  return compact({
    id: str(o.id) ?? slugify(kind, name),
    name,
    kind,
    url: url(o.url),
    description: str(o.description),
    likes: num(o.likes),
    downloads: num(o.downloads),
    tags: strArray(o.tags),
    updatedAt: parseDate(o.updatedAt),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const hackathon = (o) => {
  const name = str(o.name) ?? str(o.title)
  if (!name) return null
  return compact({
    id: str(o.id) ?? slugify(name),
    name,
    event: str(o.event),
    result: str(o.result),
    role: str(o.role),
    date: parseDate(o.date),
    description: str(o.description),
    technologies: strArray(o.technologies ?? o.tools),
    metrics: metrics(o.metrics),
    links: links(o.links),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const talk = (o) => {
  const title = str(o.title)
  if (!title) return null
  return compact({
    id: str(o.id) ?? slugify(title),
    title,
    event: str(o.event),
    venue: str(o.venue),
    audience: str(o.audience),
    format: str(o.format),
    date: parseDate(o.date),
    description: str(o.description),
    links: links(o.links),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const competitive = (o) => {
  const platform = str(o.platform)
  if (!platform) return null
  /** @type {Record<string, number>|undefined} */
  let breakdown
  if (o.breakdown && typeof o.breakdown === 'object') {
    breakdown = {}
    for (const [k, val] of Object.entries(/** @type {Record<string, unknown>} */ (o.breakdown))) {
      const n = num(val)
      if (n !== undefined) breakdown[k] = n
    }
    if (!Object.keys(breakdown).length) breakdown = undefined
  }
  return compact({
    platform,
    connector: str(o.connector),
    username: str(o.username),
    url: url(o.url),
    rating: num(o.rating),
    maxRating: num(o.maxRating),
    rank: str(o.rank),
    maxRank: str(o.maxRank),
    problemsSolved: num(o.problemsSolved),
    contests: num(o.contests),
    globalRank: num(o.globalRank),
    breakdown,
    metrics: metrics(o.metrics),
    source: provenance(o.source),
  })
}

/** @param {Record<string, unknown>} o */
const language = (o) => {
  const name = str(o.name)
  if (!name) return null
  const level = num(o.level)
  return compact({
    name,
    level: level !== undefined ? clamp(level, 1, 5) : undefined,
    label: str(o.label),
  })
}

/** @param {Record<string, unknown>} o */
const custom = (o) => {
  const title = str(o.title) ?? str(o.name)
  if (!title) return null
  return compact({
    id: str(o.id) ?? slugify(title),
    title,
    subtitle: str(o.subtitle) ?? str(o.role),
    date: parseDate(o.date),
    description: str(o.description),
    tags: strArray(o.tags),
    metrics: metrics(o.metrics),
    links: links(o.links),
    source: provenance(o.source),
  })
}

/**
 * Normalizer for each collection, keyed by collection name.
 * @type {Record<string, (o: Record<string, unknown>) => (Record<string, unknown>|null)>}
 */
const NORMALIZERS = {
  education,
  experience,
  projects: project,
  skills: skill,
  achievements: achievement,
  certifications: certification,
  publications: publication,
  posts: post,
  packages: pkg,
  videos: video,
  models: model,
  hackathons: hackathon,
  talks: talk,
  competitive,
  languages: language,
}

/**
 * The field each normalizer requires before it will accept a record, and the reason it
 * does: a project with no name cannot be rendered, so dropping it is right.
 *
 * A *patch* is the exception. An override that changes only a job title is keyed by id and
 * legitimately carries nothing else, and rejecting it would silently discard the user's
 * edit — so `normalizeProfile(input, {partial: true})` supplies these temporarily, runs the
 * normalizer for its coercion and safety checks, then removes what it supplied.
 *
 * @type {Record<string, string[]>}
 */
const IDENTIFYING_FIELDS = {
  education: ['institution'],
  experience: ['company'],
  projects: ['name'],
  skills: ['name'],
  achievements: ['title'],
  certifications: ['name'],
  publications: ['title'],
  posts: ['title'],
  packages: ['name', 'registry'],
  videos: ['title'],
  models: ['name', 'kind'],
  hackathons: ['name'],
  talks: ['title'],
  competitive: ['platform'],
  languages: ['name'],
}

/** Distinctive enough that no real value collides with it. */
const PLACEHOLDER = ' partial '

/**
 * Normalize a record that may be a partial patch.
 *
 * Runs the real normalizer — so a patch is subject to exactly the same URL sanitization and
 * type coercion as imported data, which matters because overrides come from a JSON file and
 * from localStorage — then strips the fields that were only supplied to get past its guard.
 *
 * @param {string} collection
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>|null}
 */
function normalizePartial(collection, record) {
  const normalizer = NORMALIZERS[collection]
  if (!normalizer) return null

  const required = IDENTIFYING_FIELDS[collection] ?? []
  const supplied = required.filter((field) => !str(record[field]))
  if (!supplied.length) return normalizer(record)

  // `models.kind` is an enum, so a sentinel would be rejected; a valid member gets it past
  // the guard and is removed again below.
  const stand = (field) => (field === 'kind' ? 'model' : PLACEHOLDER)
  const padded = { ...record }
  for (const field of supplied) padded[field] = stand(field)

  const normalized = normalizer(padded)
  if (!normalized) return null

  for (const field of supplied) delete normalized[field]
  return normalized
}

/** @param {unknown} v @param {readonly string[]} allowed */
function enumOf(v, allowed) {
  const s = str(v)
  if (!s) return undefined
  const lower = s.toLowerCase()
  return allowed.includes(lower) ? lower : undefined
}

/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/* -------------------------------------------------------------------------- */
/* Top-level                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Normalize an arbitrary object into a `Profile`.
 *
 * Never throws. Records that cannot be identified (no name, no title) are dropped;
 * unknown top-level keys are ignored. The result is always structurally complete.
 *
 * @param {unknown} input
 * @returns {Profile}
 */
export function normalizeProfile(input, options = {}) {
  const base = createEmptyProfile()
  if (!input || typeof input !== 'object') return base
  const o = /** @type {Record<string, unknown>} */ (input)

  base.identity = normalizeIdentity(o.identity ?? o.profile ?? {})

  for (const key of COLLECTIONS) {
    const normalizer = NORMALIZERS[key]
    const raw = o[key]
    if (!normalizer || !Array.isArray(raw)) continue
    // A bare string is accepted only where it is unambiguous shorthand for a name.
    // Elsewhere a stray string is malformed data and gets dropped rather than becoming
    // a record whose name is the literal text.
    const allowsShorthand = key === 'skills' || key === 'languages'
    const out = []
    for (const record of raw) {
      const asObject = allowsShorthand && typeof record === 'string' ? { name: record } : record
      if (!asObject || typeof asObject !== 'object') continue
      const source = /** @type {Record<string, unknown>} */ (asObject)
      // In partial mode a record identified only by `id` is a patch, not a broken record,
      // and must survive — otherwise a user's edit to one field is silently discarded.
      const normalized = options.partial && str(source.id)
        ? normalizePartial(key, source)
        : normalizer(source)
      if (normalized) out.push(normalized)
    }
    // @ts-expect-error — collections are homogeneous by construction.
    base[key] = out
  }

  if (o.custom && typeof o.custom === 'object' && !Array.isArray(o.custom)) {
    for (const [key, raw] of Object.entries(/** @type {Record<string, unknown>} */ (o.custom))) {
      if (!Array.isArray(raw)) continue
      const out = []
      for (const record of raw) {
        if (!record || typeof record !== 'object') continue
        const normalized = custom(/** @type {Record<string, unknown>} */ (record))
        if (normalized) out.push(normalized)
      }
      if (out.length) base.custom[key] = /** @type {any} */ (out)
    }
  }

  if (o.socials && typeof o.socials === 'object') {
    for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (o.socials))) {
      const href = url(value)
      if (href) base.socials[key] = href
    }
  }

  if (o.stats && typeof o.stats === 'object') {
    const entries = /** @type {Record<string, unknown>} */ (o.stats).entries
    if (Array.isArray(entries)) {
      base.stats.entries = entries.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return []
        const e = /** @type {Record<string, unknown>} */ (raw)
        const label = str(e.label)
        const value = num(e.value)
        if (!label || value === undefined) return []
        return [compact({
          id: str(e.id) ?? slugify(label),
          label,
          value,
          display: str(e.display),
          note: str(e.note),
          kind: enumOf(e.kind, ['fetched', 'derived', 'stated']) ?? 'derived',
          connectors: strArray(e.connectors),
        })]
      })
    }
  }

  if (o.meta && typeof o.meta === 'object') {
    const m = /** @type {Record<string, unknown>} */ (o.meta)
    base.meta = compact({
      generatedAt: str(m.generatedAt),
      connectors: strArray(m.connectors),
      sourceStatus: m.sourceStatus && typeof m.sourceStatus === 'object'
        ? /** @type {Record<string, string>} */ (m.sourceStatus)
        : undefined,
    })
  }

  return base
}

/**
 * @param {unknown} input
 * @returns {import('./types.js').Identity}
 */
export function normalizeIdentity(input) {
  if (!input || typeof input !== 'object') return { name: '' }
  const o = /** @type {Record<string, unknown>} */ (input)

  /** @type {import('./types.js').Availability|undefined} */
  let availability
  if (o.availability && typeof o.availability === 'object') {
    const a = /** @type {Record<string, unknown>} */ (o.availability)
    availability = compact({
      status: enumOf(a.status, ['open', 'selective', 'closed']),
      label: str(a.label),
      interests: strArray(a.interests),
      preferredRoles: strArray(a.preferredRoles),
      preferredLocations: strArray(a.preferredLocations),
      responseTime: str(a.responseTime),
      currentAffiliation: str(a.currentAffiliation),
    })
    if (!Object.keys(availability).length) availability = undefined
  } else if (typeof o.availability === 'string') {
    availability = { label: str(o.availability) }
  }

  /** @type {import('./types.js').Contact|undefined} */
  let contact
  if (o.contact && typeof o.contact === 'object') {
    const c = /** @type {Record<string, unknown>} */ (o.contact)
    const email = str(c.email)
    contact = compact({
      // Validate shape before we ever render it into a `mailto:` href.
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
      phone: str(c.phone),
      website: url(c.website),
      links: links(c.links),
    })
    if (!Object.keys(contact).length) contact = undefined
  }

  return compact({
    name: str(o.name) ?? '',
    headline: str(o.headline) ?? str(o.role) ?? str(o.title),
    summary: str(o.summary) ?? str(o.about) ?? str(o.bio),
    location: str(o.location),
    avatar: imageRef(o.avatar ?? o.image ?? o.photo),
    pronouns: str(o.pronouns),
    availability,
    contact,
  })
}
