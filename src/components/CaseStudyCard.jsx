import { useState, useRef, useEffect, useId } from 'react'
import Icon from './Icon'
import { track, AnalyticsEvents } from '../lib/analytics'

function hasValue(val) {
  if (val === undefined || val === null) return false
  if (typeof val === 'string') return val.trim().length > 0
  if (Array.isArray(val)) return val.length > 0
  return true
}

function MetricBadge({ metric }) {
  return (
    <div className="metric-badge">
      <span className="metric-value">{metric.value}</span>
      <span className="metric-label">{metric.label}</span>
      {metric.note && <span className="metric-note">{metric.note}</span>}
    </div>
  )
}

function DetailField({ label, children }) {
  if (!children) return null
  return (
    <div className="case-detail-field">
      <h4 className="case-detail-label">{label}</h4>
      <div className="case-detail-value">{children}</div>
    </div>
  )
}

function LinkList({ links }) {
  if (!links || links.length === 0) return null
  return (
    <div className="case-links">
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="case-link"
        >
          {link.label}
          <Icon name="ExternalLink" size={12} />
        </a>
      ))}
    </div>
  )
}

function TagList({ tags, label }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="case-tags">
      {label && <span className="case-tags-label">{label}</span>}
      <div className="case-tags-list">
        {tags.map((t, i) => (
          <span key={i} className="case-tag">{t}</span>
        ))}
      </div>
    </div>
  )
}

export default function CaseStudyCard({ item, type = 'project', icon }) {
  const [expanded, setExpanded] = useState(false)
  const detailsRef = useRef(null)
  const detailsId = useId()

  useEffect(() => {
    if (expanded && detailsRef.current) {
      detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expanded])

  const hasCaseStudy = hasValue(item.problem) || hasValue(item.approach) || hasValue(item.impact)
  const hasMetrics = item.metrics && item.metrics.length > 0
  const hasLinks = item.links && item.links.length > 0
  const hasTools = item.tools && item.tools.length > 0
  const hasTags = item.tags && item.tags.length > 0

  const title = item.title || item.name || item.company || 'Untitled'
  const subtitle = item.subtitle || item.role || item.venue || item.event || item.issuer || ''
  const date = item.date || item.period || ''

  return (
    <div className="case-card" data-expanded={expanded}>
      {/* Summary */}
      <div className="case-summary">
        <div className="case-header">
          <div className="case-title-row">
            {icon && (
              <div className="case-icon" aria-hidden="true">
                <Icon name={icon} size={16} />
              </div>
            )}
            <div>
              <h3 className="case-title">{title}</h3>
              {subtitle && <span className="case-subtitle">{subtitle}</span>}
            </div>
          </div>
          <div className="case-meta">
            {date && <span className="case-date">{date}</span>}
            {item.status && <span className={`case-status case-status-${item.status}`}>{item.status}</span>}
            {item.featured && <span className="case-featured">Featured</span>}
          </div>
        </div>

        {item.description && (
          <p className="case-description">{item.description}</p>
        )}

        {/* Compact metrics on summary */}
        {hasMetrics && !expanded && (
          <div className="case-metrics-compact">
            {item.metrics.slice(0, 3).map((m, i) => (
              <MetricBadge key={i} metric={m} />
            ))}
          </div>
        )}

        {/* Expand toggle */}
        {hasCaseStudy && (
          <button
            className="case-expand-btn"
            onClick={() => {
              const next = !expanded
              setExpanded(next)
              track(next ? AnalyticsEvents.CASE_STUDY_EXPAND : AnalyticsEvents.CASE_STUDY_COLLAPSE, { title })
            }}
            aria-expanded={expanded}
            aria-controls={detailsId}
          >
            {expanded ? 'Show less' : 'View details'}
            <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
          </button>
        )}
      </div>

      {/* Expanded Details — a CSS grid-rows accordion (transitions.dev's pattern), not a
          Motion height:'auto' tween. That measured Motion's target height synchronously
          before every open, then drove `height` frame-by-frame in JS — `height` is a layout
          property, so every one of those frames forced the browser to re-run layout for this
          element and everything after it. grid-template-rows: 0fr -> 1fr gets the identical
          visual result with no JS measurement step and no React-driven per-frame writes; the
          browser's own layout engine owns the whole interpolation. See
          .agents/skills/transitions-dev/21-accordion.md. Kept permanently mounted (rather
          than AnimatePresence add/remove) because that is what lets the grid-row transition
          run at all — animating in a value that does not exist yet has nothing to animate
          from. `inert` keeps it out of tab order and off screen readers while collapsed, so
          nothing about the content being technically laid out at zero height leaks into the
          accessible experience. */}
      {hasCaseStudy && (
        <div className="case-details" data-expanded={expanded}>
          {/* Two nested wrappers, not one: `.case-details-inner` clips (overflow: hidden)
              and carries no padding of its own, because padding on the element that clips
              survives the clip and keeps the collapsed track pinned open at (padding +
              border) tall — measured at 37px before this was split out. All box model
              (padding, border, layout) lives on `.case-details-content` instead, one level
              further in, where it cannot hold the collapsed height open. */}
          <div
            ref={detailsRef}
            id={detailsId}
            className="case-details-inner"
            inert={!expanded}
          >
            <div className="case-details-content">
            <DetailField label="Context">
              {item.context && <p>{item.context}</p>}
            </DetailField>

            <DetailField label="Problem">
              {item.problem && <p>{item.problem}</p>}
            </DetailField>

            <DetailField label="Approach">
              {item.approach && <p>{item.approach}</p>}
            </DetailField>

            <DetailField label="Impact">
              {item.impact && <p>{item.impact}</p>}
            </DetailField>

            <DetailField label="Responsibilities">
              {item.responsibilities && <p>{item.responsibilities}</p>}
            </DetailField>

            <DetailField label="Constraints">
              {item.constraints && <p>{item.constraints}</p>}
            </DetailField>

            <DetailField label="Lessons Learned">
              {item.lessons && <p>{item.lessons}</p>}
            </DetailField>

            {/* Full metrics */}
            {hasMetrics && (
              <DetailField label="Results">
                <div className="case-metrics-full">
                  {item.metrics.map((m, i) => (
                    <MetricBadge key={i} metric={m} />
                  ))}
                </div>
              </DetailField>
            )}

            {/* Tools & Tags */}
            <DetailField label="Stack">
              <TagList tags={item.tools} />
              <TagList tags={item.tags} label={item.tools ? '' : 'Tags'} />
            </DetailField>

            {/* Links */}
            {hasLinks && (
              <DetailField label="Links">
                <LinkList links={item.links} />
              </DetailField>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
