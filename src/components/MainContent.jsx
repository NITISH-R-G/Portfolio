import { lazy, Suspense } from 'react'
import { motion } from 'motion/react'
import { usePortfolio } from '../hooks/usePortfolio'
import { useReducedMotion } from '../hooks/useReducedMotion'
import ProjectCarousel from './ProjectCarousel'
import Button from './Button'
import Icon from './Icon'

const CertGallery = lazy(() => import('./CertGallery'))
const CaseStudyCard = lazy(() => import('./CaseStudyCard'))

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } }
}

const sectionItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } }
}

function hasContent(section) {
  if (!section || section.enabled === false) return false
  if (section.items && Array.isArray(section.items) && section.items.length > 0) return true
  if (section.text) return true
  if (section.url) return true
  return false
}

function GenericListItem({ item, fields }) {
  return (
    <div className="generic-list-card">
      <div className="generic-list-content">
        {fields.map(f => {
          const val = item[f.key]
          if (!val) return null
          if (f.multiline) {
            return <p key={f.key} className="generic-list-desc">{val}</p>
          }
          return <span key={f.key} className={`generic-list-${f.key}`}>{val}</span>
        })}
      </div>
      {item.link && (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="generic-list-link">
          <Icon name="ExternalLink" size={14} />
        </a>
      )}
    </div>
  )
}

function GenericSection({ id, label, items, fields, icon, useCaseStudy }) {
  if (!items || items.length === 0) return null
  return (
    <motion.section id={id} className="content-section" variants={sectionItem}>
      <h2 className="section-label">{label}</h2>
      <div className={useCaseStudy ? 'case-study-list' : 'generic-list'}>
        <Suspense fallback={null}>
          {items.map((item, i) => (
            useCaseStudy ? (
              <CaseStudyCard key={item.id || i} item={item} icon={icon} />
            ) : (
              <GenericListItem key={item.id || i} item={item} fields={fields} />
            )
          ))}
        </Suspense>
      </div>
    </motion.section>
  )
}

export default function MainContent() {
  const { sections, contact, footer } = usePortfolio()
  const reducedMotion = useReducedMotion()

  const sectionConfigs = [
    { id: 'hackathons', label: 'HACKATHONS', items: sections.hackathons?.items, icon: 'Trophy', useCaseStudy: true },
    { id: 'conferences', label: 'CONFERENCES', items: sections.conferences?.items, fields: [{ key: 'name' }, { key: 'date' }, { key: 'role' }, { key: 'description', multiline: true }] },
    { id: 'research', label: 'RESEARCH', items: sections.research?.items, icon: 'FlaskConical', useCaseStudy: true },
    { id: 'publications', label: 'PUBLICATIONS', items: sections.publications?.items, icon: 'BookOpen', useCaseStudy: true },
    { id: 'awards', label: 'AWARDS', items: sections.awards?.items, icon: 'Medal', useCaseStudy: true },
    { id: 'openSource', label: 'OPEN SOURCE', items: sections.openSource?.items, icon: 'GitBranch', useCaseStudy: true },
    { id: 'founder', label: 'FOUNDER', items: sections.founder?.items, icon: 'Rocket', useCaseStudy: true },
    { id: 'teaching', label: 'TEACHING', items: sections.teaching?.items, fields: [{ key: 'title' }, { key: 'audience' }, { key: 'date' }, { key: 'description', multiline: true }] },
    { id: 'talks', label: 'TALKS', items: sections.talks?.items, icon: 'Mic', useCaseStudy: true },
    { id: 'designWork', label: 'DESIGN', items: sections.designWork?.items, icon: 'Palette', useCaseStudy: true },
    { id: 'media', label: 'MEDIA', items: sections.media?.items, fields: [{ key: 'title' }, { key: 'outlet' }, { key: 'date' }] },
    { id: 'testimonials', label: 'TESTIMONIALS', items: sections.testimonials?.items, fields: [{ key: 'name' }, { key: 'role' }, { key: 'text', multiline: true }] },
  ]

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
          <ProjectCarousel projects={sections.projects.items} />
        </motion.section>
      )}

      {sections.experience.enabled && sections.experience.items && (
        <motion.section id="experience" className="content-section" variants={sectionItem}>
          <h2 className="section-label">EXPERIENCE</h2>
          <div className="experience-list">
            {sections.experience.items.map((exp, i) => (
              <div key={i} className="experience-card">
                <div className="experience-content">
                  <div className="experience-header">
                    <h3 className="experience-role">{exp.role}</h3>
                    <span className="experience-period">{exp.period}</span>
                  </div>
                  <div className="experience-company">
                    {exp.company} · {exp.location}
                  </div>
                  <p className="experience-description">{exp.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {sections.education.enabled && (
        <motion.section id="education" className="content-section" variants={sectionItem}>
          <h2 className="section-label">EDUCATION</h2>
          <div className="education-list">
            {sections.education.items.map((edu, i) => (
              <div key={i} className="education-card">
                <div className="education-icon" aria-hidden="true"><Icon name="GraduationCap" size={18} /></div>
                <div className="education-content">
                  <h3 className="education-title">{edu.institution}</h3>
                  <div className="education-meta">
                    <span>{edu.degree}</span>
                    <span>{edu.location}</span>
                    <span>{edu.period}</span>
                  </div>
                  <p className="education-description">{edu.description}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {sections.certifications.enabled && sections.certifications.items && (
        <motion.section id="certifications" className="content-section" variants={sectionItem}>
          <h2 className="section-label">CERTIFICATIONS</h2>
          <Suspense fallback={null}>
            <CertGallery certs={sections.certifications.items} reducedMotion={reducedMotion} />
          </Suspense>
        </motion.section>
      )}

      {sectionConfigs.filter(s => hasContent({ enabled: true, items: s.items })).map(s => (
        <GenericSection key={s.id} id={s.id} label={s.label} items={s.items} fields={s.fields} icon={s.icon} useCaseStudy={s.useCaseStudy} />
      ))}

      {sections.resume?.enabled && sections.resume?.items?.length > 0 && (
        <motion.section id="resume" className="content-section" variants={sectionItem}>
          <h2 className="section-label">RESUME</h2>
          <div className="resume-variants">
            {sections.resume.items.map((item, i) => (
              item.url ? (
                <div key={item.id || i} className="resume-variant">
                  <Button variant="primary" href={item.url} externalIcon>
                    {item.label || 'Download Resume'}
                  </Button>
                  {item.note && <p className="resume-note">{item.note}</p>}
                </div>
              ) : null
            ))}
          </div>
        </motion.section>
      )}

      {contact.enabled && (
        <motion.section id="contact" className="content-section" variants={sectionItem}>
          <h2 className="section-label">CONTACT</h2>

          {contact.availability?.status && contact.availability.status !== 'closed' && (
            <div className="contact-availability">
              <span className={`availability-badge availability-${contact.availability.status}`}>
                {contact.availability.label || 'Open to opportunities'}
              </span>
              {contact.availability.currentAffiliation && (
                <span className="availability-affiliation">{contact.availability.currentAffiliation}</span>
              )}
            </div>
          )}

          <p className="contact-cta">{contact.cta}</p>

          {contact.availability?.preferredRoles?.length > 0 && (
            <div className="contact-preferred">
              <span className="contact-preferred-label">Preferred roles:</span>
              <span className="contact-preferred-items">{contact.availability.preferredRoles.join(' · ')}</span>
            </div>
          )}

          {contact.availability?.preferredLocations?.length > 0 && (
            <div className="contact-preferred">
              <span className="contact-preferred-label">Location:</span>
              <span className="contact-preferred-items">{contact.availability.preferredLocations.join(' · ')}</span>
            </div>
          )}

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

          {contact.availability?.responseTime && (
            <p className="contact-response-time">{contact.availability.responseTime}</p>
          )}
        </motion.section>
      )}

      <footer className="footer">
        <p>{footer.text}</p>
        <p>{footer.copyright}</p>
      </footer>
    </motion.main>
  )
}
