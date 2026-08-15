/**
 * Builder state.
 *
 * The layered model that makes refreshing safe: imported data is never edited in place.
 * The builder only ever writes two *patch* documents, and the pipeline composes them on
 * top of whatever the connectors most recently produced:
 *
 *   connector output  →  manual.json  →  config identity  →  overrides  →  what you see
 *
 * So `npm run import` can replace every source file and a user's corrections survive
 * intact, because the corrections were never mixed into the source data in the first
 * place. This is the whole reason `applyOverrides` exists rather than a "save edited
 * profile" button.
 *
 * @module admin/state
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildPortfolio } from '../core/generate/build.js'
import { recordKey } from '../core/schema/merge.js'
import { DRAFT_KEY, CONFIG_DRAFT_KEY, loadFileConfig, loadSourceLayers, loadImportStatus, loadDocuments } from '../core/load.js'

/** Vite resolves these at build time; the browser never fetches them. */
const manualModules = import.meta.glob('/src/data/manual.json', { eager: true })
const overrideModules = import.meta.glob('/src/data/overrides.json', { eager: true })

/** @param {Record<string, any>} modules @param {string} path */
const moduleDefault = (modules, path) => modules[path]?.default ?? modules[path]

/**
 * @typedef {object} Builder
 * @property {import('../core/generate/build.js').BuiltPortfolio} built
 *   The live preview — exactly what the site would render with the current drafts.
 * @property {import('../core/schema/merge.js').Overrides} overrides
 * @property {Record<string, any>} configDraft
 * @property {{key: string, profile: any}[]} sources
 * @property {{generatedAt?: string, connectors?: Record<string, any>}} status
 * @property {boolean} dirty
 * @property {(path: string, value: unknown) => void} setConfig
 * @property {(field: string, value: unknown) => void} setIdentity
 * @property {(network: string, url: string) => void} setSocial
 * @property {(collection: string, id: string, patch: Record<string, unknown>) => void} patchRecord
 * @property {(collection: string, id: string) => void} toggleHidden
 * @property {(collection: string, id: string) => boolean} isHidden
 * @property {(collection: string, ids: string[]) => void} setOrder
 * @property {(collection: string, id: string, direction: -1|1) => void} move
 * @property {() => void} reset
 * @property {(collection: string, id: string) => void} revert
 */

/**
 * @returns {Builder}
 */
export function useBuilder() {
  const [overrides, setOverrides] = useState(() => read(DRAFT_KEY, {}))
  const [configDraft, setConfigDraft] = useState(() => read(CONFIG_DRAFT_KEY, {}))

  const fileConfig = useMemo(() => loadFileConfig(), [])
  const sources = useMemo(() => loadSourceLayers(), [])
  const documents = useMemo(() => loadDocuments(), [])
  const status = useMemo(() => loadImportStatus() ?? {}, [])
  const manual = useMemo(() => moduleDefault(manualModules, '/src/data/manual.json'), [])
  const savedOverrides = useMemo(() => moduleDefault(overrideModules, '/src/data/overrides.json'), [])

  // Persist on every change so a closed tab never loses work. localStorage is synchronous
  // and these documents are small, so there is nothing to debounce.
  useEffect(() => write(DRAFT_KEY, overrides), [overrides])
  useEffect(() => write(CONFIG_DRAFT_KEY, configDraft), [configDraft])

  /**
   * The preview runs the *real* pipeline, not a simplified version of it. That is what
   * makes "Review your portfolio" trustworthy: section auto-detection, ranking, skill
   * derivation and SEO here are the same code paths the built site uses.
   */
  const built = useMemo(() => buildPortfolio({
    config: mergeDeep(fileConfig, configDraft),
    sources,
    documents,
    manual,
    overrides: mergeOverrides(savedOverrides, overrides),
    status: status.connectors,
  }), [fileConfig, configDraft, sources, documents, manual, savedOverrides, overrides, status])

  const setConfig = useCallback((path, value) => {
    setConfigDraft((draft) => setPath(draft, path, value))
  }, [])

  const setIdentity = useCallback((field, value) => {
    setOverrides((draft) => ({
      ...draft,
      identity: prune({ ...draft.identity, [field]: value }),
    }))
  }, [])

  const setSocial = useCallback((network, url) => {
    setOverrides((draft) => ({
      ...draft,
      socials: prune({ ...draft.socials, [network]: url }),
    }))
  }, [])

  const patchRecord = useCallback((collection, id, patch) => {
    setOverrides((draft) => {
      const records = { ...(draft.records ?? {}) }
      const bucket = { ...(records[collection] ?? {}) }
      const next = prune({ ...bucket[id], ...patch })
      // An empty patch is deleted rather than stored, so reverting a field leaves no trace
      // in the exported file and the record goes back to whatever the connector says.
      if (Object.keys(next).length) bucket[id] = next
      else delete bucket[id]
      if (Object.keys(bucket).length) records[collection] = bucket
      else delete records[collection]
      return { ...draft, records }
    })
  }, [])

  const toggleHidden = useCallback((collection, id) => {
    setOverrides((draft) => {
      const hidden = { ...(draft.hidden ?? {}) }
      const list = new Set(hidden[collection] ?? [])
      if (list.has(id)) list.delete(id)
      else list.add(id)
      if (list.size) hidden[collection] = [...list]
      else delete hidden[collection]
      return { ...draft, hidden }
    })
  }, [])

  const isHidden = useCallback(
    (collection, id) => Boolean(overrides.hidden?.[collection]?.includes(id)),
    [overrides],
  )

  const setOrder = useCallback((collection, ids) => {
    setOverrides((draft) => ({
      ...draft,
      order: { ...draft.order, [collection]: ids },
    }))
  }, [])

  /**
   * Move a record one position within its collection.
   *
   * Reordering writes the *whole* current order rather than just the moved id, because a
   * partial pin list would let the ranking algorithm reshuffle everything around it on the
   * next import — the user would move one card and find three others had moved too.
   */
  const move = useCallback((collection, id, direction) => {
    const current = (built.profile[collection] ?? []).map((r) => recordKey(collection, r))
    const index = current.indexOf(id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= current.length) return
    const next = [...current]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(collection, next)
  }, [built, setOrder])

  const revert = useCallback((collection, id) => {
    setOverrides((draft) => {
      const records = { ...(draft.records ?? {}) }
      if (records[collection]) {
        const bucket = { ...records[collection] }
        delete bucket[id]
        if (Object.keys(bucket).length) records[collection] = bucket
        else delete records[collection]
      }
      const hidden = { ...(draft.hidden ?? {}) }
      if (hidden[collection]) {
        const list = hidden[collection].filter((x) => x !== id)
        if (list.length) hidden[collection] = list
        else delete hidden[collection]
      }
      return { ...draft, records, hidden }
    })
  }, [])

  /**
   * Record which source wins for one disputed fact.
   *
   * Keyed by the conflict's stable id rather than by the value, so the decision keeps
   * applying after the next import re-asserts the rejected value — which is the entire
   * reason for storing a decision instead of just editing the field.
   */
  const resolveConflict = useCallback((conflictId, choice) => {
    setOverrides((draft) => ({
      ...draft,
      resolutions: { ...draft.resolutions, [conflictId]: choice },
    }))
  }, [])

  const clearResolution = useCallback((conflictId) => {
    setOverrides((draft) => {
      const resolutions = { ...draft.resolutions }
      delete resolutions[conflictId]
      const next = { ...draft, resolutions }
      if (!Object.keys(resolutions).length) delete next.resolutions
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setOverrides({})
    setConfigDraft({})
  }, [])

  const dirty = useMemo(
    () => hasContent(overrides) || hasContent(configDraft),
    [overrides, configDraft],
  )

  return {
    built, overrides, configDraft, sources, documents, status, dirty,
    setConfig, setIdentity, setSocial, patchRecord, toggleHidden, isHidden,
    setOrder, move, reset, revert, resolveConflict, clearResolution,
  }
}

/* -------------------------------------------------------------------------- */

/** @param {string} key @param {any} fallback */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

/** @param {string} key @param {any} value */
function write(key, value) {
  try {
    if (hasContent(value)) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  } catch {
    // A full or disabled localStorage costs the user persistence, not their session.
  }
}

/** Recursively true when an object holds anything other than empty containers. */
export function hasContent(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value !== 'object') return true
  return Object.values(value).some(hasContent)
}

/** Drop empty values so a cleared field leaves nothing behind in the export. */
function prune(object) {
  const out = {}
  for (const [key, value] of Object.entries(object ?? {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && !value.length) continue
    out[key] = value
  }
  return out
}

/**
 * Immutably set a dotted path, e.g. `setPath(draft, 'theme.accent', '#f00')`.
 * @param {Record<string, any>} object
 * @param {string} path
 * @param {unknown} value
 */
export function setPath(object, path, value) {
  const [head, ...rest] = path.split('.')
  const next = { ...object }
  if (!rest.length) {
    if (value === undefined || value === '') delete next[head]
    else next[head] = value
    return next
  }
  next[head] = setPath(next[head] ?? {}, rest.join('.'), value)
  if (!hasContent(next[head])) delete next[head]
  return next
}

/** Read a dotted path, falling back through a second object. */
export function getPath(object, path, fallback) {
  const value = path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), object)
  return value === undefined ? fallback : value
}

/** @param {any} base @param {any} patch */
function mergeDeep(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base
  const out = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeDeep(out[key], value)
      : value
  }
  return out
}

/** Combine committed overrides with the in-browser draft, draft winning. */
function mergeOverrides(saved, draft) {
  if (!hasContent(draft)) return saved
  if (!saved) return draft
  return {
    identity: { ...saved.identity, ...draft.identity },
    socials: { ...saved.socials, ...draft.socials },
    order: { ...saved.order, ...draft.order },
    resolutions: { ...saved.resolutions, ...draft.resolutions },
    records: mergeBuckets(saved.records, draft.records),
    hidden: mergeLists(saved.hidden, draft.hidden),
  }
}

function mergeBuckets(a, b) {
  const out = { ...(a ?? {}) }
  for (const [collection, patches] of Object.entries(b ?? {})) {
    out[collection] = { ...(out[collection] ?? {}), ...patches }
  }
  return out
}

function mergeLists(a, b) {
  const out = { ...(a ?? {}) }
  for (const [collection, ids] of Object.entries(b ?? {})) {
    out[collection] = [...new Set([...(out[collection] ?? []), ...ids])]
  }
  return out
}
