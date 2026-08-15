/**
 * Scoring: what did the extractor actually get right?
 *
 * One number is not enough, because the ways extraction fails are not interchangeable. An
 * extractor that finds half the fields and gets them all right is useful — you can trust
 * what it gives you and prompt for the rest. One that finds every field and gets a third of
 * them wrong is worse than useless, because it looks complete. Both score 50% on any single
 * blended metric, so this module refuses to blend them.
 *
 *     recall       of everything on the page, how much was found?
 *     accuracy     of what was found, how much was right?
 *     precision    of what was produced, how much was real? (invention is penalised here)
 *     structure    did records land in the right collection?
 *     entities     were "Google" and "Google LLC" understood to be one employer?
 *     dates        were ranges, precisions and "Present" read correctly?
 *     evidence     can each correct value be traced to where it came from?
 *     failures     how often was there no usable output at all?
 *     latency      how long did it take?
 *
 * **Precision is the metric that keeps the others honest.** Recall alone rewards an
 * extractor for emitting everything it can imagine, and a page's navigation menu turns into
 * six job titles. Counting invented fields against it is what makes "found more" and "made
 * things up" distinguishable.
 *
 * @module benchmarks/score
 */

import { canonicalOrg, dedupeKey } from '../src/core/extraction/normalize.js'
import { COLLECTIONS } from '../src/core/schema/types.js'

/**
 * Leaf names whose values name an organization, and so are compared with legal-form
 * suffixes stripped. This list is also what the `entities` metric counts.
 */
const ORG_FIELDS = new Set(['company', 'institution', 'issuer', 'venue', 'publisher', 'organization', 'provider'])

/** Leaf names holding a date or a range. Counted separately by the `dates` metric. */
const DATE_FIELDS = new Set(['date', 'dates', 'expires', 'updatedAt', 'startDate', 'endDate'])

/**
 * How much of an expected list must be present for the value to count as correct.
 *
 * A judgement call, stated openly rather than buried: technology and topic lists are
 * legitimately fuzzy — a page listing "React, TypeScript, CSS" and an extractor reading
 * "React, TypeScript" has not made an error of the same kind as reading the wrong employer.
 * Requiring exact set equality would score honest partial reads as wrong and flatten the
 * difference between a near-miss and a fabrication.
 */
const LIST_THRESHOLD = 0.75

/**
 * Which sections can license a claim about each collection.
 *
 * Used by evidence validity. A company name read from under an "Experience" heading is
 * supported by its context; the same name read from a "Following" list is not, and the
 * difference is invisible to any check that only asks whether evidence *exists*.
 *
 * @type {Record<string, RegExp>}
 */
const SECTION_LICENSE = {
  experience: /experience|employment|work|positions?|career|roles?/i,
  education: /education|academic|qualifications?|degrees?|schooling/i,
  projects: /projects?|portfolio|work|selected/i,
  publications: /publications?|papers?|research|articles?|preprints?/i,
  certifications: /certifications?|certificates?|licen[cs]es?|credentials?/i,
  achievements: /achievements?|awards?|honou?rs?|accomplishments?|recognition/i,
  skills: /skills?|technologies|competenc|tools|stack|expertise/i,
  talks: /talks?|speaking|presentations?|conferences?/i,
  posts: /writing|posts?|articles?|blog|newsletter/i,
  languages: /languages?/i,
}

/**
 * @typedef {object} FieldResult
 * @property {string} path
 * @property {'correct'|'wrong'|'missing'|'extra'} status
 * @property {'scalar'|'org'|'date'|'list'} kind
 * @property {boolean} evidenced
 * @property {boolean} [supported]  Whether the evidence actually backs the value.
 * @property {unknown} [expected]
 * @property {unknown} [actual]
 */

/**
 * @typedef {object} TrapResult
 * @property {string} path
 * @property {unknown} value
 * @property {boolean} violated
 */

/**
 * @typedef {object} CaseScore
 * @property {string} slug
 * @property {string[]} traits
 * @property {boolean} failed          No usable output at all.
 * @property {number} ms
 * @property {FieldResult[]} fields
 * @property {{found: number, misplaced: number, total: number}} structure
 * @property {TrapResult[]} traps
 */

/**
 * Score one extraction against ground truth.
 *
 * @param {import('./corpus.js').Case} testCase
 * @param {{profile: Record<string, any>, evidence?: Record<string, {confidence: number}>}} extraction
 * @param {{ms?: number, failed?: boolean}} [meta]
 * @returns {CaseScore}
 */
export function scoreCase(testCase, extraction, meta = {}) {
  const expected = testCase.expected.profile ?? {}
  const actual = extraction.profile ?? {}
  const evidence = extraction.evidence ?? {}

  /** @type {FieldResult[]} */
  const fields = []
  const structure = { found: 0, misplaced: 0, total: 0 }

  /* Identity and socials --------------------------------------------------- */

  for (const group of ['identity', 'socials']) {
    const wanted = flattenScalars(expected[group] ?? {}, group)
    const got = flattenScalars(actual[group] ?? {}, group)

    for (const [path, value] of wanted) {
      const has = got.has(path)
      const span = evidence[`${group}|${path.slice(group.length + 1)}`]
      fields.push({
        path,
        status: !has ? 'missing' : same(value, got.get(path), leafOf(path)) ? 'correct' : 'wrong',
        kind: kindOf(leafOf(path), value),
        evidenced: Boolean(span?.confidence),
        supported: has ? supports(got.get(path), span, null) : undefined,
        expected: value,
        ...(has ? { actual: got.get(path) } : {}),
      })
    }

    for (const [path, value] of got) {
      if (!wanted.has(path)) {
        fields.push({ path, status: 'extra', kind: kindOf(leafOf(path), value), evidenced: false, actual: value })
      }
    }
  }

  /* Collections ------------------------------------------------------------ */

  // Indexed once across every collection so a record can be found in the wrong one — which
  // is exactly what the structure metric needs to see. An extractor that files a paper under
  // `projects` did not "miss" it, and reporting that as a miss would hide a fixable bug
  // behind a recall number.
  const actualIndex = indexRecords(actual)
  const matchedElsewhere = new Set()

  for (const collection of COLLECTIONS) {
    const wantedRecords = Array.isArray(expected[collection]) ? expected[collection] : []

    for (const record of wantedRecords) {
      structure.total += 1
      const key = dedupeKey(collection, record)
      const hit = actualIndex.get(`${collection}|${key}`)
      const elsewhere = hit ? null : findElsewhere(actualIndex, key, collection)

      if (hit) structure.found += 1
      else if (elsewhere) structure.misplaced += 1

      const found = hit ?? elsewhere?.record
      if (elsewhere) matchedElsewhere.add(elsewhere.indexKey)
      if (hit) matchedElsewhere.add(`${collection}|${key}`)

      const subject = `${collection}/${key}`
      for (const [path, value] of flattenScalars(record, subject)) {
        const leaf = leafOf(path)
        const attribute = path.slice(subject.length + 1)
        const actualValue = found ? valueAt(found, attribute) : undefined
        const has = actualValue !== undefined
        const span = evidence[`${collection}/${dedupeKey(collection, found ?? record)}|${attribute}`]
          ?? evidence[`${subject}|${attribute}`]

        fields.push({
          path,
          status: !has ? 'missing' : same(value, actualValue, leaf) ? 'correct' : 'wrong',
          kind: kindOf(leaf, value),
          evidenced: Boolean(span?.confidence ?? found?.source?.confidence),
          supported: has ? supports(actualValue, span ?? { confidence: found?.source?.confidence }, collection) : undefined,
          expected: value,
          ...(has ? { actual: actualValue } : {}),
        })
      }
    }
  }

  // Records the extractor produced that no expected record matches. These are the
  // fabrications precision is meant to catch — a nav menu read as employment history.
  for (const [indexKey, record] of actualIndex) {
    if (matchedElsewhere.has(indexKey)) continue
    const [collection] = indexKey.split('|')
    for (const [path, value] of flattenScalars(record, indexKey.replace('|', '/'))) {
      fields.push({ path, status: 'extra', kind: kindOf(leafOf(path), value), evidenced: false, actual: value })
    }
    if (!Array.isArray(expected[collection])) continue
  }

  return {
    slug: testCase.slug,
    traits: testCase.expected.traits ?? [],
    failed: Boolean(meta.failed),
    ms: meta.ms ?? 0,
    fields,
    structure,
    traps: scoreTraps(testCase.expected.forbidden, actual),
  }
}

/**
 * Check the things that must *not* be concluded.
 *
 * The dangerous failure in this system is not a missing field. It is a page that mentions
 * Google in a footer, Python in an article, or Cambridge in someone else's affiliation, and
 * an extractor that turns any of those into a claim about the person. Recall rewards that
 * behaviour and accuracy does not see it, because the invented value has no expected
 * counterpart to be wrong about.
 *
 * So the corpus states them explicitly, and they are scored as their own metric.
 *
 * @param {Record<string, any>|undefined} forbidden
 * @param {Record<string, any>} actual
 * @returns {TrapResult[]}
 */
function scoreTraps(forbidden, actual) {
  if (!forbidden) return []

  /** @type {TrapResult[]} */
  const results = []

  for (const [group, spec] of Object.entries(forbidden)) {
    if (Array.isArray(spec)) {
      const records = Array.isArray(actual[group]) ? actual[group] : []
      for (const banned of spec) {
        // Violated when *any* extracted record matches every stated field. Stating only
        // `{company: "Google"}` therefore bans the employer however the rest of the record
        // came out, which is the claim that matters.
        const violated = records.some((/** @type {any} */ record) =>
          Object.entries(banned).every(([key, value]) => same(value, record[key], key)))
        results.push({ path: `${group}[].${Object.keys(banned).join('+')}`, value: Object.values(banned).join(' / '), violated })
      }
      continue
    }

    for (const [path, value] of flattenScalars(spec, group)) {
      const got = valueAt(actual, path)
      results.push({ path, value, violated: got !== undefined && same(value, got, leafOf(path)) })
    }
  }

  return results
}

/**
 * Does this evidence actually back this value?
 *
 * A weaker check than entailment, and worth being precise about what it does and does not
 * establish. It asks two things:
 *
 *   1. **Containment** — does the recorded span actually contain the value? Evidence that
 *      does not mention what it supposedly supports is pointing at the wrong place.
 *   2. **Licensing** — did the span come from a section that can support this kind of claim?
 *      "Google" under *Experience* backs an employer; "Google" under *Following* does not,
 *      and containment alone cannot tell them apart.
 *
 * What it cannot do is judge meaning: "worked with Google's API" sits under Experience and
 * contains "Google", and this will accept it. Catching that needs a judge that reads the
 * sentence, which is a Tier 3 question. This is the deterministic floor beneath it.
 *
 * Values from structured data are supported by construction — the page declared them in a
 * typed field, and the declaration *is* the evidence.
 *
 * @param {unknown} value
 * @param {{confidence?: number, text?: string, section?: string}|undefined} span
 * @param {string|null} collection
 * @returns {boolean}
 */
export function supports(value, span, collection) {
  if (!span?.confidence) return false
  if (span.confidence >= 1) return true

  if (span.section && collection && SECTION_LICENSE[collection]) {
    if (!SECTION_LICENSE[collection].test(span.section)) return false
  }

  // No span text is not a failure of support — plenty of legitimate signals (a URL matching
  // a known platform) have no surrounding prose to quote. It is only unsupported when there
  // *is* a span and the value is absent from it.
  if (!span.text) return true

  const haystack = loose(span.text)
  const needles = Array.isArray(value) ? value : [value]
  return needles.every((v) => {
    if (v === null || v === undefined) return true
    if (typeof v === 'object') return true
    return haystack.includes(loose(v))
  })
}

/**
 * Roll case scores into the report's numbers.
 *
 * Every rate is over *fields*, not over cases, so a page with forty facts weighs more than
 * one with three. Averaging per-case percentages would let a thin fixture cancel out a rich
 * one and make the corpus's composition, rather than the extractor, decide the score.
 *
 * @param {CaseScore[]} scores
 */
export function aggregate(scores) {
  const count = (/** @type {(f: FieldResult) => boolean} */ p) =>
    scores.reduce((n, s) => n + s.fields.filter(p).length, 0)

  const correct = count((f) => f.status === 'correct')
  const wrong = count((f) => f.status === 'wrong')
  const missing = count((f) => f.status === 'missing')
  const extra = count((f) => f.status === 'extra')
  const expectedTotal = correct + wrong + missing
  const produced = correct + wrong + extra

  const byKind = (/** @type {FieldResult['kind']} */ kind) => {
    const want = count((f) => f.kind === kind && f.status !== 'extra')
    const got = count((f) => f.kind === kind && f.status === 'correct')
    return want ? got / want : null
  }

  const structure = scores.reduce(
    (acc, s) => ({
      found: acc.found + s.structure.found,
      misplaced: acc.misplaced + s.structure.misplaced,
      total: acc.total + s.structure.total,
    }),
    { found: 0, misplaced: 0, total: 0 },
  )

  const evidenced = count((f) => f.status === 'correct' && f.evidenced)
  const supported = count((f) => f.status === 'correct' && f.supported)
  const failures = scores.filter((s) => s.failed).length
  const times = scores.map((s) => s.ms).sort((a, b) => a - b)

  const traps = scores.flatMap((s) => s.traps)
  const violations = traps.filter((t) => t.violated).length

  // Pages whose content only exists after scripts run. Reported on their own because it is
  // the single axis a static fetcher cannot improve on, and therefore the clearest statement
  // of what a rendering layer would actually buy.
  const js = scores.filter((s) => s.traits.includes('javascript'))
  const jsFields = js.reduce((n, s) => n + s.fields.filter((f) => f.status === 'correct').length, 0)
  const jsExpected = js.reduce((n, s) => n + s.fields.filter((f) => f.status !== 'extra').length, 0)

  return {
    cases: scores.length,
    fields: { correct, wrong, missing, extra, expectedTotal, produced },

    recall: expectedTotal ? correct / expectedTotal : null,
    accuracy: correct + wrong ? correct / (correct + wrong) : null,
    precision: produced ? correct / produced : null,

    structure: structure.found + structure.misplaced ? structure.found / (structure.found + structure.misplaced) : null,
    entities: byKind('org'),
    dates: byKind('date'),

    evidence: correct ? evidenced / correct : null,
    // The stricter of the two: evidence that exists versus evidence that holds up.
    validity: correct ? supported / correct : null,

    // Of everything produced, how much was invented. The inverse of precision, reported
    // separately because it is the number to argue about when choosing a provider.
    inventionRate: produced ? extra / produced : null,
    traps: { total: traps.length, violations, rate: traps.length ? 1 - violations / traps.length : null },

    jsRecall: jsExpected ? jsFields / jsExpected : null,
    failureRate: scores.length ? failures / scores.length : null,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : 0,
    totalMs: times.reduce((a, b) => a + b, 0),
  }
}

/**
 * The bar a provider has to clear before recall, cost or latency are worth discussing.
 *
 * Ordered by how much damage the failure does, not by how much it costs to fix. Inventing
 * someone's employment history is a different category of harm from missing a field they
 * can add by hand, so no amount of recall buys its way past these.
 */
export const GATE = {
  precision: 0.97,
  evidence: 0.95,
  validity: 0.95,
  traps: 1,
}

/**
 * Which gates a provider's summary fails.
 *
 * @param {ReturnType<typeof aggregate>} summary
 * @returns {{metric: string, required: number, actual: number|null}[]}
 */
export function gateFailures(summary) {
  return Object.entries(GATE)
    .map(([metric, required]) => ({
      metric,
      required,
      actual: metric === 'traps' ? summary.traps.rate : summary[metric],
    }))
    .filter(({ actual, required }) => actual !== null && actual < required)
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Are two values the same fact?
 *
 * Not the same *bytes* — the same fact. "Senior Engineer" and "senior engineer" are one
 * value; so are "Google" and "Google, Inc."; so is a technology list in a different order.
 * Demanding byte equality would measure formatting, not extraction.
 *
 * @param {unknown} expected @param {unknown} actual @param {string} leaf
 * @returns {boolean}
 */
export function same(expected, actual, leaf) {
  if (expected === actual) return true
  if (expected === undefined || actual === undefined) return false

  if (ORG_FIELDS.has(leaf) && typeof expected === 'string' && typeof actual === 'string') {
    return canonicalOrg(expected) === canonicalOrg(actual)
  }

  if (typeof expected === 'string' && typeof actual === 'string') {
    // `https://example.dev` and `https://example.dev/` are the same page. The normalizer
    // canonicalizes URLs, and scoring that as an error would measure normalization rather
    // than extraction.
    if (/^https?:\/\//i.test(expected)) return loose(expected).replace(/\/$/, '') === loose(actual).replace(/\/$/, '')
    return loose(expected) === loose(actual)
  }

  if (typeof expected === 'number' || typeof actual === 'number') {
    return Number(expected) === Number(actual)
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (!expected.length) return !actual.length
    const want = new Set(expected.map((v) => loose(typeof v === 'string' ? v : JSON.stringify(v))))
    const got = new Set(actual.map((v) => loose(typeof v === 'string' ? v : JSON.stringify(v))))
    const hits = [...want].filter((v) => got.has(v)).length
    // Both directions matter: missing half the list is a partial read, and doubling it with
    // invented entries is a fabrication. One ratio would let the second hide.
    return hits / want.size >= LIST_THRESHOLD && hits / Math.max(got.size, 1) >= LIST_THRESHOLD
  }

  if (isObject(expected) && isObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
    // `display` is a rendering hint, not a fact, and a date that agrees on instant and
    // precision is correct whether or not the extractor pre-formatted it.
    keys.delete('display')
    return [...keys].every((k) => same(expected[k], actual[k], k))
  }

  return false
}

/** @param {unknown} value */
const loose = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,]$/, '').trim()

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/* -------------------------------------------------------------------------- */
/* Flattening                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A record's comparable leaves, as `path → value`.
 *
 * Arrays of strings stay whole — a technology list is one fact, not five, and scoring it as
 * five would let a single well-tagged project outweigh an entire missing job. Arrays of
 * objects are skipped: matching `links` and `metrics` positionally would measure ordering.
 *
 * `source` is excluded throughout. It is provenance the extractor stamps, not a claim about
 * the person, and scoring it would reward an extractor for describing itself.
 *
 * @param {Record<string, any>} object @param {string} prefix
 * @returns {Map<string, unknown>}
 */
export function flattenScalars(object, prefix) {
  /** @type {Map<string, unknown>} */
  const out = new Map()

  const walk = (/** @type {Record<string, any>} */ node, /** @type {string} */ path) => {
    for (const [key, value] of Object.entries(node ?? {})) {
      if (key === 'source' || key === 'id' || value === undefined || value === null || value === '') continue
      const here = `${path}.${key}`

      if (Array.isArray(value)) {
        if (value.every((v) => typeof v === 'string')) out.set(here, value)
        continue
      }
      // A PortfolioDate or DateRange is one fact; descending into `iso` and `precision`
      // would score a single date twice and let precision errors hide in the average.
      if (isObject(value) && !isDateish(value)) {
        walk(value, here)
        continue
      }
      out.set(here, value)
    }
  }

  walk(object, prefix)
  return out
}

/** @param {Record<string, any>} value */
const isDateish = (value) => 'iso' in value || 'start' in value || 'end' in value || 'current' in value

/** @param {string} path */
const leafOf = (path) => path.split('.').pop() ?? ''

/** @param {string} leaf @param {unknown} value @returns {FieldResult['kind']} */
function kindOf(leaf, value) {
  if (DATE_FIELDS.has(leaf)) return 'date'
  if (ORG_FIELDS.has(leaf)) return 'org'
  if (Array.isArray(value)) return 'list'
  return 'scalar'
}

/** @param {Record<string, any>} record @param {string} path */
function valueAt(record, path) {
  let node = record
  for (const part of path.split('.')) {
    if (node === undefined || node === null) return undefined
    node = node[part]
  }
  return node
}

/**
 * Every record the extractor produced, keyed `collection|dedupeKey`.
 *
 * @param {Record<string, any>} profile
 * @returns {Map<string, Record<string, any>>}
 */
function indexRecords(profile) {
  /** @type {Map<string, Record<string, any>>} */
  const index = new Map()
  for (const collection of COLLECTIONS) {
    const records = Array.isArray(profile[collection]) ? profile[collection] : []
    for (const record of records) index.set(`${collection}|${dedupeKey(collection, record)}`, record)
  }
  return index
}

/**
 * The same record, filed under a different collection.
 *
 * @param {Map<string, Record<string, any>>} index @param {string} key @param {string} not
 */
function findElsewhere(index, key, not) {
  for (const [indexKey, record] of index) {
    const [collection, recordKey] = splitOnce(indexKey)
    if (collection !== not && recordKey === key) return { record, indexKey }
  }
  return null
}

/** @param {string} value */
function splitOnce(value) {
  const at = value.indexOf('|')
  return [value.slice(0, at), value.slice(at + 1)]
}

export { ORG_FIELDS, DATE_FIELDS, LIST_THRESHOLD }
