import Icon from './Icon'
import { track, AnalyticsEvents } from '../lib/analytics'

/**
 * Dense single-column list layout for projects — the alternative to the carousel and grid,
 * selected via `layout.projectLayout: "list"`. Suits profiles with many projects where a
 * scannable row matters more than a preview image.
 *
 * @param {{projects: import('../core/schema/types.js').ProjectItem[]}} props
 */
export default function ProjectList({ projects }) {
  return (
    <div className="project-list" role="list">
      {projects.map((project) => {
        const href = project.liveUrl || project.repository || project.links?.[0]?.url
        const Wrapper = href ? 'a' : 'div'
        return (
          <Wrapper
            key={project.id || project.name}
            {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="project-list-row"
            onClick={href ? () => track(AnalyticsEvents.PROJECT_CLICK, { title: project.name }) : undefined}
          >
            <div className="project-list-main">
              <h3 className="project-list-title">{project.name}</h3>
              {project.description && <p className="project-list-desc">{project.description}</p>}
              <div className="project-list-meta">
                {(project.technologies ?? []).slice(0, 4).map((tag) => (
                  <span key={tag} className="project-scroll-chip">{tag}</span>
                ))}
                {typeof project.stars === 'number' && project.stars > 0 && (
                  <span className="project-scroll-chip project-scroll-stars">
                    <Icon name="Star" size={11} /> {project.stars.toLocaleString('en-US')}
                  </span>
                )}
              </div>
            </div>
            {href && <Icon name="ExternalLink" size={16} className="project-list-arrow" />}
          </Wrapper>
        )
      })}
    </div>
  )
}
