/**
 * Automatic section selection.
 *
 * A researcher, a competitive programmer and a frontend developer should not get the same
 * page skeleton. Rather than asking every user to configure twenty toggles, each section
 * declares what data justifies its existence, and the generator decides.
 *
 * The rules are intentionally conservative. A section appears when it has enough content to
 * look deliberate — one blog post is not a Writing section — and disappears entirely
 * otherwise, rather than rendering a heading over empty space.
 *
 * A user can always override: `sections.writing = true` forces it on, `false` forces it off.
 * `'auto'` (the default) is what this module decides.
 *
 * @module core/generate/sections
 */

/** @typedef {import('../schema/types.js').Profile} Profile */

/**
 * @typedef {object} SectionDefinition
 * @property {string} id
 * @property {string} label            Heading text.
 * @property {string} navLabel         Shorter label for the dock.
 * @property {string} icon             Icon name resolved by `components/Icon`.
 * @property {(profile: Profile) => number} count
 *   How many items this section would render. Used both for the threshold and to tell the
 *   user in the admin *why* a section is hidden.
 * @property {number} [threshold]      Minimum count for `auto` to show it. Default 1.
 * @property {boolean} [alwaysConsider] Show even with zero items (hero, contact).
 */

/** @type {SectionDefinition[]} */
export const SECTION_DEFINITIONS = [
  {
    id: 'hero',
    label: 'Intro',
    navLabel: 'Intro',
    icon: 'User',
    alwaysConsider: true,
    count: (p) => (p.identity?.name ? 1 : 0),
  },
  {
    id: 'about',
    label: 'About',
    navLabel: 'About',
    icon: 'User',
    count: (p) => (p.identity?.summary ? 1 : 0),
  },
  {
    id: 'stats',
    label: 'By the numbers',
    navLabel: 'Stats',
    icon: 'BarChart3',
    // A stats strip with two numbers looks thin; three is the point at which it reads as a
    // deliberate summary.
    threshold: 3,
    count: (p) => (p.stats?.entries ?? []).length,
  },
  {
    id: 'projects',
    label: 'Projects',
    navLabel: 'Projects',
    icon: 'FolderKanban',
    count: (p) => (p.projects ?? []).length,
  },
  {
    id: 'experience',
    label: 'Experience',
    navLabel: 'Experience',
    icon: 'Briefcase',
    count: (p) => (p.experience ?? []).length,
  },
  {
    id: 'education',
    label: 'Education',
    navLabel: 'Education',
    icon: 'GraduationCap',
    count: (p) => (p.education ?? []).length,
  },
  {
    id: 'skills',
    label: 'Skills',
    navLabel: 'Skills',
    icon: 'Code',
    threshold: 3,
    count: (p) => (p.skills ?? []).length,
  },
  {
    id: 'openSource',
    label: 'Open source',
    navLabel: 'Open source',
    icon: 'GitBranch',
    // Only meaningful when work has actually been picked up by others; otherwise these
    // repos are already covered by Projects.
    threshold: 1,
    count: (p) => (p.projects ?? []).filter((x) => !x.isFork && ((x.stars ?? 0) >= 5 || (x.forks ?? 0) >= 2)).length,
  },
  {
    id: 'competitive',
    label: 'Competitive programming',
    navLabel: 'Competitive',
    icon: 'Trophy',
    count: (p) => (p.competitive ?? []).length,
  },
  {
    id: 'publications',
    label: 'Publications',
    navLabel: 'Research',
    icon: 'BookOpen',
    count: (p) => (p.publications ?? []).length,
  },
  {
    id: 'writing',
    label: 'Writing',
    navLabel: 'Writing',
    icon: 'Newspaper',
    threshold: 2,
    count: (p) => (p.posts ?? []).length,
  },
  {
    id: 'packages',
    label: 'Packages',
    navLabel: 'Packages',
    icon: 'Package',
    count: (p) => (p.packages ?? []).length,
  },
  {
    id: 'models',
    label: 'Models & datasets',
    navLabel: 'Models',
    icon: 'Boxes',
    count: (p) => (p.models ?? []).length,
  },
  {
    id: 'videos',
    label: 'Talks & video',
    navLabel: 'Video',
    icon: 'Video',
    threshold: 2,
    count: (p) => (p.videos ?? []).length,
  },
  {
    id: 'hackathons',
    label: 'Hackathons',
    navLabel: 'Hackathons',
    icon: 'Trophy',
    count: (p) => (p.hackathons ?? []).length,
  },
  {
    id: 'talks',
    label: 'Talks',
    navLabel: 'Talks',
    icon: 'Mic',
    count: (p) => (p.talks ?? []).length,
  },
  {
    id: 'achievements',
    label: 'Achievements',
    navLabel: 'Awards',
    icon: 'Medal',
    count: (p) => (p.achievements ?? []).length,
  },
  {
    id: 'certifications',
    label: 'Certifications',
    navLabel: 'Certifications',
    icon: 'Award',
    count: (p) => (p.certifications ?? []).length,
  },
  {
    id: 'languages',
    label: 'Languages',
    navLabel: 'Languages',
    icon: 'Globe',
    count: (p) => (p.languages ?? []).length,
  },
  {
    id: 'contact',
    label: 'Contact',
    navLabel: 'Contact',
    icon: 'Mail',
    alwaysConsider: true,
    count: (p) => {
      const contact = p.identity?.contact
      return (contact?.email ? 1 : 0) + (contact?.links?.length ?? 0) + Object.keys(p.socials ?? {}).length
    },
  },
]

/** @type {Map<string, SectionDefinition>} */
const BY_ID = new Map(SECTION_DEFINITIONS.map((s) => [s.id, s]))

/**
 * @param {string} id
 * @returns {SectionDefinition|undefined}
 */
export function getSectionDefinition(id) {
  return BY_ID.get(id)
}

/**
 * @typedef {object} ResolvedSection
 * @property {string} id
 * @property {string} label
 * @property {string} navLabel
 * @property {string} icon
 * @property {boolean} visible
 * @property {number} count
 * @property {'forced-on'|'forced-off'|'auto-shown'|'auto-hidden'} reason
 * @property {Record<string, unknown>} options   From `config.sectionOptions[id]`.
 */

/**
 * Decide which sections to render, in order.
 *
 * Returns *every* known section with a `visible` flag and a `reason`, rather than only the
 * visible ones, so the admin can show a user exactly what was hidden and why.
 *
 * @param {Profile} profile
 * @param {import('../config/types.js').PortfolioConfig} config  A resolved config.
 * @returns {ResolvedSection[]}
 */
export function resolveSections(profile, config) {
  const visibility = config?.sections ?? {}
  const optionsMap = config?.sectionOptions ?? {}
  const order = Array.isArray(config?.sectionOrder) && config.sectionOrder.length
    ? config.sectionOrder
    : SECTION_DEFINITIONS.map((s) => s.id)

  /** @type {ResolvedSection[]} */
  const resolved = []
  const seen = new Set()

  const consider = (/** @type {string} */ id) => {
    if (seen.has(id)) return
    seen.add(id)

    const definition = BY_ID.get(id)
    const setting = visibility[id] ?? 'auto'
    const options = optionsMap[id] ?? {}

    // A section id with no definition is a user-declared custom section; it is driven by
    // `profile.custom[id]` and shown when it has content.
    if (!definition) {
      const custom = profile?.custom?.[id] ?? []
      const count = Array.isArray(custom) ? custom.length : 0
      const visible = setting === true || (setting !== false && count > 0)
      resolved.push({
        id,
        label: String(options.label ?? titleCase(id)),
        navLabel: String(options.navLabel ?? options.label ?? titleCase(id)),
        icon: String(options.icon ?? 'Sparkles'),
        visible,
        count,
        reason: reasonFor(setting, visible),
        options,
      })
      return
    }

    let count = 0
    try {
      count = definition.count(profile) || 0
    } catch {
      count = 0
    }

    const threshold = definition.threshold ?? 1
    const meetsThreshold = definition.alwaysConsider ? count > 0 : count >= threshold
    const visible = setting === true ? true : setting === false ? false : meetsThreshold

    resolved.push({
      id,
      label: String(options.label ?? definition.label),
      navLabel: String(options.navLabel ?? options.label ?? definition.navLabel),
      icon: String(options.icon ?? definition.icon),
      visible,
      count,
      reason: reasonFor(setting, visible),
      options,
    })
  }

  for (const id of order) consider(id)
  // Anything defined but missing from the order still gets evaluated, so a new built-in
  // section appears for existing users without them editing `sectionOrder`.
  for (const definition of SECTION_DEFINITIONS) consider(definition.id)
  for (const id of Object.keys(profile?.custom ?? {})) consider(id)

  return resolved
}

/**
 * @param {boolean|'auto'} setting
 * @param {boolean} visible
 * @returns {ResolvedSection['reason']}
 */
function reasonFor(setting, visible) {
  if (setting === true) return 'forced-on'
  if (setting === false) return 'forced-off'
  return visible ? 'auto-shown' : 'auto-hidden'
}

/**
 * Navigation items for the visible sections. The dock is derived from the same resolution
 * as the page, so the two can never drift out of sync — which was a real defect in the
 * original implementation, where navigation was a separate hand-maintained list.
 *
 * @param {ResolvedSection[]} sections
 * @returns {{id: string, label: string, icon: string}[]}
 */
export function navigationFor(sections) {
  return sections
    .filter((s) => s.visible && s.id !== 'hero')
    .map((s) => ({ id: s.id, label: s.navLabel, icon: s.icon }))
}

/** @param {string} id */
function titleCase(id) {
  return String(id)
    .replace(/[-_]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}
