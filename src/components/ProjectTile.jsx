import { motion } from 'motion/react'
import Icon from './Icon'
import { deterministicGradient } from '../lib/deterministicColor'
import { track, AnalyticsEvents } from '../lib/analytics'

/**
 * One project card in the carousel/grid. Renders the project's own `image` when it has one;
 * otherwise falls back to a deterministic gradient tile rather than a generic stock photo,
 * so an imported project with no screenshot still looks intentional.
 *
 * @param {{project: import('../core/schema/types.js').ProjectItem, index: number, reducedMotion: boolean}} props
 */
export default function ProjectTile({ project, index, reducedMotion }) {
  const href = project.liveUrl || project.repository || project.links?.[0]?.url || '#'
  const primaryTag = project.primaryLanguage || project.technologies?.[0] || 'Project'

  return (
    <motion.a
      href={href}
      target={href !== '#' ? '_blank' : undefined}
      rel={href !== '#' ? 'noopener noreferrer' : undefined}
      className="project-scroll-card"
      whileHover={reducedMotion ? {} : { y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={() => track(AnalyticsEvents.PROJECT_CLICK, { title: project.name })}
    >
      <div className="project-scroll-image-wrap">
        {project.image ? (
          <img
            src={project.image}
            alt={project.imageAlt || project.name}
            className="project-scroll-image"
            width="600"
            height="400"
            loading={index < 3 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <div
            className="project-scroll-image project-scroll-image-generated"
            style={{ background: deterministicGradient(project.name) }}
            aria-hidden="true"
          >
            <Icon name="FolderKanban" size={28} />
          </div>
        )}
      </div>
      <div className="project-scroll-content">
        <div className="project-scroll-tag">
          <Icon name="FolderKanban" size={14} />
          <span>{primaryTag}</span>
        </div>
        <h3 className="project-scroll-title">{project.name}</h3>
        {project.description && <p className="project-scroll-desc">{project.description}</p>}
        <div className="project-scroll-footer">
          <div className="project-scroll-tags">
            {(project.technologies ?? []).slice(0, 3).map((tag) => (
              <span key={tag} className="project-scroll-chip">{tag}</span>
            ))}
            {typeof project.stars === 'number' && project.stars > 0 && (
              <span className="project-scroll-chip project-scroll-stars">
                <Icon name="Star" size={11} /> {project.stars.toLocaleString('en-US')}
              </span>
            )}
          </div>
          <div className="project-scroll-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </motion.a>
  )
}
