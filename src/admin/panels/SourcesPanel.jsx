/**
 * Your sources.
 *
 * Once ten sources are connected, "did that work?" stops being answerable by reading
 * scrollback. This is the standing answer: what each source is, when it last actually
 * succeeded, what it brought in, and what changed since last time.
 *
 * The organising idea is that **most rows need nothing from you**. LinkedIn cannot be
 * fetched and never will be; that is settled, not a problem. So states are sorted by
 * whether the user can act on them, and the ones that can are the ones that stand out.
 *
 * @module admin/panels/SourcesPanel
 */

import { useCallback, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { CONNECTORS, connectorGroups, getConnector } from '../../connectors/index.js'
import { deriveHealth, summarize, isSuccess, HEALTH_STATES, describeAge } from '../../core/sources/health.js'
import { Panel, Note } from '../fields.jsx'
import * as api from '../api.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function SourcesPanel({ builder }) {
  const { built, documents } = builder
  const [live, setLive] = useState(null)
  const [state, setState] = useState(null)
  const [refreshing, setRefreshing] = useState('')
  const [log, setLog] = useState('')
  const [showAll, setShowAll] = useState(false)

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

  const healths = configured.map(([key, cfg]) => deriveHealth({
    key,
    connector: getConnector(key),
    status: statuses[key],
    config: cfg,
  }))

  // Sources needing attention first — that is the reason to open this page at all. The same
  // three buckets the summary counts, so the headline and the order agree.
  const ordered = [...healths].sort((a, b) => {
    const rank = (h) => (h.actionable ? 0 : isSuccess(h.state) ? 1 : 2)
    return rank(a) - rank(b) || a.name.localeCompare(b.name)
  })

  const summary = summarize(healths)

  const runRefresh = async (only) => {
    setRefreshing(only ?? 'all')
    setLog('')
    try {
      const result = await api.runImport(only ? [only] : undefined)
      setLog(result.output ?? '')
      await refresh()
    } catch (err) {
      setLog(err.message)
    } finally {
      setRefreshing('')
    }
  }

  return (
    <Panel
      title="Your sources"
      description="Where your portfolio's data comes from, and whether each one is actually working."
    >
      <div className="health-summary">
        <span className="health-stat">
          <strong>{summary.connected}</strong> connected
        </span>
        {summary.attention > 0 && (
          <span className="health-stat health-stat-warn">
            <strong>{summary.attention}</strong> need{summary.attention === 1 ? 's' : ''} attention
          </span>
        )}
        {summary.informational > 0 && (
          <span className="health-stat health-stat-muted">
            <strong>{summary.informational}</strong> informational
          </span>
        )}
        <span className="health-stat health-stat-muted">
          <strong>{summary.records}</strong> records
        </span>

        {live && (
          <button
            type="button"
            className="btn-admin btn-admin-primary health-refresh"
            disabled={refreshing !== ''}
            onClick={() => runRefresh()}
          >
            <Icon name={refreshing === 'all' ? 'Loader2' : 'RefreshCw'} size={14} />
            {refreshing === 'all' ? 'Refreshing…' : 'Refresh all'}
          </button>
        )}
      </div>

      {!configured.length && (
        <Note tone="warn" icon="Info">
          No sources are configured yet. Start on the <a href="#connect">Connect</a> screen.
        </Note>
      )}

      {live === false && (
        <Note icon="Info">
          Refreshing runs the importer, which needs the dev server. Run <code>npm run import</code>{' '}
          in your terminal instead.
        </Note>
      )}

      <div className="health-list">
        {ordered.map((health) => (
          <SourceRow
            key={health.key}
            health={health}
            connector={getConnector(health.key)}
            live={live}
            refreshing={refreshing === health.key}
            disabled={refreshing !== ''}
            onRefresh={() => runRefresh(health.key)}
          />
        ))}

        {(state?.documents ?? documents ?? []).map((doc) => (
          <DocumentRow key={doc.id} document={doc} />
        ))}
      </div>

      {log && <pre className="import-log"><code>{log}</code></pre>}

      <div className="admin-panel-head" style={{ marginTop: '2rem' }}>
        <h3 className="admin-panel-title">Available connectors</h3>
        <p className="admin-panel-description">
          {CONNECTORS.length} platforms. Add one on the <a href="#connect">Connect</a> screen,
          or by putting its id under <code>dataSources</code>.
        </p>
      </div>

      <button type="button" className="btn-admin btn-admin-ghost" onClick={() => setShowAll((v) => !v)}>
        {showAll ? 'Hide' : 'Show all'} <Icon name={showAll ? 'ChevronUp' : 'ChevronDown'} size={14} />
      </button>

      {showAll && (
        <div className="connector-catalogue">
          {connectorGroups().map((group) => (
            <section key={group.category} className="connector-group">
              <h4 className="connector-group-label">{group.label}</h4>
              {group.connectors.map((connector) => (
                <div key={connector.id} className="connector-row">
                  <Icon name={connector.icon} size={16} />
                  <div className="connector-row-body">
                    <p className="connector-row-title">
                      <code>{connector.id}</code> — {connector.name}
                      {config.dataSources?.[connector.id] && <span className="connector-active">in use</span>}
                    </p>
                    <p className="connector-row-summary">{connector.summary}</p>
                    <p className="connector-row-limits">{connector.limits}</p>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * One source.
 *
 * @param {{
 *   health: import('../../core/sources/health.js').SourceHealth,
 *   connector: any, live: boolean|null, refreshing: boolean, disabled: boolean,
 *   onRefresh: () => void,
 * }} props
 */
function SourceRow({ health, connector, live, refreshing, disabled, onRefresh }) {
  const info = HEALTH_STATES[health.state] ?? HEALTH_STATES.error
  const changed = health.recordsChanged
  const changedTotal = changed ? changed.added + changed.removed + changed.updated : 0

  return (
    <article className={`health-row health-row-${info.tone}`}>
      <span className="health-icon"><Icon name={connector?.icon ?? 'Link'} size={18} /></span>

      <div className="health-body">
        <p className="health-name">
          {health.name}
          <span className={`health-badge health-badge-${info.tone}`}>{info.label}</span>
        </p>

        {health.account && <p className="health-account">{health.account}</p>}
        <p className="health-message">{health.message}</p>

        <p className="health-meta">
          {health.recordsImported ? <span>{health.recordsImported} records</span> : null}
          {health.lastSuccessfulAt ? (
            <span>Last synced {describeAge(health.ageDays)}</span>
          ) : (
            <span>Never synced</span>
          )}
          {/* "Attempted but not succeeded" is the state a plain "last synced" line hides,
              and it is exactly the one worth seeing. */}
          {health.lastAttemptedAt && health.lastAttemptedAt !== health.lastSuccessfulAt && (
            <span className="health-meta-warn">Last tried {formatWhen(health.lastAttemptedAt)}</span>
          )}
          {health.nextRetryAt && <span>Retry after {formatTime(health.nextRetryAt)}</span>}
          {changedTotal > 0 && (
            <span className="health-changed">
              {[
                changed.added ? `+${changed.added}` : '',
                changed.updated ? `~${changed.updated}` : '',
                changed.removed ? `−${changed.removed}` : '',
              ].filter(Boolean).join(' ')} since last sync
            </span>
          )}
          {health.durationMs ? <span>{(health.durationMs / 1000).toFixed(1)}s</span> : null}
        </p>

        {health.warnings?.map((warning) => (
          <p key={warning} className="health-warning">{warning}</p>
        ))}
      </div>

      <div className="health-actions">
        {live && health.canRefresh && (
          <button type="button" className="btn-admin btn-admin-ghost" disabled={disabled} onClick={onRefresh}>
            <Icon name={refreshing ? 'Loader2' : 'RefreshCw'} size={14} />
            {refreshing ? '…' : 'Refresh'}
          </button>
        )}
      </div>
    </article>
  )
}

/** A document is a source too, and belongs in the same list. */
function DocumentRow({ document }) {
  const active = document.versions?.find((v) => v.versionId === document.activeVersion) ?? document.versions?.[0]
  const counts = Object.entries(active?.counts ?? {})
    .map(([collection, n]) => `${n} ${collection}`).join(' · ')

  return (
    <article className="health-row health-row-info">
      <span className="health-icon"><Icon name="Download" size={18} /></span>
      <div className="health-body">
        <p className="health-name">
          {document.label}
          <span className="health-badge health-badge-info">Active</span>
        </p>
        <p className="health-account">{active?.filename}</p>
        <p className="health-message">{counts || 'Nothing extracted'}</p>
        <p className="health-meta">
          <span>Updated {formatWhen(active?.importedAt)}</span>
          <span>
            {document.versions?.length} version{document.versions?.length === 1 ? '' : 's'}
          </span>
          <span>{active?.extraction}</span>
        </p>
      </div>
    </article>
  )
}

/** @param {string|undefined} iso */
function formatWhen(iso) {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(days)) return iso
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return iso.slice(0, 10)
}

/** @param {string} iso */
function formatTime(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
