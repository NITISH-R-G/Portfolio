/**
 * What a portfolio is still missing — and what it has no business missing.
 *
 * The trap this module is built to avoid: a completeness score that treats every field as
 * required tells a working engineer their portfolio is 40% complete because they have never
 * published a paper, entered a programming contest, or released an npm package. That number
 * is worse than no number. It is wrong, it cannot be acted on, and it teaches the owner to
 * ignore the one signal that was supposed to help them.
 *
 * So every check declares when it *applies*. A field is only counted against you if there is
 * a reason to think it belongs in your portfolio — usually because you connected a source
 * that produces it, or because you already have some of it. Publications are expected of
 * someone with ORCID connected; they are `not-applicable` for everyone else.
 *
 * Nothing here invents fields. Every check reads a real path on the normalized `Profile`,
 * and the collections come from `COLLECTIONS` in the schema rather than a list kept here.
 *
 * ## The five states
 *
 *   `complete`       — present, and enough of it.
 *   `partial`        — present but thin; the check says what would finish it.
 *   `missing`        — applies to you, and is not there. This is the actionable state.
 *   `not-applicable` — no reason to expect it. Excluded from every total.
 *   `review`         — present but something about it needs a human eye.
 *
 * ## The percentage
 *
 * `score` is `complete / applicable`, where `applicable` excludes `not-applicable` entirely
 * and `partial` counts as a half. It is reported alongside the counts it came from, never on
 * its own, because a single number cannot say *which* thing to go and fix.
 *
 * @module core/profile/completeness
 */

import { COLLECTIONS } from '../schema/types.js'

/**
 * @typedef {'complete'|'partial'|'missing'|'not-applicable'|'review'} CheckState
 */

/**
 * @typedef {object} Check
 * @property {string} id
 * @property {string} group
 * @property {string} label
 * @property {CheckState} state
 * @property {string} detail        What is there, or what is not.
 * @property {string} [fix]         What would improve it. Absent when nothing is needed.
 * @property {string} [because]     Why it applies — shown when applicability is not obvious.
 * @property {number} [count]
 */

/** Display order, and the grouping the admin renders. */
const GROUPS = ['Identity', 'Professional', 'Projects', 'Skills', 'Writing & research', 'Presence']

/**
 * Which connectors imply a collection is expected.
 *
 * Derived from what each connector *declares* it can populate, not from a list of platform
 * names: `supportedData` already says that ORCID produces publications and npm produces
 * packages. Connecting one is the clearest possible signal that the owner expects that kind
 * of record to appear.
 *
 * @param {{dataSources?: Record<string, unknown>}} config
 * @param {(id: string) => {supportedData?: string[]}|undefined} lookup
 * @returns {Set<string>}
 */
export function expectedCollections(config, lookup) {
  const expected = new Set()
  for (const key of Object.keys(config?.dataSources ?? {})) {
    for (const collection of lookup(key)?.supportedData ?? []) expected.add(collection)
  }
  return expected
}

/**
 * Assess a built profile.
 *
 * @param {object} profile                       A normalized `Profile`.
 * @param {object} [options]
 * @param {Set<string>} [options.expected]       Collections a connected source can produce.
 * @param {object} [options.config]              For privacy-aware checks.
 * @returns {{checks: Check[], groups: {name: string, checks: Check[]}[], summary: {
 *   complete: number, partial: number, missing: number, review: number,
 *   notApplicable: number, applicable: number, score: number,
 * }}}
 */
export function assessProfile(profile, options = {}) {
  const expected = options.expected ?? new Set()
  const identity = profile?.identity ?? {}
  const list = (name) => (Array.isArray(profile?.[name]) ? profile[name] : [])

  /** A collection check, applicable when it has records or a connected source produces it. */
  const collection = ({ id, group, label, name, want = 1, fix, detailOf }) => {
    const items = list(name)
    if (!items.length && !expected.has(name)) {
      return {
        id, group, label, state: 'not-applicable', count: 0,
        detail: 'No connected source produces this, and you have none.',
      }
    }
    if (!items.length) {
      return {
        id, group, label, state: 'missing', count: 0, fix,
        detail: 'Nothing imported yet.',
        because: 'A source you connected can produce these.',
      }
    }
    const detail = detailOf ? detailOf(items) : `${items.length} ${items.length === 1 ? 'record' : 'records'}`
    return items.length >= want
      ? { id, group, label, state: 'complete', count: items.length, detail }
      : { id, group, label, state: 'partial', count: items.length, detail, fix }
  }

  /** A single identity field. */
  const field = ({ id, group, label, value, fix, applies = true, because }) => {
    if (!applies) {
      return { id, group, label, state: 'not-applicable', detail: 'Not expected for this portfolio.' }
    }
    const present = typeof value === 'string' ? value.trim().length > 0 : value != null
    return present
      ? { id, group, label, state: 'complete', detail: String(value).slice(0, 80) }
      : { id, group, label, state: 'missing', detail: 'Not set.', fix, because }
  }

  /** @type {Check[]} */
  const checks = [
    field({
      id: 'name', group: 'Identity', label: 'Name', value: identity.name,
      fix: 'Set `identity.name` in your config, or connect a source that reports it.',
    }),
    field({
      id: 'headline', group: 'Identity', label: 'Headline', value: identity.headline,
      fix: 'One line saying what you do. It is the first thing a visitor reads.',
    }),
    field({
      id: 'avatar', group: 'Identity', label: 'Avatar', value: identity.avatar,
      fix: 'Point `identity.avatar` at an image, or connect a source that has one.',
    }),
    field({
      id: 'location', group: 'Identity', label: 'Location', value: identity.location,
      fix: 'Optional, but it is the second thing recruiters look for.',
    }),
    field({
      id: 'summary', group: 'Professional', label: 'About', value: identity.summary,
      fix: 'A paragraph in your own words. No connector writes this for you.',
    }),

    collection({
      id: 'experience', group: 'Professional', label: 'Experience', name: 'experience',
      fix: 'Import a résumé, or add roles manually — most platforms do not expose employment.',
      detailOf: (items) => `${items.length} ${items.length === 1 ? 'role' : 'roles'}`,
    }),
    collection({
      id: 'education', group: 'Professional', label: 'Education', name: 'education',
      fix: 'Import a résumé, or add it manually.',
    }),

    collection({
      id: 'projects', group: 'Projects', label: 'Projects', name: 'projects',
      fix: 'Connect a code host, or add projects manually.',
    }),
    describedProjects(list('projects'), expected),
    linkedProjects(list('projects'), expected),

    collection({
      id: 'skills', group: 'Skills', label: 'Skills', name: 'skills', want: 3,
      fix: 'Skills are derived from your projects and imports; connect more sources to widen them.',
    }),

    collection({
      id: 'publications', group: 'Writing & research', label: 'Publications', name: 'publications',
      fix: 'Connect ORCID, DBLP or Semantic Scholar.',
    }),
    collection({
      id: 'posts', group: 'Writing & research', label: 'Writing', name: 'posts',
      fix: 'Connect a blog feed, DEV, Hashnode or Medium.',
    }),

    socialsCheck(profile?.socials),
    contactCheck(identity, options.config),
  ]

  // Every remaining collection, generically. Adding a collection to the schema therefore adds
  // a check, rather than being silently unmeasured — but only ever as `not-applicable` unless
  // a connected source produces it.
  const named = new Set(checks.map((check) => check.id))
  for (const name of COLLECTIONS) {
    if (named.has(name)) continue
    checks.push(collection({
      id: name,
      group: 'Presence',
      label: name.charAt(0).toUpperCase() + name.slice(1),
      name,
      fix: `Connect a source that produces ${name}.`,
    }))
  }

  return { checks, groups: groupChecks(checks), summary: summarise(checks) }
}

/* -------------------------------------------------------------------------- */

/** Projects without a description read as a bare list of names. */
function describedProjects(projects, expected) {
  const base = { id: 'project-descriptions', group: 'Projects', label: 'Project descriptions' }
  if (!projects.length) {
    return {
      ...base,
      state: expected.has('projects') ? 'missing' : 'not-applicable',
      detail: 'No projects yet.',
      ...(expected.has('projects') ? { fix: 'Import projects first.' } : {}),
    }
  }
  const without = projects.filter((p) => !String(p?.description ?? '').trim())
  if (!without.length) return { ...base, state: 'complete', detail: 'Every project has one.', count: projects.length }
  return {
    ...base,
    state: 'partial',
    count: projects.length - without.length,
    detail: `${without.length} of ${projects.length} have no description.`,
    fix: 'Add a repository description upstream, or write one in your overrides.',
  }
}

/** A project nobody can look at is a claim without a citation. */
function linkedProjects(projects, expected) {
  const base = { id: 'project-links', group: 'Projects', label: 'Project links' }
  if (!projects.length) {
    return {
      ...base,
      state: expected.has('projects') ? 'missing' : 'not-applicable',
      detail: 'No projects yet.',
    }
  }
  const linked = projects.filter((p) => p?.repository || p?.liveUrl || p?.url)
  if (linked.length === projects.length) {
    return { ...base, state: 'complete', detail: 'Every project links somewhere.', count: linked.length }
  }
  return {
    ...base,
    state: 'partial',
    count: linked.length,
    detail: `${projects.length - linked.length} of ${projects.length} link nowhere.`,
    fix: 'Add a repository or live URL so a reader can verify the work.',
  }
}

/** Links out. Always applicable — a portfolio with no way to reach you is incomplete. */
function socialsCheck(socials) {
  const count = Object.values(socials ?? {}).filter(Boolean).length
  const base = { id: 'socials', group: 'Presence', label: 'Profile links' }
  if (!count) {
    return { ...base, state: 'missing', count: 0, detail: 'No profile links.', fix: 'Connect any source — most contribute one automatically.' }
  }
  return count >= 2
    ? { ...base, state: 'complete', count, detail: `${count} links` }
    : { ...base, state: 'partial', count, detail: 'One link.', fix: 'Two or more gives a reader somewhere to go.' }
}

/**
 * Contact, which is the one check privacy can legitimately turn off.
 *
 * A portfolio configured to hide its email is not incomplete — it is configured. Reporting
 * that as a gap would nag the owner to undo a deliberate privacy decision.
 */
function contactCheck(identity, config) {
  const base = { id: 'contact', group: 'Presence', label: 'Contact' }
  const hidden = config?.privacy?.hideEmail === true
  if (hidden) {
    return { ...base, state: 'not-applicable', detail: 'Email is hidden by your privacy settings.' }
  }
  const email = identity?.contact?.email
  return email
    ? { ...base, state: 'complete', detail: 'An email is published.' }
    : { ...base, state: 'missing', detail: 'No contact address.', fix: 'Set `identity.contact.email`, or leave it off deliberately.' }
}

/** @param {Check[]} checks */
function groupChecks(checks) {
  return GROUPS
    .map((name) => ({ name, checks: checks.filter((check) => check.group === name) }))
    .filter((group) => group.checks.length)
}

/**
 * Counts, and the score derived from them.
 *
 * `not-applicable` is excluded from the denominator entirely — that is the whole point. A
 * `partial` counts as half, because "some of it" is genuinely between the two.
 *
 * @param {Check[]} checks
 */
function summarise(checks) {
  const count = (state) => checks.filter((check) => check.state === state).length
  const complete = count('complete')
  const partial = count('partial')
  const missing = count('missing')
  const review = count('review')
  const notApplicable = count('not-applicable')
  const applicable = complete + partial + missing + review

  return {
    complete,
    partial,
    missing,
    review,
    notApplicable,
    applicable,
    score: applicable ? Math.round(((complete + partial / 2) / applicable) * 100) : 100,
  }
}
