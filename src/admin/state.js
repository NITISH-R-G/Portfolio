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
import { applyClears, hasContent, prune, sameDraft, setPath, mergeDeep, mergeOverrides } from './drafts.js'
import { DRAFT_KEY, CONFIG_DRAFT_KEY, PUBLISHED_KEY, loadFileConfig, loadSourceLayers, loadImportStatus, loadDocuments } from '../core/load.js'

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
 * @property {() => void} markPublished
 * @property {(collection: string, id: string) => void} revert
 */

/**
 * @returns {Builder}
 */
export function useBuilder() {
  const [overrides, setOverrides] = useState(() => read(DRAFT_KEY, {}))
  const [configDraft, setConfigDraft] = useState(() => read(CONFIG_DRAFT_KEY, {}))
  // The drafts as they stood when a publish last succeeded. See `dirty` below for why this
  // exists rather than the drafts simply being cleared.
  const [published, setPublished] = useState(() => read(PUBLISHED_KEY, {}))

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
  useEffect(() => write(PUBLISHED_KEY, published), [published])

  /**
   * The preview runs the *real* pipeline, not a simplified version of it. That is what
   * makes "Review your portfolio" trustworthy: section auto-detection, ranking, skill
   * derivation and SEO here are the same code paths the built site uses.
   */
  const built = useMemo(() => buildPortfolio({
    // `applyClears` at both merge points, so a field the user emptied previews as empty rather
    // than showing the sentinel — and so the preview matches what publishing will commit.
    config: applyClears(mergeDeep(fileConfig, configDraft)),
    sources,
    documents,
    manual,
    overrides: applyClears(mergeOverrides(savedOverrides, overrides)),
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
    // The snapshot goes too. It records "these drafts are already committed", and with no
    // drafts left there is nothing for it to vouch for — keeping it would leave an empty
    // editor comparing itself against edits it no longer holds, and reporting them unsaved.
    setPublished({})
  }, [])

  /**
   * Record that the current drafts have been committed.
   *
   * Called by the Save panel when the Worker confirms a commit. Deliberately not a reset: the
   * page was built before the publish, so `fileConfig` does not contain the change yet and
   * clearing the drafts would make the preview snap back to the old value until the site
   * rebuilds — which looks exactly like the publish having been undone.
   */
  const markPublished = useCallback(() => {
    setPublished({ overrides, config: configDraft })
  }, [overrides, configDraft])

  /**
   * Whether this browser holds edits that are not saved anywhere.
   *
   * It used to ask whether the drafts were *non-empty*, which is a different question and
   * answered the wrong one after a successful publish: the drafts stay in localStorage so the
   * preview keeps showing the change until the site rebuilds, so the badge read "unsaved"
   * forever — while the Save panel, which compares against the repository, correctly said
   * there was nothing left to publish. Two true statements about two different questions, and
   * only one of them was the question the badge claimed to answer.
   *
   * So it now compares the drafts against the snapshot taken when a publish last succeeded.
   * Editing anything after that makes them differ again immediately, which is the ability to
   * spot genuinely unsaved work that this has to keep.
   */
  const dirty = useMemo(
    () => !sameDraft(overrides, published.overrides) || !sameDraft(configDraft, published.config),
    [overrides, configDraft, published],
  )

  return {
    built, overrides, configDraft, sources, documents, status, dirty,
    setConfig, setIdentity, setSocial, patchRecord, toggleHidden, isHidden,
    setOrder, move, reset, revert, resolveConflict, clearResolution, markPublished,
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

/**
 * Draft merging lives in `drafts.js` so the Publish panel can share it without dragging React
 * and Vite's glob resolution along. Re-exported here because every existing caller imports
 * these from `state.js`.
 */
export { hasContent, setPath, getPath, mergeDeep, mergeOverrides, applyClears, CLEARED } from './drafts.js'
