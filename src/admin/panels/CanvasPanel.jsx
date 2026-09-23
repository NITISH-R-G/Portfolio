'use client'

/**
 * The canvas: the whole portfolio, selected a block at a time.
 *
 * Every other workbench panel is organised by *data* — projects, skills, the footer. This one is
 * organised by the *page*: you look at it, click the part you want to change, and the inspector
 * becomes that part's controls. It is the design-tool model, applied to the real page rather
 * than to a mock of it — the canvas is `PortfolioPreview`, the same components the site renders,
 * over the draft.
 *
 * What the inspector offers for a selection is only what is real for it: whether the block is
 * shown, where it sits, and the one or two settings that belong to that block alone (the
 * header's monogram, the footer's wordmark). Its content — the projects themselves, the roles,
 * the skills — has a full editor already, and the inspector links there rather than duplicating
 * it in a narrower form.
 *
 * With nothing selected, the inspector is the page's own: the section minimap setting, and the
 * list of blocks, which is the keyboard-and-screen-reader way to make a selection.
 *
 * @module admin/panels/CanvasPanel
 */

import { useState } from 'react'
import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { initials, toPageSections } from '@/features/portfolio/data/adapter'

import { getPath } from '../drafts.js'
import { Field, Note, Panel, SelectField, TextField, Toggle, TriState } from '../fields.jsx'
import {
  REGION_LABELS,
  REGION_PANEL,
  engineSectionFor,
  moveInOrder,
} from '../preview/canvas-regions'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { SelectableCanvas } from '../preview/selectable-canvas'
import { useSourceTheme } from '../preview/use-source-theme'

/**
 * @param {{
 *   builder: import('../state.js').Builder,
 *   navigate?: (panel: string) => void,
 * }} props
 */
export default function CanvasPanel({ builder, navigate }) {
  const { built } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)
  const [selected, setSelected] = useState(null)

  const regions = [...toPageSections(built.sections), ...(built.config.footer?.enabled === false ? [] : ['footer'])]
  // A selection can outlive its block — hiding the selected section removes it from the page.
  // The inspector keeps it selected so the owner can bring it straight back.
  const open = (region) => navigate?.(REGION_PANEL[region])

  return (
    <Panel
      workbench
      title="Canvas"
      description="Click any part of the page to edit it. ↑/↓ step through the blocks, Enter opens a block's full editor, Esc clears the selection."
    >
      <EditorLayout
        title={selected ? REGION_LABELS[selected] : undefined}
        description={selected ? 'Selected on the canvas.' : undefined}
        controls={
          selected ? (
            <RegionInspector
              builder={builder}
              region={selected}
              onOpen={() => open(selected)}
              onClear={() => setSelected(null)}
            />
          ) : (
            <PageInspector builder={builder} regions={regions} onSelect={setSelected} />
          )
        }
        preview={
          <PreviewFrame
            title="Whole page"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <SelectableCanvas selected={selected} onSelect={setSelected} onOpen={open}>
              <PortfolioPreview built={built} theme={theme} regions />
            </SelectableCanvas>
          </PreviewFrame>
        }
      />
    </Panel>
  )
}

/** Nothing selected: the page's own settings, and the blocks as a list to select from. */
function PageInspector({ builder, regions, onSelect }) {
  const { built, setConfig } = builder
  return (
    <>
      <Section
        title="Blocks on the page"
        description="The same selection as clicking the canvas."
      >
        <ul className="flex flex-col gap-0.5">
          {regions.map((region) => (
            <li key={region}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
                onClick={() => onSelect(region)}
              >
                {REGION_LABELS[region]}
              </Button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Section minimap">
        <SelectField
          label="Right-margin minimap"
          value={built.config.layout?.navigation ?? 'minimap'}
          onChange={(value) => setConfig('layout.navigation', value)}
          options={[
            { value: 'minimap', label: 'Show' },
            { value: 'none', label: 'Hide' },
          ]}
          help="The line of section marks at the page's right edge, on screens at least 64rem wide. The canvas draws it too once the frame is that wide — hide the inspector, or use the full-screen view."
        />
      </Section>
    </>
  )
}

function RegionInspector({ builder, region, onOpen, onClear }) {
  const { built, setConfig } = builder
  const engineId = engineSectionFor(region)
  const section = engineId ? built.sections?.find((entry) => entry.id === engineId) : null
  const order = built.config.sectionOrder ?? []
  const setting = engineId ? built.config.sections?.[engineId] : undefined
  const visible = new Set((built.sections ?? []).filter((entry) => entry.visible).map((entry) => entry.id))
  const move = (delta) => moveInOrder(order, engineId, delta, visible)

  return (
    <>
      {engineId && (
        <Section
          title="On the page"
          description={section ? `${section.count} item${section.count === 1 ? '' : 's'} · ${REASONS[section.reason] ?? section.reason}` : undefined}
        >
          <Field label="Visibility">
            <TriState
              value={setting === 'auto' ? undefined : setting}
              onChange={(value) => setConfig(`sections.${engineId}`, value === undefined ? 'auto' : value)}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={move(-1).join() === order.join()}
              onClick={() => setConfig('sectionOrder', move(-1))}
            >
              <ChevronUpIcon />
              Move up
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={move(1).join() === order.join()}
              onClick={() => setConfig('sectionOrder', move(1))}
            >
              <ChevronDownIcon />
              Move down
            </Button>
          </div>
        </Section>
      )}

      {region === 'profile' && <HeaderControls builder={builder} />}
      {region === 'footer' && <FooterControls builder={builder} />}

      <div className="flex flex-col gap-2">
        <Button size="sm" className="gap-2 self-start" onClick={onOpen}>
          Edit {REGION_LABELS[region].toLowerCase()} content
          <ArrowRightIcon />
        </Button>
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </>
  )
}

/** The header's own setting: the letters in the spotlight mark. */
function HeaderControls({ builder }) {
  const { built, setConfig } = builder
  // The draft, not the resolved value, so clearing the field shows it empty rather than
  // snapping back to the initials the moment it is emptied.
  const drafted = getPath(builder.configDraft, 'profile.monogram')
  const value = typeof drafted === 'string' ? drafted : (built.config.profile?.monogram ?? '')
  const fallback = initials(built.profile.identity?.name)

  return (
    <Section title="Spotlight mark">
      <TextField
        label="Monogram"
        value={value}
        placeholder={fallback || 'AB'}
        onChange={(next) => setConfig('profile.monogram', next.slice(0, 4))}
        help={`Up to four letters drawn in the header's spotlight mark. Empty uses your initials${fallback ? ` (${fallback})` : ''}.`}
      />
    </Section>
  )
}

/** The footer's own setting: the word across its foot. */
function FooterControls({ builder }) {
  const { built, setConfig } = builder
  const drafted = getPath(builder.configDraft, 'footer.wordmark')
  const resolved = drafted !== undefined ? drafted : built.config.footer?.wordmark
  const shown = resolved !== false

  return (
    <Section title="Wordmark">
      <Toggle
        label="Show the wordmark"
        checked={shown}
        onChange={(checked) => setConfig('footer.wordmark', checked ? '' : false)}
        help="The large word across the foot of the page that follows the pointer."
      />
      {shown && (
        <TextField
          label="Word"
          value={typeof resolved === 'string' ? resolved : ''}
          placeholder={String(built.profile.identity?.name ?? '').split(/\s+/)[0]?.toUpperCase() || 'NAME'}
          onChange={(next) => setConfig('footer.wordmark', next)}
          help="Empty uses your first name."
        />
      )}
      {!shown && <Note>The footer keeps its rows and links; only the wordmark is gone.</Note>}
    </Section>
  )
}

const REASONS = {
  'forced-on': 'shown because you said so',
  'forced-off': 'hidden because you said so',
  'auto-shown': 'shown automatically',
  'auto-hidden': 'hidden automatically — not enough content',
}
