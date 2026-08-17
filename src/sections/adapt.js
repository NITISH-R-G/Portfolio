/**
 * Record → display-props adapters.
 *
 * The schema in `core/schema/types.js` is normalized for storage and merging, not for
 * rendering — dates are `{iso, precision}` objects, "who this is about" is spread across
 * `name`/`company`/`platform` depending on collection. Rather than teach every card
 * component eleven different field names, each collection is adapted once, here, into the
 * flat shape `CaseStudyCard` already expects. Adding a twelfth collection means adding one
 * function to this file, not touching the card.
 *
 * @module sections/adapt
 */

import { formatDate, formatRange } from '../core/schema/date.js'

/**
 * @typedef {object} CaseStudyProps
 * @property {string} [id]
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [date]
 * @property {string} [status]
 * @property {boolean} [featured]
 * @property {string} [description]
 * @property {string} [context]
 * @property {string} [problem]
 * @property {string} [approach]
 * @property {string} [impact]
 * @property {string} [responsibilities]
 * @property {string} [constraints]
 * @property {string} [lessons]
 * @property {import('../core/schema/types.js').Metric[]} [metrics]
 * @property {import('../core/schema/types.js').Link[]} [links]
 * @property {string[]} [tools]
 * @property {string[]} [tags]
 */

/** @param {import('../core/schema/types.js').ProjectItem} p @returns {CaseStudyProps} */
export function adaptProject(p) {
  const links = [
    ...(p.links ?? []),
    ...(p.repository ? [{ label: 'GitHub', url: p.repository, rel: 'repository' }] : []),
    ...(p.liveUrl ? [{ label: 'Live', url: p.liveUrl, rel: 'live' }] : []),
  ]
  return {
    id: p.id,
    title: p.name,
    subtitle: p.role,
    date: formatDate(p.date) || formatDate(p.updatedAt),
    status: p.status,
    featured: p.featured,
    description: p.description,
    context: p.context,
    problem: p.problem,
    approach: p.approach,
    impact: p.impact,
    responsibilities: p.responsibilities,
    constraints: p.constraints,
    lessons: p.lessons,
    metrics: withRepoMetrics(p),
    links: links.length ? links : undefined,
    tools: p.technologies,
    tags: p.topics,
  }
}

/** Fold star/fork counts into the metrics row so imported repos show real numbers. */
function withRepoMetrics(/** @type {import('../core/schema/types.js').ProjectItem} */ p) {
  const derived = []
  if (typeof p.stars === 'number' && p.stars > 0) derived.push({ label: 'Stars', value: p.stars.toLocaleString('en-US') })
  if (typeof p.forks === 'number' && p.forks > 0) derived.push({ label: 'Forks', value: p.forks.toLocaleString('en-US') })
  return [...(p.metrics ?? []), ...derived]
}

/** @param {import('../core/schema/types.js').ExperienceItem} e @returns {CaseStudyProps} */
export function adaptExperience(e) {
  return {
    id: e.id,
    title: e.role || e.company,
    subtitle: e.role ? e.company : undefined,
    date: formatRange(e.dates),
    description: [e.location, e.employmentType].filter(Boolean).join(' · ') || undefined,
    context: e.description,
    responsibilities: (e.highlights ?? []).join(' '),
    metrics: e.metrics,
    links: e.links,
    tools: e.technologies,
  }
}

/** @param {import('../core/schema/types.js').EducationItem} e @returns {CaseStudyProps} */
export function adaptEducation(e) {
  return {
    id: e.id,
    title: e.institution,
    subtitle: [e.degree, e.field].filter(Boolean).join(', ') || undefined,
    date: formatRange(e.dates),
    description: [e.location, e.grade].filter(Boolean).join(' · ') || undefined,
    context: e.description,
    tools: e.courses,
    tags: e.achievements,
    links: e.links,
  }
}

/** @param {import('../core/schema/types.js').CompetitiveProfile} c @returns {CaseStudyProps} */
export function adaptCompetitive(c) {
  /** @type {import('../core/schema/types.js').Metric[]} */
  const metrics = []
  if (c.rating !== undefined) metrics.push({ label: 'Rating', value: String(c.rating) })
  if (c.maxRating !== undefined && c.maxRating !== c.rating) metrics.push({ label: 'Peak rating', value: String(c.maxRating) })
  if (c.problemsSolved !== undefined) metrics.push({ label: 'Problems solved', value: c.problemsSolved.toLocaleString('en-US') })
  if (c.contests !== undefined) metrics.push({ label: 'Contests', value: String(c.contests) })
  if (c.globalRank !== undefined) metrics.push({ label: 'Global rank', value: `#${c.globalRank.toLocaleString('en-US')}` })
  metrics.push(...(c.metrics ?? []))
  return {
    id: c.platform,
    title: c.platform,
    subtitle: [c.username, c.rank].filter(Boolean).join(' · ') || undefined,
    metrics,
    links: c.url ? [{ label: 'Profile', url: c.url }] : undefined,
  }
}

/** @param {import('../core/schema/types.js').PublicationItem} p @returns {CaseStudyProps} */
export function adaptPublication(p) {
  const metrics = []
  if (p.citations) metrics.push({ label: 'Citations', value: p.citations.toLocaleString('en-US') })
  return {
    id: p.id,
    title: p.title,
    subtitle: p.venue,
    date: formatDate(p.date),
    description: p.abstract,
    tags: p.authors,
    metrics,
    links: [
      ...(p.url ? [{ label: 'Read', url: p.url }] : []),
      ...(p.doi ? [{ label: 'DOI', url: `https://doi.org/${p.doi}` }] : []),
    ],
  }
}

/** @param {import('../core/schema/types.js').PostItem} p @returns {CaseStudyProps} */
export function adaptPost(p) {
  const metrics = []
  if (p.reactions) metrics.push({ label: 'Reactions', value: String(p.reactions) })
  if (p.comments) metrics.push({ label: 'Comments', value: String(p.comments) })
  return {
    id: p.id,
    title: p.title,
    subtitle: p.publication,
    date: formatDate(p.date),
    description: p.excerpt,
    tags: p.tags,
    metrics,
    links: p.url ? [{ label: 'Read', url: p.url }] : undefined,
  }
}

/** @param {import('../core/schema/types.js').PackageItem} p @returns {CaseStudyProps} */
export function adaptPackage(p) {
  const metrics = []
  if (p.downloads) {
    metrics.push({ label: 'Downloads', value: p.downloads.toLocaleString('en-US'), note: p.downloadsPeriod })
  }
  if (p.version) metrics.push({ label: 'Version', value: p.version })
  return {
    id: p.id,
    title: p.name,
    subtitle: p.registry,
    date: formatDate(p.updatedAt),
    description: p.description,
    tags: p.keywords,
    metrics,
    links: [
      ...(p.url ? [{ label: 'Package', url: p.url }] : []),
      ...(p.repository ? [{ label: 'Source', url: p.repository }] : []),
    ],
  }
}

/** @param {import('../core/schema/types.js').ModelItem} m @returns {CaseStudyProps} */
export function adaptModel(m) {
  const metrics = []
  if (m.likes) metrics.push({ label: 'Likes', value: m.likes.toLocaleString('en-US') })
  if (m.downloads) metrics.push({ label: 'Downloads', value: m.downloads.toLocaleString('en-US') })
  return {
    id: m.id,
    title: m.name,
    subtitle: m.kind ? m.kind[0].toUpperCase() + m.kind.slice(1) : undefined,
    date: formatDate(m.updatedAt),
    description: m.description,
    tags: m.tags,
    metrics,
    links: m.url ? [{ label: 'View', url: m.url }] : undefined,
  }
}

/** @param {import('../core/schema/types.js').VideoItem} v @returns {CaseStudyProps} */
export function adaptVideo(v) {
  const metrics = []
  if (v.views) metrics.push({ label: 'Views', value: v.views.toLocaleString('en-US') })
  return {
    id: v.id,
    title: v.title,
    date: formatDate(v.date),
    description: v.description,
    metrics,
    links: v.url ? [{ label: 'Watch', url: v.url }] : undefined,
  }
}

/** @param {import('../core/schema/types.js').HackathonItem} h @returns {CaseStudyProps} */
export function adaptHackathon(h) {
  return {
    id: h.id,
    title: h.name,
    subtitle: [h.event, h.role].filter(Boolean).join(' · ') || undefined,
    date: formatDate(h.date),
    status: h.result,
    description: h.description,
    metrics: h.metrics,
    links: h.links,
    tools: h.technologies,
  }
}

/** @param {import('../core/schema/types.js').TalkItem} t @returns {CaseStudyProps} */
export function adaptTalk(t) {
  return {
    id: t.id,
    title: t.title,
    subtitle: [t.event, t.venue].filter(Boolean).join(' · ') || undefined,
    date: formatDate(t.date),
    description: [t.audience, t.format].filter(Boolean).join(' · ') || t.description,
    context: t.audience && t.format ? t.description : undefined,
    links: t.links,
  }
}

/** @param {import('../core/schema/types.js').AchievementItem} a @returns {CaseStudyProps} */
export function adaptAchievement(a) {
  return {
    id: a.id,
    title: a.title,
    subtitle: a.organization,
    date: formatDate(a.date),
    status: a.rank,
    description: a.description,
    metrics: a.metrics,
    links: a.url ? [{ label: 'View', url: a.url }] : undefined,
  }
}

/** @param {import('../core/schema/types.js').CustomItem} c @returns {CaseStudyProps} */
export function adaptCustom(c) {
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    date: formatDate(c.date),
    description: c.description,
    tags: c.tags,
    metrics: c.metrics,
    links: c.links,
  }
}

/**
 * Adapter for a section id, or `undefined` for section ids handled by a bespoke component
 * (projects, education, contact, skills, ...) rather than the generic case-study list.
 *
 * @type {Record<string, (record: any) => CaseStudyProps>}
 */
export const ADAPTERS = {
  experience: adaptExperience,
  openSource: adaptProject,
  competitive: adaptCompetitive,
  publications: adaptPublication,
  writing: adaptPost,
  packages: adaptPackage,
  models: adaptModel,
  videos: adaptVideo,
  hackathons: adaptHackathon,
  talks: adaptTalk,
  achievements: adaptAchievement,
}

/**
 * Which `Profile` collection a generic section id reads from, when it differs from the id
 * itself (`writing` reads `posts`, `openSource` and `competitive` read filtered/renamed
 * collections).
 *
 * @param {string} sectionId
 * @param {import('../core/schema/types.js').Profile} profile
 * @returns {any[]}
 */
export function collectionFor(sectionId, profile) {
  switch (sectionId) {
    case 'writing':
      return profile.posts ?? []
    case 'openSource':
      return (profile.projects ?? []).filter(
        (p) => !p.isFork && ((p.stars ?? 0) >= 5 || (p.forks ?? 0) >= 2),
      )
    case 'competitive':
      return profile.competitive ?? []
    default:
      return /** @type {any[]} */ (profile[/** @type {keyof typeof profile} */ (sectionId)]) ?? []
  }
}
