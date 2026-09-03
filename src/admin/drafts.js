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

/**
 * "This field was deliberately emptied", as a value a draft can carry.
 *
 * A draft is a patch: it holds only what this browser changed, and a merge applies it over what
 * is already committed. Which means *removing* a key from the draft cannot express a deletion —
 * it is indistinguishable from never having touched the field, and the committed value wins. So
 * clearing a published headline did nothing at all: the box emptied, Save reported a change,
 * and the merge put the old text straight back.
 *
 * The marker is a value rather than an absence, so it survives the merge and can be acted on
 * afterwards. `applyClears` is what turns it back into an absence, and it runs at both points
 * where a draft stops being a draft — the live preview and the published file — so the marker
 * itself never reaches the profile or the repository.
 *
 * A `\u0000`-prefixed string because it must be distinguishable from every legitimate value a
 * field can hold, and no portfolio field contains a null byte.
 */
export const CLEARED = '\u0000cleared'

/**
 * Strip cleared fields, turning the marker back into the absence it stands for.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function applyClears(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return /** @type {any} */ (value.filter((item) => item !== CLEARED).map(applyClears))

  const out = {}
  for (const [key, inner] of Object.entries(value)) {
    if (inner === CLEARED) continue
    out[key] = applyClears(inner)
  }
  return /** @type {any} */ (out)
}

/**
 * Whether two drafts describe the same edits.
 *
 * Compared by value with keys sorted, not by `JSON.stringify` order, because the two sides are
 * built at different times and by different code paths — one is what the editor holds now, the
 * other was serialised when a publish succeeded. Key order between those is not stable and
 * carries no meaning.
 *
 * @param {unknown} a @param {unknown} b
 * @returns {boolean}
 */
export function sameDraft(a, b) {
  return stableString(a ?? {}) === stableString(b ?? {})
}

/** @param {unknown} value @returns {string} */
function stableString(value) {
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`
  if (value && typeof value === 'object') {
    // Code-unit order, stated explicitly. `Object.keys` yields strings, so `<`/`>` compare by
    // UTF-16 code unit — identical to the default comparator, and deliberately *not*
    // `localeCompare`: this is a canonical form, so the ordering only has to be total and the
    // same everywhere. A locale-aware comparator would make it depend on the machine's ICU
    // data, which is the one property a canonicalisation cannot afford to lose.
    return `{${Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .filter((key) => hasContent(value[key]) || value[key] === CLEARED)
      .map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Recursively true when an object holds anything other than empty containers. */
export function hasContent(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value !== 'object') return true
  return Object.values(value).some(hasContent)
}

/**
 * Normalise an override bucket, recording emptied fields rather than dropping them.
 *
 * Same reasoning as `setPath`: these buckets are merged over committed overrides, so a removed
 * key restores the committed value instead of clearing it. An empty array is still dropped —
 * an empty list and no list mean the same thing for `hidden` and `order`.
 */
export function prune(object) {
  const out = {}
  for (const [key, value] of Object.entries(object ?? {})) {
    if (Array.isArray(value) && !value.length) continue
    if (value === undefined || value === null || value === '') {
      out[key] = CLEARED
      continue
    }
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
    // `CLEARED`, not `delete`. See the constant: dropping the key makes "I emptied this" look
    // exactly like "I never touched this", and the committed value wins.
    if (value === undefined || value === '') next[head] = CLEARED
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
