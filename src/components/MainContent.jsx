import { motion } from 'motion/react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import ProjectsCoverflow from './ProjectsCoverflow'
import Button from './Button'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } }
}

const sectionItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }
}

export default function MainContent() {
  const { sections, contact, footer } = usePortfolio()
  const reducedMotion = useReducedMotion()
  
  return (
    <motion.main
      className="main-content"
      id="main-content"
      tabIndex="-1"
      initial={reducedMotion ? 'visible' : 'hidden'}
      animate="visible"
      variants={container}
    >
      {sections.intro.enabled && (
        <motion.section id="intro" className="content-section" variants={sectionItem}>
          <h2 className="section-label">INTRO</h2>
          <p className="intro-text">{sections.intro.text}</p>
          <p className="intro-text">{sections.intro.subtext}</p>
        </motion.section>
      )}
      
      {sections.projects.enabled && (
        <motion.section id="projects" className="content-section" variants={sectionItem}>
          <h2 className="section-label">PROJECTS</h2>
          <ProjectsCoverflow projects={sections.projects.items} />
        </motion.section>
      )}
      
      {sections.experience.enabled && (
        <motion.section id="experience" className="content-section" variants={sectionItem}>
          <h2 className="section-label">EXPERIENCE</h2>
          <div className="experience-list">
            <div className="experience-card">
              <div className="experience-content">
                <p className="experience-description">{sections.experience.placeholder}</p>
              </div>
            </div>
          </div>
        </motion.section>
      )}
      
      {sections.education.enabled && (
        <motion.section id="education" className="content-section" variants={sectionItem}>
          <h2 className="section-label">EDUCATION</h2>
          <div className="education-list">
            {sections.education.items.map((edu, i) => (
              <div key={i} className="education-card">
                <div className="education-icon" aria-hidden="true">🎓</div>
                <div className="education-content">
                  <h3 className="education-title">{edu.institution}</h3>
                  <div className="education-meta">
                    <span>📍 {edu.location}</span>
                  </div>
                  <p className="education-description">{edu.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}
      
      {contact.enabled && (
        <motion.section id="contact" className="content-section" variants={sectionItem}>
          <h2 className="section-label">CONTACT</h2>
          <p className="contact-cta">{contact.cta}</p>
          <div className="contact-table">
            {contact.links.map((link, i) => (
              <Button
                key={i}
                variant={link.href.startsWith('http') || link.href.startsWith('mailto:') ? 'external' : 'ghost'}
                href={link.href}
                externalIcon={link.href.startsWith('http') || link.href.startsWith('mailto:')}
                className="contact-row"
              >
                <span className="contact-label">{link.label}</span>
                <span className="contact-value">{link.value}</span>
              </Button>
            ))}
          </div>
        </motion.section>
      )}
      
      <footer className="footer">
        <p>{footer.text}</p>
        <p>{footer.copyright}</p>
      </footer>
    </motion.main>
  )
}
