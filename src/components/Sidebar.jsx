import { motion } from 'motion/react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { renderSection, RAIL_SECTION_IDS } from '../sections/registry'
import Icon from './Icon'

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }
const item = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } },
}
const socialItem = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 },
  }),
}

const socialIconOverrides = { github: 'Github', linkedin: 'Linkedin', x: 'Twitter', twitter: 'Twitter', youtube: 'Youtube' }

/**
 * The identity rail. Renders whichever sections were routed here by `RAIL_SECTION_IDS`
 * (hero, about, skills, languages by default) in the order `sectionOrder` puts them, so a
 * user who reorders sections in config sees the rail reorder too — nothing about which
 * sections appear in the rail is hardcoded into this component's JSX.
 */
export default function Sidebar() {
  const { profile, sections, config } = usePortfolio()
  const reducedMotion = useReducedMotion()

  const railSections = sections.filter((s) => s.visible && RAIL_SECTION_IDS.has(s.id))
  const socialEntries = Object.entries(profile.socials ?? {}).filter(([, url]) => url)

  return (
    <motion.aside
      className="sidebar"
      initial={reducedMotion ? 'visible' : 'hidden'}
      animate="visible"
      variants={container}
    >
      {railSections.map((section) =>
        section.id === 'hero' ? (
          <motion.div key={section.id} variants={item}>
            {renderSection(section, profile, config, reducedMotion)}
          </motion.div>
        ) : (
          <motion.section key={section.id} id={section.id} className="sidebar-section" variants={item}>
            <h2 className="section-label">{section.label}</h2>
            {renderSection(section, profile, config, reducedMotion)}
          </motion.section>
        ),
      )}

      {socialEntries.length > 0 && (
        <motion.div className="social-links" variants={container}>
          {socialEntries.map(([key, url], i) => (
            <motion.a
              key={key}
              href={url}
              className="social-icon"
              aria-label={key}
              target="_blank"
              rel="noopener noreferrer"
              variants={socialItem}
              custom={i}
              whileHover={!reducedMotion ? { scale: 1.1, borderColor: 'var(--color-border-strong)' } : {}}
              whileTap={!reducedMotion ? { scale: 0.95 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Icon name={socialIconOverrides[key] ?? 'Link'} size={18} aria-hidden="true" />
            </motion.a>
          ))}
        </motion.div>
      )}
    </motion.aside>
  )
}
