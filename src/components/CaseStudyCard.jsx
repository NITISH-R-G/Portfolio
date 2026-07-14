import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Icon from './Icon'

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
  const subtitle = item.role || item.venue || item.event || item.issuer || ''
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
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : 'View details'}
            <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
          </button>
        )}
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            ref={detailsRef}
            className="case-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="case-details-inner">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
