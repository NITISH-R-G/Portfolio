'use client'

/**
 * What the sync service is actually doing, as the admin shows it.
 *
 * Two surfaces. `SyncServiceSection` is the service as a whole: where it lives, which of its
 * mechanisms have *really delivered*, what it last did and whether that reached the site.
 * `SyncMechanisms` is per source: how this particular source can update and what the service
 * has observed about it.
 *
 * The rule throughout is the one `core/sync/capability` enforces — **configured is not working**.
 * A webhook that has never delivered is shown as "nothing received yet", not as active, and the
 * only latency ever printed is one the service measured end to end. If the service cannot be
 * reached, that is what the screen says; it never falls back to showing last-known numbers as
 * though they were current.
 *
 * @module admin/panels/sync-status
 */

import { useEffect, useState } from 'react'

import { normalizeSyncStatus, statusUrlOf } from '../../core/sync/status.js'
import { Note, TextField } from '../fields.jsx'
import { Section } from '../preview/editor-layout.jsx'
import { Meta } from './source-ui.jsx'

const POLL_MS = 60_000
const TIMEOUT_MS = 8_000

/** What went wrong, in words someone setting this up can act on. */
function explain(error) {
  if (error?.name === 'AbortError') return `The sync service did not answer within ${TIMEOUT_MS / 1000} seconds.`
  if (error instanceof TypeError) {
    return 'Could not reach the sync service. Check the address, that it is deployed, and that its ADMIN_ORIGIN setting allows this page.'
  }
  return `The sync service answered, but not with a status (${error?.message ?? 'unknown error'}).`
}

/**
 * Read `GET {endpoint}/sync/status`, now and every minute.
 *
 * The result is keyed by the endpoint it came from, so changing the address never shows the old
 * service's numbers under the new one. `idle` and `loading` are *derived* rather than set, which
 * keeps every `setState` inside an async callback — nothing is written synchronously from an
 * effect, so there is no extra render and no chance of a stale value flashing up.
 *
 * Nothing is sent that identifies the owner: no credentials, no cookies, no referrer.
 *
 * @param {string|undefined} endpoint
 * @returns {{phase: 'idle'|'loading'|'ok'|'error', status: import('../../core/sync/status.js').SyncStatus|null, error: string|null, at: number|null}}
 */
export function useSyncStatus(endpoint) {
  const [result, setResult] = useState({ endpoint: undefined, phase: 'idle', status: null, error: null, at: null })

  useEffect(() => {
    if (!endpoint) return undefined
    let cancelled = false
    let controller

    const load = async () => {
      controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const response = await fetch(statusUrlOf(endpoint), {
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: { accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const status = normalizeSyncStatus(await response.json())
        if (!status) throw new Error('the response is not a sync status')
        if (!cancelled) setResult({ endpoint, phase: 'ok', status, error: null, at: Date.now() })
      } catch (error) {
        // Keep the previous status out of it: an error replaces what was shown, so stale
        // numbers cannot sit under a banner that says the service is unreachable.
        if (!cancelled) setResult({ endpoint, phase: 'error', status: null, error: explain(error), at: Date.now() })
      } finally {
        clearTimeout(timer)
      }
    }

    load()
    const interval = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      controller?.abort()
      clearInterval(interval)
    }
  }, [endpoint])

  if (!endpoint) return { phase: 'idle', status: null, error: null, at: null }
  if (result.endpoint !== endpoint) return { phase: 'loading', status: null, error: null, at: null }
  return result
}

/** "3 minutes ago" / "in 2 minutes", from an ISO time. */
export function ago(iso, now = Date.now()) {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const seconds = Math.round(Math.abs(now - ms) / 1000)
  const unit =
    seconds < 90 ? `${seconds} second${seconds === 1 ? '' : 's'}`
    : seconds < 5400 ? `${Math.round(seconds / 60)} minutes`
    : seconds < 129_600 ? `${Math.round(seconds / 3600)} hours`
    : `${Math.round(seconds / 86_400)} days`
  return ms <= now ? `${unit} ago` : `in ${unit}`
}

const seconds = (ms) => `${Math.round(ms / 1000)} s`

/**
 * The service as a whole.
 *
 * @param {{
 *   endpointDraft: string,
 *   endpoint: string|undefined,
 *   onEndpointChange: (value: string) => void,
 *   sync: ReturnType<typeof useSyncStatus>,
 * }} props
 */
export function SyncServiceSection({ endpointDraft, endpoint, onEndpointChange, sync }) {
  // Typed text that the engine did not accept as an address. Said, rather than silently ignored,
  // because "nothing happens" is the worst answer to a pasted URL.
  const rejected = endpointDraft.trim() !== '' && !endpoint

  return (
    <Section
      title="Sync service"
      description="Optional. Lets a source tell your portfolio when it changed, instead of waiting for the weekly rebuild."
    >
      <TextField
        label="Service address"
        value={endpointDraft}
        placeholder="https://portfolio-sync.your-name.workers.dev"
        onChange={onEndpointChange}
        help="Only used to read its status. Setting it enables nothing on its own."
      />
      {rejected && (
        <Note tone="warn">
          That is not a usable address. It must be https, with no username, query or fragment.
        </Note>
      )}

      {!endpoint && !rejected && (
        <Note>
          No sync service is configured, so sources refresh weekly and on every push to{' '}
          <code>main</code>. To update when a source changes, deploy <code>workers/sync</code> — see{' '}
          <code>docs/sync-service.md</code>.
        </Note>
      )}

      {endpoint && sync.phase === 'loading' && <p className="text-xs text-muted-foreground">Asking the service…</p>}
      {endpoint && sync.phase === 'error' && <Note tone="warn">{sync.error}</Note>}
      {endpoint && sync.phase === 'ok' && <SyncStatusBody status={sync.status} />}
    </Section>
  )
}

function SyncStatusBody({ status }) {
  const { webhook, eventsPoll } = status.mechanisms

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Webhook</dt>
        <dd>
          {!webhook.configured
            ? 'Not configured on the service — it refuses every delivery.'
            : webhook.lastSeenAt
              ? `Working — last delivery ${ago(webhook.lastSeenAt)}.`
              : 'Configured, but nothing has been received yet.'}
        </dd>

        <dt className="text-muted-foreground">Polling</dt>
        <dd>
          {!eventsPoll.enabled
            ? 'Switched off.'
            : eventsPoll.lastPolledAt
              ? `Running — last checked ${ago(eventsPoll.lastPolledAt)}${eventsPoll.consecutiveFailures ? `, failing (${eventsPoll.consecutiveFailures} in a row)` : ''}.`
              : 'Enabled, but has not run yet.'}
        </dd>

        <dt className="text-muted-foreground">Last change</dt>
        <dd>
          {status.lastEventAt
            ? `${ago(status.lastEventAt)}${status.lastVia ? `, by ${status.lastVia === 'events-poll' ? 'polling' : status.lastVia}` : ''}`
            : 'None seen yet.'}
        </dd>

        <dt className="text-muted-foreground">Last rebuild</dt>
        <dd>
          {!status.lastDispatch
            ? 'None requested yet.'
            : !status.lastPublish
              ? `Requested ${ago(status.lastDispatch.at)}. The result is not known — the service only learns it if it subscribes to workflow runs.`
              : status.lastPublish.conclusion === 'success'
                ? `Live ${ago(status.lastPublish.completedAt)}${status.lastPublish.latencyMs != null ? ` — ${seconds(status.lastPublish.latencyMs)} after the first change` : ''}.`
                : `${status.lastPublish.conclusion ?? 'unknown'} ${ago(status.lastPublish.completedAt) ?? ''}. The previous version of the site is still live.`}
          {status.lastPublish?.runUrl && (
            <>
              {' '}
              <a className="underline underline-offset-2" href={status.lastPublish.runUrl} target="_blank" rel="noreferrer noopener">
                View the run
              </a>
            </>
          )}
        </dd>
      </dl>

      {status.pending?.stalled && (
        <Note tone="warn">
          A rebuild could not be requested after {status.pending.attempts} attempts and the service
          has stopped retrying on its own. It will try once more at the next change.
          {status.lastFailure?.error ? ` Last error: ${status.lastFailure.error}` : ''}
        </Note>
      )}
      {status.pending && !status.pending.stalled && (
        <p className="text-xs text-muted-foreground">
          {status.pending.count} change{status.pending.count === 1 ? '' : 's'} waiting
          {status.pending.retryAt ? `, next attempt ${ago(status.pending.retryAt)}` : ' for the next rebuild'}.
        </p>
      )}
    </div>
  )
}

/**
 * How one source can update, and what has actually been seen. Rendered only for a source that
 * declares a mechanism; for every other source the existing "How it refreshes" line already says
 * everything there is to say, and repeating it would be noise.
 *
 * @param {{description: import('../../core/sync/capability.js').SyncDescription}} props
 */
export function SyncMechanisms({ description }) {
  if (description.mechanisms.length === 0) return null

  const label = { observed: 'working', unverified: 'not seen yet', 'not-deployed': 'needs the sync service' }

  return (
    <Section title="How it updates" description={description.summary}>
      <Meta items={[`Now: ${description.effective === 'events-poll' ? 'polling' : description.effective}`, description.latency]} />
      <ul className="flex flex-col gap-2">
        {description.mechanisms.map((mechanism) => (
          <li key={mechanism.kind} className="rounded-lg border p-2.5 text-xs">
            <p className="font-medium">
              {mechanism.kind === 'webhook' ? 'Webhook' : 'Polling'}{' '}
              <span className="font-mono text-[0.6875rem] text-muted-foreground">{label[mechanism.status]}</span>
            </p>
            <p className="mt-0.5 text-pretty text-muted-foreground">{mechanism.latency}</p>
            {mechanism.blindTo && (
              <p className="mt-0.5 text-pretty text-muted-foreground">
                Cannot see: {mechanism.blindTo.join(', ')}.
              </p>
            )}
            {mechanism.status === 'not-deployed' && mechanism.setup && (
              <p className="mt-0.5 text-pretty text-muted-foreground/80">To enable: {mechanism.setup}</p>
            )}
          </li>
        ))}
      </ul>
      {description.observedLatencyMs !== undefined && (
        <p className="text-xs text-muted-foreground">
          Measured: the last change was live {seconds(description.observedLatencyMs)} after it happened.
        </p>
      )}
    </Section>
  )
}
