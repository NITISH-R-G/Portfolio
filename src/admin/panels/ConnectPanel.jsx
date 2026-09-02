/**
 * "Connect anything."
 *
 * The screen a new person meets, built around one rule: **the user says what they have, and
 * the system works out what it is.** A profile link, a résumé, a JSON export, several links
 * at once — one input takes all of it.
 *
 * Nothing here knows about any specific platform. The grid, the fields, the hints and the
 * limits all come from `core/sources/capabilities.js`, which derives them from what each
 * connector already declares. That is deliberate: `if (github) … if (linkedin) …` scattered
 * through an interface is tolerable at five integrations and unmaintainable at fifty, and
 * every branch is a place a new connector gets forgotten.
 *
 * @module admin/panels/ConnectPanel
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { getConnector } from '../../connectors/index.js'
import { classifyInput, detectSource } from '../../core/sources/detect.js'
import { featuredCapabilities, allCapabilities, describeCapability } from '../../core/sources/capabilities.js'
import { Panel, Note } from '../fields.jsx'
import * as api from '../api.js'
import { isConfigured } from '../publish.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ConnectPanel({ builder }) {
  // Whether this deployment has a publishing Worker, so the dev-server notice below can say
  // what still works rather than only what does not.
  const publishing = isConfigured(builder.built.config)

  const { built } = builder
  const [live, setLive] = useState(null)
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [importLog, setImportLog] = useState('')

  const refresh = useCallback(async () => {
    try { setState(await api.getState()) } catch { setState(null) }
  }, [])

  useEffect(() => {
    api.isAvailable().then((available) => {
      setLive(available)
      if (available) refresh()
    })
  }, [refresh])

  const configured = state?.config?.dataSources ?? built.config.dataSources ?? {}
  const statuses = state?.status?.connectors ?? built.profile.meta?.sourceStatus ?? {}

  /* Actions ----------------------------------------------------------------- */

  const connect = useCallback(async (connectorId, config) => {
    setBusy(connectorId)
    setMessage(null)
    try {
      await api.saveConfig({ dataSources: { [connectorId]: config } })
      await refresh()
      setMessage({ tone: 'ok', text: `${getConnector(connectorId)?.name ?? connectorId} connected.` })
      return true
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
      return false
    } finally {
      setBusy('')
    }
  }, [refresh])

  const disconnect = async (connectorId) => {
    setBusy(connectorId)
    try {
      // An explicit null removes the key rather than writing an empty object, so the config
      // ends up as if the source had never been added.
      await api.saveConfig({ dataSources: { [connectorId]: null } })
      await refresh()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  const importAll = async () => {
    setBusy('import')
    setImportLog('')
    setMessage(null)
    try {
      const result = await api.runImport()
      setImportLog(result.output ?? '')
      await refresh()
      setMessage(result.ok
        ? { tone: 'ok', text: 'Import finished. Reload to see it on your portfolio.' }
        : { tone: 'warn', text: 'Import finished with problems — see the log below.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  /* ------------------------------------------------------------------------- */

  if (live === false) {
    return (
      <Panel title="Connect anything" description="Bring your professional identity together.">
        <Note tone="warn" icon="AlertTriangle">
          Connecting writes to <code>portfolio.config.js</code> and runs importers on your
          machine, so it only works while the dev server is running. Start it with{' '}
          <code>npm run dev</code> and open <code>/admin.html</code> from there — or run{' '}
          <code>npm run setup</code> in your terminal.
        </Note>
        {publishing && (
          // Connect is the first panel, so this warning is the first thing a deployed admin
          // shows — and on its own it reads as "none of this works here", which is wrong.
          // Editing and publishing are a different subsystem and are fully available.
          <Note icon="UploadCloud">
            Everything else still works here. Edit your content and settings as usual, then use
            the <strong>Save</strong> panel to publish them straight to GitHub — only adding new
            sources needs the dev server.
          </Note>
        )}
      </Panel>
    )
  }

  const connectedCount = Object.keys(configured).length + (state?.documents?.length ?? 0)

  return (
    <Panel
      title="Build your professional identity"
      description="Connect anything. Whether that turns out to be an API, a feed, a credential or a file is this project's problem, not yours."
    >
      {message && (
        <Note tone={message.tone === 'ok' ? 'info' : message.tone} icon={message.tone === 'ok' ? 'Check' : 'AlertTriangle'}>
          {message.text}
        </Note>
      )}

      <AddAnything onConnect={connect} onChanged={refresh} onMessage={setMessage} />

      <h3 className="admin-subheading">Or pick a platform</h3>
      <div className="platform-grid">
        {featuredCapabilities().map((capability) => (
          <PlatformTile
            key={capability.id}
            capability={capability}
            config={configured[capability.id]}
            status={statuses[capability.id]}
            busy={busy === capability.id}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        ))}
        <button type="button" className="platform-tile platform-tile-more" onClick={() => setShowAll((v) => !v)}>
          <Icon name={showAll ? 'ChevronUp' : 'Plus'} size={18} />
          <span className="platform-name">{showAll ? 'Fewer' : 'More'}</span>
        </button>
      </div>

      {showAll && (
        <div className="platform-grid">
          {allCapabilities().filter((c) => !c.featured).map((capability) => (
            <PlatformTile
              key={capability.id}
              capability={capability}
              config={configured[capability.id]}
              status={statuses[capability.id]}
              busy={busy === capability.id}
              onConnect={connect}
              onDisconnect={disconnect}
            />
          ))}
        </div>
      )}

      {connectedCount > 0 && (
        <>
          <h3 className="admin-subheading">Import your data</h3>
          <p className="field-help">
            Fetches everything you have connected. Sources that cannot be fetched are skipped
            with a reason, and one failing platform never affects the others.
          </p>
          <button type="button" className="btn-admin btn-admin-primary" disabled={busy !== ''} onClick={importAll}>
            <Icon name={busy === 'import' ? 'Loader2' : 'RefreshCw'} size={14} />
            {busy === 'import' ? 'Importing…' : 'Import now'}
          </button>
          {importLog && <pre className="import-log"><code>{importLog}</code></pre>}
        </>
      )}
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * One input for everything.
 *
 * Accepts typed text, pasted text and dropped files, and decides what each is by looking at
 * it. Making the user choose "link" or "file" or "paste" first would be asking them to
 * classify their own input before the system that is good at classifying has seen it.
 */
function AddAnything({ onConnect, onChanged, onMessage }) {
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const classification = text.trim() ? classifyInput(text) : null

  const submitFile = async (file) => {
    if (!file) return
    setBusy(true)
    onMessage(null)
    try {
      const result = await api.uploadDocument(file)
      if (!result.ok) {
        onMessage({ tone: 'warn', text: `${result.reason} ${result.hint ?? ''}`.trim() })
      } else {
        const counted = Object.entries(result.counts ?? {}).map(([c, n]) => `${n} ${c}`).join(', ')
        onMessage({
          tone: 'ok',
          text: result.outcome === 'unchanged'
            ? 'Already imported — identical to the active version.'
            : `Read ${counted || 'nothing'} from ${file.name}.`,
        })
      }
      await onChanged()
    } catch (err) {
      onMessage({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    const parsed = classifyInput(text)

    if (parsed.kind === 'urls') {
      const usable = (parsed.detections ?? []).filter((d) => d.outcome === 'matched' || d.outcome === 'website')
      if (!usable.length) {
        const first = parsed.detections?.[0]
        onMessage({ tone: 'warn', text: `${first?.message ?? 'Not recognised.'} ${first?.hint ?? ''}`.trim() })
        return
      }
      for (const [connectorId, config] of Object.entries(parsed.sources ?? {})) {
        await onConnect(connectorId, config)
      }
      setText('')
      return
    }

    if (parsed.kind === 'empty') return

    // Pasted document text goes through the same ingestion path as a dropped file, so a
    // résumé pasted from a PDF viewer gets identical provenance to one uploaded.
    setBusy(true)
    try {
      const file = new File([text], parsed.filename ?? 'pasted.txt', { type: 'text/plain' })
      await submitFile(file)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`add-anything${over ? ' add-anything-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); submitFile(e.dataTransfer.files?.[0]) }}
    >
      <label className="sr-only" htmlFor="add-anything-input">
        Paste a profile URL, or your résumé
      </label>
      <textarea
        id="add-anything-input"
        ref={inputRef}
        className="add-anything-input"
        rows={text.includes('\n') ? 6 : 2}
        placeholder={'Paste a profile URL, upload a résumé, or connect an account…\nhttps://github.com/your-name'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits a single line; a multi-line paste needs Enter for newlines, so
          // the modifier form always works.
          if (e.key === 'Enter' && (!text.includes('\n') || e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
        }}
      />

      <div className="add-anything-foot">
        <span className="add-anything-hint">
          {classification
            ? <><Icon name={iconFor(classification.kind)} size={13} /> {classification.label}</>
            : 'A link, a résumé, or several links at once. Drop a file anywhere here.'}
        </span>

        <span className="add-anything-actions">
          <button type="button" className="btn-admin btn-admin-ghost" onClick={() => document.getElementById('add-anything-file')?.click()}>
            <Icon name="Download" size={14} /> Choose a file
          </button>
          <button type="button" className="btn-admin btn-admin-primary" disabled={busy || !text.trim()} onClick={submit}>
            <Icon name={busy ? 'Loader2' : 'Plus'} size={14} /> {busy ? 'Reading…' : 'Add'}
          </button>
        </span>
      </div>

      <input
        id="add-anything-file"
        type="file"
        accept=".pdf,.docx,.md,.markdown,.txt,.json,.yaml,.yml,.zip"
        hidden
        onChange={(e) => submitFile(e.target.files?.[0])}
      />

      {classification?.detections?.length > 1 && (
        <ul className="detection-list">
          {classification.detections.map((detection, i) => (
            <li key={i} className={`detection detection-${detection.outcome}`}>
              <Icon name={detection.outcome === 'matched' ? 'Check' : detection.outcome === 'website' ? 'Globe' : 'AlertTriangle'} size={12} />
              {detection.outcome === 'matched'
                ? <>{getConnector(detection.connector)?.name} — <code>{detection.account}</code></>
                : detection.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** @param {string} kind */
function iconFor(kind) {
  return { urls: 'Link', json: 'Database', markdown: 'Type', text: 'Type', empty: 'Info' }[kind] ?? 'Info'
}

/**
 * One platform.
 *
 * Every label, field and hint is read from capability metadata, so adding a connector adds
 * a tile with no change here.
 */
function PlatformTile({ capability, config, status, busy, onConnect, onDisconnect }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const connected = Boolean(config)
  const connector = getConnector(capability.id)
  const field = capability.identifiers.find((i) => i.required)

  const submit = () => {
    if (!value.trim()) return
    // A pasted URL is understood even in a field that asked for a handle, so nobody has to
    // work out which this one wants.
    const detection = detectSource(value)
    const cfg = detection.outcome === 'matched' && detection.connector === capability.id
      ? detection.config
      : { [field?.key ?? 'profileUrl']: value.trim() }
    onConnect(capability.id, cfg)
    setValue('')
    setOpen(false)
  }

  if (connected) {
    return (
      <div className="platform-tile platform-tile-on">
        <Icon name={capability.icon} size={18} />
        <span className="platform-name">{capability.name}</span>
        <span className="platform-account">{connector?.identify?.(config) ?? '—'}</span>
        <span className="platform-state">{status ? shortState(status.state) : 'Not imported'}</span>
        <button type="button" className="platform-remove" disabled={busy}
          aria-label={`Disconnect ${capability.name}`} onClick={() => onDisconnect(capability.id)}>
          <Icon name="Trash2" size={12} />
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" className="platform-tile" onClick={() => setOpen(true)}>
        <Icon name={capability.icon} size={18} />
        <span className="platform-name">{capability.name}</span>
        <span className="platform-hint">{describeCapability(capability)}</span>
      </button>
    )
  }

  return (
    <div className="platform-tile platform-tile-open">
      <Icon name={capability.icon} size={18} />
      <span className="platform-name">{capability.name}</span>
      <input
        className="field-input"
        autoFocus
        placeholder={field?.placeholder ?? field?.label ?? 'Profile URL'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setOpen(false); setValue('') }
        }}
      />
      {field?.help && <span className="platform-hint">{field.help}</span>}
      {capability.authentication === 'required' && (
        <span className="platform-hint platform-hint-warn">
          Needs {capability.authEnv.join(' and ')} in .env.
        </span>
      )}
      <span className="platform-actions">
        <button type="button" className="btn-admin btn-admin-ghost" onClick={() => { setOpen(false); setValue('') }}>
          Cancel
        </button>
        <button type="button" className="btn-admin btn-admin-primary" disabled={busy || !value.trim()} onClick={submit}>
          Connect
        </button>
      </span>
    </div>
  )
}

/** @param {string} state */
function shortState(state) {
  return {
    imported: 'Connected', partial: 'Connected', manual: 'Entered by you',
    'link-only': 'Linked', empty: 'Nothing found', unavailable: 'Needs a key',
    skipped: 'Incomplete', error: 'Failed',
  }[state] ?? state
}

