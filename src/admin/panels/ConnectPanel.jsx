'use client'

/**
 * "Your professional identity is assembled from these sources."
 *
 * The screen a new person meets, built around one rule: **the user says what they have, and the
 * system works out what it is.** A profile link, a résumé, a JSON export, several links at once
 * — one input takes all of it, and the catalogue below is there for when you would rather browse
 * than type.
 *
 * Nothing here knows about any specific platform. The rows, the categories, the search index and
 * the action on each connector all come from `core/sources/*`, which derives them from what each
 * connector already declares. That is deliberate: `if (github) … if (linkedin) …` scattered
 * through an interface is tolerable at five integrations and unmaintainable at fifty, and every
 * branch is a place a new connector gets forgotten.
 *
 * The action is the load-bearing part. It is *derived*, never chosen: a platform with no readable
 * interface cannot produce a "Connect" button here, because `bestMethod` will not have returned
 * a rung that reaches one. LinkedIn and Google Scholar offer a profile URL, Kaggle asks for the
 * credential its API requires, Medium says it reads a feed. There is no way to render a control
 * this project cannot honour.
 *
 * @module admin/panels/ConnectPanel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlusIcon, SearchIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import Icon from '../icon.jsx'
import { getConnector } from '../../connectors/index.js'
import { classifyInput, detectSource } from '../../core/sources/detect.js'
import { allCapabilities, describeCapability } from '../../core/sources/capabilities.js'
import { Panel, Note } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import * as api from '../api.js'
import { isConfigured } from '../publish.js'
import { CategoryNav, Meta, SourceMark, StatusDot } from './source-ui.jsx'
import { actionFor, categories, filterConnectors, methodLabel } from './source-catalogue.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ConnectPanel({ builder }) {
  const publishing = isConfigured(builder.built.config)
  const { built } = builder

  const [live, setLive] = useState(null)
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)
  const [importLog, setImportLog] = useState('')

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)

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

  // Computed once: `allCapabilities()` walks every connector and sorts, and it cannot change
  // between renders because the registry is static.
  const all = useMemo(() => allCapabilities(), [])
  const groups = useMemo(() => categories(), [])
  const shown = useMemo(() => filterConnectors(all, { query, category }), [all, query, category])

  const connectedCount = Object.keys(configured).length

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

  const disconnect = useCallback(async (connectorId) => {
    setBusy(connectorId)
    try {
      // An explicit null removes the key rather than writing an empty object, so the config ends
      // up as if the source had never been added.
      await api.saveConfig({ dataSources: { [connectorId]: null } })
      await refresh()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }, [refresh])

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
        : { tone: 'warn', text: 'Import finished with problems — see the log.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusy('')
    }
  }

  /* ------------------------------------------------------------------------- */

  const active = selected ? all.find((c) => c.id === selected) : null

  return (
    <Panel
      workbench
      title="Connect"
      description="Your professional identity, assembled from the places you actually work."
    >
      <EditorLayout
        controls={
          <>
            {live === false && (
              <Section title="Not running">
                <Note tone="warn">
                  Connecting writes to <code>portfolio.config.js</code> and runs importers on your
                  machine, so it needs a dev session. Start one with <code>pnpm dev</code>.
                  {publishing && ' Editing and publishing work here regardless — see Save.'}
                </Note>
              </Section>
            )}

            {message && (
              <Section title="Last action">
                <Note tone={message.tone === 'ok' ? 'info' : message.tone}>{message.text}</Note>
              </Section>
            )}

            {active ? (
              <ConnectorInspector
                capability={active}
                config={configured[active.id]}
                status={statuses[active.id]}
                busy={busy === active.id}
                live={live}
                onConnect={connect}
                onDisconnect={disconnect}
                onClose={() => setSelected(null)}
              />
            ) : (
              <Section
                title="Pick a source"
                description="Choose a platform on the left, or paste a profile URL into the box at the top."
              >
                <Meta
                  items={[
                    `${all.length} platforms`,
                    `${connectedCount} connected`,
                    `${groups.length} categories`,
                  ]}
                />
              </Section>
            )}

            {connectedCount > 0 && live && (
              <Section
                title="Import"
                description="Fetches everything connected. A source that cannot be fetched is skipped with a reason, and one failure never affects the others."
              >
                <Button
                  size="sm"
                  className="gap-2 self-start"
                  disabled={busy !== ''}
                  onClick={importAll}
                >
                  <Icon name={busy === 'import' ? 'Loader2' : 'RefreshCw'} size={14} />
                  {busy === 'import' ? 'Importing…' : 'Import now'}
                </Button>
                {importLog && (
                  <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
                    <code>{importLog}</code>
                  </pre>
                )}
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
            <AddAnything
              onConnect={connect}
              onChanged={refresh}
              onMessage={setMessage}
              disabled={live === false}
            />

            <div className="screen-line-top screen-line-bottom flex items-center gap-2 px-4 py-2">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                placeholder={`Search ${all.length} platforms — try "rss", "publications", "api"…`}
                aria-label="Search platforms"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <Button variant="ghost" size="icon-xs" aria-label="Clear search" onClick={() => setQuery('')}>
                  <XIcon />
                </Button>
              )}
            </div>

            <CategoryNav
              value={category}
              onChange={setCategory}
              groups={groups}
              allCount={all.length}
            />

            {shown.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  No platform matches <span className="font-mono">{query}</span>.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setQuery(''); setCategory('') }}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <ul>
                {shown.map((capability) => (
                  <li key={capability.id}>
                    <ConnectorRow
                      capability={capability}
                      config={configured[capability.id]}
                      selected={selected === capability.id}
                      onSelect={() => setSelected(selected === capability.id ? null : capability.id)}
                    />
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

/**
 * One platform, as a row.
 *
 * A row rather than a tile because the interesting part is the second line — what this actually
 * does — and a grid of squares has nowhere to put it without becoming a wall of cards. The
 * screen lines are his; the mono metadata is his; the whole thing is one selectable band the
 * width of the canvas.
 */
function ConnectorRow({ capability, config, selected, onSelect }) {
  const connected = Boolean(config)
  const connector = getConnector(capability.id)
  const action = actionFor(capability, connected)

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'screen-line-bottom flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color] ease-out hover:bg-accent-muted',
        selected && 'bg-accent-muted',
      )}
    >
      <SourceMark name={capability.icon} />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{capability.name}</span>
          {connected && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StatusDot tone="ok" />
              {connector?.identify?.(config) ?? 'connected'}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {describeCapability(capability)}
        </span>
      </span>

      <Meta
        className="hidden shrink-0 @xl:flex"
        items={[methodLabel(capability), capability.data[0]]}
      />

      <span className="shrink-0 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        {connected ? 'Connected' : action.label}
      </span>
    </button>
  )
}

/**
 * The selected platform, in the inspector.
 *
 * Everything shown is something the connector declared. The form appears only when there is
 * genuinely something to type, and the button says what will actually happen — which for several
 * well-known platforms is "add a link", not "connect".
 */
function ConnectorInspector({ capability, config, status, busy, live, onConnect, onDisconnect, onClose }) {
  const connected = Boolean(config)
  const connector = getConnector(capability.id)
  const action = actionFor(capability, connected)
  const field = capability.identifiers.find((identifier) => identifier.required) ?? capability.identifiers[0]
  const [value, setValue] = useState('')

  const submit = () => {
    if (!value.trim()) return
    // A pasted URL is understood even in a field that asked for a handle, so nobody has to work
    // out which this one wants.
    const detection = detectSource(value)
    const next = detection.outcome === 'matched' && detection.connector === capability.id
      ? detection.config
      : { [field?.key ?? 'profileUrl']: value.trim() }
    onConnect(capability.id, next)
    setValue('')
  }

  return (
    <>
      <Section title={capability.name} description={capability.summary}>
        <div className="flex items-center gap-3">
          <SourceMark name={capability.icon} />
          <Meta items={[methodLabel(capability), capability.category, connected ? 'connected' : 'not connected']} />
          <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
        </div>

        <p className="text-xs text-pretty text-muted-foreground">{action.hint}</p>
      </Section>

      <Section title="What it imports">
        {capability.data.length ? (
          <div className="flex flex-wrap gap-1.5">
            {capability.data.map((label) => (
              <span
                key={label}
                className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[.6875rem] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing — it contributes a verified link.</p>
        )}

        {/* Stated because the connector states it, and because the limits are the reason several
            of these are a link rather than an import. */}
        {capability.limits && (
          <p className="text-xs text-pretty text-muted-foreground">{capability.limits}</p>
        )}
        {capability.rateLimit.known && (
          <Meta items={[capability.rateLimit.note]} />
        )}
      </Section>

      {connected ? (
        <Section title="Connected" description={status?.message}>
          <Meta
            items={[
              connector?.identify?.(config) ?? '—',
              status?.state,
              status?.counts && `${Object.values(status.counts).reduce((a, b) => a + b, 0)} records`,
            ]}
          />
          <Button
            variant="destructive"
            size="sm"
            className="gap-2 self-start"
            disabled={busy || live === false}
            aria-label={`Disconnect ${capability.name}`}
            onClick={() => onDisconnect(capability.id)}
          >
            <Trash2Icon />
            Disconnect
          </Button>
        </Section>
      ) : (
        <Section title={action.label}>
          {/* No form for a credential: the value belongs in `.env`, not in a browser field that
              would put it through an HTTP request and into the config file. */}
          {action.needs === 'credential' ? (
            <Note tone="warn">
              Set <code>{capability.authEnv.join('</code> and <code>')}</code> in your{' '}
              <code>.env</code>, then connect. The credential stays on your machine — it is never
              sent to this admin or written to the config.
            </Note>
          ) : (
            <>
              <Input
                className="h-8"
                placeholder={field?.placeholder ?? field?.label ?? 'Profile URL'}
                aria-label={`${capability.name} ${field?.label ?? 'profile URL'}`}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
              />
              {field?.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
            </>
          )}

          <Button
            size="sm"
            className="gap-2 self-start"
            disabled={busy || live === false || (action.needs !== 'credential' && !value.trim())}
            onClick={submit}
          >
            <PlusIcon />
            {action.label}
          </Button>
        </Section>
      )}
    </>
  )
}

/**
 * One input for everything.
 *
 * Accepts typed text, pasted text and dropped files, and decides what each is by looking at it.
 * Making the user choose "link" or "file" or "paste" first would be asking them to classify their
 * own input before the system that is good at classifying has seen it.
 */
function AddAnything({ onConnect, onChanged, onMessage, disabled }) {
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

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

    // Pasted document text goes through the same ingestion path as a dropped file, so a résumé
    // pasted from a PDF viewer gets identical provenance to one uploaded.
    setBusy(true)
    try {
      await submitFile(new File([text], parsed.filename ?? 'pasted.txt', { type: 'text/plain' }))
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'screen-line-bottom flex flex-col gap-2 px-4 py-4 transition-[background-color]',
        over && 'bg-accent-muted',
      )}
      onDragOver={(event) => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); submitFile(event.dataTransfer.files?.[0]) }}
    >
      <label className="sr-only" htmlFor="add-anything-input">
        Paste a profile URL, or your résumé
      </label>
      <textarea
        id="add-anything-input"
        className="min-h-16 w-full resize-none bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/70"
        rows={text.includes('\n') ? 6 : 2}
        placeholder={'Paste a profile URL, drop a résumé, or connect an account…\nhttps://github.com/your-name'}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter submits a single line; a multi-line paste needs Enter for newlines, so the
          // modifier form always works.
          if (event.key === 'Enter' && (!text.includes('\n') || event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submit()
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Meta
          className="flex-1"
          items={[classification ? classification.label : 'A link, a résumé, or several links at once.']}
        />

        <Button variant="ghost" size="sm" className="gap-1.5" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <UploadIcon />
          Choose a file
        </Button>
        <Button size="sm" className="gap-1.5" disabled={disabled || busy || !text.trim()} onClick={submit}>
          <Icon name={busy ? 'Loader2' : 'Plus'} size={14} />
          {busy ? 'Reading…' : 'Add'}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.md,.markdown,.txt,.json,.yaml,.yml,.zip"
        hidden
        onChange={(event) => submitFile(event.target.files?.[0])}
      />

      {classification?.detections?.length > 1 && (
        <>
          <Separator />
          <ul className="flex flex-col gap-1">
            {classification.detections.map((detection, index) => (
              <li key={index} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <StatusDot tone={detection.outcome === 'matched' ? 'ok' : detection.outcome === 'website' ? 'info' : 'warn'} />
                {detection.outcome === 'matched'
                  ? <>{getConnector(detection.connector)?.name} — {detection.account}</>
                  : detection.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
