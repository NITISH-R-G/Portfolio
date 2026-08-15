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
 * @typedef {object} FieldResult
 * @property {string} path
 * @property {'correct'|'wrong'|'missing'|'extra'} status
 * @property {'scalar'|'org'|'date'|'list'} kind
 * @property {boolean} evidenced
 * @property {unknown} [expected]
 * @property {unknown} [actual]
 */

/**
 * @typedef {object} CaseScore
 * @property {string} slug
 * @property {string[]} traits
 * @property {boolean} failed          No usable output at all.
 * @property {number} ms
 * @property {FieldResult[]} fields
 * @property {{found: number, misplaced: number, total: number}} structure
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
      fields.push({
        path,
        status: !has ? 'missing' : same(value, got.get(path), leafOf(path)) ? 'correct' : 'wrong',
        kind: kindOf(leafOf(path), value),
        evidenced: Boolean(evidence[`${group}|${path.slice(group.length + 1)}`]?.confidence),
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
        const actualValue = found ? valueAt(found, path.slice(subject.length + 1)) : undefined
        const has = actualValue !== undefined

        fields.push({
          path,
          status: !has ? 'missing' : same(value, actualValue, leaf) ? 'correct' : 'wrong',
          kind: kindOf(leaf, value),
          evidenced: Boolean(found?.source?.confidence ?? evidence[`${subject}|${path.slice(subject.length + 1)}`]?.confidence),
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
  }
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
  const failures = scores.filter((s) => s.failed).length
  const times = scores.map((s) => s.ms).sort((a, b) => a - b)

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

    failureRate: scores.length ? failures / scores.length : null,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : 0,
    totalMs: times.reduce((a, b) => a + b, 0),
  }
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
