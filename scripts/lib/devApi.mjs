/**
 * The builder's hands.
 *
 * A static site has no backend, which is the point — it deploys anywhere and depends on
 * nothing. But it also means the builder at `/admin.html` can compute a perfect answer and
 * then have no way to save it, so every change becomes copy-a-blob-into-a-file. That is
 * survivable for occasional tweaks and fatal for onboarding: nobody connects eight accounts
 * by hand-editing a config file eight times.
 *
 * So the dev server — and *only* the dev server — exposes a small local write API. This
 * ships nothing to production: `apply: 'serve'` means the plugin does not exist in a build,
 * and the deployed site is exactly as static as before.
 *
 * The safety properties that make this acceptable:
 *
 *   - dev-only, and refused outright if `command !== 'serve'`;
 *   - writes only to a fixed set of known paths, never a path from the request;
 *   - same-origin only, and rejects requests carrying a cross-origin `Origin` header;
 *   - it is your own machine, running your own checkout, editing your own files.
 *
 * @module scripts/lib/devApi
 */

import { ingestDocument } from '../../src/core/documents/ingest.js'
import { addVersion, readRecord } from '../../src/core/documents/store.js'
import { PATHS, writeJson, readJson, relative, fs, path } from './portfolio.mjs'
import { readUserConfig, writeConfigFile } from './configFile.mjs'

/** Requests larger than this are refused rather than buffered. */
const MAX_BODY = 12 * 1024 * 1024

/**
 * @returns {import('vite').Plugin}
 */
export function portfolioDevApi() {
  return {
    name: 'portfolio-dev-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use('/__portfolio', async (req, res) => {
        // A browser page on another origin must not be able to drive this, even though it
        // only listens on localhost.
        const origin = req.headers.origin
        if (origin && !isLocal(origin)) {
          return send(res, 403, { error: 'Cross-origin requests are refused.' })
        }

        const route = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/'

        try {
          if (req.method === 'GET' && route === '/state') return send(res, 200, await readState())
          if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })

          const body = await readBody(req)

          switch (route) {
            case '/config': return send(res, 200, await saveConfig(body))
            case '/overrides': return send(res, 200, saveOverrides(body))
            case '/document': return send(res, 200, await saveDocument(body))
            case '/document/activate': return send(res, 200, activateVersion(body))
            case '/document/delete': return send(res, 200, deleteDocument(body))
            case '/import': return send(res, 200, await runImport(body))
            default: return send(res, 404, { error: `No such endpoint: ${route}` })
          }
        } catch (err) {
          // Reported rather than thrown: the builder shows the message, and a failed save
          // must not take the dev server down.
          send(res, 500, { error: /** @type {Error} */ (err).message })
        }
      })

      server.config.logger.info(
        '  \u001b[2mportfolio: local write API enabled at /__portfolio (dev only)\u001b[0m',
      )
    },
  }
}

/* -------------------------------------------------------------------------- */

/** What the builder needs to know that the browser bundle cannot see. */
async function readState() {
  return {
    config: await readUserConfig(),
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
 * A patch rather than a replacement, so the builder never has to hold — and risk
 * discarding — settings it does not have a UI for.
 */
async function saveConfig(body) {
  const patch = body?.config
  if (!patch || typeof patch !== 'object') throw new Error('Expected a `config` object.')

  const current = await readUserConfig()
  const next = body.replace === true ? patch : deepMerge(current, patch)
  const { backup } = writeConfigFile(next)

  return { ok: true, file: relative(PATHS.config), backup: backup ? relative(backup) : undefined, config: next }
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
 * hundred kilobytes, and one JSON shape across every endpoint is worth more here than
 * saving a third of the bytes.
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
  const file = path.join(PATHS.documents, `${safeId(body?.id)}.json`)
  if (!fs.existsSync(file)) throw new Error(`No document "${body?.id}".`)
  fs.rmSync(file)
  return { ok: true, file: relative(file) }
}

/**
 * Run the connector import.
 *
 * Spawned rather than imported so it owns its own lifetime — a fetch that hangs cannot
 * wedge the dev server, and the output the user sees is the same output `npm run import`
 * produces.
 */
async function runImport(body) {
  const { spawn } = await import('node:child_process')
  const args = [path.join(PATHS.root, 'scripts', 'import.mjs')]
  if (Array.isArray(body?.only) && body.only.length) {
    args.push('--only', body.only.filter((k) => /^[\w-]+$/.test(k)).join(','))
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: PATHS.root, env: { ...process.env, NO_COLOR: '1' } })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('close', (code) => {
      resolve({ ok: code === 0, code, output: output.slice(-8000), status: readJson(PATHS.status) })
    })
    child.on('error', (err) => resolve({ ok: false, error: err.message }))
  })
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

/** Ids become filenames, so they must not be able to escape the directory. */
function safeId(id) {
  const clean = String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!clean) throw new Error('A document id is required.')
  return clean
}

/** @param {string} origin */
function isLocal(origin) {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error(`That file is larger than ${Math.round(MAX_BODY / 1024 / 1024)} MB.`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (err) {
        reject(new Error(`Request body was not valid JSON: ${err.message}`))
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(payload))
}

/** @param {any} base @param {any} patch */
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base
  const out = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    // An explicit null removes a key, which is how the builder disconnects a source.
    if (value === null) { delete out[key]; continue }
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(out[key], value)
      : value
  }
  return out
}
