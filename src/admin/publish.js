/**
 * Publishing from the browser.
 *
 * The client half of `workers/admin`. It is deliberately thin — it holds no credentials,
 * makes no decisions about what may be written, and cannot name a file the Worker has not
 * already agreed to accept. Every security property of this feature lives on the far side of
 * these calls; if this module were replaced wholesale by an attacker's version, the Worker
 * would refuse it just the same.
 *
 * ## What "publishing" means here
 *
 * The same two files the Save panel has always produced, committed for you instead of copied
 * by you. The commit lands on your deploy branch, the existing GitHub Actions workflow builds
 * it, and Pages serves the result. There is no second pipeline and no new source of truth —
 * the button replaces a copy-paste step, not the architecture.
 *
 * ## When it is not configured
 *
 * `config.admin.api` is empty in a default clone, and that is a working state, not a broken
 * one: `isConfigured()` returns false, the Publish panel never appears, and the builder does
 * exactly what it did before. Publishing is additive.
 *
 * @module admin/publish
 */

import { applyClears, hasContent, mergeDeep, mergeOverrides } from './drafts.js'

/** The paths the Worker will accept. Mirrored here only to build the payload. */
export const PUBLISHABLE = Object.freeze({
  overrides: 'src/data/overrides.json',
  config: 'src/data/config.json',
  manual: 'src/data/manual.json',
})

/**
 * @param {Record<string, any>} config
 * @returns {string}
 */
export function apiOrigin(config) {
  const raw = config?.admin?.api ?? ''
  return typeof raw === 'string' ? raw.replace(/\/+$/, '') : ''
}

/** @param {Record<string, any>} config */
export const isConfigured = (config) => apiOrigin(config).length > 0

/**
 * @param {string} origin
 * @param {string} route
 * @param {RequestInit} [init]
 */
async function call(origin, route, init = {}) {
  const response = await fetch(`${origin}${route}`, {
    // Without this the session cookie is not sent, because the Worker is a different origin
    // from the page. It is the one line that makes the whole cookie design work.
    credentials: 'include',
    ...init,
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed (${response.status}).`)
    error.status = response.status
    throw error
  }
  return body
}

/**
 * Who is signed in, and what the repository currently holds.
 *
 * A network failure is reported as "unknown" rather than "signed out": those are different
 * states, and conflating them shows a Sign in button to someone who is already signed in and
 * merely offline.
 *
 * @param {Record<string, any>} config
 * @returns {Promise<{authenticated: boolean, user?: string, repository?: string, head?: string,
 *   files?: Record<string, string|null>, offline?: boolean, error?: string}>}
 */
export async function getSession(config) {
  const origin = apiOrigin(config)
  if (!origin) return { authenticated: false }
  try {
    return await call(origin, '/api/session')
  } catch (error) {
    return { authenticated: false, offline: true, error: error.message }
  }
}

/**
 * Send the browser to GitHub to sign in.
 *
 * A full navigation rather than a popup: popups are blocked by default in enough browsers
 * that a sign-in button which silently does nothing is a realistic outcome, and the editor's
 * state is in localStorage so leaving the page loses nothing.
 *
 * @param {Record<string, any>} config
 */
export function signIn(config) {
  const origin = apiOrigin(config)
  if (!origin) return
  const back = encodeURIComponent(`${window.location.pathname}${window.location.hash}`)
  window.location.href = `${origin}/auth/login?return=${back}`
}

/** @param {Record<string, any>} config */
export const signOut = (config) => call(apiOrigin(config), '/auth/logout', { method: 'POST' })

/**
 * Commit the current draft.
 *
 * `head` is the commit the editor was looking at when it loaded the session. Sending it back
 * is what makes two people — or two tabs — saving at once safe: the Worker refuses rather than
 * quietly overwriting whichever save arrived first.
 *
 * @param {Record<string, any>} config
 * @param {{files: {path: string, content: string}[], head?: string}} payload
 * @returns {Promise<{commit: string, url: string, unchanged?: boolean}>}
 */
export function publish(config, payload) {
  return call(apiOrigin(config), '/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/**
 * Turn the builder's drafts into the files to commit.
 *
 * The draft is a *patch*, not a document: it holds only what this browser changed. Publishing it
 * verbatim would delete every setting published from another browser or an earlier session, so
 * each file is the committed content with the draft merged on top — through the same two merge
 * functions the live preview uses, so what is committed is exactly what was on screen.
 *
 * The committed side comes from the repository via the session, not from the build-time
 * snapshot, so it is current even if the site has not been rebuilt since the last publish.
 *
 * Only changed files are included. The Worker would refuse a no-op as an empty commit anyway,
 * but it would cost three blob uploads to find that out, and the diff a person reads later
 * should show what they actually touched.
 *
 * @param {{overrides: Record<string, unknown>, configDraft: Record<string, unknown>}} builder
 * @param {Record<string, string|null>} [committed] Current file contents, from the session.
 * @returns {{path: string, content: string}[]}
 */
export function filesToPublish(builder, committed = {}) {
  const candidates = [
    {
      path: PUBLISHABLE.overrides,
      value: mergeOverrides(parse(committed[PUBLISHABLE.overrides]) ?? {}, builder.overrides ?? {}),
    },
    {
      path: PUBLISHABLE.config,
      value: mergeDeep(parse(committed[PUBLISHABLE.config]) ?? {}, builder.configDraft ?? {}),
    },
  ]

  return candidates
    // `applyClears` before `compact`: the first turns "the user emptied this" into an absence,
    // the second drops the empty containers that may be left behind. Order matters — compacting
    // first would see the marker as content and keep the branch alive.
    .map(({ path, value }) => ({ path, value: compact(applyClears(value)) }))
    // An empty document for a file that does not exist yet is not a change. Without this,
    // editing only the theme would offer to commit an empty `overrides.json` alongside it,
    // and the user would be shown a file they never touched.
    .filter(({ path, value }) => hasContent(value) || typeof committed[path] === 'string')
    .map(({ path, value }) => ({ path, content: `${JSON.stringify(value ?? {}, null, 2)}\n` }))
    .filter(({ path, content }) => normalize(committed[path]) !== normalize(content))
}

/**
 * Drop branches that hold nothing.
 *
 * `mergeOverrides` materialises all six override buckets whether or not they are used, so a
 * merge with an empty draft returns a document that differs from the committed file only by a
 * handful of `{}`. Without this the panel would offer to publish a change nobody made — and
 * would keep offering it, because publishing it changes nothing.
 *
 * @param {unknown} value
 */
function compact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const out = {}
  for (const [key, inner] of Object.entries(value)) {
    if (!hasContent(inner)) continue
    out[key] = compact(inner)
  }
  return out
}

/**
 * Compare by parsed value, not by text.
 *
 * A file committed with different key ordering or indentation is the same configuration, and
 * offering to publish it would present the user with a change they did not make.
 *
 * @param {string|null|undefined} text
 */
function normalize(text) {
  if (typeof text !== 'string') return null
  try {
    return stableStringify(JSON.parse(text))
  } catch {
    // Unparseable on disk: treat as different so publishing repairs it.
    return `invalid:${text}`
  }
}

/**
 * Parse a committed file, treating "absent" and "malformed" alike.
 *
 * Malformed is deliberately not an error: the draft is then merged onto nothing and publishing
 * repairs the file, which is better than refusing to touch a file that is already broken.
 *
 * @param {string|null|undefined} text
 */
function parse(text) {
  if (typeof text !== 'string') return null
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** @param {unknown} value @returns {string} */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
