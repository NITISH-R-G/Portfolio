/**
 * Profile validation.
 *
 * Validation *reports*; it never discards. `normalizeProfile` has already dropped anything
 * structurally unusable, so by the time data reaches here the question is no longer "is this
 * parseable" but "is this good enough to publish". The answer is a list of findings the
 * setup CLI, `npm run doctor` and the admin all render to the user.
 *
 * Nothing here throws, and a profile with errors still builds — a portfolio that renders
 * with a warning is more useful than a build that fails.
 *
 * @module core/schema/validate
 */

import { COLLECTIONS } from './types.js'

/** @typedef {import('./types.js').Profile} Profile */

/**
 * @typedef {object} Finding
 * @property {'error'|'warning'|'info'} level
 * @property {string} path     Dotted path into the profile, e.g. `projects[3].repository`.
 * @property {string} message
 * @property {string} [hint]   What the user should do about it.
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid       False only when there is at least one `error`.
 * @property {Finding[]} findings
 * @property {Completeness} completeness
 */

/**
 * @typedef {object} Completeness
 * @property {number} score           0–100.
 * @property {string[]} present       Names of the areas that have content.
 * @property {string[]} missing       Names of the areas that are empty.
 */

/**
 * Weighted areas used for the completeness score. Weights encode what a reader of a
 * technical portfolio actually looks for, not an even split across the schema.
 */
const COMPLETENESS_WEIGHTS = [
  { id: 'name', label: 'Name', weight: 15, test: (/** @type {Profile} */ p) => Boolean(p.identity.name) },
  { id: 'headline', label: 'Headline', weight: 10, test: (p) => Boolean(p.identity.headline) },
  { id: 'summary', label: 'Summary', weight: 10, test: (p) => Boolean(p.identity.summary) },
  { id: 'contact', label: 'Contact method', weight: 10, test: (p) => Boolean(p.identity.contact?.email || p.identity.contact?.links?.length) },
  { id: 'socials', label: 'Linked profiles', weight: 10, test: (p) => Object.keys(p.socials).length > 0 },
  { id: 'projects', label: 'Projects', weight: 15, test: (p) => p.projects.length > 0 },
  { id: 'skills', label: 'Skills', weight: 10, test: (p) => p.skills.length > 0 },
  { id: 'history', label: 'Experience or education', weight: 15, test: (p) => p.experience.length > 0 || p.education.length > 0 },
  { id: 'evidence', label: 'Evidence-backed content', weight: 5, test: (p) =>
    p.skills.some((s) => s.evidence?.length) ||
    p.projects.some((pr) => typeof pr.stars === 'number') ||
    p.competitive.length > 0 ||
    p.publications.length > 0 },
]

/**
 * Validate a normalized profile.
 *
 * @param {Profile} profile
 * @returns {ValidationResult}
 */
export function validateProfile(profile) {
  /** @type {Finding[]} */
  const findings = []

  const add = (/** @type {Finding['level']} */ level, /** @type {string} */ path, /** @type {string} */ message, /** @type {string} */ hint) => {
    findings.push(hint ? { level, path, message, hint } : { level, path, message })
  }

  if (!profile || typeof profile !== 'object') {
    return {
      valid: false,
      findings: [{ level: 'error', path: '', message: 'Profile is not an object.' }],
      completeness: { score: 0, present: [], missing: COMPLETENESS_WEIGHTS.map((w) => w.label) },
    }
  }

  /* Identity ---------------------------------------------------------------- */

  if (!profile.identity?.name) {
    add('error', 'identity.name', 'No name is set.',
      'Set `identity.name` in portfolio.config.js, or run `npm run setup`.')
  }
  if (!profile.identity?.headline) {
    add('warning', 'identity.headline', 'No headline is set.',
      'A one-line headline is the first thing a visitor reads.')
  }
  if (!profile.identity?.contact?.email && !profile.identity?.contact?.links?.length) {
    add('warning', 'identity.contact', 'No way to get in touch.',
      'Add `identity.contact.email` or at least one contact link.')
  }

  /* Collections ------------------------------------------------------------- */

  for (const collection of COLLECTIONS) {
    const records = /** @type {Record<string, any>[]} */ (profile[collection] ?? [])
    if (!Array.isArray(records)) {
      add('error', String(collection), 'Expected an array.')
      continue
    }

    /** @type {Map<string, number>} */
    const seenIds = new Map()
    records.forEach((record, i) => {
      const path = `${String(collection)}[${i}]`

      if (typeof record.id === 'string') {
        const prev = seenIds.get(record.id)
        if (prev !== undefined) {
          add('warning', path, `Duplicate id "${record.id}" (also at index ${prev}).`,
            'Duplicate ids make user overrides ambiguous. Give each record a unique id.')
        } else {
          seenIds.set(record.id, i)
        }
      }

      // A record with no date is fine; a record whose date failed to parse is not, because
      // the user wrote something and it was silently dropped.
      if (record.date && !record.date.iso) {
        add('warning', `${path}.date`, 'Date could not be parsed and was dropped.',
          'Use an ISO date ("2024-03-15"), "Mar 2024", or "2024".')
      }
    })
  }

  /* Cross-cutting content checks -------------------------------------------- */

  // These checks run on whatever survived the per-collection guard above, so a caller who
  // hands us a half-built object still gets findings instead of an exception.
  const projects = Array.isArray(profile.projects) ? profile.projects : []
  const socials = profile.socials && typeof profile.socials === 'object' ? profile.socials : {}

  const untitledProjects = projects.filter((p) => !p.description).length
  if (untitledProjects > 0) {
    add('info', 'projects', `${untitledProjects} project${untitledProjects === 1 ? ' has' : 's have'} no description.`,
      'Add a repository description on the source platform, or write one in your overrides.')
  }

  if (projects.length > 0 && !projects.some((p) => p.featured || (p.featureScore ?? 0) > 0)) {
    add('info', 'projects', 'No project is marked featured and none has been scored yet.',
      'Run `npm run import` to score projects, or set `featured: true` on your best work.')
  }

  const brokenSocials = Object.entries(socials).filter(([, v]) => typeof v !== 'string' || !/^https?:\/\//.test(v))
  for (const [key] of brokenSocials) {
    add('warning', `socials.${key}`, 'Not a valid http(s) URL; it will not be rendered.')
  }

  if (Object.keys(socials).length === 0) {
    add('info', 'socials', 'No profiles are connected.',
      'Connecting even one source (GitHub is the highest-yield) fills several sections automatically.')
  }

  /* Completeness ------------------------------------------------------------ */

  const present = []
  const missing = []
  let score = 0
  for (const area of COMPLETENESS_WEIGHTS) {
    let ok = false
    try {
      ok = area.test(profile)
    } catch {
      ok = false
    }
    if (ok) {
      score += area.weight
      present.push(area.label)
    } else {
      missing.push(area.label)
    }
  }

  return {
    valid: !findings.some((f) => f.level === 'error'),
    findings,
    completeness: { score, present, missing },
  }
}

/**
 * Render findings as plain text for the CLI.
 *
 * @param {ValidationResult} result
 * @returns {string}
 */
export function formatFindings(result) {
  if (!result.findings.length) return 'No issues found.'
  const icon = { error: 'ERROR  ', warning: 'WARN   ', info: 'INFO   ' }
  const order = { error: 0, warning: 1, info: 2 }
  return [...result.findings]
    .sort((a, b) => order[a.level] - order[b.level])
    .map((f) => {
      const head = `${icon[f.level]}${f.path ? `${f.path}: ` : ''}${f.message}`
      return f.hint ? `${head}\n         ↳ ${f.hint}` : head
    })
    .join('\n')
}
