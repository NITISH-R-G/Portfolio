/**
 * Step 4: "Review your portfolio".
 *
 * Every imported record, in the order it will render, with three actions that matter and
 * no more: hide it, move it, or correct a field. Everything else — what to feature, what
 * order, which sections exist — is already decided by the pipeline, and this panel exists
 * to let a human disagree with those decisions, not to make them from scratch.
 *
 * @module admin/panels/ContentPanel
 */

import { useState } from 'react'
import Icon from '../../components/Icon'
import { COLLECTIONS } from '../../core/schema/types.js'
import { recordKey } from '../../core/schema/merge.js'
import { formatRange, formatDate } from '../../core/schema/date.js'
import { Panel, Note } from '../fields.jsx'

/** Which fields are worth editing, per collection. Kept short deliberately. */
const EDITABLE = {
  projects: ['name', 'description', 'liveUrl', 'image'],
  experience: ['role', 'company', 'description'],
  education: ['institution', 'degree', 'field'],
  achievements: ['title', 'organization', 'description'],
  certifications: ['name', 'issuer', 'credentialUrl'],
  publications: ['title', 'venue'],
  posts: ['title'],
  packages: ['description'],
  models: ['description'],
  hackathons: ['name', 'result', 'description'],
  talks: ['title', 'event'],
  competitive: [],
  skills: [],
  languages: ['name', 'label'],
  videos: ['title'],
}

const LABELS = {
  education: 'Education', experience: 'Experience', projects: 'Projects', skills: 'Skills',
  achievements: 'Achievements', certifications: 'Certifications', publications: 'Publications',
  posts: 'Writing', packages: 'Packages', videos: 'Videos', models: 'Models & datasets',
  hackathons: 'Hackathons', talks: 'Talks', competitive: 'Competitive programming',
  languages: 'Languages',
}

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ContentPanel({ builder }) {
  const { built, overrides, patchRecord, toggleHidden, isHidden, move, revert } = builder
  const populated = COLLECTIONS.filter((c) => (built.profile[c] ?? []).length)
  const [active, setActive] = useState(populated[0] ?? 'projects')
  const [expanded, setExpanded] = useState(null)

  if (!populated.length) {
    return (
      <Panel title="Content" description="Every record in your portfolio.">
        <Note tone="warn" icon="Info">
          There is no content yet. Run <code>npm run import</code>, or add records to{' '}
          <code>src/data/manual.json</code>.
        </Note>
      </Panel>
    )
  }

  const collection = populated.includes(active) ? active : populated[0]
  const records = built.profile[collection] ?? []
  // Hidden records are filtered out of `built` by the pipeline, so they have to be listed
  // separately — otherwise hiding one would remove the only control that un-hides it.
  const hiddenIds = overrides.hidden?.[collection] ?? []

  return (
    <Panel
      title="Content"
      description="Everything that will render, in order. Hide what you do not want, correct what a platform got wrong."
    >
      <Note icon="Info">
        Edits are stored as overrides against a record's id. Re-importing replaces the source
        data underneath them and your changes stay put.
      </Note>

      <nav className="collection-tabs">
        {populated.map((id) => (
          <button
            key={id}
            type="button"
            className={`collection-tab${id === collection ? ' collection-tab-active' : ''}`}
            onClick={() => { setActive(id); setExpanded(null) }}
          >
            {LABELS[id] ?? id}
            <span className="collection-count">{(built.profile[id] ?? []).length}</span>
          </button>
        ))}
      </nav>

      <ul className="record-list">
        {records.map((record, index) => {
          const id = recordKey(collection, record)
          const isOpen = expanded === id
          const edits = overrides.records?.[collection]?.[id]
          const fields = EDITABLE[collection] ?? []

          return (
            <li key={id} className={`record-row${edits ? ' record-edited' : ''}`}>
              <div className="record-main">
                <div className="move-buttons">
                  <button type="button" className="btn-move" disabled={index === 0}
                    onClick={() => move(collection, id, -1)} aria-label="Move up">
                    <Icon name="ChevronUp" size={14} />
                  </button>
                  <button type="button" className="btn-move" disabled={index === records.length - 1}
                    onClick={() => move(collection, id, 1)} aria-label="Move down">
                    <Icon name="ChevronDown" size={14} />
                  </button>
                </div>

                <div className="record-body">
                  <p className="record-title">
                    {title(collection, record)}
                    {edits && <span className="record-flag">edited</span>}
                    {record.featured && <span className="record-flag record-flag-featured">featured</span>}
                  </p>
                  <p className="record-meta">{meta(collection, record)}</p>
                </div>

                <div className="record-actions">
                  {record.source?.connector && (
                    <span className="record-source" title={`Imported from ${record.source.connector}`}>
                      {record.source.connector}
                    </span>
                  )}
                  {fields.length > 0 && (
                    <button type="button" className="btn-admin btn-admin-ghost"
                      onClick={() => setExpanded(isOpen ? null : id)}
                      aria-expanded={isOpen}>
                      {isOpen ? 'Done' : 'Edit'}
                    </button>
                  )}
                  <button type="button" className="btn-remove" onClick={() => toggleHidden(collection, id)}
                    aria-label={`Hide ${title(collection, record)}`} title="Hide from the portfolio">
                    <Icon name="EyeOff" size={14} />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="record-editor">
                  {fields.map((field) => (
                    <label key={field} className="field">
                      <span className="field-label">{humanize(field)}</span>
                      {field === 'description' ? (
                        <textarea
                          className="field-textarea"
                          rows={3}
                          value={record[field] ?? ''}
                          onChange={(e) => patchRecord(collection, id, { [field]: e.target.value })}
                        />
                      ) : (
                        <input
                          className="field-input"
                          value={record[field] ?? ''}
                          onChange={(e) => patchRecord(collection, id, { [field]: e.target.value })}
                        />
                      )}
                    </label>
                  ))}
                  {edits && (
                    <button type="button" className="btn-admin btn-admin-ghost"
                      onClick={() => { revert(collection, id); setExpanded(null) }}>
                      <Icon name="Undo2" size={14} /> Revert to imported values
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {hiddenIds.length > 0 && (
        <>
          <h3 className="admin-subheading">Hidden</h3>
          <ul className="record-list record-list-hidden">
            {hiddenIds.map((id) => (
              <li key={id} className="record-row record-row-hidden">
                <div className="record-main">
                  <div className="record-body">
                    <p className="record-title">{id}</p>
                    <p className="record-meta">Hidden — it will not render, and its numbers are excluded from your stats.</p>
                  </div>
                  <button type="button" className="btn-admin btn-admin-ghost"
                    onClick={() => toggleHidden(collection, id)}>
                    <Icon name="Eye" size={14} /> Show
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */

function title(collection, record) {
  return record.name ?? record.title ?? record.institution ?? record.company ?? record.platform ?? '(untitled)'
}

/** A one-line summary that answers "which record is this" without opening it. */
function meta(collection, record) {
  const parts = []

  if (record.dates) parts.push(formatRange(record.dates))
  else if (record.date) parts.push(formatDate(record.date))

  if (record.role && record.company) parts.push(record.role)
  if (record.issuer) parts.push(record.issuer)
  if (record.organization) parts.push(record.organization)
  if (record.venue) parts.push(record.venue)
  if (typeof record.stars === 'number' && record.stars > 0) parts.push(`${record.stars} stars`)
  if (typeof record.citations === 'number' && record.citations > 0) parts.push(`${record.citations} citations`)
  if (typeof record.downloads === 'number') parts.push(`${record.downloads.toLocaleString()} downloads`)
  if (record.rating) parts.push(`rating ${record.rating}`)
  if (record.primaryLanguage) parts.push(record.primaryLanguage)
  if (record.description && parts.length < 2) parts.push(truncate(record.description, 80))

  return parts.filter(Boolean).join(' · ') || '—'
}

const humanize = (field) =>
  field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text)
