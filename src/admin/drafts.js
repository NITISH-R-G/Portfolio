/**
 * Draft merging, without React.
 *
 * These functions decide how an in-browser draft combines with what is already committed, and
 * two very different callers need them: the live preview in `state.js`, and the Publish panel
 * that turns a draft into files. Sharing one implementation is what guarantees that what gets
 * committed is what was on screen — and keeping them here, free of hooks and of Vite's
 * `import.meta.glob`, is what lets the security suite import the publishing logic under plain
 * Node.
 *
 * @module admin/drafts
 */

/** Recursively true when an object holds anything other than empty containers. */
export function hasContent(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value !== 'object') return true
  return Object.values(value).some(hasContent)
}

/** Drop empty values so a cleared field leaves nothing behind in the export. */
export function prune(object) {
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

/**
 * Exported because publishing must send exactly what the preview showed. If the Publish panel
 * merged the draft onto the committed file by its own rules, the two could disagree — and the
 * disagreement would only surface after a commit.
 *
 * @param {any} base @param {any} patch
 */
export function mergeDeep(base, patch) {
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
export function mergeOverrides(saved, draft) {
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
