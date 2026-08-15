/**
 * Helpers shared by connector implementations.
 *
 * Everything here exists because it was needed by three or more connectors. Anything used
 * by only one belongs in that connector's own directory.
 *
 * @module connectors/support
 */

/**
 * Build the provenance stamp attached to every imported record.
 *
 * This is what makes the "evidence, not claims" promise checkable: a number on the page can
 * be traced back to the connector that fetched it, the URL it came from, and when. Sections
 * render it as the "sourced from" line when `privacy.showDataProvenance` is on.
 *
 * @param {string} connector
 * @param {string|undefined} url
 * @param {number} now
 * @returns {{connector: string, url?: string, fetchedAt: string}}
 */
export function stamp(connector, url, now) {
  return {
    connector,
    ...(url ? { url } : {}),
    fetchedAt: new Date(now).toISOString(),
  }
}

/**
 * Read a required identifier from a connector's config, tolerating the forms users
 * actually paste: a bare handle, an `@handle`, or the full profile URL.
 *
 * Accepting a pasted URL is not politeness — it is the single most common setup mistake,
 * and rejecting it would send the user to the docs to learn a distinction that does not
 * matter to them.
 *
 * @param {Record<string, unknown>} cfg
 * @param {string[]} keys      Config keys to try, in order.
 * @param {RegExp} [fromUrl]   Capture group 1 extracts the handle from a profile URL.
 * @returns {string|undefined}
 */
export function handle(cfg, keys, fromUrl) {
  for (const key of keys) {
    const raw = cfg?.[key]
    if (typeof raw !== 'string') continue
    let value = raw.trim()
    if (!value) continue
    if (fromUrl && /^https?:\/\//i.test(value)) {
      const match = fromUrl.exec(value)
      if (match?.[1]) return decodeURIComponent(match[1]).replace(/\/+$/, '')
      continue
    }
    value = value.replace(/^@/, '').replace(/\/+$/, '')
    if (value) return value
  }
  return undefined
}

/**
 * Read a list-shaped config value. Accepts an array or a comma-separated string, because
 * both are natural to type and the wizard writes one while a hand-editor writes the other.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function list(value) {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean)
  }
  return []
}

/**
 * Coerce to a finite non-negative number, or `undefined`.
 *
 * Used on every count a platform reports. Upstream APIs return `null`, `"1,234"` and
 * `"N/A"` in fields documented as integers; a portfolio must show nothing rather than
 * "NaN" or a fabricated zero.
 *
 * @param {unknown} value
 * @returns {number|undefined}
 */
export function count(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s]/g, '')
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Normalize an upstream timestamp to `YYYY-MM-DD`.
 * @param {unknown} value
 * @returns {string|undefined}
 */
export function isoDay(value) {
  if (typeof value === 'number') {
    // Several APIs return Unix seconds; anything below this threshold cannot be milliseconds.
    const ms = value < 1e11 ? value * 1000 : value
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined
  }
  if (typeof value !== 'string' || !value.trim()) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined
}

/**
 * Strip `undefined` keys so generated JSON stays small and its diffs stay reviewable —
 * these files are committed, and a refresh should produce a readable diff.
 *
 * @template {Record<string, unknown>} T
 * @param {T} obj
 * @returns {T}
 */
export function clean(obj) {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key]
  }
  return obj
}

/**
 * A skill entry with the evidence that justifies it.
 *
 * The evidence line is the whole point: "Python — 24 repositories, 180k bytes" is a
 * verifiable statement, "Expert in Python" is not. `core/generate/skills.js` merges
 * evidence across connectors, so several sources can independently support one skill.
 *
 * @param {string} name
 * @param {object} options
 * @param {string} [options.category]
 * @param {number} [options.weight]
 * @param {string} options.label       Human-readable evidence, e.g. "24 repositories".
 * @param {number} [options.evidenceCount]
 * @param {string} options.connector
 * @param {string} [options.url]
 * @param {number} options.now
 */
export function skillWithEvidence(name, options) {
  return clean({
    name,
    category: options.category,
    weight: options.weight,
    evidence: [clean({
      label: options.label,
      count: options.evidenceCount,
      connector: options.connector,
      url: options.url,
    })],
    source: stamp(options.connector, options.url, options.now),
  })
}

/**
 * Build a `Metric` — a labelled figure shown beside a record.
 *
 * @param {string} label
 * @param {number|string|undefined} value
 * @param {{note?: string, numeric?: number}} [extra]
 * @returns {{label: string, value: string, numeric?: number, note?: string}|undefined}
 */
export function metric(label, value, extra = {}) {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = typeof value === 'number' ? value : count(value)
  return clean({
    label,
    value: typeof value === 'number' ? formatNumber(value) : String(value),
    numeric: extra.numeric ?? numeric,
    note: extra.note,
  })
}

/**
 * Compact a large count the way a reader expects to see it (1_250 → "1.3k").
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (abs >= 1_000) return `${trim(value / 1_000)}k`
  return String(value)
}

/** One decimal place, but never a trailing ".0". */
function trim(n) {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * Drop `undefined` entries from an array built with conditional expressions, and return
 * `undefined` rather than `[]` so `clean` removes the key entirely.
 *
 * @template T
 * @param {(T|undefined|null|false)[]} items
 * @returns {T[]|undefined}
 */
export function some(items) {
  const out = items.filter(Boolean)
  return out.length ? /** @type {T[]} */ (out) : undefined
}
