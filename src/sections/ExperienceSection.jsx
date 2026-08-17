import { formatRange } from '../core/schema/date.js'
import GenericSection from './GenericSection'
import { adaptExperience } from './adapt.js'

/**
 * @param {{experience: import('../core/schema/types.js').ExperienceItem[], layout?: 'cards'|'timeline'}} props
 */
export default function ExperienceSection({ experience, layout = 'cards' }) {
  if (!experience || experience.length === 0) return null

  if (layout === 'timeline') {
    return (
      <div className="experience-timeline">
        {experience.map((exp, i) => (
          <div key={exp.id || i} className="timeline-row">
            <div className="timeline-rail" aria-hidden="true">
              <span className="timeline-dot" />
              {i < experience.length - 1 && <span className="timeline-line" />}
            </div>
            <div className="timeline-content">
              <div className="experience-header">
                <h3 className="experience-role">{exp.role}</h3>
                <span className="experience-period">{formatRange(exp.dates)}</span>
              </div>
              <div className="experience-company">{[exp.company, exp.location].filter(Boolean).join(' · ')}</div>
              {exp.description && <p className="experience-description">{exp.description}</p>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Case-study cards carry the full detail (highlights, metrics, links); the original
  // design's compact summary card is preserved as the default via CSS, not a second markup path.
  return <GenericSection records={experience} adapt={adaptExperience} icon="Briefcase" />
}
