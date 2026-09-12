'use client'

/**
 * Your sources, and whether they are actually working.
 *
 * Once ten sources are connected, "did that work?" stops being answerable by reading scrollback.
 * This is the standing answer: what each source is, when it last actually *succeeded*, what it
 * brought in, and what changed since last time.
 *
 * Two ideas from `core/sources/health` do most of the work, and this screen exists to make them
 * visible rather than to invent a second health model. **Attempted is not succeeded** — a failed
 * run does not erase the memory of the last good one, so a blip reads differently from a broken
 * integration. And **most rows need nothing from you**: LinkedIn cannot be fetched and never will
 * be, which is settled rather than a problem. So rows sort by whether you can act on them, and
 * only those are given any weight.
 *
 * @module admin/panels/SourcesPanel
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import Icon from '../icon.jsx'
import { getConnector } from '../../connectors/index.js'
import { deriveHealth, summarize, isSuccess, HEALTH_STATES, describeAge } from '../../core/sources/health.js'
import { capabilitiesFor } from '../../core/sources/capabilities.js'
import { refreshPolicyFor, summarizeRefresh, SCHEDULE } from '../../core/sources/refresh.js'
import { Panel, Note } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import * as api from '../api.js'
import { Meta, SourceMark, StatusDot } from './source-ui.jsx'
import { methodLabel } from './source-catalogue.js'
import { ChangeReview } from './change-review.jsx'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function SourcesPanel({ builder }) {
  const { built, documents } = builder
  const [live, setLive] = useState(null)
  const [state, setState] = useState(null)
  const [refreshing, setRefreshing] = useState('')
  const [log, setLog] = useState('')
  const [selected, setSelected] = useState(null)
  /**
   * A fetched-but-unapplied run.
   *
   * Held here rather than written anywhere: until the user accepts it, nothing about the
   * portfolio has changed, and closing this panel must leave the profile exactly as it was.
   */
  const [pending, setPending] = useState(null)
  /**
   * A synchronous in-flight guard.
   *
   * `refreshing` cannot do this job on its own: React batches state updates, so two clicks in
   * the same tick both observe the old value and both fire. Disabling the button is not enough
   * either — the re-render that disables it happens after the second click has already been
   * handled. Measured: three rapid clicks produced two imports. A ref changes synchronously,
   * so the second call sees the first.
   */
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    try { setState(await api.getState()) } catch { setState(null) }
  }, [])

  useEffect(() => {
    api.isAvailable().then((available) => {
      setLive(available)
      if (available) refresh()
    })
  }, [refresh])

  const config = state?.config ?? built.config
  const statuses = state?.status?.connectors ?? built.profile.meta?.sourceStatus ?? {}
  const configured = Object.entries(config.dataSources ?? {})

  // Derived on every render rather than memoised. `deriveHealth` is arithmetic over at most a
  // few dozen sources, and the alternative — a dependency list over two objects that are rebuilt
  // each render — would need stringifying them to be correct, which costs more than the work it
  // was avoiding.
  const healths = configured.map(([key, cfg]) => deriveHealth({
    key,
    connector: getConnector(key),
    status: statuses[key],
    config: cfg,
  }))

  // Sources needing attention first — that is the reason to open this screen at all. The same
  // three buckets the summary counts, so the headline and the order agree.
  const ordered = [...healths].sort((a, b) => {
    const rank = (h) => (h.actionable ? 0 : isSuccess(h.state) ? 1 : 2)
    return rank(a) - rank(b) || a.name.localeCompare(b.name)
  })

  const summary = summarize(healths)

  // Whether each source can keep itself current, derived from what the connector declares.
  // `env` is deliberately not consulted from the browser — a credential's *presence* is a
  // server-side fact, so a source needing one reports `blocked` here until an import proves
  // otherwise, rather than the admin guessing at the environment it cannot see.
  const policies = configured.map(([key]) => refreshPolicyFor(getConnector(key)))
  const automation = summarizeRefresh(policies)
  const policyFor = (key) => refreshPolicyFor(getConnector(key))

  const docs = state?.documents ?? documents ?? []

  /**
   * Fetch, normalise and diff — and write nothing.
   *
   * Named "Preview" rather than "Check for updates" because it is not a peek at metadata: the
   * connectors really run. Anything less would be a guess dressed up as a preview, and the
   * point of this screen is that its numbers are the numbers applying would produce.
   */
  const runPreview = async (only) => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(only ?? 'all')
    setLog('')
    setPending(null)
    try {
      const result = await api.runImport(only ? [only] : undefined, { preview: true })
      setLog(result.output ?? '')
      if (!result.result) {
        // No structured result means the importer did not finish. Reported as the failure it
        // is, rather than as an empty preview that would read as "nothing to update".
        setPending({ failed: true, only, message: result.error ?? 'The importer did not return a result.' })
        return
      }
      setPending({ only, result: result.result, at: Date.now() })
    } catch (err) {
      setPending({ failed: true, only, message: err.message })
    } finally {
      inFlight.current = false
      setRefreshing('')
    }
  }

  /** Apply what was previewed. The same run, without `--dry-run`. */
  const applyPending = async () => {
    if (!pending || pending.failed || inFlight.current) return
    inFlight.current = true
    setRefreshing(pending.only ?? 'all')
    try {
      const result = await api.runImport(pending.only ? [pending.only] : undefined)
      setLog(result.output ?? '')
      // Kept as the review of what was just applied, so the user can read what changed rather
      // than watching the numbers vanish at the moment they become true.
      setPending(result.result ? { ...pending, result: result.result, applied: true } : null)
      await refresh()
    } catch (err) {
      setPending({ failed: true, only: pending.only, message: err.message })
    } finally {
      inFlight.current = false
      setRefreshing('')
    }
  }

  const active = selected ? ordered.find((h) => h.key === selected) : null

  return (
    <Panel
      workbench
      title="Sources"
      description="Where your portfolio's data comes from, and whether each one is actually working."
    >
      <EditorLayout
        controls={
          <>
            <Section title="Overall">
              <div className="flex flex-col gap-1.5">
                <SummaryLine tone="ok" count={summary.connected} label="connected" />
                {summary.attention > 0 && (
                  <SummaryLine tone="warn" count={summary.attention} label="needing attention" />
                )}
                {summary.informational > 0 && (
                  <SummaryLine tone="muted" count={summary.informational} label="informational" />
                )}
                <SummaryLine tone="muted" count={summary.records} label="records imported" />
              </div>

              {live && configured.length > 0 && (
                <Button
                  size="sm"
                  className="gap-2 self-start"
                  disabled={refreshing !== ''}
                  onClick={() => runPreview()}
                >
                  <Icon name={refreshing === 'all' ? 'Loader2' : 'RefreshCw'} size={14} />
                  {refreshing === 'all' ? 'Fetching…' : 'Fetch & preview'}
                </Button>
              )}
            </Section>

            {configured.length > 0 && (
              <Section
                title="Maintenance"
                description={`Automatic refresh runs ${SCHEDULE.description}, and on every push to main.`}
              >
                <div className="flex flex-col gap-1.5">
                  <SummaryLine tone="ok" count={automation.automatic} label="refresh automatically" />
                  {automation.blocked > 0 && (
                    <SummaryLine tone="warn" count={automation.blocked} label="blocked on a credential" />
                  )}
                  {automation.manual > 0 && (
                    <SummaryLine tone="info" count={automation.manual} label="only when you edit them" />
                  )}
                  {automation.unsupported > 0 && (
                    <SummaryLine tone="muted" count={automation.unsupported} label="never — nothing to fetch" />
                  )}
                </div>

                {/* The honest limit, stated where someone would otherwise assume otherwise.
                    GitHub Actions cannot run independent per-source schedules, so there is no
                    per-source cadence to offer and none is pretended. */}
                <p className="text-xs text-pretty text-muted-foreground">
                  One schedule covers every source — the repository&apos;s workflow. Per-source
                  cadence is not offered because nothing here could honour it.
                </p>
              </Section>
            )}

            {live === false && (
              <Section title="Not running">
                <Note>
                  Refreshing runs the importer, which needs a dev session. Start one with{' '}
                  <code>pnpm dev</code>, or run <code>pnpm run import</code> in your terminal.
                </Note>
              </Section>
            )}

            {pending && (
              <ChangeReview
                pending={pending}
                busy={refreshing !== ''}
                onApply={applyPending}
                onDismiss={() => setPending(null)}
              />
            )}

            {active && !pending && (
              <SourceInspector health={active} policy={policyFor(active.key)} onClose={() => setSelected(null)} />
            )}

            {log && (
              <Section title="Import log">
                <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
                  <code>{log}</code>
                </pre>
              </Section>
            )}
          </>
        }
        preview={
          // A container, not a viewport, decides what fits here. The canvas is `main` minus the
          // inspector gutter — 392px inside a 1440px window — so a viewport breakpoint renders
          // wide metadata into a narrow column and pushes the whole page sideways. It did
          // exactly that: 232px of horizontal overflow at 1440.
          //
          // `overflow-x-clip` for the second half of the same problem: `screen-line-*` draws a
          // `200vw` full-bleed rule as an absolutely-positioned pseudo-element, and an abspos
          // child that extends past its container still counts toward an ancestor's scrollWidth.
          // His own `SiteFooter` wraps the identical construct in `max-w-screen overflow-x-clip`.
          // `clip` rather than `hidden`, so no scroll container is created and the sticky
          // inspector keeps working.
          <div className="@container flex max-w-full flex-col overflow-x-clip">
            {!configured.length && !docs.length ? (
              <div className="px-4 py-20 text-center">
                <p className="text-sm font-medium">No sources yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-pretty text-muted-foreground">
                  Your portfolio is built from the places you already work. Connect one and it
                  keeps itself current.
                </p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <a href="#connect">Go to Connect</a>
                </Button>
              </div>
            ) : (
              <ul>
                {ordered.map((health) => (
                  <li key={health.key}>
                    <SourceRow
                      health={health}
                      selected={selected === health.key}
                      live={live}
                      refreshing={refreshing === health.key}
                      disabled={refreshing !== ''}
                      onSelect={() => setSelected(selected === health.key ? null : health.key)}
                      onRefresh={() => runPreview(health.key)}
                    />
                  </li>
                ))}

                {docs.map((doc) => (
                  <li key={doc.id}>
                    <DocumentRow document={doc} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */

function SummaryLine({ tone, count, label }) {
  return (
    <p className="flex items-baseline gap-2 text-sm">
      <StatusDot tone={tone} className="translate-y-[-1px]" />
      <span className="font-mono tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </p>
  )
}

/**
 * One source.
 *
 * Every value shown is `deriveHealth` output. Nothing is recomputed here — in particular
 * staleness, which is derived rather than stored precisely so that two screens cannot disagree
 * about whether a source is old.
 */
function SourceRow({ health, selected, live, refreshing, disabled, onSelect, onRefresh }) {
  const info = HEALTH_STATES[health.state] ?? HEALTH_STATES.error
  const connector = getConnector(health.key)
  const changed = health.recordsChanged
  const changedTotal = changed ? changed.added + changed.removed + changed.updated : 0

  return (
    <div
      className={cn(
        'screen-line-bottom flex items-center gap-3 px-4 py-3 transition-[background-color] ease-out hover:bg-accent-muted',
        selected && 'bg-accent-muted',
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <SourceMark name={connector?.icon} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{health.name}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <StatusDot tone={info.tone} />
              {info.label}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {health.message}
          </span>
        </span>

        <Meta
          className="hidden shrink-0 @2xl:flex"
          items={[
            health.account,
            health.recordsImported ? `${health.recordsImported} records` : null,
            health.lastSuccessfulAt ? `synced ${describeAge(health.ageDays)}` : 'never synced',
            changedTotal > 0
              ? [
                  changed.added ? `+${changed.added}` : '',
                  changed.updated ? `~${changed.updated}` : '',
                  changed.removed ? `−${changed.removed}` : '',
                ].filter(Boolean).join(' ')
              : null,
          ]}
        />
      </button>

      {/* Shown only when a refresh would actually do something. A connector with no `fetch` has
          nothing to re-run, and a button that quietly did nothing would be the exact dead
          control this admin is not allowed to have. */}
      {live && health.canRefresh && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          disabled={disabled}
          aria-label={`Fetch and preview ${health.name}`}
          onClick={onRefresh}
        >
          <Icon name={refreshing ? 'Loader2' : 'RefreshCw'} size={14} />
        </Button>
      )}
    </div>
  )
}

/**
 * The selected source, in full.
 *
 * The row is deliberately terse; this is where the things that only matter when something is
 * wrong live — the failed attempt that did not replace the last success, the retry time, the
 * warnings a partial import produced.
 */
function SourceInspector({ health, policy, onClose }) {
  const info = HEALTH_STATES[health.state] ?? HEALTH_STATES.error
  const capability = capabilitiesFor(health.key)
  const connector = getConnector(health.key)
  const changed = health.recordsChanged

  return (
    <>
      <Section title={health.name} description={health.message}>
        <div className="flex items-center gap-3">
          <SourceMark name={connector?.icon} />
          <Meta items={[info.label, health.account, capability && methodLabel(capability)]} />
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
        </div>
      </Section>

      <Section title="How it refreshes">
        <p className="text-xs text-pretty text-muted-foreground">{policy.summary}</p>
        <Meta items={[policy.method, policy.mode]} />
        {policy.webhook.providerSupports && (
          // Recorded rather than offered. The provider has webhooks; this project has nowhere
          // to receive one, and saying only the first half would be a promise.
          <p className="text-xs text-pretty text-muted-foreground/80">
            {policy.webhook.reason}
          </p>
        )}
      </Section>

      <Section title="Last run">
        <Meta
          className="flex-col !items-start"
          items={[
            health.lastSuccessfulAt
              ? `Last success ${describeAge(health.ageDays)}`
              : 'Never succeeded',
            // The state a plain "last synced" line hides, and exactly the one worth seeing.
            health.lastAttemptedAt && health.lastAttemptedAt !== health.lastSuccessfulAt
              ? `Last attempt failed (${when(health.lastAttemptedAt)})`
              : null,
            health.nextRetryAt ? `Retry after ${time(health.nextRetryAt)}` : null,
            health.durationMs ? `${(health.durationMs / 1000).toFixed(1)}s` : null,
            health.stale ? 'Data is stale' : null,
          ]}
        />
      </Section>

      {(health.recordsImported || changed) && (
        <Section title="Records">
          <Meta
            items={[
              health.recordsImported ? `${health.recordsImported} imported` : null,
              changed?.added ? `${changed.added} added` : null,
              changed?.updated ? `${changed.updated} updated` : null,
              changed?.removed ? `${changed.removed} removed` : null,
            ]}
          />
        </Section>
      )}

      {health.warnings?.length > 0 && (
        <Section title="Warnings">
          {health.warnings.map((warning) => (
            <p key={warning} className="text-xs text-pretty text-muted-foreground">{warning}</p>
          ))}
        </Section>
      )}

      {/* Only when the user can actually do something. `actionable` is the health model's own
          judgement, and it is what keeps "LinkedIn cannot be fetched" from nagging forever. */}
      {health.actionable && (
        <Section title="Needs attention">
          <Note tone="warn">{health.message}</Note>
        </Section>
      )}
    </>
  )
}

/** A document is a source too, and belongs in the same list. */
function DocumentRow({ document }) {
  const active = document.versions?.find((v) => v.versionId === document.activeVersion) ?? document.versions?.[0]
  const counts = Object.entries(active?.counts ?? {})
    .map(([collection, n]) => `${n} ${collection}`).join(' · ')

  return (
    <div className="screen-line-bottom flex items-center gap-3 px-4 py-3">
      <SourceMark name="FileText" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{document.label}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot tone="info" />
            Active
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {counts || 'Nothing extracted'}
        </p>
      </div>
      <Meta
        className="hidden shrink-0 @2xl:flex"
        items={[
          active?.filename,
          `updated ${when(active?.importedAt)}`,
          `${document.versions?.length} version${document.versions?.length === 1 ? '' : 's'}`,
        ]}
      />
    </div>
  )
}

/** @param {string|undefined} iso */
function when(iso) {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(days)) return iso
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return iso.slice(0, 10)
}

/** @param {string} iso */
function time(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
