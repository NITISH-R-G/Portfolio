/**
 * Claims → canonical profile.
 *
 * Three things happen here, and keeping them separate is the point:
 *
 *   1. **Resolve.** Pick a value for every attribute, per that attribute's policy.
 *   2. **Detect.** Notice where independent sources genuinely disagreed.
 *   3. **Explain.** Keep every claim, so any published value can be traced to who said it.
 *
 * A merge does step 1 and throws away the information needed for 2 and 3. Doing all three
 * is what lets the product show someone their own contradictions and let them decide once,
 * permanently.
 *
 * @module core/identity/resolve
 */

import { COLLECTIONS } from '../schema/types.js'
import { createEmptyProfile, normalizeProfile } from '../schema/profile.js'
import { LAYER_PRECEDENCE, CLAIM_KINDS, EVIDENCE_LAYERS } from './types.js'
import { collectClaims, groupClaims, rankClaims, policyFor, isPlainObject } from './claims.js'

/** @typedef {import('./types.js').Claim} Claim */
/** @typedef {import('./types.js').Conflict} Conflict */
/** @typedef {import('./types.js').Layer} Layer */

/**
 * Resolve a set of layers into one canonical identity.
 *
 * @param {Layer[]} layers
 * @param {{
 *   resolutions?: Record<string, {source?: string, value?: unknown}>,
 *   labels?: Record<string, string>,
 * }} [options]
 * @returns {import('./types.js').CanonicalIdentity}
 */
export function resolveIdentity(layers, options = {}) {
  const active = (layers ?? []).filter((layer) => layer?.profile)
  const resolutions = options.resolutions ?? {}
  const labels = { ...Object.fromEntries(active.map((l) => [l.id, l.label ?? l.id])), ...options.labels }

  const claims = collectClaims(active)
  const grouped = groupClaims(claims)

  /** @type {Conflict[]} */
  const conflicts = []
  /** @type {Map<string, unknown>} */
  const resolved = new Map()

  for (const [key, bucket] of grouped) {
    const [subject, attribute] = splitKey(key)
    const policy = policyFor(attribute)

    if (policy === 'union') {
      resolved.set(key, unionOf(bucket))
      continue
    }

    const ranked = rankClaims(bucket, LAYER_PRECEDENCE)
    const winner = policy === 'newest' ? newestOf(bucket) ?? ranked[0] : ranked[0]

    // A user decision, once made, outranks everything — including a later import that
    // reintroduces the value they rejected. This is the whole point of storing it.
    const resolution = resolutions[conflictId(subject, attribute)]
    let stale = false
    if (resolution) {
      if (resolution.value !== undefined) {
        resolved.set(key, resolution.value)
      } else {
        const chosen = bucket.find((c) => c.source === resolution.source)
        // The chosen source no longer makes this claim — it was removed from the config, or
        // the platform stopped reporting the field. The decision cannot be honoured, so it
        // is flagged rather than silently ignored: the value on the page is now one the
        // owner did not pick.
        stale = !chosen
        resolved.set(key, chosen ? chosen.value : winner.value)
      }
    } else {
      resolved.set(key, winner.value)
    }

    // `first` and `newest` resolve themselves by definition. A star count that was 12 in
    // April and 40 in August is one number measured twice, not two sources disagreeing, and
    // asking someone to arbitrate it would bury the conflicts that actually need a person.
    if (policy === 'first' || policy === 'newest') continue

    const conflict = detectConflict({
      subject, attribute, bucket, winner, resolution, labels, stale,
      chosenValue: resolved.get(key),
    })
    if (conflict) conflicts.push(conflict)
  }

  const profile = assemble(resolved, grouped)

  return {
    profile,
    conflicts: conflicts.map((c) => nameSubject(c, resolved)).sort(byCollectionThenLabel),
    evidence: grouped,
    sources: [...new Set(claims.map((c) => c.source))].sort(),
  }
}

/**
 * Replace the record id in a conflict's label with the record's actual name.
 *
 * "Role — Acme Corp" is a question someone can answer at a glance; "Role — acme" makes them
 * go and look up which record that is. Done after resolution because the name is itself a
 * resolved value.
 *
 * @param {Conflict} conflict
 * @param {Map<string, unknown>} resolved
 * @returns {Conflict}
 */
function nameSubject(conflict, resolved) {
  if (conflict.subject === 'identity' || conflict.subject === 'socials') return conflict

  const name = ['company', 'name', 'title', 'institution', 'platform']
    .map((field) => resolved.get(`${conflict.subject}|${field}`))
    .find((value) => typeof value === 'string' && value.trim())

  if (!name) return conflict
  return { ...conflict, label: `${conflict.label.split(' — ')[0]} — ${name}` }
}

/* -------------------------------------------------------------------------- */
/* Conflict detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Decide whether a disagreement is worth a person's attention.
 *
 * Deliberately narrow. Every false positive costs the owner a decision they should not
 * have had to make, and a conflict list full of noise is one nobody reads — at which point
 * the real conflicts are invisible again and the whole mechanism has failed.
 *
 * @returns {Conflict|null}
 */
function detectConflict({ subject, attribute, bucket, winner, resolution, labels, stale, chosenValue }) {
  if (attribute === '@exists') return null

  // Group by value so two sources agreeing counts once.
  /** @type {Map<string, Claim[]>} */
  const byValue = new Map()
  for (const claim of bucket) {
    const key = valueKey(claim.value)
    const existing = byValue.get(key)
    if (existing) existing.push(claim)
    else byValue.set(key, [claim])
  }
  if (byValue.size < 2) return null

  // Anything the owner authored themselves — config, hand-written data, an explicit
  // override — is a *decision*, not a disagreement. Someone who typed their own headline is
  // not in conflict with their GitHub bio; they have already answered the question, and
  // asking again would bury the genuine conflicts under one row per field they filled in.
  //
  // Only independently-obtained sources can actually contradict each other, so only they
  // are counted here. Resume-derived data belongs to a `document` layer for exactly this
  // reason: it is evidence about the person, not a statement by them.
  const contested = [...byValue.values()].filter((claims) =>
    claims.some((c) => EVIDENCE_LAYERS.has(c.layerKind)))
  if (contested.length < 2) return null

  // Values that differ only in whitespace or case are the same claim badly typed twice.
  const meaningful = new Map()
  for (const claims of contested) {
    const key = comparableKey(claims[0].value)
    if (!meaningful.has(key)) meaningful.set(key, claims)
  }
  if (meaningful.size < 2) return null

  const options = [...meaningful.values()]
    .map((claims) => {
      const ranked = rankClaims(claims, LAYER_PRECEDENCE)
      const best = ranked[0]
      return {
        value: best.value,
        source: best.source,
        sourceLabel: labels[best.source] ?? best.source,
        kind: best.kind,
        observedAt: best.observedAt,
        url: best.url,
        // Every source asserting this same value. Without it the reader sees "your config
        // versus your résumé" and cannot tell that GitHub and LinkedIn also say the first
        // one — which is exactly the information that settles the decision.
        agreedBy: ranked.map((claim) => labels[claim.source] ?? claim.source),
        ...(best.document ? { document: best.document } : {}),
        ...(best.confidence !== undefined ? { confidence: best.confidence } : {}),
      }
    })
    .sort((a, b) => (CLAIM_KINDS[b.kind]?.rank ?? 0) - (CLAIM_KINDS[a.kind]?.rank ?? 0))

  const chosenKey = comparableKey(chosenValue)
  const chosen = options.find((o) => comparableKey(o.value) === chosenKey)

  return {
    id: conflictId(subject, attribute),
    subject,
    attribute,
    collection: subject.split('/')[0],
    label: describe(subject, attribute),
    options,
    chosen: chosen?.source ?? winner.source,
    // A stale decision is not a decision: the source it named is gone, so the value now
    // shown is one the owner never chose. Reporting it as resolved would hide that.
    resolved: Boolean(resolution) && !stale,
    resolvedBy: resolution && !stale ? 'user' : 'precedence',
    ...(stale ? { staleResolution: resolution.source } : {}),
  }
}

/**
 * A stable id for a conflict, so a decision keeps applying across re-imports.
 * @param {string} subject @param {string} attribute
 */
export const conflictId = (subject, attribute) => `${subject}:${attribute}`

/**
 * A human description: "Role at Acme Corp" rather than "experience/acme-corp:role".
 * @param {string} subject @param {string} attribute
 */
function describe(subject, attribute) {
  const [collection, id] = splitSubject(subject)
  const field = attribute
    .split('.').pop()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

  if (subject === 'identity') return field
  if (subject === 'socials') return `${attribute} profile link`
  if (!id) return field

  const readable = id
    .replace(/^(github|gitlab|npm|pypi|hf|docker|s2|dblp|orcid)-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return `${field} — ${readable}`
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild a `Profile` from resolved attribute values.
 *
 * @param {Map<string, unknown>} resolved
 * @param {Map<string, Claim[]>} grouped
 * @returns {import('../schema/types.js').Profile}
 */
function assemble(resolved, grouped) {
  /** @type {Record<string, Record<string, any>>} */
  const bySubject = {}

  for (const [key, value] of resolved) {
    const [subject, attribute] = splitKey(key)
    ;(bySubject[subject] ??= {})[attribute] = value
  }

  // A subject asserted by any layer must exist even if every one of its fields was empty,
  // or a record whose only content is its identifying name would silently vanish.
  for (const key of grouped.keys()) {
    const [subject] = splitKey(key)
    bySubject[subject] ??= {}
  }

  const raw = {
    identity: expand(bySubject.identity ?? {}),
    socials: bySubject.socials ?? {},
  }

  for (const collection of COLLECTIONS) {
    const records = []
    for (const [subject, fields] of Object.entries(bySubject)) {
      const [name, id] = splitSubject(subject)
      if (name !== collection || !id) continue
      const { '@exists': _exists, ...rest } = fields
      records.push({ id, ...rest })
    }
    if (records.length) raw[collection] = records
  }

  const statEntries = []
  for (const [subject, fields] of Object.entries(bySubject)) {
    const [name, id] = splitSubject(subject)
    if (name !== 'stats' || !id) continue
    if (fields.value === undefined) continue
    statEntries.push({ id, ...fields })
  }
  if (statEntries.length) raw.stats = { entries: statEntries }

  /** @type {Record<string, any[]>} */
  const custom = {}
  for (const [subject, fields] of Object.entries(bySubject)) {
    const [name, id] = splitSubject(subject)
    if (!name.startsWith('custom:') || !id) continue
    const { '@exists': _exists, ...rest } = fields
    ;(custom[name.slice('custom:'.length)] ??= []).push({ id, ...rest })
  }
  if (Object.keys(custom).length) raw.custom = custom

  // Back through the schema normalizer, so the canonical profile is subject to exactly the
  // same coercion and safety rules as every other input — including URL protocol checks.
  const profile = normalizeProfile(raw)
  return Object.keys(bySubject).length ? profile : createEmptyProfile()
}

/**
 * Turn dotted attribute keys back into nested objects: `contact.email` → `{contact: {email}}`.
 * @param {Record<string, unknown>} flat
 */
function expand(flat) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes('.')) { out[key] = value; continue }
    const [head, ...rest] = key.split('.')
    let cursor = (out[head] ??= {})
    for (let i = 0; i < rest.length - 1; i += 1) cursor = (cursor[rest[i]] ??= {})
    cursor[rest[rest.length - 1]] = value
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Value helpers                                                               */
/* -------------------------------------------------------------------------- */

/** @param {Claim[]} bucket */
function unionOf(bucket) {
  const seen = new Map()
  for (const claim of bucket) {
    const values = Array.isArray(claim.value) ? claim.value : [claim.value]
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue
      // De-duplicated case-insensitively, but the first spelling seen is kept — "PyTorch"
      // should not become "pytorch" because a topic tag was lower-case.
      const key = typeof value === 'string' ? value.toLowerCase() : valueKey(value)
      if (!seen.has(key)) seen.set(key, value)
    }
  }
  return [...seen.values()]
}

/** @param {Claim[]} bucket */
function newestOf(bucket) {
  let best = null
  let bestTime = -Infinity
  for (const claim of bucket) {
    const ms = claim.observedAt ? Date.parse(claim.observedAt) : NaN
    const time = Number.isFinite(ms) ? ms : -1
    if (time > bestTime) { best = claim; bestTime = time }
  }
  return best
}

/** Exact identity, for grouping identical claims. */
function valueKey(value) {
  if (typeof value === 'string') return `s:${value}`
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return `j:${stableStringify(value)}`
  return `p:${String(value)}`
}

/** Loose identity, for deciding whether a difference is worth showing a person. */
function comparableKey(value) {
  if (typeof value === 'string') {
    return `s:${value.trim().toLowerCase().replace(/\s+/g, ' ')}`
  }
  return valueKey(value)
}

/** Key order must not affect equality, or object claims would conflict with themselves. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((k) => `${k}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** @param {string} key */
function splitKey(key) {
  const index = key.indexOf('|')
  return [key.slice(0, index), key.slice(index + 1)]
}

/** @param {string} subject */
function splitSubject(subject) {
  const index = subject.indexOf('/')
  return index === -1 ? [subject, ''] : [subject.slice(0, index), subject.slice(index + 1)]
}

/** @param {Conflict} a @param {Conflict} b */
function byCollectionThenLabel(a, b) {
  // Identity first: it is the most visible thing on the page and the cheapest to decide.
  const rank = (c) => (c.subject === 'identity' ? 0 : c.subject === 'socials' ? 1 : 2)
  return rank(a) - rank(b) || a.collection.localeCompare(b.collection) || a.label.localeCompare(b.label)
}

/**
 * Every claim made about one attribute, strongest first. Powers "where did this come from".
 *
 * @param {import('./types.js').CanonicalIdentity} identity
 * @param {string} subject
 * @param {string} attribute
 * @returns {Claim[]}
 */
export function evidenceFor(identity, subject, attribute) {
  const bucket = identity.evidence.get(`${subject}|${attribute}`) ?? []
  return rankClaims(bucket, LAYER_PRECEDENCE)
}

/**
 * Which sources contributed to a record, for a "sourced from" line.
 *
 * @param {import('./types.js').CanonicalIdentity} identity
 * @param {string} subject
 * @returns {string[]}
 */
export function sourcesFor(identity, subject) {
  const sources = new Set()
  for (const [key, claims] of identity.evidence) {
    if (!key.startsWith(`${subject}|`)) continue
    for (const claim of claims) sources.add(claim.source)
  }
  return [...sources].sort()
}
