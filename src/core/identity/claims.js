/**
 * Turning layers into claims.
 *
 * Every source is flattened into individual assertions before anything is merged, so that
 * disagreement is *representable* rather than destroyed at merge time. This is the step a
 * last-write-wins merge skips, and skipping it is why such a merge can never tell you what
 * it discarded.
 *
 * @module core/identity/claims
 */

import { COLLECTIONS } from '../schema/types.js'
import { normalizeProfile } from '../schema/profile.js'
import { recordKey } from '../schema/merge.js'
import { CLAIM_KINDS } from './types.js'

/** @typedef {import('./types.js').Claim} Claim */
/** @typedef {import('./types.js').Layer} Layer */
/** @typedef {import('./types.js').ClaimKind} ClaimKind */

/**
 * How to combine several sources' values for one attribute.
 *
 * Getting this table right is most of what separates a useful identity model from a naive
 * diff. Two connectors listing different technologies for the same project are not in
 * conflict — they each saw part of the truth, and the answer is the union. Two connectors
 * reporting different star counts are not in conflict either — one is simply older. Only
 * genuine disagreement about a single-valued fact deserves a person's attention.
 *
 * - `preferred` — one value wins; disagreement is a real conflict. The default.
 * - `union`     — set-valued; combine and de-duplicate. Never a conflict.
 * - `newest`    — a point-in-time measurement; the most recent observation wins.
 * - `first`     — ordered and meaningful as a whole; the highest-precedence list wins,
 *                 silently, because a partial merge would corrupt the order.
 *
 * @type {Record<string, 'preferred'|'union'|'newest'|'first'>}
 */
export const ATTRIBUTE_POLICY = {
  technologies: 'union',
  topics: 'union',
  tags: 'union',
  keywords: 'union',
  courses: 'union',
  interests: 'union',
  preferredRoles: 'union',
  preferredLocations: 'union',

  // Counts a platform re-reports on every sync. An older, smaller number is stale data,
  // not a competing opinion.
  stars: 'newest',
  forks: 'newest',
  watchers: 'newest',
  downloads: 'newest',
  citations: 'newest',
  likes: 'newest',
  views: 'newest',
  reactions: 'newest',
  comments: 'newest',
  rating: 'newest',
  maxRating: 'newest',
  problemsSolved: 'newest',
  contests: 'newest',
  globalRank: 'newest',
  updatedAt: 'newest',

  // Author order carries meaning; a union would scramble it.
  authors: 'first',
  // Prose lists. Merging two sources' bullet points produces near-duplicates, so one
  // source's list wins and the disagreement is surfaced.
  highlights: 'preferred',
  achievements: 'preferred',

  // Carried through, but never contested. These are structure and provenance rather than
  // claims *about* the person, so a disagreement is meaningless — "GitHub and your résumé
  // disagree about which connector fetched this" is not a question anyone can answer.
  // They must still be resolved and reattached, though: `source` in particular is what the
  // whole provenance story depends on, and dropping it would silently un-attribute every
  // record and break the stats derived from attribution.
  source: 'first',
  metrics: 'first',
  links: 'first',
  evidence: 'first',
  breakdown: 'first',
  featureScore: 'first',
  weight: 'first',
}

/**
 * The one attribute that is never a claim: it is the subject's own key, reattached during
 * assembly. Asserting it would make every record claim its own name.
 */
const NON_CONFLICTING = new Set(['id'])

/**
 * Which claim kind a layer's records represent.
 *
 * Read from the data rather than declared: only a connector that genuinely called an API
 * stamps `source.fetchedAt`, so its presence is what distinguishes a reported figure from
 * one the owner typed. The same signal already drives the "reported" / "self-reported"
 * labels on the rendered page, and reusing it keeps the two from ever disagreeing.
 *
 * @param {import('./types.js').LayerKind} layerKind
 * @param {Record<string, any>|undefined} record
 * @returns {ClaimKind}
 */
export function claimKindFor(layerKind, record) {
  if (layerKind === 'override') return 'verified'
  if (layerKind === 'document') return 'extracted'
  if (layerKind === 'connector') return record?.source?.fetchedAt ? 'reported' : 'stated'
  return 'stated'
}

/**
 * Flatten every layer into claims.
 *
 * @param {Layer[]} layers
 * @returns {Claim[]}
 */
export function collectClaims(layers) {
  /** @type {Claim[]} */
  const claims = []

  for (const layer of layers) {
    if (!layer?.profile) continue
    // An override layer carries patches, which are legitimately partial — an edit to a job
    // title names no company. They still go through the normalizer, so a patch is subject
    // to the same URL sanitization as imported data; it simply is not required to be a
    // complete record.
    const profile = normalizeProfile(layer.profile, { partial: layer.kind === 'override' })

    /**
     * Where this specific value was found, at the finest granularity available.
     *
     * Three sources of detail, most specific first: the layer's per-attribute evidence map,
     * the record's own stamp, and the layer's document identity. Falling through to the
     * last is what stops `identity` and `socials` — plain objects with nowhere to hang a
     * `source` — arriving unattributed.
     *
     * @param {string} subject @param {string} attribute @param {Record<string, any>} [record]
     */
    const evidenceFor = (subject, attribute, record) => {
      const span = layer.evidence?.[`${subject}|${attribute}`]
      const base = record?.source?.document ?? layer.document

      // Carried independently of the document evidence. A confidence can legitimately exist
      // without a span, and — more importantly — one attached to API-reported data is
      // exactly what `validateIdentity` needs to see in order to flag it. Dropping it here
      // because there was no document would hide the problem instead of reporting it.
      const confidence = record?.source?.confidence ?? span?.confidence
      const carried = confidence !== undefined ? { confidence } : {}

      if (!span && !base) return carried

      const document = { ...base, ...omit(span, 'confidence') }
      if (!document.id) return carried

      return { document, ...carried }
    }

    /** @param {string} subject @param {string} attribute @param {unknown} value @param {Record<string, any>} [record] */
    const add = (subject, attribute, value, record) => {
      if (value === undefined || value === null || value === '') return
      if (Array.isArray(value) && value.length === 0) return
      if (NON_CONFLICTING.has(attribute)) return

      claims.push({
        subject,
        attribute,
        value,
        source: layer.id,
        layerKind: layer.kind,
        kind: claimKindFor(layer.kind, record),
        observedAt: record?.source?.fetchedAt ?? layer.observedAt,
        url: record?.source?.url,
        // Carried onto the claim so a conflict can say "Résumé, page 1, Experience" rather
        // than just naming the file — which is the difference between a decision someone
        // can make and one they have to go and research.
        ...evidenceFor(subject, attribute, record),
      })
    }

    /* Identity ------------------------------------------------------------- */

    for (const [key, value] of Object.entries(profile.identity ?? {})) {
      // `name` is always present (as '') after normalization, so an empty one means "not
      // specified" rather than "set to empty" — asserting it would let a silent blank
      // outrank a real name.
      if (key === 'name' && !value) continue
      if (isPlainObject(value)) {
        for (const [inner, innerValue] of Object.entries(value)) {
          add('identity', `${key}.${inner}`, innerValue)
        }
      } else {
        add('identity', key, value)
      }
    }

    /* Socials -------------------------------------------------------------- */

    for (const [network, url] of Object.entries(profile.socials ?? {})) {
      add('socials', network, url)
    }

    /* Collections ---------------------------------------------------------- */

    for (const collection of COLLECTIONS) {
      const records = /** @type {Record<string, any>[]} */ (profile[collection] ?? [])
      if (!Array.isArray(records)) continue

      for (const record of records) {
        const subject = `${collection}/${recordKey(collection, record)}`
        for (const [attribute, value] of Object.entries(record)) {
          add(subject, attribute, value, record)
        }
        // The record's own existence is a claim, so a subject asserted by only one source
        // is still traceable to it even when every field is unanimous.
        claims.push({
          subject,
          attribute: '@exists',
          value: true,
          source: layer.id,
          layerKind: layer.kind,
          kind: claimKindFor(layer.kind, record),
          observedAt: record?.source?.fetchedAt ?? layer.observedAt,
          url: record?.source?.url,
        })
      }
    }

    /* Custom collections ---------------------------------------------------- */

    // User-declared sections for things no platform models — an Air Rifle Shooting
    // achievement, a community role. They resolve exactly like built-in collections, so a
    // hand-added record gets the same provenance and conflict handling as an imported one.
    for (const [name, records] of Object.entries(profile.custom ?? {})) {
      if (!Array.isArray(records)) continue
      for (const record of records) {
        const subject = `custom:${name}/${recordKey('custom', record)}`
        for (const [attribute, value] of Object.entries(record)) {
          add(subject, attribute, value, record)
        }
        claims.push({
          subject,
          attribute: '@exists',
          value: true,
          source: layer.id,
          layerKind: layer.kind,
          kind: claimKindFor(layer.kind, record),
          observedAt: record?.source?.fetchedAt ?? layer.observedAt,
          url: record?.source?.url,
        })
      }
    }

    /* Stats ---------------------------------------------------------------- */

    for (const entry of profile.stats?.entries ?? []) {
      if (!entry?.id) continue
      // Derived stats are recomputed downstream from the records on the page, so treating
      // them as claims would raise conflicts about numbers nobody asserted.
      if (entry.kind === 'derived') continue
      add(`stats/${entry.id}`, 'value', entry.value)
      add(`stats/${entry.id}`, 'label', entry.label)
      add(`stats/${entry.id}`, 'kind', entry.kind)
      add(`stats/${entry.id}`, 'note', entry.note)
    }
  }

  return claims
}

/**
 * Group claims by what they are about.
 *
 * @param {Claim[]} claims
 * @returns {Map<string, Claim[]>}
 */
export function groupClaims(claims) {
  /** @type {Map<string, Claim[]>} */
  const grouped = new Map()
  for (const claim of claims) {
    const key = `${claim.subject}|${claim.attribute}`
    const bucket = grouped.get(key)
    if (bucket) bucket.push(claim)
    else grouped.set(key, [claim])
  }
  return grouped
}

/**
 * The policy for an attribute.
 * @param {string} attribute
 * @returns {'preferred'|'union'|'newest'|'first'}
 */
export function policyFor(attribute) {
  return ATTRIBUTE_POLICY[attribute] ?? 'preferred'
}

/**
 * Order claims strongest-first.
 *
 * Layer precedence is the primary key, deliberately: it is what guarantees that what a
 * person wrote about themselves is never overwritten by an import. Only when two layers of
 * the *same* kind disagree — two connectors, say — do recency and claim kind decide, since
 * there the alternative would be alphabetical order by filename, which means nothing.
 *
 * @param {Claim[]} claims
 * @param {Record<string, number>} precedence
 * @returns {Claim[]}
 */
export function rankClaims(claims, precedence) {
  return [...claims].sort((a, b) => {
    const layerDelta = (precedence[b.layerKind] ?? 0) - (precedence[a.layerKind] ?? 0)
    if (layerDelta) return layerDelta

    const timeDelta = timeOf(b) - timeOf(a)
    if (timeDelta) return timeDelta

    const kindDelta = (CLAIM_KINDS[b.kind]?.rank ?? 0) - (CLAIM_KINDS[a.kind]?.rank ?? 0)
    if (kindDelta) return kindDelta

    // Stable and explainable rather than arbitrary.
    return a.source.localeCompare(b.source)
  })
}

/** @param {Claim} claim */
function timeOf(claim) {
  const ms = claim.observedAt ? Date.parse(claim.observedAt) : NaN
  return Number.isFinite(ms) ? ms : 0
}

/** @param {unknown} v */
const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)

/**
 * A copy without one key. Used to keep `confidence` out of the document-evidence object,
 * where it would look like part of the location rather than a judgement about it.
 *
 * @param {Record<string, unknown>|undefined} object
 * @param {string} key
 */
function omit(object, key) {
  if (!object) return undefined
  const { [key]: _dropped, ...rest } = object
  return rest
}

export { isPlainObject }
