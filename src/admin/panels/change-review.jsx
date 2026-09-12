'use client'

/**
 * What an import would do, before it does it — and what it did, after.
 *
 * One component for both, because they are the same information at two moments and splitting
 * them would let the two drift. The only thing that differs is whether the numbers are a
 * proposal or a record, and that is one word plus which buttons are offered.
 *
 * Everything shown comes from the importer's own result: the states, counts and
 * `recordsChanged` that `withHistory` already computes and `status.json` already stores. This
 * component adds no arithmetic of its own — a review that counted differently from the health
 * model would be a second source of truth about the same run.
 *
 * @module admin/panels/change-review
 */

import { CheckIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getConnector } from '../../connectors/index.js'
import { Note } from '../fields.jsx'
import { Section } from '../preview/editor-layout.jsx'
import { Meta, SourceMark, StatusDot } from './source-ui.jsx'

/** Health tone per importer state, so a review reads like the Sources rows beside it. */
const TONE = {
  imported: 'ok',
  partial: 'warn',
  empty: 'muted',
  manual: 'info',
  'link-only': 'info',
  unavailable: 'warn',
  error: 'error',
  skipped: 'muted',
}

/**
 * Roll a run up into the sentence a person actually wants.
 *
 * Exported because the summary is worth having without the whole panel — and because it is
 * the thing worth testing: the counts must come from the importer, not from anything this
 * file recomputes.
 *
 * @param {{connectors?: Record<string, any>}} result
 * @returns {{
 *   sources: {key: string, name: string, state: string, tone: string, message: string,
 *     account?: string, records: number, changed: {added: number, removed: number, updated: number}}[],
 *   totals: {added: number, removed: number, updated: number, records: number},
 *   failures: number,
 *   changedSources: number,
 * }}
 */
export function previewSummary(result) {
  const entries = Object.entries(result?.connectors ?? {})
  const totals = { added: 0, removed: 0, updated: 0, records: 0 }
  let failures = 0
  let changedSources = 0

  const sources = entries.map(([key, status]) => {
    const changed = status?.recordsChanged ?? { added: 0, removed: 0, updated: 0 }
    const records = status?.recordsImported ?? 0

    totals.added += changed.added ?? 0
    totals.removed += changed.removed ?? 0
    totals.updated += changed.updated ?? 0
    totals.records += records

    if (status?.state === 'error' || status?.state === 'unavailable') failures += 1
    if ((changed.added ?? 0) + (changed.removed ?? 0) + (changed.updated ?? 0) > 0) changedSources += 1

    return {
      key,
      name: status?.name ?? getConnector(key)?.name ?? key,
      state: status?.state ?? 'skipped',
      tone: TONE[status?.state] ?? 'muted',
      message: status?.message ?? '',
      account: status?.account,
      records,
      changed,
      warnings: status?.warnings ?? [],
    }
  })

  // Sources that did something first; a run of twenty where two changed should not make the
  // reader hunt for the two.
  sources.sort((a, b) => total(b.changed) - total(a.changed) || a.name.localeCompare(b.name))

  return { sources, totals, failures, changedSources }
}

const total = (changed) => (changed?.added ?? 0) + (changed?.removed ?? 0) + (changed?.updated ?? 0)

/**
 * The review, in the inspector.
 *
 * @param {{
 *   pending: {failed?: boolean, applied?: boolean, message?: string, only?: string, result?: object},
 *   busy: boolean,
 *   onApply: () => void,
 *   onDismiss: () => void,
 * }} props
 */
export function ChangeReview({ pending, busy, onApply, onDismiss }) {
  if (pending.failed) {
    return (
      <Section title="Import failed">
        {/* Stated plainly, and without a set of empty counts beside it. An empty preview reads
            as "nothing to update", which is the opposite of what happened. */}
        <Note tone="error">{pending.message}</Note>
        <p className="text-xs text-pretty text-muted-foreground">
          Nothing was written. Your portfolio is exactly as it was, and the source keeps
          whatever health it last had.
        </p>
        <Button variant="outline" size="sm" className="gap-2 self-start" onClick={onDismiss}>
          <XIcon />
          Dismiss
        </Button>
      </Section>
    )
  }

  const summary = previewSummary(pending.result)
  const applied = pending.applied === true
  const nothingChanged = total(summary.totals) === 0

  return (
    <>
      <Section
        title={applied ? 'Applied' : 'Preview'}
        description={
          applied
            ? 'These changes are now part of your portfolio.'
            : 'Fetched and compared against what you already have. Nothing has been written yet.'
        }
      >
        {nothingChanged ? (
          <Note>
            {summary.failures > 0
              ? 'No changes — and some sources could not be read. See below.'
              : 'Everything is already up to date. Applying would change nothing.'}
          </Note>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm">
            {summary.totals.added > 0 && <Delta tone="ok" sign="+" n={summary.totals.added} label="added" />}
            {summary.totals.updated > 0 && <Delta tone="info" sign="~" n={summary.totals.updated} label="updated" />}
            {summary.totals.removed > 0 && <Delta tone="warn" sign="−" n={summary.totals.removed} label="removed" />}
          </div>
        )}

        <Meta
          items={[
            `${summary.sources.length} ${summary.sources.length === 1 ? 'source' : 'sources'}`,
            `${summary.totals.records} records`,
            summary.failures > 0 ? `${summary.failures} failed` : null,
          ]}
        />

        {!applied && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-2"
              disabled={busy || nothingChanged}
              onClick={onApply}
            >
              <CheckIcon />
              {busy ? 'Applying…' : 'Apply'}
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" disabled={busy} onClick={onDismiss}>
              <XIcon />
              Cancel
            </Button>
          </div>
        )}

        {applied && (
          <Button variant="outline" size="sm" className="gap-2 self-start" onClick={onDismiss}>
            Done
          </Button>
        )}
      </Section>

      <Section title="Per source">
        <ul className="flex flex-col gap-3">
          {summary.sources.map((source) => (
            <li key={source.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <SourceMark name={getConnector(source.key)?.icon} className="size-6" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{source.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot tone={source.tone} />
                  {source.state}
                </span>
              </div>

              <p className="pl-8 text-xs text-pretty text-muted-foreground">{source.message}</p>

              <Meta
                className="pl-8"
                items={[
                  source.account,
                  total(source.changed) > 0
                    ? [
                        source.changed.added ? `+${source.changed.added}` : '',
                        source.changed.updated ? `~${source.changed.updated}` : '',
                        source.changed.removed ? `−${source.changed.removed}` : '',
                      ].filter(Boolean).join(' ')
                    : 'no change',
                  source.records ? `${source.records} records` : null,
                ]}
              />

              {/* A warning is the connector telling you what it could not do. It belongs in the
                  decision, not in a log the user has to go looking for. */}
              {source.warnings.map((warning) => (
                <p key={warning} className="pl-8 text-xs text-pretty text-muted-foreground/80">
                  {warning}
                </p>
              ))}
            </li>
          ))}
        </ul>

        {summary.failures > 0 && (
          <Note tone="warn">
            A source that failed is left exactly as it was — its last good import is still what
            your portfolio shows.
          </Note>
        )}
      </Section>
    </>
  )
}

function Delta({ tone, sign, n, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot tone={tone} />
      <span className="tabular-nums">{sign}{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}
