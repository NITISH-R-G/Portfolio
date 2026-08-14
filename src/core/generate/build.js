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

import { mergeProfiles, applyOverrides } from '../schema/merge.js'
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

  /* 1–3. Layer, merge, override. -------------------------------------------- */

  const layers = [
    ...(Array.isArray(input.sources) ? input.sources : []),
    input.manual,
    // Config identity sits above imported data: what a user typed about themselves beats
    // what a platform's bio field happens to say.
    configProfileLayer(config),
  ].filter(Boolean)

  let profile = mergeProfiles(...layers)
  profile = applyOverrides(profile, input.overrides)

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

  return { profile, sections, navigation, theme, seo, config, validation, configIssues: issues }
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
