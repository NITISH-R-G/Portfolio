/**
 * The build pipeline.
 *
 * One function turns raw layers into everything the UI needs. It is pure, synchronous and
 * runs identically in Node (`npm run import`, `npm run export`, tests) and in the browser
 * (the admin's live preview), which is what makes the preview trustworthy: it is not an
 * approximation of the build, it *is* the build.
 *
 * @module core/generate/build
 */

import { applyOverrides } from '../schema/merge.js'
import { resolveIdentity } from '../identity/resolve.js'
import { validateIdentity } from '../identity/validate.js'
import { toLayer } from '../documents/store.js'
import { validateProfile } from '../schema/validate.js'
import { resolveConfig, configProfileLayer } from '../config/resolve.js'
import { resolveTheme } from '../themes/apply.js'
import { rankProjects, sortByDateDesc } from './scoring.js'
import { deriveSkills } from './skills.js'
import { deriveStats } from './stats.js'
import { resolveSections, navigationFor } from './sections.js'
import { generateSeo } from './seo.js'
import { rangeValue } from '../schema/date.js'

/** @typedef {import('../schema/types.js').Profile} Profile */

/**
 * @typedef {object} BuildInput
 * @property {import('../config/types.js').PortfolioConfig} [config]
 * @property {unknown[]} [sources]    Connector outputs, lowest priority.
 * @property {unknown} [manual]       Hand-written profile data.
 * @property {import('../schema/merge.js').Overrides} [overrides]
 * @property {Record<string, unknown>} [status]  Per-connector outcome from the last import.
 * @property {number} [now]           Injectable clock for deterministic builds and tests.
 */

/**
 * @typedef {object} BuiltPortfolio
 * @property {Profile} profile
 * @property {import('./sections.js').ResolvedSection[]} sections
 * @property {{id: string, label: string, icon: string}[]} navigation
 * @property {import('../themes/apply.js').ResolvedTheme} theme
 * @property {import('./seo.js').SeoResult} seo
 * @property {Required<import('../config/types.js').PortfolioConfig>} config
 * @property {import('../schema/validate.js').ValidationResult} validation
 * @property {import('../config/resolve.js').ConfigIssue[]} configIssues
 */

/**
 * Run the full pipeline.
 *
 * Order matters and is deliberate:
 *   merge layers → apply overrides → sort and rank → derive skills → derive stats →
 *   resolve sections → generate SEO.
 *
 * Stats are derived *after* overrides so that hiding a project also removes its stars from
 * the totals — a portfolio must never advertise a number it is not showing the evidence for.
 * Sections are resolved *after* stats so a stats strip can appear only once there are stats.
 *
 * @param {BuildInput} input
 * @returns {BuiltPortfolio}
 */
export function buildPortfolio(input = {}) {
  const now = input.now ?? Date.now()

  const { config, sectionOrder, issues } = resolveConfig(input.config)
  config.sectionOrder = sectionOrder

  /* 1–3. Layer, resolve, override. ------------------------------------------- */

  // Each layer keeps its identity through resolution, so a published value can always be
  // traced back to whoever asserted it — and so two sources disagreeing becomes a conflict
  // the owner can decide, rather than a value silently discarded at merge time.
  const layers = [
    ...toLayers(input.sources, 'connector'),
    // Documents sit at the same level as connectors, not above them: a résumé is evidence
    // about the person, obtained from a file, exactly as an API response is evidence
    // obtained from a platform. Neither type is inherently more current or more correct.
    ...toLayers(input.documents, 'document'),
    { id: 'manual', kind: 'manual', label: 'Entered by hand', profile: input.manual },
    // Config identity sits above imported data: what a user typed about themselves beats
    // what a platform's bio field happens to say.
    { id: 'config', kind: 'config', label: 'portfolio.config.js', profile: configProfileLayer(config) },
    // Overrides participate as a layer rather than being stamped on afterwards, so an edit
    // and the value it replaced both survive in the evidence graph. Patching the resolved
    // profile instead would leave no trace of what was overwritten, which is precisely the
    // auditability this layer exists to provide.
    ...overrideLayer(input.overrides),
  ].filter((layer) => layer.profile)

  const identity = resolveIdentity(layers, { resolutions: input.overrides?.resolutions })
  const identityValidation = validateIdentity(identity, {
    layers,
    resolutions: input.overrides?.resolutions,
    documents: Array.isArray(input.documents) ? input.documents : [],
  })

  let profile = identity.profile
  // Field-level patches are already applied as a layer above; this pass handles what a
  // layer cannot express — removing records entirely, and pinning their order.
  profile = applyOverrides(profile, structuralOverrides(input.overrides))

  /* 4. Order and rank. ------------------------------------------------------- */

  profile.projects = rankProjects(profile.projects, { now })
  profile.experience = sortByRange(profile.experience, now)
  profile.education = sortByRange(profile.education, now)
  profile.publications = sortByDateDesc(profile.publications)
  profile.posts = sortByDateDesc(profile.posts)
  profile.achievements = sortByDateDesc(profile.achievements)
  profile.certifications = sortByDateDesc(profile.certifications)
  profile.hackathons = sortByDateDesc(profile.hackathons)
  profile.talks = sortByDateDesc(profile.talks)
  profile.videos = sortByDateDesc(profile.videos)
  profile.packages = [...profile.packages].sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
  profile.models = [...profile.models].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
  profile.competitive = [...profile.competitive].sort(
    (a, b) => (b.maxRating ?? b.rating ?? 0) - (a.maxRating ?? a.rating ?? 0),
  )

  // Re-apply ordering overrides: ranking above would otherwise undo a user's explicit pin.
  profile = applyOverrides(profile, input.overrides?.order ? { order: input.overrides.order } : undefined)

  /* 5. Derive. --------------------------------------------------------------- */

  profile.skills = deriveSkills(profile)
  profile.stats = { entries: deriveStats(profile) }

  profile.meta = {
    ...profile.meta,
    ...(input.status ? { sourceStatus: /** @type {Record<string, string>} */ (input.status) } : {}),
  }

  /* 6–7. Present. ------------------------------------------------------------ */

  const sections = resolveSections(profile, config)
  const navigation = navigationFor(sections)
  const theme = resolveTheme(config)
  const seo = generateSeo(profile, config)
  const validation = validateProfile(profile)

  return {
    profile, sections, navigation, theme, seo, config, validation,
    configIssues: issues,
    conflicts: identity.conflicts,
    identityValidation,
    evidence: identity.evidence,
    sources: identity.sources,
  }
}

/**
 * Accept either tagged layers (`{id, profile}`) or bare profile objects.
 *
 * Bare objects are what the pipeline took before sources carried identity, and callers
 * outside this repository may still pass them. They resolve identically; they just cannot
 * name themselves in a conflict, so they are labelled by position rather than dropped.
 *
 * @param {unknown} sources
 * @returns {import('../identity/types.js').Layer[]}
 */
function toLayers(sources, kind) {
  if (!Array.isArray(sources)) return []
  return sources.map((raw, index) => {
    // A stored document is a stable identity with many versions. Only the active version
    // contributes claims — publishing two versions at once would have a source disagree
    // with itself, which is not a conflict any person can resolve.
    const source = raw && typeof raw === 'object' && Array.isArray(raw.versions)
      ? toLayer(raw)
      : raw

    if (source && typeof source === 'object' && 'profile' in source) {
      const tagged = /** @type {{id?: string, key?: string, label?: string, meta?: any, profile: unknown}} */ (source)
      const id = tagged.id ?? tagged.meta?.id ?? tagged.key ?? `${kind}-${index + 1}`
      return {
        id,
        kind,
        label: tagged.label ?? tagged.meta?.filename ?? id,
        profile: tagged.profile,
        // A document's import time is when its claims were observed, which is what lets a
        // fresher API response legitimately outrank an older résumé.
        ...(tagged.meta?.importedAt ? { observedAt: tagged.meta.importedAt } : {}),
        // Carried so that *every* claim from this layer can be attributed, including the
        // ones that live outside record arrays. `identity` and `socials` are plain objects
        // with nowhere to hang a `source`, and without this their values would arrive
        // unattributed — a document-derived name indistinguishable from a typed one.
        ...(kind === 'document' && tagged.meta
          ? { document: { id: tagged.meta.id, filename: tagged.meta.filename } }
          : {}),
        ...(tagged.evidence ? { evidence: tagged.evidence } : {}),
      }
    }
    return {
      id: `${kind}-${index + 1}`,
      kind,
      label: `${kind === 'document' ? 'Document' : 'Source'} ${index + 1}`,
      profile: source,
    }
  })
}

/**
 * The user's field-level edits, as a layer.
 *
 * Only the parts of `overrides` that assert a *value*. Hides and ordering are not claims
 * about what is true, so they stay in `applyOverrides`.
 *
 * @param {import('../schema/merge.js').Overrides|undefined} overrides
 * @returns {import('../identity/types.js').Layer[]}
 */
function overrideLayer(overrides) {
  if (!overrides) return []

  /** @type {Record<string, any>} */
  const profile = {}
  if (overrides.identity && Object.keys(overrides.identity).length) profile.identity = overrides.identity
  if (overrides.socials && Object.keys(overrides.socials).length) profile.socials = overrides.socials

  for (const [collection, patches] of Object.entries(overrides.records ?? {})) {
    const records = Object.entries(patches ?? {})
      .filter(([, patch]) => patch && typeof patch === 'object')
      .map(([id, patch]) => ({ ...patch, id }))
    if (records.length) profile[collection] = records
  }

  if (!Object.keys(profile).length) return []
  return [{ id: 'you', kind: /** @type {const} */ ('override'), label: 'Your edit', profile }]
}

/**
 * The parts of `overrides` that describe presentation rather than truth.
 *
 * @param {import('../schema/merge.js').Overrides|undefined} overrides
 */
function structuralOverrides(overrides) {
  if (!overrides) return undefined
  const { hidden, order } = overrides
  if (!hidden && !order) return undefined
  return { ...(hidden ? { hidden } : {}), ...(order ? { order } : {}) }
}

/**
 * Sort dated ranges newest-first, keeping current roles at the top.
 *
 * @template {{dates?: import('../schema/types.js').DateRange}} T
 * @param {T[]} items
 * @param {number} now
 * @returns {T[]}
 */
function sortByRange(items, now) {
  if (!Array.isArray(items)) return []
  return [...items].sort((a, b) => rangeValue(b.dates, now) - rangeValue(a.dates, now))
}

/**
 * Return only the sections that should render, in order — the list `MainContent` iterates.
 *
 * @param {BuiltPortfolio} built
 * @returns {import('./sections.js').ResolvedSection[]}
 */
export function visibleSections(built) {
  return built.sections.filter((s) => s.visible)
}
