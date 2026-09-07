'use client'

/**
 * The showcase — deployed projects, shown large.
 *
 * A showcase item is a project the owner marked, not a separate kind of record. That is the
 * whole design: a project already has a name, a description, a live URL, a repository, a
 * screenshot and a build-time probe result, so a second collection would mean two places to
 * edit one fact and one of them going stale. Marking one is a checkbox; everything else on this
 * panel edits the project itself and therefore shows up in the project list too, which is
 * correct — they are the same project.
 *
 * Adding works through the override system's own affordance rather than a new mechanism: a
 * record patch stored under an id that matches nothing is kept as a user-authored record
 * (`applyOverrides`, "A patch whose id matches nothing is a user-authored record"). So "Add a
 * project" writes a patch under a fresh id, and it publishes through `overrides.json` like
 * every other edit. Nothing needed inventing, and an engine user with no connectors at all can
 * still build a showcase by hand.
 *
 * The section renders nothing when no project is marked, which is what an unconfigured fork
 * should look like — not an empty grid with a placeholder in it.
 *
 * @module admin/panels/ShowcasePanel
 */

import { useState } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeOffIcon,
  PlusIcon,
  Undo2Icon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { framePolicy } from '@/features/portfolio/data/adapter'

import { recordKey } from '../../core/schema/merge.js'
import { Note, Panel, TextArea, TextField, Toggle } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

const COLLECTION = 'projects'

/** A fresh id for a hand-added project, stable enough not to collide with an imported one. */
const newProjectId = () => `manual-${Date.now().toString(36)}`

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ShowcasePanel({ builder }) {
  const { built, overrides, patchRecord, toggleHidden, setOrder, revert } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)
  const [selectedId, setSelectedId] = useState(null)

  const projects = built.profile.projects ?? []
  const showcased = projects.filter((project) => project.showcase === true)

  const selected =
    projects.find((project) => recordKey(COLLECTION, project) === selectedId) ??
    showcased[0] ??
    projects[0]
  const activeId = selected ? recordKey(COLLECTION, selected) : null
  const edited = Boolean(activeId && overrides.records?.[COLLECTION]?.[activeId])
  const patch = (values) => patchRecord(COLLECTION, activeId, values)

  /**
   * Move a showcase item past the next one *in the showcase*.
   *
   * Not `builder.move`, which steps one position through the whole project collection. With
   * forty-three projects and three of them showcased, that swaps the item with a neighbour
   * nobody can see and the grid does not visibly change — a control that writes an order and
   * appears to do nothing. Swapping the two showcased entries writes the same kind of full
   * order, and moves the card the owner is looking at.
   */
  const moveInShowcase = (id, direction) => {
    const order = projects.map((project) => recordKey(COLLECTION, project))
    const marked = projects
      .map((project, index) => ({ index, key: recordKey(COLLECTION, project) }))
      .filter(({ index }) => projects[index].showcase === true)

    const at = marked.findIndex((entry) => entry.key === id)
    const target = at + direction
    if (at === -1 || target < 0 || target >= marked.length) return

    const a = marked[at].index
    const b = marked[target].index
    const next = [...order]
    ;[next[a], next[b]] = [next[b], next[a]]
    setOrder(COLLECTION, next)
  }

  const url = selected
    ? selected.preview === false
      ? ''
      : selected.previewUrl || selected.liveUrl || ''
    : ''
  const policy = framePolicy(url)

  const addProject = () => {
    const id = newProjectId()
    // A name is what makes the orphan patch a record rather than a discarded fragment.
    // Only what makes it a record. An empty `liveUrl` would be stored as the "cleared"
    // sentinel, which means "the owner emptied this" rather than "never set".
    patchRecord(COLLECTION, id, { name: 'New project', showcase: true })
    setSelectedId(id)
  }

  return (
    <Panel
      workbench
      title="Showcase"
      description="Deployed projects, shown large. Mark a project to include it."
    >
      <EditorLayout
        controls={
          <>
            <Section
              title={`${showcased.length} in the showcase`}
              description={`Of ${projects.length} projects. Order here is the order on the page.`}
            >
              <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
                {projects.map((project) => {
                  const id = recordKey(COLLECTION, project)
                  const inShowcase = project.showcase === true
                  const showcasePosition = showcased.indexOf(project)
                  return (
                    <li key={id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="size-3.5 shrink-0 accent-primary"
                        checked={project.showcase === true}
                        aria-label={`Show ${project.name} in the showcase`}
                        onChange={(event) =>
                          patchRecord(COLLECTION, id, {
                            showcase: event.target.checked ? true : undefined,
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedId(id)}
                        aria-current={id === activeId ? 'true' : undefined}
                        className={cn(
                          'min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-xs transition-colors',
                          id === activeId
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {project.name || '(untitled)'}
                      </button>

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={!inShowcase || showcasePosition === 0}
                        onClick={() => moveInShowcase(id, -1)}
                        aria-label={`Move ${project.name} up`}
                      >
                        <ChevronUpIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={
                          !inShowcase || showcasePosition === showcased.length - 1
                        }
                        onClick={() => moveInShowcase(id, 1)}
                        aria-label={`Move ${project.name} down`}
                      >
                        <ChevronDownIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleHidden(COLLECTION, id)}
                        aria-label={`Hide ${project.name}`}
                        title="Hide from the portfolio entirely"
                      >
                        <EyeOffIcon />
                      </Button>
                    </li>
                  )
                })}
              </ul>

              <Button
                variant="outline"
                size="sm"
                className="gap-2 self-start"
                onClick={addProject}
              >
                <PlusIcon />
                Add a project
              </Button>
            </Section>

            {selected && (
              <Section title={selected.name || 'Project'}>
                <Toggle
                  label="Show in the showcase"
                  checked={selected.showcase === true}
                  onChange={(checked) => patch({ showcase: checked ? true : undefined })}
                  help="Off leaves it in the project list, where it renders compactly."
                />

                <TextField
                  label="Title"
                  value={selected.name ?? ''}
                  onChange={(value) => patch({ name: value })}
                />

                <TextArea
                  label="Description"
                  rows={3}
                  value={selected.description ?? ''}
                  onChange={(value) => patch({ description: value })}
                />

                <TextField
                  label="Category"
                  value={selected.category ?? ''}
                  placeholder="Projects"
                  onChange={(value) => patch({ category: value })}
                  help="Free text. Groups nothing yet on the page; it is carried so a fork can group by it."
                />

                <TextField
                  label="Live URL"
                  type="url"
                  value={selected.liveUrl ?? ''}
                  placeholder="https://your-project.example"
                  onChange={(value) => patch({ liveUrl: value })}
                  help="What the card frames. A project with no URL is left out of the showcase."
                />

                <TextField
                  label="Preview URL"
                  type="url"
                  value={selected.previewUrl ?? ''}
                  placeholder={selected.liveUrl || 'https://demo.example'}
                  onChange={(value) => patch({ previewUrl: value })}
                  help="Only when the demo lives somewhere other than the live URL."
                />

                <TextField
                  label="Source URL"
                  type="url"
                  value={selected.repository ?? ''}
                  placeholder="https://github.com/you/project"
                  onChange={(value) => patch({ repository: value })}
                  help="Adds a Source link under the card."
                />

                <TextField
                  label="Screenshot"
                  value={selected.image ?? ''}
                  onChange={(value) => patch({ image: value })}
                  help="Shown behind a preview that has not loaded, or that was refused framing."
                />

                <EmbedStatus url={url} policy={policy} />

                <div className="flex flex-wrap gap-2">
                  {edited && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        revert(COLLECTION, activeId)
                        setSelectedId(null)
                      }}
                    >
                      <Undo2Icon />
                      {selected.source?.connector ? 'Revert edits' : 'Remove'}
                    </Button>
                  )}
                </div>

                {edited && !selected.source?.connector && (
                  <Note>
                    This project was added here rather than imported, so reverting removes it.
                  </Note>
                )}
              </Section>
            )}

            <Note>
              The showcase frames each deployment live where the site allows it. Whether it does
              is read from its own headers at build time by <code>npm run compose</code>, so a
              URL added just now counts as unprobed until the next build.
            </Note>
          </>
        }
        preview={
          <PreviewFrame
            title="Showcase"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={built} theme={theme} section="showcase" />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}

/** What the frame will do for this URL, and why — the one thing an owner cannot deduce. */
function EmbedStatus({ url, policy }) {
  if (!url) {
    return <Note>Add a live URL and the card will frame it.</Note>
  }
  if (policy.embeddable) {
    return (
      <Note>
        <strong>{hostOf(url)}</strong> allows framing — the card loads it live on request.
      </Note>
    )
  }
  return (
    <Note tone="warning">
      <strong>{hostOf(url)}</strong>{' '}
      {policy.reason ? `refuses framing (${policy.reason})` : 'has not been probed yet'}, so the
      card shows the screenshot and a link out. Nothing here works around a refusal.
    </Note>
  )
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
