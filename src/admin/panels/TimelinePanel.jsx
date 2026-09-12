'use client'

/**
 * Timeline.
 *
 * His `Timescale` draws one cell per year with an age column beside it, which makes it the one
 * component on the page whose content is not a collection the connectors fill. Upstream it was
 * a hand-written list of one person's life — birth year, schools, the company he founded — and
 * Phase 8A replaced that literal with a derivation, so the strip is now built from the dated
 * records the owner already has: roles, degrees and awards all carry dates, and a timeline is
 * exactly a list of dated things.
 *
 * That leaves two genuine decisions for an owner, and this panel is those two and nothing else:
 *
 *   birth year   where the age column counts from. Without it the strip starts at the earliest
 *                record, which makes the age column arbitrary rather than wrong.
 *   milestones   whether to accept the derivation or write the strip by hand.
 *
 * The second is deliberately all-or-nothing, because `toTimeline` is: an authored list replaces
 * the derivation outright rather than merging with it. Offering per-year edits on top of a
 * derived list would imply a merge the adapter does not perform, and the next import would
 * silently discard them. So writing your own starts by copying what was derived — you can see
 * exactly what you are replacing, and nothing is lost by choosing.
 *
 * @module admin/panels/TimelinePanel
 */

import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toTimeline } from '@/features/portfolio/data/adapter'

import { Field, Note, Panel, TextField } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function TimelinePanel({ builder }) {
  const { built, setConfig } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const timeline = built.config.timeline ?? {}
  const authored = Array.isArray(timeline.milestones) ? timeline.milestones : null

  // What the strip is actually showing, in whichever mode is in force. Read from the same
  // function the component reads, so the counts stated here cannot disagree with the preview
  // beside them.
  const resolved = toTimeline(built.profile, built.config)

  // Years carrying an entry, as opposed to the empty in-between years `fill` adds to keep the
  // strip continuous. Counting the filled ones would report a number nobody can see.
  const withContent = resolved.milestones.filter((milestone) => milestone.content).length

  const section = built.sections?.find((entry) => entry.id === 'timeline')

  const writeMilestones = (next) => setConfig('timeline.milestones', next)

  const patchMilestone = (index, patch) =>
    writeMilestones(
      authored.map((milestone, i) => (i === index ? { ...milestone, ...patch } : milestone))
    )

  return (
    <Panel
      workbench
      title="Timeline"
      description="The year strip, built from your dated records — or written by hand."
    >
      <EditorLayout
        controls={
          <>
            <Section title="Age column">
              <TextField
                label="Birth year"
                type="number"
                value={timeline.birthYear ?? ''}
                placeholder={String(resolved.birthYear)}
                onChange={(value) =>
                  setConfig('timeline.birthYear', value === '' ? undefined : Number(value))
                }
                help={
                  timeline.birthYear
                    ? 'The age column counts from this year.'
                    : 'Not set, so the strip starts at your earliest record and the age column counts from there.'
                }
              />
            </Section>

            <Section
              title="Milestones"
              description={
                authored
                  ? 'Written by hand. The derivation from your records is not used.'
                  : 'Derived from the dates on your roles, degrees and awards.'
              }
            >
              {!authored && (
                <>
                  {/* The derived mode has no per-year controls on purpose — see the module note.
                      What it does have is an honest statement of what the derivation found, so
                      an empty strip is explained rather than merely blank. */}
                  <p className="text-xs text-pretty text-muted-foreground">
                    {withContent > 0
                      ? `${withContent} ${withContent === 1 ? 'year has' : 'years have'} an entry, drawn from your experience, education and awards. Edit those records to change the strip.`
                      : 'No dated records yet. Roles, degrees and awards with dates on them appear here automatically.'}
                  </p>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 self-start"
                    onClick={() =>
                      // Seeded with the derivation rather than empty: an authored list replaces
                      // it, so starting blank would silently discard what is on screen.
                      writeMilestones(
                        resolved.milestones
                          .filter((milestone) => milestone.content)
                          .map((milestone) => ({
                            year: milestone.year,
                            content: milestone.content,
                          }))
                      )
                    }
                  >
                    <PlusIcon />
                    Write my own instead
                  </Button>

                  <Note>
                    Writing your own replaces the derivation completely — imported records will
                    no longer add themselves to the strip.
                  </Note>
                </>
              )}

              {authored && (
                <>
                  {authored.map((milestone, index) => (
                    <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          value={milestone.year ?? ''}
                          placeholder="Year"
                          aria-label={`Milestone ${index + 1} year`}
                          onChange={(event) =>
                            patchMilestone(index, {
                              year:
                                event.target.value === ''
                                  ? undefined
                                  : Number(event.target.value),
                            })
                          }
                        />
                        <span className="flex-1 text-xs text-muted-foreground">
                          {Number.isFinite(Number(milestone.year))
                            ? `age ${Number(milestone.year) - resolved.birthYear}`
                            : 'a year is required'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${milestone.year || 'milestone'}`}
                          onClick={() =>
                            writeMilestones(authored.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>

                      <Textarea
                        className="min-h-16 text-sm"
                        value={milestone.content ?? ''}
                        placeholder="What happened this year. Markdown is allowed."
                        aria-label={`Milestone ${index + 1} content`}
                        onChange={(event) =>
                          patchMilestone(index, { content: event.target.value })
                        }
                      />
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        writeMilestones([
                          ...authored,
                          { year: new Date().getFullYear(), content: '' },
                        ])
                      }
                    >
                      <PlusIcon />
                      Add a year
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfig('timeline.milestones', undefined)}
                    >
                      Go back to the derived timeline
                    </Button>
                  </div>

                  <Note>
                    Years without an entry are drawn as empty cells so the strip stays
                    continuous. A milestone with no year is dropped.
                  </Note>
                </>
              )}
            </Section>

            <Section title="Visibility">
              {/* The section is `auto` by default, and `auto` can hide it. Saying so here is the
                  difference between "my edits did nothing" and "there is nothing to draw yet". */}
              <Field label="On the page">
                <p className="text-xs text-pretty text-muted-foreground">
                  {!section
                    ? 'Unavailable.'
                    : section.visible
                      ? 'The timeline is shown on your portfolio.'
                      : `Hidden — a timeline needs dated records in at least two different years, and ${section.count === 1 ? 'only one year has' : `${section.count} years have`} one so far. You can turn it on anyway from Navigation.`}
                </p>
              </Field>
            </Section>
          </>
        }
        preview={
          <PreviewFrame
            title="Timescale"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={built} theme={theme} section="timeline" />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
