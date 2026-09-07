'use client'

/**
 * Projects, and the showcase configuration that belongs to them.
 *
 * §11 of the brief: project preview settings must not be buried inside a generic content list.
 * So a project gets its own editor, grouped the way a person thinks about a project — what it
 * is, where it lives, whether to embed it, and where it sits — and the preview is his actual
 * `ProjectItem`, expanded, with the actual `ProjectPreview` inside it.
 *
 * Which matters most for the showcase controls. Whether a hosted URL can be embedded is not
 * something the browser can find out — a frame refused by `X-Frame-Options` fires `onLoad` like
 * any other, and reading its location throws — so it is measured at build time by
 * `scripts/probe-embeddable.mjs` and read here through the same `framePolicy` the site uses.
 * The consequence is worth stating in the UI rather than hiding: a URL typed just now has not
 * been probed, so it previews as blocked until the next build. That is the honest answer, and
 * it is the one the deployed page will give too.
 *
 * @module admin/panels/ProjectsPanel
 */

import { useState } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  Undo2Icon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ProjectItem } from '@/features/portfolio/components/projects/project-item'
import { framePolicy, toProjects } from '@/features/portfolio/data/adapter'

import { recordKey } from '../../core/schema/merge.js'
import { Grid, Note, Panel, TextArea, TextField, Toggle } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { ThemeScope } from '../preview/theme-scope'
import { useSourceTheme } from '../preview/use-source-theme'

const COLLECTION = 'projects'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ProjectsPanel({ builder }) {
  const { built, overrides, patchRecord, toggleHidden, move, revert } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const records = built.profile.projects ?? []
  const hiddenIds = overrides.hidden?.[COLLECTION] ?? []
  const [selectedId, setSelectedId] = useState(null)

  const selected =
    records.find((record) => recordKey(COLLECTION, record) === selectedId) ?? records[0]
  const activeId = selected ? recordKey(COLLECTION, selected) : null

  if (!records.length) {
    return (
      <Panel title="Projects" description="Every project, and how each one is shown.">
        <Note tone="warning">
          There are no projects yet. Connect a source under <strong>Connect profiles</strong>, or
          add them to <code>src/data/manual.json</code>.
        </Note>
      </Panel>
    )
  }

  const patch = (values) => patchRecord(COLLECTION, activeId, values)
  const edited = Boolean(overrides.records?.[COLLECTION]?.[activeId])

  // The exact object his component will receive, produced by the exact function the site's
  // `PROJECTS` is defined by — so what the preview draws is what the page draws.
  const previewProject = toProjects({ projects: [selected] })[0]
  const previewUrl =
    selected.preview === false ? '' : selected.previewUrl || selected.liveUrl || ''
  const policy = framePolicy(previewUrl)

  return (
    <Panel
      workbench
      title="Projects"
      description="Every project, in render order, and the showcase settings that belong to each one."
    >
      <EditorLayout
        controls={
          <>
            <Section title="Projects" description={`${records.length} in render order.`}>
              <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
                {records.map((record, index) => {
                  const id = recordKey(COLLECTION, record)
                  return (
                    <li key={id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(id)}
                        aria-current={id === activeId ? 'true' : undefined}
                        className={cn(
                          'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          id === activeId
                            ? 'bg-accent font-medium text-accent-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {record.name || '(untitled)'}
                        {overrides.records?.[COLLECTION]?.[id] && (
                          <span className="ml-1.5 font-mono text-[0.65rem] text-muted-foreground">
                            edited
                          </span>
                        )}
                      </button>

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === 0}
                        onClick={() => move(COLLECTION, id, -1)}
                        aria-label={`Move ${record.name} up`}
                      >
                        <ChevronUpIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === records.length - 1}
                        onClick={() => move(COLLECTION, id, 1)}
                        aria-label={`Move ${record.name} down`}
                      >
                        <ChevronDownIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleHidden(COLLECTION, id)}
                        aria-label={`Hide ${record.name}`}
                        title="Hide from the portfolio"
                      >
                        <EyeOffIcon />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </Section>

            {hiddenIds.length > 0 && (
              <Section
                title="Hidden"
                description="Not rendered, and excluded from the counts in your stats."
              >
                <ul className="flex flex-col gap-1">
                  {hiddenIds.map((id) => (
                    <li key={id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        {id}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="gap-1"
                        onClick={() => toggleHidden(COLLECTION, id)}
                      >
                        <EyeIcon />
                        Show
                      </Button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Content" description={selected.name}>
              <TextField
                label="Title"
                value={selected.name ?? ''}
                onChange={(value) => patch({ name: value })}
              />
              <TextArea
                label="Description"
                rows={4}
                value={selected.description ?? ''}
                onChange={(value) => patch({ description: value })}
                help="Shown inside the expanded card."
              />
              <TextField
                label="Technologies"
                value={(selected.technologies ?? []).join(', ')}
                onChange={(value) =>
                  patch({
                    technologies: value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                help="Comma-separated. Rendered as his Tag chips."
              />
              <TextField
                label="Logo"
                value={selected.image ?? ''}
                onChange={(value) => patch({ image: value })}
                help="A path inside public/, or an absolute URL. Falls back to his generic icon tile."
              />
            </Section>

            <Section title="Links">
              <TextField
                label="Hosted URL"
                type="url"
                value={selected.liveUrl ?? ''}
                onChange={(value) => patch({ liveUrl: value })}
                placeholder="https://your-project.example"
              />
              <TextField
                label="Repository"
                type="url"
                value={selected.repository ?? ''}
                onChange={(value) => patch({ repository: value })}
                placeholder="https://github.com/you/project"
              />
            </Section>

            <Section
              title="Showcase"
              description="The embedded preview inside the expanded card."
            >
              <Toggle
                label="Show an embedded preview"
                checked={selected.preview !== false}
                onChange={(checked) => patch({ preview: checked ? undefined : false })}
                help="Off removes the frame entirely, for a deployment that is private, rate-limited, or simply not worth framing."
              />

              <TextField
                label="Preview URL"
                type="url"
                value={selected.previewUrl ?? ''}
                onChange={(value) => patch({ previewUrl: value })}
                placeholder={selected.liveUrl || 'https://demo.example'}
                help="Only needed when the demo lives somewhere other than the hosted URL. Blank uses the hosted URL."
              />

              <TextField
                label="Fallback screenshot"
                value={selected.image ?? ''}
                onChange={(value) => patch({ image: value })}
                help="Shown behind a preview that has not loaded, or that was refused embedding."
              />

              <EmbedStatus url={previewUrl} policy={policy} enabled={selected.preview !== false} />
            </Section>

            <Section title="Visibility">
              <Toggle
                label="Feature this project"
                checked={selected.featured === true}
                onChange={(checked) => patch({ featured: checked ? true : undefined })}
                help="Pins it above the ranking the generator computed."
              />
              <Grid>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => toggleHidden(COLLECTION, activeId)}
                >
                  <EyeOffIcon />
                  Hide project
                </Button>
                {edited && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => revert(COLLECTION, activeId)}
                  >
                    <Undo2Icon />
                    Revert edits
                  </Button>
                )}
              </Grid>
            </Section>
          </>
        }
        preview={
          <div className="flex flex-col gap-6">
            <PreviewFrame
              title={`ProjectItem — ${selected.name || '(untitled)'}`}
              theme={theme}
              themeName={themeName}
              onThemeChange={setTheme}
            >
              <ThemeScope theme={theme} className="bg-background text-foreground">
                {/* His component, expanded, so the showcase controls above are visible without
                    the reader having to click the card open first. */}
                <ProjectItem project={{ ...previewProject, isExpanded: true }} />
              </ThemeScope>
            </PreviewFrame>

            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                In context
              </p>
              <div className="overflow-hidden rounded-xl inset-ring inset-ring-border">
                <PortfolioPreview built={built} theme={theme} section="projects" />
              </div>
            </div>
          </div>
        }
      />
    </Panel>
  )
}

/**
 * What the frame will actually do, and why.
 *
 * Stated rather than implied because it is the one thing about this feature a portfolio owner
 * cannot deduce: the answer depends on headers only the build can read, so a URL added a moment
 * ago is genuinely unknown until the site is rebuilt.
 */
function EmbedStatus({ url, policy, enabled }) {
  if (!enabled) {
    return <Note>No preview will be rendered for this project.</Note>
  }
  if (!url) {
    return (
      <Note>
        Add a hosted or preview URL and the card will offer an embedded frame.
      </Note>
    )
  }
  if (policy.embeddable) {
    return (
      <Note>
        <strong>{hostOf(url)}</strong> allows framing — the card embeds it live.
      </Note>
    )
  }
  return (
    <Note tone="warning">
      <strong>{hostOf(url)}</strong> {policy.reason ? `refuses framing (${policy.reason})` : 'has not been probed yet'}
      , so the card shows the screenshot and a link instead. Framing is decided by the site&apos;s
      own headers, read at build time by <code>npm run compose</code>; a URL added just now
      counts as unprobed until the next build.
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
