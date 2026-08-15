/**
 * Node-side access to the built portfolio.
 *
 * The browser reads its data through `src/core/load.js` and Vite's `import.meta.glob`.
 * Node cannot use that, so this reads the same four inputs from disk and runs the *same*
 * `buildPortfolio`. Both paths therefore produce identical output — which is what lets
 * `npm run export` and the SEO plugin generate files that match what the site renders,
 * rather than an approximation of it.
 *
 * @module scripts/lib/portfolio
 */

import fs from 'node:fs'
import path from 'node:path'
import { buildPortfolio } from '../../src/core/generate/build.js'
import { loadResolvedConfig, ROOT } from './loadConfig.mjs'
import { readRecord, toLayer } from '../../src/core/documents/store.js'

export const PATHS = {
  root: ROOT,
  config: path.join(ROOT, 'portfolio.config.js'),
  data: path.join(ROOT, 'src', 'data'),
  manual: path.join(ROOT, 'src', 'data', 'manual.json'),
  overrides: path.join(ROOT, 'src', 'data', 'overrides.json'),
  generated: path.join(ROOT, 'src', 'data', 'generated'),
  sources: path.join(ROOT, 'src', 'data', 'generated', 'sources'),
  status: path.join(ROOT, 'src', 'data', 'generated', 'status.json'),
  // Outside `generated/` deliberately: a connector can always be re-fetched, but an
  // uploaded résumé cannot be re-read, so documents are durable input rather than cache.
  documents: path.join(ROOT, 'src', 'data', 'documents'),
  env: path.join(ROOT, '.env'),
  public: path.join(ROOT, 'public'),
  dist: path.join(ROOT, 'dist'),
  exports: path.join(ROOT, 'exports'),
}

/**
 * Read a JSON file, treating "missing" and "malformed" differently: a missing file is the
 * normal state of a fresh clone, while a malformed one is a real problem the user needs
 * told about — silently ignoring it would make their edits vanish with no explanation.
 *
 * @param {string} file
 * @param {(message: string) => void} [onError]
 * @returns {any}
 */
export function readJson(file, onError) {
  if (!fs.existsSync(file)) return undefined
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    onError?.(`${path.relative(ROOT, file)} is not valid JSON: ${/** @type {Error} */ (err).message}`)
    return undefined
  }
}

/**
 * Write JSON with a trailing newline and stable two-space indentation.
 *
 * These files are committed, so their diffs are read by people. Stable formatting means a
 * re-import produces a diff showing what actually changed upstream, not a reformat.
 *
 * @param {string} file
 * @param {unknown} value
 */
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/**
 * Load `.env` into `process.env` without a dependency.
 *
 * Deliberately does not overwrite variables that are already set, so a real environment
 * variable (in CI, or exported in the shell) always beats the file — which is the
 * behaviour every other tool has, and the one users expect when debugging a token.
 *
 * @param {string} [file]
 * @returns {string[]} names of the variables loaded
 */
export function loadEnv(file = PATHS.env) {
  if (!fs.existsSync(file)) return []
  const loaded = []
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    let value = rawValue.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
    loaded.push(key)
  }
  return loaded
}

/**
 * Every connector output file currently on disk, in a stable order.
 * @returns {{key: string, file: string, profile: unknown}[]}
 */
export function readSources(onError) {
  if (!fs.existsSync(PATHS.sources)) return []
  return fs.readdirSync(PATHS.sources)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      key: name.replace(/\.json$/, ''),
      file: path.join(PATHS.sources, name),
      profile: readJson(path.join(PATHS.sources, name), onError),
    }))
    .filter((entry) => entry.profile)
}

/**
 * Every imported document on disk, newest first.
 *
 * @returns {import('../../src/core/documents/types.js').ImportedDocument[]}
 */
export function readDocuments(onError) {
  if (!fs.existsSync(PATHS.documents)) return []
  return fs.readdirSync(PATHS.documents)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readRecord(readJson(path.join(PATHS.documents, name), onError)))
    .filter(Boolean)
}

/**
 * Run the full pipeline against what is on disk.
 *
 * @param {{now?: number, onError?: (message: string) => void}} [options]
 * @returns {Promise<import('../../src/core/generate/build.js').BuiltPortfolio & {
 *   sourceKeys: string[], hasImports: boolean,
 * }>}
 */
export async function loadBuiltPortfolio(options = {}) {
  const onError = options.onError
  const resolved = await loadResolvedConfig()

  const sources = readSources(onError)
  const documents = readDocuments(onError)
  const manual = readJson(PATHS.manual, onError)
  const overrides = readJson(PATHS.overrides, onError)
  const statusFile = readJson(PATHS.status, onError)

  const built = buildPortfolio({
    // `loadResolvedConfig` already resolved defaults in; `buildPortfolio` resolving it a
    // second time is idempotent and keeps this function's contract identical to the
    // browser's, which passes the raw config.
    config: resolved.config,
    sources,
    documents,
    manual,
    overrides,
    status: statusFile?.connectors,
    now: options.now,
  })

  return {
    ...built,
    configIssues: [...resolved.issues, ...built.configIssues].filter(dedupeIssues()),
    sourceKeys: sources.map((s) => s.key),
    documents,
    hasImports: sources.length > 0,
  }
}

/**
 * Config resolution runs twice (once here, once inside `buildPortfolio`), so identical
 * issues would otherwise be reported to the user twice.
 */
function dedupeIssues() {
  const seen = new Set()
  return (/** @type {{path: string, message: string}} */ issue) => {
    const key = `${issue.path}|${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
}

/** @param {string} file */
export const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/')

export { fs, path }
