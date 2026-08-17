import { formatRange } from '../core/schema/date.js'
import Icon from '../components/Icon'

/**
 * Education keeps its own compact card rather than the expandable case-study treatment used
 * elsewhere — a degree rarely has a problem/approach/impact narrative, so the "View details"
 * toggle would be dead weight here.
 *
 * @param {{education: import('../core/schema/types.js').EducationItem[]}} props
 */
export default function EducationSection({ education }) {
  if (!education || education.length === 0) return null
  return (
    <div className="education-list">
      {education.map((edu, i) => (
        <div key={edu.id || i} className="education-card">
          <div className="education-icon" aria-hidden="true"><Icon name="GraduationCap" size={18} /></div>
          <div className="education-content">
            <h3 className="education-title">{edu.institution}</h3>
            <div className="education-meta">
              {edu.degree && <span>{[edu.degree, edu.field].filter(Boolean).join(', ')}</span>}
              {edu.location && <span>{edu.location}</span>}
              {formatRange(edu.dates) && <span>{formatRange(edu.dates)}</span>}
              {edu.grade && <span>{edu.grade}</span>}
            </div>
            {edu.description && <p className="education-description">{edu.description}</p>}
            {edu.achievements?.length > 0 && (
              <ul className="education-achievements">
                {edu.achievements.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
