'use client'

/**
 * Skills — the technology pills his `TechStack` renders.
 *
 * Every control here maps to something that component reads: the label it prints, the category
 * it groups by, the logo it draws beside the label, and the URL that decides whether the pill is
 * a link or a plain span. Those four plus order and visibility are the whole of what the
 * rendered stack is made of, which is why there is nothing else.
 *
 * The logo and the link are new. This panel used to claim they were impossible — that his icons
 * were "a closed map of brand marks for the technologies *he* lists" — which was wrong: his type
 * has always required an icon and his markup has always had a slot for it, and what was missing
 * was a mapping on our side. `data/tech-icons` is that mapping.
 *
 * There is deliberately no "add technology". Skills are *derived*: the engine computes them from
 * evidence across the connected sources, and the draft layer patches, hides and reorders what
 * came back rather than inventing records. A technology the connectors did not find belongs in
 * `src/data/manual.json`, which is the layer built for facts nobody imported. A button here
 * would have nowhere to persist to, and a control that cannot persist is the thing this whole
 * pass has been removing.
 *
 * @module admin/panels/SkillsPanel
 */

import { useMemo, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, EyeOffIcon, Undo2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { techIcon } from '@/features/portfolio/data/tech-icons'

import { recordKey } from '../../core/schema/merge.js'
import { Note, Panel, TextField } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { HiddenList } from '../preview/record-editor.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { TechIconPicker } from '../preview/tech-icon-picker'
import { useSourceTheme } from '../preview/use-source-theme'

const COLLECTION = 'skills'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function SkillsPanel({ builder }) {
  const { built, overrides, patchRecord, toggleHidden, move, revert } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)
  const [filter, setFilter] = useState('')
  const [selectedName, setSelectedName] = useState(null)

  // Memoised so the identity is stable: `?? []` returns a fresh array every render, which
  // would re-run every memo downstream of it on each keystroke.
  const skills = useMemo(() => built.profile.skills ?? [], [built.profile.skills])
  const hiddenIds = overrides.hidden?.[COLLECTION] ?? []

  const categories = useMemo(
    () => [...new Set(skills.map((skill) => skill.category ?? 'Other'))].sort(),
    [skills],
  )

  const shown = filter
    ? skills.filter((skill) =>
        `${skill.name} ${skill.category ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
      )
    : skills

  const selected = skills.find((skill) => skill.name === selectedName) ?? shown[0] ?? skills[0]
  const selectedId = selected ? recordKey(COLLECTION, selected) : null
  const edited = Boolean(selectedId && overrides.records?.[COLLECTION]?.[selectedId])
  const patch = (values) => patchRecord(COLLECTION, selectedId, values)

  if (!skills.length) {
    return (
      <Panel title="Skills" description="What the stack section lists.">
        <Note tone="warning">
          No skills yet. They are derived from evidence across your connected sources — connect
          one under <strong>Connect</strong>.
        </Note>
      </Panel>
    )
  }

  return (
    <Panel
      workbench
      title="Stack"
      description="The technology pills, their logos, and the groups they fall under."
    >
      <EditorLayout
        controls={
          <>
            <Section
              title={`${skills.length} technologies`}
              description={`Across ${categories.length} categories, in render order.`}
            >
              <Input
                placeholder="Filter…"
                className="h-8"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />

              <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
                {shown.map((skill) => {
                  const id = recordKey(COLLECTION, skill)
                  const index = skills.indexOf(skill)
                  return (
                    <li key={id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedName(skill.name)}
                        aria-current={id === selectedId ? 'true' : undefined}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
                          id === selectedId
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <span
                          className="flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5"
                          aria-hidden
                        >
                          {techIcon(skill.name, skill.icon)}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {skill.name}
                        </span>
                      </button>

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={index <= 0}
                        onClick={() => move(COLLECTION, id, -1)}
                        aria-label={`Move ${skill.name} up`}
                      >
                        <ChevronUpIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === skills.length - 1}
                        onClick={() => move(COLLECTION, id, 1)}
                        aria-label={`Move ${skill.name} down`}
                      >
                        <ChevronDownIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleHidden(COLLECTION, id)}
                        aria-label={`Hide ${skill.name}`}
                        title="Hide from the stack"
                      >
                        <EyeOffIcon />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </Section>

            {selected && (
              <Section title={selected.name}>
                <TextField
                  label="Label"
                  value={selected.name ?? ''}
                  onChange={(value) => patch({ name: value })}
                  help="The text on the pill."
                />

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Logo</span>
                  <TechIconPicker
                    name={selected.name}
                    value={selected.icon}
                    onChange={(slug) => patch({ icon: slug || undefined })}
                  />
                  <p className="text-xs text-pretty text-muted-foreground">
                    Automatic reads the label — “TypeScript”, “Next.js”, “C++” all resolve on
                    their own. A technology with no logo renders as text, which is the intended
                    fallback rather than a gap.
                  </p>
                </div>

                <TextField
                  label="Category"
                  value={selected.category ?? ''}
                  placeholder="Other"
                  onChange={(value) => patch({ category: value })}
                  help="Groups the pill. Reusing an existing name adds to that group; a new one starts a group."
                />

                <TextField
                  label="Homepage"
                  type="url"
                  value={selected.url ?? ''}
                  placeholder="https://www.typescriptlang.org"
                  onChange={(value) => patch({ url: value })}
                  help="Blank renders a plain pill. With a URL the pill becomes a link."
                />

                {edited && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 self-start"
                    onClick={() => revert(COLLECTION, selectedId)}
                  >
                    <Undo2Icon />
                    Revert to imported values
                  </Button>
                )}
              </Section>
            )}

            <HiddenList builder={builder} collection={COLLECTION} hiddenIds={hiddenIds} />

            <Note>
              Skills are derived from your connected sources, so there is no “add” here — a
              technology nobody imported belongs in <code>src/data/manual.json</code>.
            </Note>
          </>
        }
        preview={
          <PreviewFrame
            title="Stack"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={built} theme={theme} section="stack" />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
