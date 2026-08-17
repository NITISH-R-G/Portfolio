import { motion } from 'motion/react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { renderSection } from '../sections/registry'

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }
const sectionItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } },
}

/**
 * Renders the given sections in order, each dispatched through `sections/registry.jsx`.
 * No section id is special-cased here — the registry decides what each one renders, and
 * this component only supplies the shared heading/animation wrapper.
 *
 * @param {{sections: import('../core/generate/sections.js').ResolvedSection[]}} props
 */
export default function MainContent({ sections }) {
  const { profile, config } = usePortfolio()
  const reducedMotion = useReducedMotion()
  const year = new Date().getFullYear()

  return (
    <motion.main
      className="main-content"
      id="main-content"
      tabIndex="-1"
      initial={reducedMotion ? 'visible' : 'hidden'}
      animate="visible"
      variants={container}
    >
      {sections.map((section) => (
        <motion.section key={section.id} id={section.id} className="content-section" variants={sectionItem}>
          {section.id !== 'hero' && <h2 className="section-label">{section.label}</h2>}
          {renderSection(section, profile, config, reducedMotion)}
        </motion.section>
      ))}

      <footer className="footer">
        <p>Built with an open-source portfolio engine</p>
        {profile.identity?.name && <p>© {year} {profile.identity.name}</p>}
      </footer>
    </motion.main>
  )
}
