'use client'

/**
 * Education, certifications and awards.
 *
 * Three collections in one panel because they are three of his sections that share a shape — a
 * list of dated records with an issuer and a link — and because switching between them while
 * watching the same preview column is how an owner checks the lower half of the page reads
 * well. They are still three editors: each names the fields *its own* component reads, and each
 * previews that component rather than a shared approximation of all three.
 *
 * The date fields are ISO strings on purpose. His award and certification components format
 * them with `date-fns`, which throws on anything it cannot parse, and a portfolio that fails to
 * render because someone typed "Summer 2024" is worse than one that asks for `2024-06`.
 *
 * @module admin/panels/RecordsPanel
 */

import { useState } from 'react'

import { cn } from '@/lib/utils'

import { Note, Panel } from '../fields.jsx'
import { EditorLayout } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import {
  HiddenList,
  RecordFields,
  RecordList,
  useRecordSelection,
} from '../preview/record-editor.jsx'
import { useSourceTheme } from '../preview/use-source-theme'

const TABS = [
  {
    collection: 'education',
    label: 'Education',
    section: 'education',
    empty: 'No education records yet.',
    title: (record) =>
      [record.institution, record.degree].filter(Boolean).join(' · ') || '(untitled)',
    fields: [
      { key: 'institution', label: 'School' },
      { key: 'degree', label: 'Degree' },
      { key: 'field', label: 'Field of study' },
      { key: 'description', label: 'Description', type: 'textarea' },
      {
        key: 'achievements',
        label: 'Achievements',
        type: 'list',
        help: 'Comma-separated. Appended to the description as a bullet list.',
      },
      { key: 'courses', label: 'Courses', type: 'list', help: 'Rendered as his Tag chips.' },
      { key: 'dates.start.iso', label: 'Start date', placeholder: '2021-08' },
      { key: 'dates.end.iso', label: 'End date', placeholder: '2025-05' },
    ],
  },
  {
    collection: 'certifications',
    label: 'Certifications',
    section: 'certifications',
    empty: 'No certifications yet.',
    title: (record) => record.name || '(untitled)',
    fields: [
      { key: 'name', label: 'Title' },
      { key: 'issuer', label: 'Issuer' },
      { key: 'image', label: 'Issuer logo', help: 'A path inside public/, or an absolute URL.' },
      { key: 'credentialId', label: 'Credential ID' },
      { key: 'credentialUrl', label: 'Credential URL', type: 'url' },
      {
        key: 'date.iso',
        label: 'Issue date',
        placeholder: '2025-02',
        help: 'ISO — his component formats it with date-fns, which rejects anything else.',
      },
    ],
  },
  {
    collection: 'achievements',
    label: 'Awards',
    section: 'awards',
    empty: 'No awards yet.',
    title: (record) => record.title || '(untitled)',
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'rank', label: 'Prize', help: 'The line his AwardItem shows above the title.' },
      { key: 'organization', label: 'Awarded by' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'url', label: 'Reference link', type: 'url' },
      {
        key: 'date.iso',
        label: 'Date',
        placeholder: '2026-06',
        help: 'ISO — awards are sorted by this date, newest first.',
      },
    ],
  },
]

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function RecordsPanel({ builder }) {
  const [tabIndex, setTabIndex] = useState(0)
  const [selectedId, setSelectedId] = useState({})
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const tab = TABS[tabIndex]
  const { records, selected, activeId, hiddenIds } = useRecordSelection(
    builder,
    tab.collection,
    selectedId[tab.collection],
  )

  const tabs = (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg border p-1"
      role="tablist"
      aria-label="Record type"
    >
      {TABS.map((entry, index) => (
        <button
          key={entry.collection}
          type="button"
          role="tab"
          aria-selected={index === tabIndex}
          onClick={() => setTabIndex(index)}
          className={cn(
            'rounded-md px-2.5 py-1 text-sm transition-colors',
            index === tabIndex
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {entry.label}
          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
            {(builder.built.profile[entry.collection] ?? []).length}
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <Panel
      workbench
      title="Education, certifications & awards"
      description="The dated records in the lower half of the page. Each is edited against the component that renders it."
    >
      <EditorLayout
        controls={
          <>
            {tabs}

            {!records.length ? (
              <Note tone="warning">
                {tab.empty} Connect a source, or add records to{' '}
                <code>src/data/manual.json</code>.
              </Note>
            ) : (
              <>
                <RecordList
                  builder={builder}
                  collection={tab.collection}
                  records={records}
                  activeId={activeId}
                  onSelect={(id) =>
                    setSelectedId((current) => ({ ...current, [tab.collection]: id }))
                  }
                  label={tab.label}
                  title={tab.title}
                />

                <RecordFields
                  builder={builder}
                  collection={tab.collection}
                  record={selected}
                  id={activeId}
                  fields={tab.fields}
                  title={tab.title(selected)}
                />
              </>
            )}

            <HiddenList
              builder={builder}
              collection={tab.collection}
              hiddenIds={hiddenIds}
            />
          </>
        }
        preview={
          <PreviewFrame
            title={tab.label}
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={builder.built} theme={theme} section={tab.section} />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
