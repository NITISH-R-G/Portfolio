'use client'

/**
 * Navigation and sections.
 *
 * Two controls that decide the shape of the page rather than its content: which blocks the home
 * page is made of and in what order, and what the header links to.
 *
 * The section list is filtered to the sections this application actually renders. The engine's
 * taxonomy is wider than his page — it knows about publications, talks, packages and a dozen
 * more — and offering a toggle for a section no component draws is exactly the failure this
 * panel set exists to avoid. The ones with no renderer are still *named*, at the bottom, with
 * the reason, because "my publications are missing" deserves an answer better than silence.
 *
 * Three states, not two. "Auto" is the generator's own judgement from the data — a section with
 * nothing in it disappears rather than rendering a heading over empty space — and collapsing it
 * into "Hide" would make an auto-hidden section indistinguishable from one the owner hid on
 * purpose.
 *
 * @module admin/panels/NavigationPanel
 */

import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PAGE_SECTION_BY_ENGINE_ID } from '@/features/portfolio/data/adapter'

import { getPath } from '../drafts.js'
import { Note, Panel, TriState } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function NavigationPanel({ builder }) {
  const { built, setConfig } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const order = built.config.sectionOrder ?? []
  const sections = built.sections ?? []
  const byId = new Map(sections.map((section) => [section.id, section]))

  const rendered = order.filter((id) => PAGE_SECTION_BY_ENGINE_ID[id])
  const unrendered = sections.filter((section) => !PAGE_SECTION_BY_ENGINE_ID[section.id])

  const moveSection = (id, direction) => {
    const index = order.indexOf(id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setConfig('sectionOrder', next)
  }

  // As with the footer rows, the controls read the draft rather than the resolved config, so a
  // half-typed nav entry does not vanish between the click that added it and the first keystroke.
  const draftedNav = getPath(builder.configDraft, 'navigation.items')
  const navItems = Array.isArray(draftedNav)
    ? draftedNav
    : (built.config.navigation?.items ?? [])

  const writeNav = (next) => setConfig('navigation.items', next)

  return (
    <Panel
      workbench
      title="Navigation & sections"
      description="Which blocks the page is made of, in what order, and what the header links to."
    >
      <EditorLayout
        controls={
          <>
            <Section
              title="Page sections"
              description="Auto lets the generator decide from your data. Show and Hide override it."
            >
              <ul className="flex flex-col gap-1">
                {rendered.map((id, index) => {
                  const section = byId.get(id)
                  const setting = built.config.sections?.[id]
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {section?.label ?? id}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {section
                            ? `${section.count} item${section.count === 1 ? '' : 's'} · ${REASONS[section.reason] ?? section.reason}`
                            : id}
                        </p>
                      </div>

                      <TriState
                        value={setting === 'auto' ? undefined : setting}
                        onChange={(value) =>
                          setConfig(`sections.${id}`, value === undefined ? 'auto' : value)
                        }
                      />

                      <div className="flex shrink-0 flex-col">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0}
                          onClick={() => moveSection(id, -1)}
                          aria-label={`Move ${section?.label ?? id} up`}
                        >
                          <ChevronUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === rendered.length - 1}
                          onClick={() => moveSection(id, 1)}
                          aria-label={`Move ${section?.label ?? id} down`}
                        >
                          <ChevronDownIcon />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Section>

            <Section
              title="Header links"
              description="Rendered by his NavDesktop and NavMobile. In-app paths only — the header marks the active item by comparing the path, so an external URL would link but never highlight."
            >
              {navItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    className="h-8 min-w-0 flex-1"
                    value={item.title ?? ''}
                    placeholder="Blocks"
                    aria-label={`Link ${index + 1} title`}
                    onChange={(event) =>
                      writeNav(
                        navItems.map((entry, i) =>
                          i === index ? { ...entry, title: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    className="h-8 min-w-0 flex-1"
                    value={item.href ?? ''}
                    placeholder="/blocks"
                    aria-label={`Link ${index + 1} path`}
                    onChange={(event) =>
                      writeNav(
                        navItems.map((entry, i) =>
                          i === index ? { ...entry, href: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${item.title || 'link'}`}
                    onClick={() => writeNav(navItems.filter((_, i) => i !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="gap-2 self-start"
                onClick={() => writeNav([...navItems, { title: '', href: '/' }])}
              >
                <PlusIcon />
                Add link
              </Button>

              {navItems.length === 0 && (
                <Note>
                  The header shows no links. This application ships one page beyond the
                  portfolio itself — <code>/blocks</code> — so that is the usual first entry.
                </Note>
              )}
            </Section>

            {unrendered.length > 0 && (
              <Section
                title="No renderer in this application"
                description="The engine knows about these and will keep importing them, but his portfolio has no component that draws them, so there is nothing to switch on."
              >
                <p className="text-xs text-pretty text-muted-foreground">
                  {unrendered.map((section) => section.label).join(' · ')}
                </p>
              </Section>
            )}
          </>
        }
        preview={
          <PreviewFrame
            title="Whole page"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={built} theme={theme} />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}

/** What the generator decided, in words. */
const REASONS = {
  'forced-on': 'shown because you said so',
  'forced-off': 'hidden because you said so',
  'auto-shown': 'shown automatically',
  'auto-hidden': 'hidden automatically — not enough content',
}
