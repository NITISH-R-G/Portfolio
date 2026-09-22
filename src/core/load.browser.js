/**
 * Data loading for the admin, in the browser.
 *
 * The admin re-runs the whole pipeline client-side so its preview is the real thing: section
 * auto-detection, ranking, skill derivation and SEO in the preview are the same code paths the
 * built site uses. To do that it needs the pipeline's *inputs*, not its output — the composed
 * `portfolio.json` is already merged and cannot have a draft layered under it.
 *
 * `scripts/compose.mjs` therefore emits `inputs.json` alongside it, and this module hands those
 * layers to `state.js` behind the same function names the retired Vite loader exposed. That is
 * why this file exists rather than the admin importing the JSON directly: `state.js` is
 * unchanged apart from its import line, so the draft/publish semantics it implements are the
 * ones that were already tested.
 *
 * The localStorage draft keys are re-exported from here for the same reason.
 *
 * @module core/load.browser
 */

import inputs from '../data/generated/inputs.json'

/**
 * The admin's unsaved edits. Two keys rather than one because the two drafts have different
 * destinations — content edits are published to `src/data/overrides.json`, while theme, layout
 * and section settings are published as `src/data/config.json`.
 */
const DRAFT_KEY = 'portfolio-admin-overrides'
const CONFIG_DRAFT_KEY = 'portfolio-admin-config'
/**
 * The drafts as they stood when a publish last succeeded. Read only by the admin, to tell
 * "edited and not saved" from "edited, saved, and still shown because the site has not rebuilt
 * yet". The site build never reads it.
 */
const PUBLISHED_KEY = 'portfolio-admin-published'

/** The committed config, both layers: the hand-authored JS then anything already published. */
export function loadFileConfig() {
  return inputs.fileConfig ?? {}
}

/** Per-source contributions, keyed by the `dataSources` key that produced them. */
export function loadSourceLayers() {
  return inputs.sources ?? []
}

/** Every imported document, newest first. */
export function loadDocuments() {
  return inputs.documents ?? []
}

/** The raw import status, including when the last import ran. */
export function loadImportStatus() {
  return inputs.status
}

/** The hand-written `manual.json` layer. */
export function loadManual() {
  return inputs.manual
}

/** The committed `overrides.json`, without any unsaved draft on top. */
export function loadSavedOverrides() {
  return inputs.savedOverrides
}

export { DRAFT_KEY, CONFIG_DRAFT_KEY, PUBLISHED_KEY }
