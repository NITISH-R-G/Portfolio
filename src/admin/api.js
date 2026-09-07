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

/**
 * Where the API lives.
 *
 * The route contract is unchanged — `/__portfolio/state`, `/__portfolio/import` and the rest
 * are exactly what they were — but the origin is no longer this page's. The API used to be
 * middleware inside the Vite dev server, so a relative path found it; the app is now a static
 * Next export with nowhere to put a write endpoint, and the API is a separate local process.
 *
 * `NEXT_PUBLIC_ADMIN_API` is what points at that process, and it is inlined at build time.
 * In a production export it is simply not set, which is the mechanism that keeps the deployed
 * admin from advertising an API that cannot exist: no origin, no probe, no controls that
 * pretend to save.
 */
const ORIGIN = process.env.NEXT_PUBLIC_ADMIN_API ?? ''
const BASE = ORIGIN ? `${ORIGIN}/__portfolio` : ''

/**
 * A header a cross-site form cannot set.
 *
 * Sending it is what forces a CORS preflight on every mutation, and the sidecar answers that
 * preflight only for the admin's own origin. Must match `ADMIN_HEADER` in
 * `scripts/lib/adminApi.mjs`.
 */
const ADMIN_HEADER = 'x-portfolio-admin'

/**
 * Whether the local write API is reachable.
 *
 * Probed once and cached: it cannot appear mid-session, since it exists only when a dev
 * session is running alongside this page.
 *
 * @type {Promise<boolean>|null}
 */
let availability = null

export function isAvailable() {
  // No configured origin means there is nothing to ask. Probing anyway would spend a failed
  // request on every deployed admin load to learn what the build already knows.
  if (!BASE) return Promise.resolve(false)

  availability ??= fetch(`${BASE}/state`, { method: 'GET', headers: { [ADMIN_HEADER]: '1' } })
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
  if (!BASE) throw new Error('The local admin API is not running.')

  const res = await fetch(`${BASE}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', [ADMIN_HEADER]: '1' },
    // Nothing here is authenticated by a cookie, and sending one to a local process that has
    // no use for it would only widen what a mistake could reach.
    credentials: 'omit',
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
