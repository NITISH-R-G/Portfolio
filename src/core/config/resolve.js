/**
 * Config resolution: user config + defaults → a complete, validated configuration.
 *
 * Resolution is pure and synchronous so the same function runs in Node (import scripts,
 * `npm run doctor`, `vite.config.js`) and in the browser bundle.
 *
 * @module core/config/resolve
 */

import { defaultConfig, SECTION_IDS } from './defaults.js'
import { deepMerge } from '../schema/merge.js'

/** @typedef {import('./types.js').PortfolioConfig} PortfolioConfig */

/**
 * @typedef {object} ConfigIssue
 * @property {'error'|'warning'} level
 * @property {string} path
 * @property {string} message
 * @property {string} [hint]
 */

/**
 * @typedef {object} ResolvedConfig
 * @property {Required<PortfolioConfig>} config
 * @property {string[]} sectionOrder   Complete, de-duplicated order covering every known id.
 * @property {ConfigIssue[]} issues
 */

/**
 * Normalize a mount path to the leading-and-trailing-slash form Vite's `base` expects.
 * `"repo"` → `"/repo/"`, `""` → `"/"`, `"/repo"` → `"/repo/"`.
 *
 * Getting this wrong is the single most common cause of a blank deployed page (all assets
 * 404), which is why it is normalized rather than trusted.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeBase(value) {
  if (typeof value !== 'string') return '/'
  let base = value.trim()
  if (!base || base === '/') return '/'
  // Accept a full URL and take its pathname, since users paste their site URL here.
  if (/^https?:\/\//i.test(base)) {
    try {
      base = new URL(base).pathname
    } catch {
      return '/'
    }
  }
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`
  return base.replace(/\/{2,}/g, '/')
}

/**
 * Strip a trailing slash from an origin so URL joins do not double up.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const trimmed = value.trim()
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate)
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '')
  } catch {
    return ''
  }
}

/**
 * Join the site origin and mount path into the absolute base URL used for canonical links,
 * OG images and the sitemap.
 *
 * @param {string} url
 * @param {string} base
 * @returns {string}
 */
export function absoluteBaseUrl(url, base) {
  if (!url) return ''
  const origin = normalizeUrl(url)
  if (!origin) return ''
  // A user who sets url to "https://me.github.io/portfolio" and base to "/portfolio/"
  // should not get "/portfolio/portfolio/".
  if (base !== '/' && origin.endsWith(base.replace(/\/$/, ''))) return `${origin}/`
  return `${origin}${base}`
}

/**
 * Resolve a user config against the defaults.
 *
 * Never throws. Problems are reported as `issues` and the resolver falls back to a working
 * value, because a typo in one config field should not prevent the site from building.
 *
 * @param {PortfolioConfig|null|undefined} userConfig
 * @returns {ResolvedConfig}
 */
export function resolveConfig(userConfig) {
  /** @type {ConfigIssue[]} */
  const issues = []
  const defaults = defaultConfig()

  if (userConfig != null && (typeof userConfig !== 'object' || Array.isArray(userConfig))) {
    issues.push({
      level: 'error',
      path: '',
      message: 'portfolio.config.js did not export an object; defaults were used.',
      hint: 'The file should `export default defineConfig({ ... })`.',
    })
    userConfig = null
  }

  const config = /** @type {Required<PortfolioConfig>} */ (deepMerge(defaults, userConfig ?? {}))

  // `deepMerge` treats an explicit null as "delete this key", which is the right behaviour
  // for a field but would leave a whole config section undefined. Restore the container
  // objects so every consumer below can assume they exist.
  for (const [key, fallback] of /** @type {[string, unknown][]} */ ([
    ['identity', defaults.identity], ['site', defaults.site], ['theme', defaults.theme],
    ['layout', defaults.layout], ['animations', defaults.animations], ['seo', defaults.seo],
    ['analytics', defaults.analytics], ['privacy', defaults.privacy], ['features', defaults.features],
    ['deployment', defaults.deployment], ['sections', defaults.sections],
    ['sectionOptions', {}], ['dataSources', {}], ['socialLinks', {}],
  ])) {
    const value = /** @type {Record<string, unknown>} */ (config)[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      if (value !== undefined) {
        issues.push({
          level: 'warning',
          path: key,
          message: `Expected an object; got ${JSON.stringify(value)}. Using defaults.`,
        })
      }
      /** @type {Record<string, unknown>} */ (config)[key] = fallback
    }
  }

  /* Identity ---------------------------------------------------------------- */

  if (!config.identity?.name) {
    issues.push({
      level: 'warning',
      path: 'identity.name',
      message: 'No name is configured.',
      hint: 'Run `npm run setup`, or set `identity.name` in portfolio.config.js.',
    })
  }

  /* Site -------------------------------------------------------------------- */

  const rawBase = config.site.base
  config.site.base = normalizeBase(rawBase)
  if (typeof rawBase === 'string' && rawBase.trim() && rawBase !== config.site.base) {
    issues.push({
      level: 'warning',
      path: 'site.base',
      message: `Base path was normalized from "${rawBase}" to "${config.site.base}".`,
    })
  }

  const rawUrl = config.site.url
  config.site.url = normalizeUrl(rawUrl)
  if (rawUrl && !config.site.url) {
    issues.push({
      level: 'warning',
      path: 'site.url',
      message: `"${rawUrl}" is not a valid URL; canonical links and OG tags will be omitted.`,
    })
  }

  if (!config.site.title) {
    config.site.title = [config.identity.name, config.identity.headline]
      .filter(Boolean)
      .join(' — ') || 'Portfolio'
  }
  if (!config.site.description) {
    config.site.description = config.identity.summary || ''
  }

  /* Theme and layout -------------------------------------------------------- */

  config.theme.density = oneOf(config.theme.density, ['compact', 'comfortable', 'spacious'], 'comfortable',
    'theme.density', issues)
  config.layout.maxWidth = oneOf(config.layout.maxWidth, ['narrow', 'default', 'wide', 'full'], 'default',
    'layout.maxWidth', issues)
  config.layout.shell = oneOf(config.layout.shell, ['sidebar', 'stacked'], 'sidebar',
    'layout.shell', issues)
  config.layout.navigation = oneOf(config.layout.navigation, ['dock', 'top', 'none'], 'dock',
    'layout.navigation', issues)
  config.layout.projectLayout = oneOf(config.layout.projectLayout, ['carousel', 'grid', 'list'], 'carousel',
    'layout.projectLayout', issues)
  config.layout.experienceLayout = oneOf(config.layout.experienceLayout, ['cards', 'timeline'], 'cards',
    'layout.experienceLayout', issues)
  config.layout.avatarStyle = oneOf(config.layout.avatarStyle, ['circle', 'rounded', 'square'], 'circle',
    'layout.avatarStyle', issues)
  config.layout.socialIconStyle = oneOf(config.layout.socialIconStyle, ['outline', 'solid', 'plain'], 'outline',
    'layout.socialIconStyle', issues)
  config.animations.intensity = oneOf(config.animations.intensity, ['none', 'subtle', 'standard', 'expressive'], 'standard',
    'animations.intensity', issues)

  // Reduced motion is not negotiable; the UI honours the media query regardless.
  config.animations.respectReducedMotion = true

  /* Sections ---------------------------------------------------------------- */

  const known = new Set(SECTION_IDS)
  const customSectionIds = new Set()

  for (const [id, visibility] of Object.entries(config.sections)) {
    if (!known.has(id)) customSectionIds.add(id)
    if (visibility !== true && visibility !== false && visibility !== 'auto') {
      issues.push({
        level: 'warning',
        path: `sections.${id}`,
        message: `Expected true, false or "auto"; got ${JSON.stringify(visibility)}. Using "auto".`,
      })
      config.sections[id] = 'auto'
    }
  }

  const sectionOrder = resolveSectionOrder(config.sectionOrder, [...known, ...customSectionIds], issues)
  config.sectionOrder = sectionOrder

  /* Data sources ------------------------------------------------------------ */

  if (config.dataSources && typeof config.dataSources === 'object') {
    for (const [id, source] of Object.entries(config.dataSources)) {
      if (!source || typeof source !== 'object') {
        issues.push({
          level: 'warning',
          path: `dataSources.${id}`,
          message: 'Expected an object; this source will be skipped.',
          hint: `Use \`${id}: { username: "..." }\`.`,
        })
        delete config.dataSources[id]
      }
    }
  }

  return { config, sectionOrder, issues }
}

/**
 * Produce a complete section order: the user's explicit order first, then every remaining
 * known id in canonical order. Unknown ids are dropped with a warning rather than silently
 * ignored, because a typo here manifests as a section mysteriously not rendering.
 *
 * @param {unknown} requested
 * @param {string[]} allIds
 * @param {ConfigIssue[]} issues
 * @returns {string[]}
 */
export function resolveSectionOrder(requested, allIds, issues = []) {
  const known = new Set(allIds)
  const seen = new Set()
  /** @type {string[]} */
  const order = []

  if (Array.isArray(requested)) {
    for (const id of requested) {
      if (typeof id !== 'string') continue
      if (!known.has(id)) {
        issues.push({
          level: 'warning',
          path: 'sectionOrder',
          message: `Unknown section "${id}" in sectionOrder; ignored.`,
          hint: `Known sections: ${allIds.join(', ')}`,
        })
        continue
      }
      if (seen.has(id)) continue
      seen.add(id)
      order.push(id)
    }
  }

  for (const id of allIds) {
    if (!seen.has(id)) order.push(id)
  }
  return order
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @param {T} fallback
 * @param {string} path
 * @param {ConfigIssue[]} issues
 * @returns {T}
 */
function oneOf(value, allowed, fallback, path, issues) {
  if (typeof value === 'string' && allowed.includes(/** @type {T} */ (value))) {
    return /** @type {T} */ (value)
  }
  if (value !== undefined && value !== '') {
    issues.push({
      level: 'warning',
      path,
      message: `Expected one of ${allowed.map((a) => `"${a}"`).join(', ')}; got ${JSON.stringify(value)}. Using "${fallback}".`,
    })
  }
  return fallback
}

/**
 * Extract the identity fields from config as a profile layer, so `identity` in config
 * participates in the same merge as imported and manual data.
 *
 * @param {Required<PortfolioConfig>} config
 * @returns {{ identity: object, socials: Record<string, string> }}
 */
export function configProfileLayer(config) {
  return {
    identity: { ...config.identity },
    socials: { ...(config.socialLinks ?? {}) },
  }
}
