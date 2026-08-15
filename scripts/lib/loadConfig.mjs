/**
 * Node-side config loading, shared by `vite.config.js` and the CLI scripts under `scripts/`.
 *
 * `portfolio.config.js` is optional — a fresh clone with no config at all still builds,
 * using the defaults in `core/config/defaults.js` (see the "5 minutes to a portfolio" goal
 * in docs/architecture.md). This only needs to resolve `site.base` correctly even in that
 * case, since a wrong `base` is the most common cause of a blank deployed page.
 *
 * @module scripts/lib/loadConfig
 */

import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { resolveConfig } from '../../src/core/config/resolve.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')

/**
 * @returns {Promise<import('../../src/core/config/resolve.js').ResolvedConfig>}
 */
export async function loadResolvedConfig() {
  const configPath = path.join(ROOT, 'portfolio.config.js')
  let userConfig = null

  if (fs.existsSync(configPath)) {
    try {
      // Node's ESM loader caches modules by URL for the lifetime of the process, and the
      // Vite dev server is one long-lived process. Without a changing URL, editing
      // portfolio.config.js would keep serving the config as it was when the server
      // started — the title and social tags would silently stay stale until a restart,
      // with nothing on screen to explain why. Keying the URL on the file's modification
      // time makes each saved edit a distinct module.
      const stamp = fs.statSync(configPath).mtimeMs
      const mod = await import(`${pathToFileURL(configPath).href}?v=${stamp}`)
      userConfig = mod.default ?? mod
    } catch (err) {
      console.warn(`[portfolio] Could not load portfolio.config.js: ${err.message}`)
    }
  }

  return resolveConfig(userConfig)
}

export { ROOT }
