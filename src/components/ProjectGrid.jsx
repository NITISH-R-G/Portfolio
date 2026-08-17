import { useReducedMotion } from '../hooks/useReducedMotion'
import ProjectTile from './ProjectTile'

/**
 * Responsive grid layout for projects — the alternative to the horizontal carousel,
 * selected via `layout.projectLayout: "grid"`. Reuses the same `ProjectTile` so both
 * layouts stay visually consistent and share one place to fix bugs.
 *
 * @param {{projects: import('../core/schema/types.js').ProjectItem[]}} props
 */
export default function ProjectGrid({ projects }) {
  const reducedMotion = useReducedMotion()
  return (
    <div className="project-grid" role="list">
      {projects.map((project, i) => (
        <ProjectTile key={project.id || project.name} project={project} index={i} reducedMotion={reducedMotion} />
      ))}
    </div>
  )
}
