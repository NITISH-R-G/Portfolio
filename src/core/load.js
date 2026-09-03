/**
 * Browser-side data loading.
 *
 * Wires the build pipeline (`core/generate/build.js`) up to the files a real deployment
 * actually ships: the user's `portfolio.config.js`, their hand-written `manual.json`,
 * whatever connectors produced into `data/generated/sources/`, and their `overrides.json`.
 *
 * Everything here resolves at *build* time via `import.meta.glob` — nothing is fetched at
 * runtime, so the shipped site has no dependency on any external service being up.
 *
 * @module core/load
 */

import { buildPortfolio } from './generate/build.js'
import { deepMerge } from './schema/merge.js'
import { readRecord, toLayer } from './documents/store.js'

// Eagerly resolved at build time. Vite requires these globs to be literal so it can
// statically analyze them; do not compute the pattern dynamically.
const configModules = import.meta.glob('/portfolio.config.js', { eager: true })
const manualModules = import.meta.glob('/src/data/manual.json', { eager: true })
const overrideModules = import.meta.glob('/src/data/overrides.json', { eager: true })
// Written by the admin's Publish button, absent in a hand-authored setup. It sits between the
// JavaScript config and the unsaved browser draft — the same shape, the same merge, so it is
// the draft made durable rather than a second place settings can live. The admin never writes
// `portfolio.config.js` itself: that file is imported by the build, so a write to it would be
// arbitrary code execution on the next deploy.
const configOverrideModules = import.meta.glob('/src/data/config.json', { eager: true })
const sourceModules = import.meta.glob('/src/data/generated/sources/*.json', { eager: true })
const statusModules = import.meta.glob('/src/data/generated/status.json', { eager: true })
// Documents live outside `generated/` because they are not reproducible: `npm run import`
// can always re-fetch a connector, but it cannot re-read a résumé the user uploaded once.
const documentModules = import.meta.glob('/src/data/documents/*.json', { eager: true })

/** @param {Record<string, unknown>} modules @param {string} path */
function moduleDefault(modules, path) {
  const mod = /** @type {{default?: unknown}} */ (modules[path])
  return mod?.default ?? mod
}

/**
 * The admin builder stores unsaved edits under these keys for a live preview that never
 * touches disk until the user exports. Production builds never read them: a deployed site
 * has no localStorage entries, so both reads return undefined and the pipeline runs on the
 * committed files alone.
 *
 * Two keys rather than one because the two drafts have different destinations — content
 * edits are exported to `src/data/overrides.json`, while theme, layout and section
 * settings are exported as a `portfolio.config.js` patch.
 */
const DRAFT_KEY = 'portfolio-admin-overrides'
const CONFIG_DRAFT_KEY = 'portfolio-admin-config'
// The drafts as they stood when a publish last succeeded. Read only by the admin, to tell
// "edited and not saved" from "edited, saved, and still shown because the site has not
// rebuilt yet". The site build never reads it — a deployed page has no localStorage at all.
const PUBLISHED_KEY = 'portfolio-admin-published'

/**
 * @param {string} key
 * @returns {any}
 */
function readDraft(key) {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    // A corrupted draft must not brick the page it was meant to preview.
    return undefined
  }
}

/** @type {import('./generate/build.js').BuiltPortfolio|null} */
let cached = null

/**
 * Load every input file the build pipeline needs and run it.
 *
 * Memoized: the module files this reads are fixed at build time and the admin draft only
 * changes via a full page reload today, so re-running the pipeline on every hook call would
 * be pure waste. Pass `{ fresh: true }` to force recomputation (used after the admin writes
 * a new draft without reloading).
 *
 * @param {{now?: number, includeDraft?: boolean, fresh?: boolean}} [options]
 * @returns {import('./generate/build.js').BuiltPortfolio}
 */
export function loadPortfolio(options = {}) {
  if (cached && !options.fresh) return cached

  const fileConfig = moduleDefault(configModules, '/portfolio.config.js') ?? {}
  const manual = moduleDefault(manualModules, '/src/data/manual.json')
  const savedOverrides = moduleDefault(overrideModules, '/src/data/overrides.json')
  const statusFile = moduleDefault(statusModules, '/src/data/generated/status.json')

  // Tagged with the connector key that produced them, so a value can be traced to its
  // source and two sources disagreeing can name themselves in a conflict.
  const sources = Object.keys(sourceModules)
    .sort()
    .map((path) => ({
      id: /** @type {string} */ (path.split('/').pop()).replace(/\.json$/, ''),
      profile: moduleDefault(sourceModules, path),
    }))
    .filter((entry) => entry.profile)

  const useDraft = options.includeDraft !== false

  const overrides = useDraft
    ? mergeOverrideLayers(savedOverrides, readDraft(DRAFT_KEY))
    : savedOverrides

  const publishedConfig = moduleDefault(configOverrideModules, '/src/data/config.json') ?? {}
  const savedConfig = deepMerge(fileConfig, publishedConfig)

  const config = useDraft
    ? deepMerge(savedConfig, readDraft(CONFIG_DRAFT_KEY) ?? {})
    : savedConfig

  cached = buildPortfolio({
    config,
    sources,
    documents: loadDocuments(),
    manual,
    overrides,
    // The status file wraps the per-connector map so it can also carry `generatedAt`.
    status: statusFile?.connectors ?? statusFile,
    now: options.now,
  })
  return cached
}

/**
 * Every imported document, newest first.
 *
 * @returns {import('../core/documents/types.js').ImportedDocument[]}
 */
export function loadDocuments() {
  return Object.keys(documentModules)
    .sort()
    .map((path) => readRecord(moduleDefault(documentModules, path)))
    .filter(Boolean)
}

/**
 * The raw import status, including when the last import ran. The build pipeline only needs
 * the per-connector map, but the admin's Sources panel needs the timestamp too.
 *
 * @returns {{generatedAt?: string, connectors?: Record<string, any>}|undefined}
 */
export function loadImportStatus() {
  return moduleDefault(statusModules, '/src/data/generated/status.json')
}

/**
 * The config exactly as committed, with no draft applied. The admin needs this to show
 * which settings are unsaved edits and which are already in the file.
 *
 * Both committed layers, in the order the site applies them: the hand-authored JavaScript, then
 * anything the admin has already published. Omitting the second would make every published
 * setting look unsaved, and the Publish panel would keep offering to commit changes that are
 * already committed.
 *
 * @returns {import('../core/config/types.js').PortfolioConfig}
 */
export function loadFileConfig() {
  return deepMerge(
    moduleDefault(configModules, '/portfolio.config.js') ?? {},
    moduleDefault(configOverrideModules, '/src/data/config.json') ?? {},
  )
}

/**
 * Per-source contributions, keyed by the `dataSources` key that produced them. Lets the
 * admin attribute a record to the connector it came from without re-running anything.
 *
 * @returns {{key: string, profile: any}[]}
 */
export function loadSourceLayers() {
  return Object.keys(sourceModules)
    .sort()
    .map((path) => ({
      key: /** @type {string} */ (path.split('/').pop()).replace(/\.json$/, ''),
      profile: moduleDefault(sourceModules, path),
    }))
    .filter((entry) => entry.profile)
}

/**
 * Combine committed overrides with an in-browser draft, draft winning. A shallow merge is
 * correct here (rather than the deep schema merge) because both sides already have the
 * `{identity, records, hidden, order, socials}` shape and each key is independently additive.
 *
 * @param {import('./schema/merge.js').Overrides|undefined} saved
 * @param {import('./schema/merge.js').Overrides|undefined} draft
 * @returns {import('./schema/merge.js').Overrides|undefined}
 */
function mergeOverrideLayers(saved, draft) {
  if (!draft) return saved
  if (!saved) return draft
  return {
    identity: { ...saved.identity, ...draft.identity },
    records: mergeNested(saved.records, draft.records),
    hidden: mergeArrays(saved.hidden, draft.hidden),
    order: { ...saved.order, ...draft.order },
    socials: { ...saved.socials, ...draft.socials },
    resolutions: { ...saved.resolutions, ...draft.resolutions },
  }
}

/** @param {Record<string, Record<string, unknown>>|undefined} a @param {Record<string, Record<string, unknown>>|undefined} b */
function mergeNested(a, b) {
  const out = { ...(a ?? {}) }
  for (const [collection, patches] of Object.entries(b ?? {})) {
    out[collection] = { ...(out[collection] ?? {}), ...patches }
  }
  return out
}

/** @param {Record<string, string[]>|undefined} a @param {Record<string, string[]>|undefined} b */
function mergeArrays(a, b) {
  const out = { ...(a ?? {}) }
  for (const [collection, ids] of Object.entries(b ?? {})) {
    out[collection] = [...new Set([...(out[collection] ?? []), ...ids])]
  }
  return out
}

/** Drop the memoized build so the next `loadPortfolio` call re-runs the pipeline. */
export function invalidatePortfolio() {
  cached = null
}

export { DRAFT_KEY, CONFIG_DRAFT_KEY, PUBLISHED_KEY }
