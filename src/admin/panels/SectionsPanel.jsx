/**
 * Section visibility and order.
 *
 * The important idea, and the one this panel has to make legible: a section's default is
 * not "on" or "off" but **auto** — shown only when there is enough data to justify it. That
 * is what stops a portfolio rendering an empty "Publications" heading, and it is why every
 * row shows its live record count and the threshold it is being measured against.
 *
 * Reordering is drag-and-drop with a keyboard equivalent, because a control that only
 * works with a mouse is a control some people cannot use at all.
 *
 * @module admin/panels/SectionsPanel
 */

import { useState } from 'react'
import Icon from '../../components/Icon'
import { getSectionDefinition } from '../../core/generate/sections.js'
import { Panel, TriState, Note } from '../fields.jsx'
import { getPath } from '../state.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function SectionsPanel({ builder }) {
  const { built, configDraft, setConfig } = builder
  const { sections, config } = built
  const [dragging, setDragging] = useState(null)

  const order = sections.map((s) => s.id)

  /** @param {number} from @param {number} to */
  const reorder = (from, to) => {
    if (from === to || to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setConfig('sectionOrder', next)
  }

  return (
    <Panel
      title="Sections"
      description="What appears, and in what order. Sections set to Auto hide themselves when there is nothing to show."
    >
      <Note icon="Info">
        <strong>Auto</strong> is almost always the right setting. A section shown with no content
        reads as an unfinished portfolio, and one hidden by hand stays hidden even after you
        import the data that would have filled it.
      </Note>

      <ol className="section-list">
        {sections.map((section, index) => {
          const definition = getSectionDefinition(section.id)
          const threshold = definition?.threshold ?? 1
          const setting = getPath(configDraft, `sections.${section.id}`,
            getPath(config, `sections.${section.id}`, 'auto'))

          return (
            <li
              key={section.id}
              className={`section-row${section.visible ? '' : ' section-row-hidden'}${dragging === index ? ' section-row-dragging' : ''}`}
              draggable
              onDragStart={() => setDragging(index)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); reorder(dragging, index); setDragging(null) }}
            >
              <span className="section-handle" aria-hidden="true">
                <Icon name="ListOrdered" size={14} />
              </span>

              <span className="section-icon"><Icon name={section.icon} size={16} /></span>

              <span className="section-body">
                <span className="section-name">{section.label}</span>
                <span className="section-detail">
                  {section.count === 0
                    ? 'no content'
                    : `${section.count} ${section.count === 1 ? 'item' : 'items'}`}
                  {threshold > 1 && ` · needs ${threshold} to show automatically`}
                  {` · `}
                  <span className={`section-reason section-reason-${section.reason}`}>
                    {REASONS[section.reason]}
                  </span>
                </span>
              </span>

              {/* Keyboard-accessible equivalent of the drag handle. */}
              <span className="move-buttons">
                <button type="button" className="btn-move" disabled={index === 0}
                  onClick={() => reorder(index, index - 1)}
                  aria-label={`Move ${section.label} up`}>
                  <Icon name="ChevronUp" size={14} />
                </button>
                <button type="button" className="btn-move" disabled={index === sections.length - 1}
                  onClick={() => reorder(index, index + 1)}
                  aria-label={`Move ${section.label} down`}>
                  <Icon name="ChevronDown" size={14} />
                </button>
              </span>

              <TriState
                value={setting}
                onChange={(value) => setConfig(`sections.${section.id}`, value)}
              />
            </li>
          )
        })}
      </ol>

      <h3 className="admin-subheading">Limits</h3>
      <p className="field-help">
        Cap how many records a section renders. The rest stay in your data and in the exports —
        they are simply not shown on the page.
      </p>

      <div className="field-grid">
        {['projects', 'experience', 'certifications', 'publications', 'posts'].map((id) => {
          const section = sections.find((s) => s.id === id || (id === 'posts' && s.id === 'writing'))
          if (!section?.count) return null
          const current = getPath(configDraft, `sectionOptions.${section.id}.limit`,
            getPath(config, `sectionOptions.${section.id}.limit`, ''))
          return (
            <label key={id} className="field">
              <span className="field-label">{section.label}</span>
              <input
                className="field-input"
                type="number"
                min="0"
                placeholder={`all ${section.count}`}
                value={current === '' ? '' : current}
                onChange={(e) => setConfig(
                  `sectionOptions.${section.id}.limit`,
                  e.target.value === '' ? '' : Number(e.target.value),
                )}
              />
            </label>
          )
        })}
      </div>
    </Panel>
  )
}

const REASONS = {
  'auto-shown': 'shown automatically',
  'auto-hidden': 'hidden — not enough content',
  'forced-on': 'always shown',
  'forced-off': 'never shown',
}
