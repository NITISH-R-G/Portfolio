/**
 * Config resolution: user config + defaults → a complete, validated configuration.
 *
 * Resolution is pure and synchronous so the same function runs in Node (import scripts,
 * `npm run doctor`, `vite.config.js`) and in the browser bundle.
 *
 * @module core/config/resolve
 */

import { defaultConfig, SECTION_IDS } from './defaults.js'
import { EFFECT_REGISTRY } from '../effects/resolve.js'
import { SOURCE_THEME_NAMES } from './source-themes.js'
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
  config.layout.navigation = oneOf(config.layout.navigation, ['minimap', 'none'], 'minimap',
    'layout.navigation', issues)
  config.layout.avatarStyle = oneOf(config.layout.avatarStyle, ['circle', 'rounded', 'square'], 'circle',
    'layout.avatarStyle', issues)
  config.animations.intensity = oneOf(config.animations.intensity, ['none', 'subtle', 'standard', 'expressive'], 'standard',
    'animations.intensity', issues)

  // Reduced motion is not negotiable; the UI honours the media query regardless.
  config.animations.respectReducedMotion = true

  /* Effects ----------------------------------------------------------------- */

  // Validated against his registry rather than a list restated here, so a theme cannot be
  // offered or accepted that his implementation has no variables for.
  config.sourceTheme = oneOf(
    config.sourceTheme, ['', ...SOURCE_THEME_NAMES], '', 'sourceTheme', issues,
  )
  resolveFooter(config, issues)
  resolveNavigation(config, issues)
  resolveProfile(config, issues)
  config.effects = resolveEffects(config.effects, issues)

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

/**
 * Validate the decorative effects block, coercing anything unusable to a safe default.
 *
 * A portfolio must render whatever is in its config. A blur of `"quite a lot"`, a negative
 * contrast, an effect nobody has heard of — none of those should reach the browser and none
 * should stop the page. So every value is checked against what the implementation can actually
 * honour, and a rejection is recorded as an issue rather than thrown: `npm run doctor` reports
 * it, and the site still builds.
 *
 * Unknown effect and target names are *dropped*, not preserved. Keeping them would mean the
 * admin UI rendering controls for something no component reads, and a typo looking like a
 * working setting.
 *
 * @param {unknown} input
 * @param {{path: string, level: string, message: string}[]} issues
 * @returns {Record<string, any>}
 */
/**
 * The footer's rows.
 *
 * Shape-checked rather than merged: a half-valid row renders as a label with nothing beside it,
 * which reads as a broken page. Anything unusable is dropped with a warning and the defaults
 * stand, matching how every other block in this file fails.
 *
 * @param {Record<string, any>} config
 * @param {ConfigIssue[]} issues
 */
function resolveFooter(config, issues) {
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
  const defaults = defaultConfig().footer
  const given = isObject(config.footer) ? config.footer : {}

  if (config.footer !== undefined && !isObject(config.footer)) {
    issues.push({ level: 'warning', path: 'footer', message: 'Expected an object; using defaults.' })
  }

  const enabled = given.enabled === undefined ? defaults.enabled : given.enabled === true
  const showSocialLinks =
    given.showSocialLinks === undefined ? defaults.showSocialLinks : given.showSocialLinks === true
  const showSourceCode =
    given.showSourceCode === undefined ? defaults.showSourceCode : given.showSourceCode === true
  const showDmca = given.showDmca === undefined ? defaults.showDmca : given.showDmca === true

  let items = defaults.items
  if (given.items !== undefined) {
    if (!Array.isArray(given.items)) {
      issues.push({ level: 'warning', path: 'footer.items', message: 'Expected an array; using defaults.' })
    } else {
      items = given.items
        .map((item, index) => {
          if (!isObject(item) || typeof item.label !== 'string' || !item.label.trim()) {
            issues.push({
              level: 'warning',
              path: `footer.items[${index}]`,
              message: 'Each item needs a non-empty "label"; dropped.',
            })
            return null
          }
          const values = (Array.isArray(item.values) ? item.values : [])
            .filter((v) => isObject(v) && typeof v.text === 'string' && v.text.trim())
            .map((v) => ({
              text: v.text,
              ...(typeof v.href === 'string' && v.href ? { href: v.href } : {}),
            }))

          if (!values.length) {
            issues.push({
              level: 'warning',
              path: `footer.items[${index}]`,
              message: `"${item.label}" has no usable values; dropped.`,
            })
            return null
          }
          return { label: item.label, values }
        })
        .filter(Boolean)
    }
  }

  config.footer = { enabled, showSocialLinks, showSourceCode, showDmca, items }
}

/**
 * The header navigation.
 *
 * An entry needs a title and an in-app path. `href` is checked for a leading slash because his
 * `Nav` compares it against `usePathname()` to mark the active item — an absolute URL would
 * never match, so the link would work but never highlight, which looks like a styling bug
 * rather than a configuration mistake.
 */
/**
 * The profile header.
 *
 * `flipInterval` reaches his `TextFlip` as its `interval` prop, in seconds. It is clamped rather
 * than merely validated: zero or a negative would make the component flip on every frame, and a
 * very large one is indistinguishable from the animation being broken. Both are worse failures
 * than the value being quietly adjusted, and neither is something an owner means.
 */
function resolveProfile(config, issues) {
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
  const defaults = defaultConfig().profile
  const given = isObject(config.profile) ? config.profile : {}

  if (config.profile !== undefined && !isObject(config.profile)) {
    issues.push({ level: 'warning', path: 'profile', message: 'Expected an object; using defaults.' })
  }

  let flipInterval = number(
    given.flipInterval,
    defaults.flipInterval,
    'profile.flipInterval',
    issues,
  )

  if (flipInterval < 1 || flipInterval > 30) {
    issues.push({
      level: 'warning',
      path: 'profile.flipInterval',
      message: `Expected 1-30 seconds; got ${flipInterval}. Using ${defaults.flipInterval}.`,
    })
    flipInterval = defaults.flipInterval
  }

  config.profile = { flipInterval }
}

function resolveNavigation(config, issues) {
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
  const given = isObject(config.navigation) ? config.navigation : {}

  if (config.navigation !== undefined && !isObject(config.navigation)) {
    issues.push({ level: 'warning', path: 'navigation', message: 'Expected an object; using defaults.' })
  }

  let items = defaultConfig().navigation.items
  if (given.items !== undefined) {
    if (!Array.isArray(given.items)) {
      issues.push({ level: 'warning', path: 'navigation.items', message: 'Expected an array; using defaults.' })
    } else {
      items = given.items
        .map((item, index) => {
          if (!isObject(item) || typeof item.title !== 'string' || !item.title.trim()) {
            issues.push({
              level: 'warning',
              path: `navigation.items[${index}]`,
              message: 'Each item needs a non-empty "title"; dropped.',
            })
            return null
          }
          if (typeof item.href !== 'string' || !item.href.startsWith('/')) {
            issues.push({
              level: 'warning',
              path: `navigation.items[${index}]`,
              message: `"${item.title}" needs an in-app "href" starting with "/"; dropped.`,
              hint: 'Link out from the footer or your profile links instead.',
            })
            return null
          }
          return { title: item.title, href: item.href }
        })
        .filter(Boolean)
    }
  }

  config.navigation = { items }
}

function resolveEffects(input, issues) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const base = defaultConfig().effects

  const out = { enabled: bool(source.enabled, base.enabled, 'effects.enabled', issues) }

  for (const [name, spec] of Object.entries(EFFECT_REGISTRY)) {
    const given = source[name] && typeof source[name] === 'object' ? source[name] : {}
    const fallback = base[name] ?? {}
    const effect = { enabled: bool(given.enabled, fallback.enabled, `effects.${name}.enabled`, issues) }

    // Parameters, each validated against the range its library accepts.
    for (const [key, value] of Object.entries(fallback)) {
      if (key === 'enabled' || key === 'targets') continue
      effect[key] = typeof value === 'number'
        ? number(given[key], value, `effects.${name}.${key}`, issues)
        : string(given[key], value, `effects.${name}.${key}`, issues)
    }

    // `size` is an enumeration rather than a free string.
    if ('size' in fallback) {
      effect.size = oneOf(given.size ?? fallback.size, ['sm', 'md', 'lg'], fallback.size,
        `effects.${name}.size`, issues)
    }

    effect.targets = {}
    const requested = given.targets && typeof given.targets === 'object' ? given.targets : {}
    for (const target of Object.keys(spec.targets)) {
      effect.targets[target] = bool(requested[target], fallback.targets?.[target] ?? false,
        `effects.${name}.targets.${target}`, issues)
    }
    for (const unknown of Object.keys(requested)) {
      if (spec.targets[unknown]) continue
      issues.push({
        path: `effects.${name}.targets.${unknown}`,
        level: 'warning',
        message: `Unknown target "${unknown}" for ${name}; ignored. Known: ${Object.keys(spec.targets).join(', ')}.`,
      })
    }

    out[name] = effect
  }

  for (const unknown of Object.keys(source)) {
    if (unknown === 'enabled' || EFFECT_REGISTRY[unknown]) continue
    issues.push({
      path: `effects.${unknown}`,
      level: 'warning',
      message: `Unknown effect "${unknown}"; ignored. Known: ${Object.keys(EFFECT_REGISTRY).join(', ')}.`,
    })
  }

  return out
}

/** @param {unknown} value */
function bool(value, fallback, path, issues) {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  issues.push({ path, level: 'warning', message: `Expected true or false; using ${fallback}.` })
  return fallback
}

/**
 * A finite, non-negative number. Effect parameters are all lengths, sigmas and frequencies —
 * none has a meaningful negative value, and `NaN` would propagate into an SVG filter and blank
 * the element rather than fail loudly.
 *
 * @param {unknown} value
 */
function number(value, fallback, path, issues) {
  if (value === undefined) return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(n) && n >= 0) return n
  issues.push({ path, level: 'warning', message: `Expected a number of 0 or more; using ${fallback}.` })
  return fallback
}

/** @param {unknown} value */
function string(value, fallback, path, issues) {
  if (value === undefined) return fallback
  if (typeof value === 'string') return value
  issues.push({ path, level: 'warning', message: `Expected a string; using "${fallback}".` })
  return fallback
}
