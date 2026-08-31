import { motion } from 'motion/react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { renderSection } from '../sections/registry'

// Same entrance curve every other reveal in the app uses (Sidebar, TopNav, Dock,
// SkillsSection) — this was the one holdout still on the older [0.16, 1, 0.3, 1] curve,
// which is what made the page-load feel subtly different from everything scroll-triggered.
const sectionItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } },
}

/**
 * Renders the given sections in order, each dispatched through `sections/registry.jsx`.
 * No section id is special-cased here — the registry decides what each one renders, and
 * this component only supplies the shared heading/animation wrapper.
 *
 * Each section reveals independently on scroll, not as one synchronized stagger at mount.
 * The previous version staggered every section 60ms apart starting the instant the page
 * loaded — for a full profile (10+ sections) that is up to 700ms+ of animation work queued
 * for content nobody has scrolled to yet, competing with Lenis and the custom cursor for
 * the same frames at the single moment first paint matters most. `whileInView` is what
 * `StatsSection` and `SkillsSection` already correctly do; this brings the rest of the page
 * in line with them rather than leaving one inconsistent reveal mechanism for "everything
 * below the fold at load" and another for "everything already using scroll triggers."
 *
 * @param {{sections: import('../core/generate/sections.js').ResolvedSection[]}} props
 */
export default function MainContent({ sections }) {
  const { profile, config } = usePortfolio()
  const reducedMotion = useReducedMotion()
  const year = new Date().getFullYear()

  return (
    <main className="main-content" id="main-content" tabIndex="-1">
      {sections.map((section) => (
        <motion.section
          key={section.id}
          id={section.id}
          className="content-section"
          initial={reducedMotion ? 'visible' : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={sectionItem}
        >
          {section.id !== 'hero' && <h2 className="section-label">{section.label}</h2>}
          {renderSection(section, profile, config, reducedMotion)}
        </motion.section>
      ))}

      <footer className="footer">
        <p>Built with an open-source portfolio engine</p>
        {profile.identity?.name && <p>© {year} {profile.identity.name}</p>}
      </footer>
    </main>
  )
}
