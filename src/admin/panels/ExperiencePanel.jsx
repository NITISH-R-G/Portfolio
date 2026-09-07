'use client'

/**
 * Experience.
 *
 * The fields are the ones his `ExperienceItem` and `ExperiencePositionItem` read, and the
 * preview is those components. One detail is worth knowing while editing: his model nests
 * positions under a company, ours is one record per role, and the adapter groups *consecutive*
 * records naming the same company into one card. So moving a role away from its siblings splits
 * the card — which is visible in the preview the moment it happens, and is the reason the
 * reorder controls sit next to a live render rather than next to a list of ids.
 *
 * @module admin/panels/ExperiencePanel
 */

import { useState } from 'react'

import { Note, Panel, Toggle } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import {
  HiddenList,
  RecordFields,
  RecordList,
  useRecordSelection,
} from '../preview/record-editor.jsx'
import { useSourceTheme } from '../preview/use-source-theme'

const COLLECTION = 'experience'

const FIELDS = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'location', label: 'Location', help: 'Containing "remote" marks the card Remote.' },
  { key: 'website', label: 'Company website', type: 'url' },
  {
    key: 'description',
    label: 'Description',
    type: 'textarea',
    help: 'Rendered as Markdown inside the expanded position.',
  },
  {
    key: 'highlights',
    label: 'Highlights',
    type: 'list',
    help: 'Comma-separated. Appended to the description as a bullet list.',
  },
  { key: 'technologies', label: 'Technologies', type: 'list' },
  { key: 'dates.start.iso', label: 'Start date', placeholder: '2024-06' },
  { key: 'dates.end.iso', label: 'End date', placeholder: '2025-03' },
]

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ExperiencePanel({ builder }) {
  const [selectedId, setSelectedId] = useState(null)
  const { records, selected, activeId, hiddenIds } = useRecordSelection(
    builder,
    COLLECTION,
    selectedId,
  )
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  if (!records.length) {
    return (
      <Panel title="Experience" description="Roles, in the order they will render.">
        <Note tone="warning">
          No experience yet. Import LinkedIn or a résumé under <strong>Connect profiles</strong>,
          or add roles to <code>src/data/manual.json</code>.
        </Note>
      </Panel>
    )
  }

  return (
    <Panel
      workbench
      title="Experience"
      description="Roles, in the order they will render. Consecutive roles at the same company become one card."
    >
      <EditorLayout
        controls={
          <>
            <RecordList
              builder={builder}
              collection={COLLECTION}
              records={records}
              activeId={activeId}
              onSelect={setSelectedId}
              label="Roles"
              title={(record) =>
                [record.role, record.company].filter(Boolean).join(' · ') || '(untitled)'
              }
            />

            <RecordFields
              builder={builder}
              collection={COLLECTION}
              record={selected}
              id={activeId}
              fields={FIELDS}
              title={selected.company || 'Details'}
            />

            <Section title="Status">
              <Toggle
                label="Current role"
                checked={Boolean(selected.dates?.current)}
                onChange={(checked) =>
                  builder.patchRecord(COLLECTION, activeId, {
                    dates: { ...selected.dates, current: checked || undefined },
                  })
                }
                help="A current role renders as “Present” and supplies the job line in the overview."
              />
            </Section>

            <HiddenList builder={builder} collection={COLLECTION} hiddenIds={hiddenIds} />
          </>
        }
        preview={
          <PreviewFrame
            title="Experience"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={builder.built} theme={theme} section="experience" />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
