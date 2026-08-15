import ProjectCarousel from '../components/ProjectCarousel'
import ProjectGrid from '../components/ProjectGrid'
import ProjectList from '../components/ProjectList'

/**
 * Dispatches to the configured project layout. Themes and users choose the presentation
 * (`layout.projectLayout`); the underlying data is identical in all three.
 *
 * @param {{projects: import('../core/schema/types.js').ProjectItem[], layout?: 'carousel'|'grid'|'list'}} props
 */
export default function ProjectsSection({ projects, layout = 'carousel' }) {
  if (!projects || projects.length === 0) return null
  if (layout === 'grid') return <ProjectGrid projects={projects} />
  if (layout === 'list') return <ProjectList projects={projects} />
  return <ProjectCarousel projects={projects} />
}
