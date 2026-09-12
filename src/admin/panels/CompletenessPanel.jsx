'use client'

/**
 * What your portfolio is still missing — and where what it has came from.
 *
 * Two questions that turn out to be one screen: "is this finished?" and "can I stand behind
 * it?". Both are answered from the built profile rather than from anything stored, so the
 * answer cannot go stale.
 *
 * The reason this is not a percentage with a progress bar: a single number is the least
 * actionable form the information can take, and it is usually wrong. A working engineer has no
 * publications and no competitive-programming profile; scoring those as gaps would tell them
 * their portfolio is half finished when it is complete for the person they actually are. So
 * every check declares whether it *applies*, and only applicable ones are counted. The score is
 * shown beside the counts it came from, never alone.
 *
 * All of the judgement lives in `core/profile/completeness.js` — this file only draws it.
 *
 * @module admin/panels/CompletenessPanel
 */

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { getConnector } from '../../connectors/index.js'
import { assessProfile, expectedCollections } from '../../core/profile/completeness.js'
import { evidenceFor } from '../../core/identity/resolve.js'
import { traceIdentity } from '../../core/identity/explain.js'
import { Panel, Note } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { Meta, StatusDot } from './source-ui.jsx'

/** How each state reads, and how loudly. `not-applicable` is deliberately the quietest. */
const STATES = {
  complete: { label: 'Complete', tone: 'ok' },
  partial: { label: 'Partial', tone: 'warn' },
  missing: { label: 'Missing', tone: 'error' },
  review: { label: 'Needs review', tone: 'warn' },
  'not-applicable': { label: 'Not applicable', tone: 'muted' },
}

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function CompletenessPanel({ builder }) {
  const { built } = builder
  const [showAll, setShowAll] = useState(false)

  const expected = expectedCollections(built.config, getConnector)
  const { groups, summary } = assessProfile(built.profile, { expected, config: built.config })
  const trace = traceIdentity(built, evidenceFor)

  return (
    <Panel
      workbench
      title="Completeness"
      description="What your portfolio still lacks, and where what it has came from."
    >
      <EditorLayout
        controls={
          <>
            <Section
              title="Score"
              description="Complete, plus half credit for partial, over everything that applies to you."
            >
              <p className="font-mono text-3xl tabular-nums">{summary.score}%</p>
              <div className="flex flex-col gap-1.5">
                <Line tone="ok" n={summary.complete} label="complete" />
                {summary.partial > 0 && <Line tone="warn" n={summary.partial} label="partial" />}
                {summary.missing > 0 && <Line tone="error" n={summary.missing} label="missing" />}
                <Line tone="muted" n={summary.notApplicable} label="not applicable" />
              </div>

              {/* The denominator, stated. A score whose basis is hidden is a score nobody can
                  argue with, which is exactly the problem with most of them. */}
              <Meta items={[`${summary.complete} + ${summary.partial}/2 of ${summary.applicable} applicable`]} />
            </Section>

            <Section
              title="Not applicable"
              description="Excluded from the score entirely, because nothing suggests they belong in your portfolio."
            >
              <p className="text-xs text-pretty text-muted-foreground">
                A collection counts against you only once a connected source can produce it, or
                you already have some. Connect ORCID and publications start being expected;
                until then their absence is not a gap.
              </p>
            </Section>

            {trace.enabled ? (
              <Section
                title="Where this came from"
                description="The claim behind each published identity field."
              >
                {trace.fields.length === 0 ? (
                  <Note>Nothing is published yet.</Note>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {trace.fields.map((field) => (
                      <li key={field.field} className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{field.label}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{String(field.value)}</span>
                        </span>
                        <Meta
                          items={[
                            field.winner ? `${field.winner.source} (${field.winner.layerKind})` : 'no claim',
                            field.claims.length > 1 ? `${field.claims.length} claims` : null,
                            field.contested ? 'sources disagree' : null,
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            ) : (
              <Section title="Where this came from">
                <Note>{trace.reason}</Note>
              </Section>
            )}
          </>
        }
        preview={
          // The same containment as the other workbench canvases: a container query decides what
          // fits, and the full-bleed screen rules are clipped so they cannot widen the page.
          <div className="@container flex max-w-full flex-col overflow-x-clip">
            {groups.map((group) => {
              const shown = showAll
                ? group.checks
                : group.checks.filter((check) => check.state !== 'not-applicable')
              if (!shown.length) return null

              return (
                <section key={group.name}>
                  <h3 className="screen-line-top screen-line-bottom bg-muted/20 px-4 py-2 font-mono text-xs tracking-wide text-muted-foreground uppercase">
                    {group.name}
                  </h3>
                  <ul>
                    {shown.map((check) => (
                      <li key={check.id}>
                        <CheckRow check={check} />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}

            <div className="px-4 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Hide what does not apply' : `Show all ${summary.notApplicable} not applicable`}
              </Button>
            </div>
          </div>
        }
      />
    </Panel>
  )
}

function CheckRow({ check }) {
  const state = STATES[check.state] ?? STATES.missing

  return (
    <div
      className={cn(
        'screen-line-bottom flex items-start gap-3 px-4 py-3',
        check.state === 'not-applicable' && 'opacity-60',
      )}
    >
      <StatusDot tone={state.tone} className="mt-2" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="text-sm font-medium">{check.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{state.label}</span>
        </p>
        <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{check.detail}</p>

        {/* Only where there is something to do about it. A "fix" on a complete check would be
            noise, and one on a not-applicable check would be a nag. */}
        {check.fix && check.state !== 'complete' && check.state !== 'not-applicable' && (
          <p className="mt-1 text-xs text-pretty text-foreground/80">{check.fix}</p>
        )}
        {check.because && (
          <Meta className="mt-1" items={[check.because]} />
        )}
      </div>

      {typeof check.count === 'number' && check.count > 0 && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{check.count}</span>
      )}
    </div>
  )
}

function Line({ tone, n, label }) {
  return (
    <p className="flex items-baseline gap-2 text-sm">
      <StatusDot tone={tone} className="translate-y-[-1px]" />
      <span className="font-mono tabular-nums">{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </p>
  )
}
