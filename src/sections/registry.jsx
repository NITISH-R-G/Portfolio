import HeroSection from './HeroSection'
import AboutSection from './AboutSection'
import StatsSection from './StatsSection'
import ProjectsSection from './ProjectsSection'
import ExperienceSection from './ExperienceSection'
import EducationSection from './EducationSection'
import SkillsSection from './SkillsSection'
import LanguagesSection from './LanguagesSection'
import CertificationsSection from './CertificationsSection'
import ContactSection from './ContactSection'
import GenericSection from './GenericSection'
import { ADAPTERS, adaptCustom, collectionFor } from './adapt.js'

/**
 * The section ids that belong in the identity rail rather than the scrolling column, when
 * `layout.shell` is `"sidebar"`. Everything else renders in reading order in the main
 * column. This is the one place that distinction is made — no component below needs to
 * know it exists.
 *
 * @type {ReadonlySet<string>}
 */
export const RAIL_SECTION_IDS = new Set(['hero', 'about', 'skills', 'languages'])

/**
 * Ids with a bespoke component. Everything else — the twelve generic collections plus any
 * `sections.<customId>` a user declares — is rendered through `GenericSection`, keyed by
 * `sections/adapt.js`. This is the extensibility point: a new collection needs an entry in
 * `ADAPTERS`, not a new component.
 */
const BESPOKE = new Set([
  'hero', 'about', 'stats', 'projects', 'experience', 'education', 'skills', 'languages',
  'certifications', 'contact',
])

/**
 * Render the body of one resolved, visible section. The caller (`PortfolioShell`) supplies
 * the wrapping `<section>` / heading / animation — this only renders what goes inside it.
 *
 * @param {import('../core/generate/sections.js').ResolvedSection} section
 * @param {import('../core/schema/types.js').Profile} profile
 * @param {Required<import('../core/config/types.js').PortfolioConfig>} config
 * @param {boolean} reducedMotion
 * @returns {import('react').ReactNode}
 */
export function renderSection(section, profile, config, reducedMotion) {
  const { id, options } = section

  switch (id) {
    case 'hero':
      return <HeroSection identity={profile.identity} avatarStyle={config.layout?.avatarStyle} reducedMotion={reducedMotion} />
    case 'about':
      return <AboutSection summary={profile.identity?.summary} />
    case 'stats':
      return <StatsSection entries={profile.stats?.entries} showProvenance={config.privacy?.showDataProvenance} />
    case 'projects':
      return <ProjectsSection projects={limit(profile.projects, options)} layout={config.layout?.projectLayout} />
    case 'experience':
      return <ExperienceSection experience={limit(profile.experience, options)} layout={config.layout?.experienceLayout} />
    case 'education':
      return <EducationSection education={limit(profile.education, options)} />
    case 'skills':
      return <SkillsSection skills={profile.skills} evidenceMode={config.features?.evidenceMode} reducedMotion={reducedMotion} />
    case 'languages':
      return <LanguagesSection languages={profile.languages} />
    case 'certifications':
      return <CertificationsSection certifications={limit(profile.certifications, options)} reducedMotion={reducedMotion} />
    case 'contact':
      return (
        <ContactSection
          identity={profile.identity}
          socials={profile.socials}
          cta={typeof options.cta === 'string' ? options.cta : undefined}
          hideEmail={config.privacy?.hideEmail}
          obfuscateEmail={config.privacy?.obfuscateEmail}
        />
      )
    default: {
      const adapt = ADAPTERS[id] ?? adaptCustom
      const records = limit(collectionFor(id, profile), options)
      return <GenericSection records={records} adapt={adapt} icon={section.icon} />
    }
  }
}

/**
 * Apply `sectionOptions.<id>.limit`, when set, so a user can cap a long list ("just my top
 * 6 projects") without hiding the rest from the data.
 *
 * @template T
 * @param {T[]} records
 * @param {Record<string, unknown>} options
 * @returns {T[]}
 */
function limit(records, options) {
  const list = records ?? []
  const cap = options?.limit
  return typeof cap === 'number' && cap > 0 ? list.slice(0, cap) : list
}

export { BESPOKE }
