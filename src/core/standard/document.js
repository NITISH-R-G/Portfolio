/**
 * The Portfolio Standard document.
 *
 * The primitive this project is actually built around is not a website — it is a portable
 * description of a professional identity that any renderer can consume. This module is the
 * boundary between the two: everything internal speaks `Profile`, everything external
 * speaks a versioned document.
 *
 * Two rules make that boundary worth having:
 *
 *   1. **A document is self-describing.** It carries `schemaVersion`, so a reader five
 *      years from now knows what it is looking at and can migrate it.
 *   2. **A document never loses what it did not understand.** Anything outside the schema
 *      survives round-tripping under `extensions`, so a renderer that models something this
 *      standard does not can still hand the file back intact.
 *
 * Without the second rule an "open standard" is really just this project's internal shape
 * with a version number on it, and any tool that adopted it would have to fork it the first
 * time it needed a field.
 *
 * @module core/standard/document
 */

import { COLLECTIONS } from '../schema/types.js'
import { normalizeProfile, createEmptyProfile } from '../schema/profile.js'

/**
 * Current version. Bumped only for a *breaking* change to the shape — adding an optional
 * field is not breaking, so it does not move.
 */
export const SCHEMA_VERSION = '1.0'

/** Versions this build can read. */
export const SUPPORTED_VERSIONS = ['1.0']

/** Where the specification lives, embedded so a document is traceable to its rules. */
export const SPEC_URL = 'https://github.com/NITISH-R-G/Portfolio/blob/main/docs/standard.md'

/**
 * @typedef {object} PortfolioDocument
 * @property {string} schemaVersion
 * @property {string} [spec]
 * @property {object} [meta]
 * @property {object} person
 * @property {object[]} education
 * @property {object[]} experience
 * @property {object[]} projects
 * @property {object[]} skills
 * @property {object[]} achievements
 * @property {object[]} certifications
 * @property {object[]} publications
 * @property {object[]} writing
 * @property {object[]} packages
 * @property {object[]} models
 * @property {object[]} videos
 * @property {object[]} hackathons
 * @property {object[]} talks
 * @property {object[]} competitions
 * @property {object[]} languages
 * @property {Record<string, string>} socials
 * @property {object[]} statistics
 * @property {object[]} [evidence]
 * @property {Record<string, unknown>} [extensions]
 */

/**
 * The standard's public names for each internal collection.
 *
 * They differ in two places on purpose. `posts` is an implementation word; `writing` is what
 * the thing actually is. `competitive` is an adjective with no noun; `competitions` reads
 * as a list of things. A standard is read by people who did not write it, so its vocabulary
 * should not require knowing this codebase.
 *
 * @type {Record<string, string>}
 */
const COLLECTION_NAMES = {
  education: 'education',
  experience: 'experience',
  projects: 'projects',
  skills: 'skills',
  achievements: 'achievements',
  certifications: 'certifications',
  publications: 'publications',
  posts: 'writing',
  packages: 'packages',
  videos: 'videos',
  models: 'models',
  hackathons: 'hackathons',
  talks: 'talks',
  competitive: 'competitions',
  languages: 'languages',
}

/** The reverse map, for reading a document back in. */
const COLLECTION_KEYS = Object.fromEntries(
  Object.entries(COLLECTION_NAMES).map(([internal, external]) => [external, internal]),
)

/**
 * Serialize a profile as a standard document.
 *
 * @param {import('../schema/types.js').Profile} profile
 * @param {{
 *   generatedAt?: string,
 *   generator?: string,
 *   evidence?: Map<string, import('../identity/types.js').Claim[]>,
 *   includeEvidence?: boolean,
 *   extensions?: Record<string, unknown>,
 * }} [options]
 * @returns {PortfolioDocument}
 */
export function toDocument(profile, options = {}) {
  const source = profile ?? createEmptyProfile()

  /** @type {PortfolioDocument} */
  const document = {
    schemaVersion: SCHEMA_VERSION,
    spec: SPEC_URL,
    meta: prune({
      generatedAt: options.generatedAt,
      generator: options.generator ?? 'portfolio-engine',
      sources: source.meta?.connectors,
    }),
    person: prune({ ...source.identity }),
    socials: { ...(source.socials ?? {}) },
    statistics: (source.stats?.entries ?? []).map((entry) => prune({ ...entry })),
  }

  for (const [internal, external] of Object.entries(COLLECTION_NAMES)) {
    document[external] = (source[internal] ?? []).map((record) => prune({ ...record }))
  }

  // Custom sections are carried as extensions rather than invented top-level keys, so a
  // reader that does not know about "exhibitions" still knows exactly where it lives and
  // can hand it back unchanged.
  const extensions = { ...options.extensions }
  if (source.custom && Object.keys(source.custom).length) {
    extensions.customSections = source.custom
  }
  if (Object.keys(extensions).length) document.extensions = extensions

  if (options.includeEvidence && options.evidence) {
    document.evidence = serializeEvidence(options.evidence)
  }

  return document
}

/**
 * Read a standard document back into a profile.
 *
 * Forgiving by design: a document from a future minor version, or from another tool that
 * added fields, must still load rather than be rejected. Unreadable *major* versions are
 * reported instead of silently mangled.
 *
 * @param {unknown} input
 * @returns {{profile: import('../schema/types.js').Profile, issues: DocumentIssue[]}}
 */
export function fromDocument(input) {
  /** @type {DocumentIssue[]} */
  const issues = []

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      profile: createEmptyProfile(),
      issues: [{ level: 'error', path: '', message: 'Not a portfolio document — expected a JSON object.' }],
    }
  }

  const document = /** @type {Record<string, any>} */ (input)
  const version = typeof document.schemaVersion === 'string' ? document.schemaVersion : undefined

  if (!version) {
    issues.push({
      level: 'warning',
      path: 'schemaVersion',
      message: `No schemaVersion; assuming ${SCHEMA_VERSION}.`,
      hint: 'A conforming document declares the version it was written against.',
    })
  } else if (!SUPPORTED_VERSIONS.includes(version)) {
    const [major] = version.split('.')
    const [currentMajor] = SCHEMA_VERSION.split('.')
    issues.push({
      level: major === currentMajor ? 'warning' : 'error',
      path: 'schemaVersion',
      message: major === currentMajor
        ? `Document is version ${version}; this build reads ${SCHEMA_VERSION}. Unknown fields will be preserved but ignored.`
        : `Document is version ${version}, which this build cannot read (it understands ${SUPPORTED_VERSIONS.join(', ')}).`,
    })
  }

  /** @type {Record<string, any>} */
  const raw = {
    identity: document.person ?? document.identity ?? {},
    socials: document.socials ?? {},
    stats: { entries: document.statistics ?? document.stats?.entries ?? [] },
  }

  for (const [external, internal] of Object.entries(COLLECTION_KEYS)) {
    const value = document[external] ?? document[internal]
    if (Array.isArray(value)) raw[internal] = value
  }

  const customSections = document.extensions?.customSections
  if (customSections && typeof customSections === 'object') raw.custom = customSections

  const profile = normalizeProfile(raw)

  // Report what was dropped, rather than letting it vanish quietly.
  for (const [external] of Object.entries(COLLECTION_KEYS)) {
    const incoming = document[external]
    if (!Array.isArray(incoming)) continue
    const kept = profile[COLLECTION_KEYS[external]]?.length ?? 0
    if (kept < incoming.length) {
      issues.push({
        level: 'warning',
        path: external,
        message: `${incoming.length - kept} of ${incoming.length} ${external} entries were dropped as unidentifiable.`,
        hint: 'Every record needs the field that names it — a project needs a name, an experience entry needs a company.',
      })
    }
  }

  return { profile, issues }
}

/**
 * @typedef {object} DocumentIssue
 * @property {'error'|'warning'} level
 * @property {string} path
 * @property {string} message
 * @property {string} [hint]
 */

/**
 * Check a document against the standard without importing it.
 *
 * @param {unknown} input
 * @returns {{valid: boolean, issues: DocumentIssue[], counts: Record<string, number>}}
 */
export function validateDocument(input) {
  const { profile, issues } = fromDocument(input)

  if (!profile.identity?.name) {
    issues.push({
      level: 'error',
      path: 'person.name',
      message: 'A document must name the person it describes.',
    })
  }

  /** @type {Record<string, number>} */
  const counts = {}
  for (const collection of COLLECTIONS) {
    const length = profile[collection]?.length ?? 0
    if (length) counts[COLLECTION_NAMES[collection] ?? collection] = length
  }

  return { valid: !issues.some((i) => i.level === 'error'), issues, counts }
}

/**
 * Flatten the evidence graph into a serializable list.
 *
 * Optional in a document, because it can be large and most consumers only want the resolved
 * profile. It is what makes a document *auditable* rather than merely portable: a reader can
 * check any published value against who asserted it and when.
 *
 * @param {Map<string, import('../identity/types.js').Claim[]>} evidence
 */
function serializeEvidence(evidence) {
  const out = []
  for (const [key, claims] of evidence) {
    const [subject, attribute] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)]
    if (attribute === '@exists') continue
    // Only disputed attributes are worth the bytes; a unanimous value's provenance is
    // already on the record itself.
    const distinct = new Set(claims.map((c) => JSON.stringify(c.value)))
    if (distinct.size < 2) continue

    out.push({
      subject,
      attribute,
      claims: claims.map((claim) => prune({
        value: claim.value,
        source: claim.source,
        kind: claim.kind,
        observedAt: claim.observedAt,
        url: claim.url,
      })),
    })
  }
  return out
}

/** @template {Record<string, unknown>} T @param {T} object @returns {T} */
function prune(object) {
  for (const key of Object.keys(object)) {
    const value = object[key]
    if (value === undefined || value === null || value === '') delete object[key]
    else if (Array.isArray(value) && value.length === 0) delete object[key]
  }
  return object
}

export { COLLECTION_NAMES, COLLECTION_KEYS }
