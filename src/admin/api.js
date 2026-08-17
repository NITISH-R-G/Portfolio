/**
 * Talking to the dev server's local write API.
 *
 * Present during `npm run dev` and absent everywhere else, so every call has to cope with
 * not being answered. When it is missing the builder degrades to what it always did —
 * compute the change, show it, and let the user paste it into a file — rather than
 * pretending a save happened.
 *
 * @module admin/api
 */

const BASE = '/__portfolio'

/**
 * Whether the local write API is reachable.
 *
 * Probed once and cached: it cannot appear mid-session, since it exists only when the dev
 * server is the thing serving this page.
 *
 * @type {Promise<boolean>|null}
 */
let availability = null

export function isAvailable() {
  availability ??= fetch(`${BASE}/state`, { method: 'GET' })
    .then((res) => res.ok)
    .catch(() => false)
  return availability
}

/**
 * @param {string} route
 * @param {unknown} [body]
 * @returns {Promise<any>}
 */
async function call(route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status}).`)
  return payload
}

/** Config and documents as they are on disk, which the browser bundle cannot see. */
export const getState = () => call('/state')

/**
 * Merge a patch into `portfolio.config.js`.
 *
 * A patch rather than the whole config, so settings the builder has no UI for are never at
 * risk of being dropped by a save.
 *
 * @param {Record<string, unknown>} config
 */
export const saveConfig = (config) => call('/config', { config })

/** @param {Record<string, unknown>} overrides */
export const saveOverrides = (overrides) => call('/overrides', { overrides })

/**
 * Upload and ingest a document.
 *
 * @param {File} file
 * @param {string} [type]
 */
export async function uploadDocument(file, type) {
  const buffer = await file.arrayBuffer()
  return call('/document', {
    filename: file.name,
    type,
    contentBase64: toBase64(buffer),
  })
}

/** @param {string} id @param {string} versionId */
export const activateVersion = (id, versionId) => call('/document/activate', { id, versionId })

/** @param {string} id */
export const deleteDocument = (id) => call('/document/delete', { id })

/** @param {string[]} [only] */
export const runImport = (only) => call('/import', only?.length ? { only } : {})

/**
 * Base64 without blowing the argument limit.
 *
 * `String.fromCharCode(...bytes)` on a multi-megabyte PDF exceeds the maximum argument
 * count and throws, so the array is walked in chunks.
 *
 * @param {ArrayBuffer} buffer
 */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
