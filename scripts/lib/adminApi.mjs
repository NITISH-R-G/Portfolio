/**
 * The builder's hands, without a transport.
 *
 * A static site has no backend, which is the point — it deploys anywhere and depends on
 * nothing. But it also means the admin can compute a perfect answer and then have no way to
 * save it, so every change becomes copy-a-blob-into-a-file. That is survivable for occasional
 * tweaks and fatal for onboarding: nobody connects eight accounts by hand-editing a config
 * file eight times.
 *
 * This module is the answer to "what should happen", and knows nothing about how the request
 * arrived. Until the Next migration the same logic lived inside a Vite plugin
 * (`server.middlewares.use`), and when `vite.config.js` was deleted the whole write API went
 * with it — the admin kept calling `/__portfolio/*` and nothing answered, so every connect,
 * import and disconnect control silently did nothing. Separating the handlers from the
 * transport is what stops that happening again: the sidecar in `scripts/dev-api.mjs` is a
 * thin socket around these functions, and a future server-side deployment can be another.
 *
 * The safety properties that make a local write API acceptable:
 *
 *   - it is never part of the static export, and never shipped to production;
 *   - it writes only to a fixed set of known paths, never a path taken from the request;
 *   - it refuses any origin but the one the admin is actually served from;
 *   - it is your own machine, running your own checkout, editing your own files.
 *
 * @module scripts/lib/adminApi
 */

import { ingestDocument } from '../../src/core/documents/ingest.js'
import { addVersion, readRecord } from '../../src/core/documents/store.js'
import { PATHS, writeJson, readJson, relative, fs, path } from './portfolio.mjs'
import { patchConfigFile, readUserConfig, writeConfigFile } from './configFile.mjs'

/** Requests larger than this are refused rather than buffered. */
export const MAX_BODY = 12 * 1024 * 1024

/**
 * A header the admin sends and a form cannot.
 *
 * This is the CSRF defence. A cross-site `<form>` can POST to any URL without the browser
 * asking anyone's permission, but it cannot set a custom header — attempting one forces a
 * CORS preflight, which this server answers only for the admin's own origin. The old Vite
 * middleware did not need this because it was same-origin with the page; a sidecar on its
 * own port is cross-origin by construction, so the protection has to be explicit.
 */
export const ADMIN_HEADER = 'x-portfolio-admin'

/**
 * Every endpoint, and whether it changes anything.
 *
 * Declared rather than inferred from the method so the two can be checked against each
 * other: a mutating route reachable by GET would be one `<img src>` away from a CSRF, and
 * this table is what the test asserts against.
 *
 * @type {{route: string, method: 'GET'|'POST', mutating: boolean, summary: string}[]}
 */
export const ROUTES = [
  { route: '/state', method: 'GET', mutating: false, summary: 'Config, documents and import status as they are on disk.' },
  { route: '/config', method: 'POST', mutating: true, summary: 'Merge a patch into portfolio.config.js. Connect and disconnect both land here.' },
  { route: '/overrides', method: 'POST', mutating: true, summary: 'Replace src/data/overrides.json.' },
  { route: '/document', method: 'POST', mutating: true, summary: 'Ingest an uploaded résumé or export.' },
  { route: '/document/activate', method: 'POST', mutating: true, summary: 'Pin a different version of a document.' },
  { route: '/document/delete', method: 'POST', mutating: true, summary: 'Remove a document record.' },
  { route: '/import', method: 'POST', mutating: true, summary: 'Run the connector import. Refresh is this with `only`.' },
]

/** @type {Map<string, typeof ROUTES[number]>} */
const BY_ROUTE = new Map(ROUTES.map((r) => [r.route, r]))

/* -------------------------------------------------------------------------- */
/* Request admission                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Whether a request is allowed to reach a handler at all.
 *
 * Pure, and separated from dispatch, because these are the checks worth testing exhaustively
 * — every one of them is the only thing standing between "a local convenience" and "any page
 * you visit can rewrite your portfolio config".
 *
 * @param {object} request
 * @param {string} [request.method]
 * @param {string} [request.route]
 * @param {string} [request.origin]       The `Origin` header, if any.
 * @param {string} [request.host]         The `Host` header, if any.
 * @param {string} [request.contentType]
 * @param {boolean} [request.marked]      Whether the admin header was present.
 * @param {string[]} allowedOrigins
 * @returns {{ok: true, route: typeof ROUTES[number]}|{ok: false, status: number, error: string}}
 */
export function checkRequest(request, allowedOrigins) {
  const { method, route, origin, host, contentType, marked } = request

  // Host is checked before anything else because it is the DNS-rebinding vector: a hostname
  // an attacker controls, resolving to 127.0.0.1, makes their page same-origin with this
  // server and every other check moot. Only names that cannot be pointed anywhere else are
  // accepted.
  if (!isLocalHost(host)) {
    return { ok: false, status: 403, error: 'This API answers only on localhost.' }
  }

  // An absent Origin is refused rather than trusted. Browsers always send one cross-origin,
  // so the only things it lets through are non-browser clients — and a local API that any
  // process on the machine can drive without a browser is a wider door than it needs.
  if (!origin) {
    return { ok: false, status: 403, error: 'An Origin header is required.' }
  }
  if (!allowedOrigins.includes(origin)) {
    return { ok: false, status: 403, error: `Origin ${origin} is not allowed.` }
  }

  // Not "any localhost port". The old check accepted every local origin, which was sound
  // when the API shared an origin with the page and is not now: another dev server on
  // another port is a different application, and some of them run other people's code.
  if (!marked) {
    return { ok: false, status: 403, error: `The ${ADMIN_HEADER} header is required.` }
  }

  const known = BY_ROUTE.get(route ?? '')
  if (!known) return { ok: false, status: 404, error: `No such endpoint: ${route}` }

  if (method !== known.method) {
    return { ok: false, status: 405, error: `Use ${known.method} for ${known.route}.` }
  }

  // A JSON content type is what makes the preflight above non-optional: `text/plain` is a
  // CORS-simple type and would let a form through without one.
  if (known.method === 'POST' && !/^application\/json\b/i.test(contentType ?? '')) {
    return { ok: false, status: 415, error: 'Expected application/json.' }
  }

  return { ok: true, route: known }
}

/**
 * Run one admitted request.
 *
 * @param {{method: string, route: string, body?: unknown}} request
 * @returns {Promise<unknown>}
 */
export async function dispatch({ route, body }) {
  switch (route) {
    case '/state': return readState()
    case '/config': return saveConfig(body)
    case '/overrides': return saveOverrides(body)
    case '/document': return saveDocument(body)
    case '/document/activate': return activateVersion(body)
    case '/document/delete': return deleteDocument(body)
    case '/import': return runImport(body)
    default: throw new Error(`No such endpoint: ${route}`)
  }
}

/**
 * Admission plus dispatch, as one call.
 *
 * @param {Parameters<typeof checkRequest>[0] & {body?: unknown}} request
 * @param {string[]} allowedOrigins
 * @returns {Promise<{status: number, payload: unknown}>}
 */
export async function handleAdminRequest(request, allowedOrigins) {
  const admitted = checkRequest(request, allowedOrigins)
  if (!admitted.ok) return { status: admitted.status, payload: { error: admitted.error } }

  try {
    return { status: 200, payload: await dispatch({ ...request, route: admitted.route.route }) }
  } catch (err) {
    // Reported rather than thrown: the admin shows the message, and a failed save must not
    // take the server down.
    return { status: 500, payload: { error: /** @type {Error} */ (err).message } }
  }
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

/** What the admin needs to know that the browser bundle cannot see. */
async function readState() {
  return {
    config: redact(await readUserConfig()),
    hasConfig: fs.existsSync(PATHS.config),
    documents: listDocuments().map((doc) => ({
      id: doc.id,
      label: doc.label,
      type: doc.type,
      activeVersion: doc.activeVersion,
      versions: doc.versions.map((v) => ({
        versionId: v.versionId,
        filename: v.filename,
        importedAt: v.importedAt,
        extraction: v.extraction,
        extractor: v.extractor,
        warnings: v.warnings ?? [],
        counts: countOf(v.profile),
      })),
    })),
    status: readJson(PATHS.status),
  }
}

/**
 * Merge a patch into the user's config and write it back.
 *
 * A patch rather than a replacement, so the admin never has to hold — and risk discarding —
 * settings it does not have a UI for. Connect writes a `dataSources` entry through here;
 * disconnect writes an explicit `null`, which `deepMerge` turns into a deletion.
 */
async function saveConfig(body) {
  const patch = body?.config
  if (!patch || typeof patch !== 'object') throw new Error('Expected a `config` object.')

  const current = await readUserConfig()
  const next = body.replace === true ? patch : deepMerge(current, patch)

  // `replace` means the caller is handing over a whole config, so there is nothing to preserve
  // and the source-preserving path has no patch to apply. Everything else — which is every
  // connect, disconnect and settings change the admin makes — edits the file in place, so the
  // comments and layout of a hand-maintained file survive the save.
  const written = body.replace === true
    ? { ...writeConfigFile(next), preserved: false }
    : patchConfigFile(patch, next)

  return {
    ok: true,
    file: relative(PATHS.config),
    backup: written.backup ? relative(written.backup) : undefined,
    // Surfaced rather than swallowed: a fallback rewrote the file and lost its comments, and
    // the person who just pressed save is the only one who can decide that matters.
    preserved: written.preserved,
    ...(written.reason ? { preservedReason: written.reason } : {}),
    config: redact(next),
  }
}

function saveOverrides(body) {
  const overrides = body?.overrides
  if (!overrides || typeof overrides !== 'object') throw new Error('Expected an `overrides` object.')
  writeJson(PATHS.overrides, overrides)
  return { ok: true, file: relative(PATHS.overrides) }
}

/**
 * Ingest an uploaded document.
 *
 * The file arrives base64-encoded in JSON rather than as multipart: the payloads are a few
 * hundred kilobytes, and one JSON shape across every endpoint is worth more here than saving
 * a third of the bytes.
 */
async function saveDocument(body) {
  const { filename, contentBase64, type } = body ?? {}
  if (!filename || !contentBase64) throw new Error('Expected `filename` and `contentBase64`.')

  const bytes = Buffer.from(contentBase64, 'base64')
  if (!bytes.length) throw new Error('The uploaded file was empty.')

  const result = await ingestDocument({ filename: path.basename(filename), bytes }, { type })
  if (!result.ok) return { ok: false, reason: result.reason, hint: result.hint }

  const file = path.join(PATHS.documents, `${result.document.meta.id}.json`)
  const { record, outcome } = addVersion(readRecord(readJson(file)), result.document)

  if (outcome !== 'unchanged') writeJson(file, record)

  return {
    ok: true,
    outcome,
    document: { id: record.id, label: record.label, versions: record.versions.length },
    counts: countOf(result.document.profile),
    warnings: result.document.warnings ?? [],
  }
}

/** Pin a different version as the one that speaks. */
function activateVersion(body) {
  const { id, versionId } = body ?? {}
  const file = path.join(PATHS.documents, `${safeId(id)}.json`)
  const record = readRecord(readJson(file))
  if (!record) throw new Error(`No document "${id}".`)
  if (!record.versions.some((v) => v.versionId === versionId)) {
    throw new Error(`"${id}" has no version ${versionId}.`)
  }
  writeJson(file, { ...record, activeVersion: versionId })
  return { ok: true }
}

function deleteDocument(body) {
  // The sanitised id is what names the file *and* what the error reports. Echoing the raw
  // value back would put attacker-chosen text in a message the admin renders, and would
  // obscure the useful fact — which document was actually looked for.
  const id = safeId(body?.id)
  const file = path.join(PATHS.documents, `${id}.json`)
  if (!fs.existsSync(file)) throw new Error(`No document "${id}".`)
  fs.rmSync(file)
  return { ok: true, file: relative(file) }
}

/**
 * Run the connector import.
 *
 * Spawned rather than imported so it owns its own lifetime — a fetch that hangs cannot wedge
 * the server, and the output the user sees is the same output `pnpm run import` produces.
 * This is also why there is no second connector implementation anywhere in this file: the
 * one script the CLI runs is the one the admin runs.
 */
async function runImport(body) {
  const { spawn } = await import('node:child_process')
  const args = [path.join(PATHS.root, 'scripts', 'import.mjs'), '--json']

  // The preview. `--dry-run` already existed and already did the right thing — fetch,
  // normalise, diff against what is on disk, write nothing — so a preview is that run plus a
  // machine-readable result, not a second importer. Nothing reaches the active profile until
  // the caller asks again without this flag.
  const preview = body?.preview === true
  if (preview) args.push('--dry-run')

  // Refresh-one is `only`. Filtered to connector-key shape rather than passed through: these
  // become process arguments, and the filter is what keeps that from being a shell for
  // anything else.
  if (Array.isArray(body?.only) && body.only.length) {
    const keys = body.only.filter((k) => typeof k === 'string' && /^[\w-]+$/.test(k))
    if (keys.length) args.push('--only', keys.join(','))
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: PATHS.root, env: { ...process.env, NO_COLOR: '1' } })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('close', (code) => {
      const result = parseResult(output)
      resolve({
        // A run that produced a result is a run that finished its work. The exit code is
        // still reported, but it is not the only evidence — on Windows the importer trips a
        // libuv teardown assertion *after* writing everything, and treating that as failure
        // told the user their successful import had failed.
        ok: result ? true : code === 0,
        code,
        preview,
        applied: result?.applied ?? (!preview && code === 0),
        result: result ? redact(result) : undefined,
        output: output.slice(-8000),
        // A preview must not appear to have changed the recorded health of anything, so the
        // status it reports is the one still on disk.
        status: readJson(PATHS.status),
      })
    })
    child.on('error', (err) => resolve({ ok: false, preview, applied: false, error: err.message }))
  })
}

/** The marker `scripts/import.mjs --json` writes its result behind. */
const RESULT_MARKER = '@@portfolio-import-json@@'

/**
 * Pull the structured result out of a run's output.
 *
 * Returns undefined rather than throwing when there is nothing to find: an importer that died
 * before emitting is a failure the caller should see as one, not a parse error.
 *
 * @param {string} output
 */
function parseResult(output) {
  const at = output.lastIndexOf(RESULT_MARKER)
  if (at === -1) return undefined
  const line = output.slice(at + RESULT_MARKER.length).split('\n')[0]
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/* -------------------------------------------------------------------------- */

function listDocuments() {
  if (!fs.existsSync(PATHS.documents)) return []
  return fs.readdirSync(PATHS.documents)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readRecord(readJson(path.join(PATHS.documents, name))))
    .filter(Boolean)
}

function countOf(profile) {
  const counts = {}
  for (const [key, value] of Object.entries(profile ?? {})) {
    if (Array.isArray(value) && value.length) counts[key] = value.length
  }
  return counts
}

/**
 * Strip anything credential-shaped before it leaves the machine.
 *
 * No connector declares a secret-bearing config field — every one of them reads credentials
 * from the environment, and `authEnv` names which. So in a correct configuration this
 * removes nothing. It exists for the incorrect one: someone who pastes a token into
 * `portfolio.config.js` should not have the admin echo it back into a browser tab, where it
 * would reach devtools, the network log and any extension reading either.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function redact(value) {
  if (Array.isArray(value)) return /** @type {any} */ (value.map(redact))
  if (!value || typeof value !== 'object') return value

  const out = {}
  for (const [key, inner] of Object.entries(value)) {
    out[key] = /token|secret|password|credential|apikey|api_key/i.test(key)
      ? '[redacted]'
      : redact(inner)
  }
  return /** @type {any} */ (out)
}

/** Ids become filenames, so they must not be able to escape the directory. */
function safeId(id) {
  const clean = String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!clean) throw new Error('A document id is required.')
  return clean
}

/**
 * Whether a `Host` header names this machine and only this machine.
 *
 * The port is ignored — the socket already decided that — but the name is not: accepting an
 * arbitrary hostname is what makes DNS rebinding work.
 *
 * @param {string|undefined} host
 */
export function isLocalHost(host) {
  if (!host) return false
  // A bracketed IPv6 literal keeps its brackets; anything else splits on the last colon.
  const name = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.replace(/:\d+$/, '')
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' || name === '::1'
}

/** @param {any} base @param {any} patch */
export function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base
  const out = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    // An explicit null removes a key, which is how the admin disconnects a source.
    if (value === null) { delete out[key]; continue }
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key], value)
      : value
  }
  return out
}
