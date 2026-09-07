/**
 * Build-time data loading for the Next application.
 *
 * The sibling `load.js` resolves its inputs with `import.meta.glob`, which is a Vite API. The
 * portfolio is a Next app now, so under Turbopack every one of those globs resolves to an empty
 * object and the pipeline runs on nothing — the page renders his layout around a profile with
 * no name in it. This module reads exactly the same files with `fs`, at build time, and calls
 * exactly the same `buildPortfolio`.
 *
 * Two loaders rather than one because the two runtimes genuinely differ, and the alternative —
 * a runtime branch inside `load.js` — would ship `fs` imports into the browser bundle. The
 * *pipeline* is not duplicated: both call `buildPortfolio`, which is where all the behaviour is.
 *
 * Server-side only. Importing this from a client component will fail at bundle time, which is
 * the correct outcome: the built profile is passed down as props, not re-derived in the browser.
 *
 * @module core/load.node
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { buildPortfolio } from './generate/build.js'
import { deepMerge } from './schema/merge.js'
import { readRecord } from './documents/store.js'

// Statically imported rather than read and evaluated: it is a JavaScript module, and the one
// thing a build must never do with a config file is `eval` it out of a string.
import fileConfig from '../../portfolio.config.js'

const ROOT = process.cwd()

/** @param {string} relative @returns {any} */
function readJson(relative) {
  const path = join(ROOT, relative)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    // A malformed data file should name itself rather than surfacing as an empty portfolio
    // three layers up.
    throw new Error(`${relative} is not valid JSON: ${/** @type {Error} */ (error).message}`)
  }
}

/** @param {string} relative @returns {{name: string, data: any}[]} */
function readJsonDir(relative) {
  const dir = join(ROOT, relative)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name: name.replace(/\.json$/, ''), data: readJson(join(relative, name)) }))
    .filter((entry) => entry.data)
}

/** @type {import('./generate/build.js').BuiltPortfolio|null} */
let cached = null

/**
 * Run the full pipeline over the committed files.
 *
 * Memoized for the same reason the Vite loader is: every input is fixed for the life of the
 * process, and Next will import this module once per route that needs it.
 *
 * The admin's unsaved localStorage draft is deliberately *not* read here — there is no
 * localStorage in Node, and a published site must render what was committed. The draft is a
 * browser-side preview concern and stays in `load.js`.
 *
 * @param {{now?: number, fresh?: boolean}} [options]
 * @returns {import('./generate/build.js').BuiltPortfolio}
 */
export function loadPortfolio(options = {}) {
  if (cached && !options.fresh) return cached

  const status = readJson('src/data/generated/status.json')

  cached = buildPortfolio({
    // `config.json` is what the admin's Publish button writes; it layers over the hand-authored
    // JavaScript. The admin never writes `portfolio.config.js` itself, because that file is
    // imported by the build and a write to it would be arbitrary code execution on next deploy.
    config: deepMerge(fileConfig, readJson('src/data/config.json') ?? {}),
    sources: readJsonDir('src/data/generated/sources').map((entry) => ({
      id: entry.name,
      profile: entry.data,
    })),
    documents: readJsonDir('src/data/documents')
      .map((entry) => readRecord(entry.data))
      .filter(Boolean),
    manual: readJson('src/data/manual.json'),
    overrides: readJson('src/data/overrides.json'),
    // The status file wraps the per-connector map so it can also carry `generatedAt`.
    status: status?.connectors ?? status,
    now: options.now,
  })
  return cached
}

/**
 * The raw layers the pipeline consumes, unmerged.
 *
 * `loadPortfolio` runs them through `buildPortfolio` and returns the result; the admin needs
 * the inputs themselves, because it re-runs that same pipeline in the browser with an unsaved
 * draft layered on top. Emitting them at compose time is what lets the admin preview be the
 * real pipeline rather than a second implementation of it.
 *
 * @returns {{
 *   fileConfig: object,
 *   sources: {key: string, profile: object}[],
 *   documents: object[],
 *   manual: object|undefined,
 *   savedOverrides: object|undefined,
 *   status: object|undefined,
 * }}
 */
export function loadInputs() {
  return {
    fileConfig: deepMerge(fileConfig, readJson('src/data/config.json') ?? {}),
    sources: readJsonDir('src/data/generated/sources').map((entry) => ({
      key: entry.name,
      profile: entry.data,
    })),
    documents: readJsonDir('src/data/documents').map((entry) => readRecord(entry.data)).filter(Boolean),
    manual: readJson('src/data/manual.json'),
    savedOverrides: readJson('src/data/overrides.json'),
    status: readJson('src/data/generated/status.json'),
  }
}

/** The raw import status, including when the last import ran. */
export function loadImportStatus() {
  return readJson('src/data/generated/status.json')
}

/** Drop the memoized build so the next call re-runs the pipeline. */
export function invalidatePortfolio() {
  cached = null
}
