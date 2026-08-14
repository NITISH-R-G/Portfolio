/**
 * Deterministic project scoring.
 *
 * A portfolio that shows everything shows nothing. This module ranks a user's work so the
 * strongest evidence surfaces first, using only signals that are already in the data — no
 * model, no API, no randomness. The same input always produces the same score, which is
 * what makes the output reviewable and the tests meaningful.
 *
 * Scores are advisory: an explicit `featured: true` always wins, and every project remains
 * available. Ranking changes the order and the emphasis, never the truth.
 *
 * @module core/generate/scoring
 */

import { dateValue } from '../schema/date.js'

/** @typedef {import('../schema/types.js').ProjectItem} ProjectItem */

/**
 * Signal weights, summing to 100.
 *
 * The balance is deliberate: popularity (stars/forks) is capped at 35 so that a thoughtful
 * project with a real write-up can out-rank a repo that went briefly viral, and a student
 * with no stars still gets a sensibly ordered portfolio.
 */
export const WEIGHTS = {
  popularity: 25,   // stars, log-scaled
  forks: 10,        // independent signal of reuse
  recency: 20,      // actively maintained work reads as current
  completeness: 20, // description, topics, language, image
  narrative: 15,    // problem/approach/impact — the user invested in explaining it
  reach: 10,        // a live URL or published link
}

/** Below this, a repo is treated as having no meaningful star signal. */
const STAR_SATURATION = 500
const FORK_SATURATION = 100

/** Recency window: newer than this scores full marks, older than the floor scores zero. */
const RECENCY_FULL_DAYS = 90
const RECENCY_ZERO_DAYS = 3 * 365

/**
 * Compress an unbounded count into 0–1 on a log curve, so the difference between 0 and 10
 * stars matters far more than between 900 and 1000.
 *
 * @param {number} value
 * @param {number} saturation
 * @returns {number}
 */
function logScale(value, saturation) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, Math.log10(1 + value) / Math.log10(1 + saturation))
}

/**
 * Score how recently a project was touched, 0–1.
 *
 * @param {ProjectItem} project
 * @param {number} now
 * @returns {number}
 */
function recencyScore(project, now) {
  const touched = Math.max(dateValue(project.updatedAt), dateValue(project.date))
  if (touched === -Infinity) return 0
  const days = (now - touched) / 86_400_000
  if (days <= RECENCY_FULL_DAYS) return 1
  if (days >= RECENCY_ZERO_DAYS) return 0
  return 1 - (days - RECENCY_FULL_DAYS) / (RECENCY_ZERO_DAYS - RECENCY_FULL_DAYS)
}

/**
 * Score how well-described a project is, 0–1. This is the signal a user can most directly
 * improve, and it rewards the work that is actually presentable.
 *
 * @param {ProjectItem} project
 * @returns {number}
 */
function completenessScore(project) {
  let score = 0
  if (project.description) score += 0.4
  if ((project.description?.length ?? 0) > 80) score += 0.1
  if (project.technologies?.length) score += 0.2
  if (project.topics?.length) score += 0.1
  if (project.primaryLanguage) score += 0.1
  if (project.image) score += 0.1
  return Math.min(1, score)
}

/**
 * Score the depth of the written case study, 0–1.
 *
 * @param {ProjectItem} project
 * @returns {number}
 */
function narrativeScore(project) {
  const fields = [project.problem, project.approach, project.impact, project.role, project.lessons]
  const filled = fields.filter(Boolean).length
  const hasMetrics = (project.metrics?.length ?? 0) > 0
  return Math.min(1, filled / fields.length + (hasMetrics ? 0.2 : 0))
}

/**
 * Score outward reach, 0–1: is there something a visitor can actually go and look at?
 *
 * @param {ProjectItem} project
 * @returns {number}
 */
function reachScore(project) {
  let score = 0
  if (project.liveUrl) score += 0.6
  if (project.repository) score += 0.3
  if (project.links?.length) score += 0.1
  return Math.min(1, score)
}

/**
 * Compute a 0–100 score for one project, with a breakdown so the admin can explain *why*
 * a project ranked where it did rather than presenting an opaque number.
 *
 * @param {ProjectItem} project
 * @param {{now?: number}} [options]
 * @returns {{score: number, breakdown: Record<string, number>}}
 */
export function scoreProject(project, options = {}) {
  const now = options.now ?? Date.now()

  const parts = {
    popularity: logScale(project.stars ?? 0, STAR_SATURATION) * WEIGHTS.popularity,
    forks: logScale(project.forks ?? 0, FORK_SATURATION) * WEIGHTS.forks,
    recency: recencyScore(project, now) * WEIGHTS.recency,
    completeness: completenessScore(project) * WEIGHTS.completeness,
    narrative: narrativeScore(project) * WEIGHTS.narrative,
    reach: reachScore(project) * WEIGHTS.reach,
  }

  let score = Object.values(parts).reduce((a, b) => a + b, 0)

  // A fork the user did not substantially build on is weak evidence of their own work.
  // Penalise rather than exclude — some of the best contributions live in forks.
  if (project.isFork && !project.description && !(project.stars ?? 0)) score *= 0.4
  else if (project.isFork) score *= 0.75

  if (project.status === 'archived') score *= 0.7

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    breakdown: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 10) / 10])),
  }
}

/**
 * Score and rank a project list.
 *
 * Returns a new array sorted best-first, with `featureScore` written onto each project.
 * Projects the user explicitly marked `featured` are pinned to the front in their scored
 * order — an explicit choice always beats a computed one.
 *
 * @param {ProjectItem[]} projects
 * @param {{now?: number, featuredCount?: number}} [options]
 * @returns {ProjectItem[]}
 */
export function rankProjects(projects, options = {}) {
  if (!Array.isArray(projects) || projects.length === 0) return []
  const now = options.now ?? Date.now()

  const scored = projects.map((project) => {
    const { score } = scoreProject(project, { now })
    return { ...project, featureScore: score }
  })

  scored.sort((a, b) => {
    const pinnedA = a.featured === true ? 1 : 0
    const pinnedB = b.featured === true ? 1 : 0
    if (pinnedA !== pinnedB) return pinnedB - pinnedA
    if (b.featureScore !== a.featureScore) return (b.featureScore ?? 0) - (a.featureScore ?? 0)
    // Stable, human-meaningful tiebreak so equal scores do not shuffle between builds.
    return String(a.name).localeCompare(String(b.name))
  })

  // Mark the top N as featured when the user has not chosen any themselves, so a freshly
  // imported portfolio still leads with its strongest work.
  const userChose = scored.some((p) => p.featured === true)
  if (!userChose) {
    const count = Math.min(options.featuredCount ?? 3, scored.length)
    for (let i = 0; i < count; i += 1) {
      // Only auto-feature projects that cleared a minimum bar; padding the row with weak
      // entries would misrepresent them.
      if ((scored[i].featureScore ?? 0) >= 25) scored[i] = { ...scored[i], featured: true }
    }
  }

  return scored
}

/**
 * Generic recency sort for any dated collection. Undated records keep their relative order
 * and sink to the bottom.
 *
 * @template {{date?: import('../schema/types.js').PortfolioDate}} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function sortByDateDesc(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = dateValue(b.item.date) - dateValue(a.item.date)
      if (diff !== 0 && Number.isFinite(diff)) return diff
      if (dateValue(a.item.date) === dateValue(b.item.date)) return a.index - b.index
      return dateValue(b.item.date) === -Infinity ? -1 : 1
    })
    .map(({ item }) => item)
}
