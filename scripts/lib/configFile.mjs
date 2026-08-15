/**
 * Reading and writing `portfolio.config.js` as source code.
 *
 * The config is a file a person edits by hand, so anything written back to it has to look
 * like something a person would have written: unquoted keys, single quotes, trailing
 * commas, and the comments that explain what it is. Emitting `JSON.stringify` output would
 * technically work and would quietly make the file worse every time the builder touched it.
 *
 * @module scripts/lib/configFile
 */

import { PATHS, fs } from './portfolio.mjs'

/**
 * Render a config object as the full file.
 *
 * @param {Record<string, unknown>} config
 * @returns {string}
 */
export function renderConfigFile(config) {
  return `// @ts-check
import { defineConfig } from './src/core/config/types.js'

/**
 * This is the one file most users need to edit.
 *
 * Everything it does not set falls back to a working default — see docs/configuration.md
 * for the full reference. Sections you have no data for hide themselves automatically, so
 * there is no list of sections to maintain here.
 */
export default defineConfig(${js(config, 0)})
`
}

/**
 * Write the config, keeping a backup of what was there.
 *
 * The previous file may be the only copy of hand-tuned settings, and a builder that
 * silently replaced it would be a builder nobody trusts with their config.
 *
 * @param {Record<string, unknown>} config
 * @returns {{written: string, backup?: string}}
 */
export function writeConfigFile(config) {
  let backup
  if (fs.existsSync(PATHS.config)) {
    backup = `${PATHS.config}.backup`
    fs.copyFileSync(PATHS.config, backup)
  }
  fs.writeFileSync(PATHS.config, renderConfigFile(config), 'utf8')
  return { written: PATHS.config, backup }
}

/**
 * Serialize to JavaScript object-literal syntax.
 *
 * @param {unknown} value
 * @param {number} depth
 * @returns {string}
 */
export function js(value, depth = 0) {
  const pad = '  '.repeat(depth + 1)
  const closePad = '  '.repeat(depth)

  if (value === null || value === undefined) return 'undefined'
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      const inline = `[${value.map((v) => js(v, depth)).join(', ')}]`
      // A long section order is unreadable on one line, and is exactly the value most
      // likely to be long.
      if (inline.length <= 72) return inline
      return `[\n${value.map((v) => `${pad}${js(v, depth + 1)},`).join('\n')}\n${closePad}]`
    }
    return `[\n${value.map((v) => `${pad}${js(v, depth + 1)},`).join('\n')}\n${closePad}]`
  }

  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, v]) => v !== undefined && v !== '')
  if (!entries.length) return '{}'

  return `{\n${entries
    .map(([key, v]) => `${pad}${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`}: ${js(v, depth + 1)},`)
    .join('\n')}\n${closePad}}`
}

/**
 * The user's config exactly as written, with no defaults resolved in.
 *
 * The builder edits *their* file, so it must start from what they wrote rather than from
 * the resolved config — otherwise every save would bake several hundred default values
 * into a file that was four lines long.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readUserConfig() {
  if (!fs.existsSync(PATHS.config)) return {}
  try {
    const { pathToFileURL } = await import('node:url')
    // Cache-busted: the file changes between reads during a dev session, and Node's module
    // cache would otherwise serve the version from process start.
    const url = `${pathToFileURL(PATHS.config).href}?t=${Date.now()}`
    const module = await import(url)
    return module.default ?? {}
  } catch {
    return {}
  }
}
