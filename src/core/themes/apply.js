/**
 * Theme resolution and application.
 *
 * `resolveTheme` is pure and runs anywhere — the browser applies its output to `:root`, and
 * the build inlines it into the HTML so the first paint is already themed (no flash of an
 * unstyled or wrong-coloured page).
 *
 * @module core/themes/apply
 */

import {
  BASE_TOKENS, DENSITY_SCALE, MAX_WIDTHS, MOTION_SCALE,
  flattenTokens, mergeTokens, scaleSpacing, kebab,
} from './tokens.js'
import { getPreset } from './presets.js'

/**
 * @typedef {object} ResolvedTheme
 * @property {string} presetId
 * @property {'dark'|'light'} colorScheme
 * @property {Record<string, string>} vars   Flattened CSS custom properties.
 * @property {string} css                    `:root { ... }` ready to inline.
 */

/**
 * Resolve a complete theme from config.
 *
 * Layering, lowest priority first:
 *   1. `BASE_TOKENS`
 *   2. the named preset
 *   3. `theme.accent` / `fontSans` / `fontMono` / `radius` shortcuts
 *   4. `theme.tokens` — arbitrary per-token overrides for advanced users
 *   5. layout- and animation-derived tokens (density, max width, motion scale)
 *
 * @param {import('../config/types.js').PortfolioConfig} config  A resolved config.
 * @returns {ResolvedTheme}
 */
export function resolveTheme(config) {
  const themeConfig = config?.theme ?? {}
  const layout = config?.layout ?? {}
  const animations = config?.animations ?? {}

  const preset = getPreset(themeConfig.preset)
  let tokens = mergeTokens(BASE_TOKENS, preset.tokens)

  /* Shortcuts ---------------------------------------------------------------- */

  if (themeConfig.accent) {
    tokens.color = {
      ...tokens.color,
      accent: themeConfig.accent,
      // Pick the accent's text colour automatically so a custom accent can never produce
      // unreadable button labels.
      accentContrast: readableOn(themeConfig.accent, tokens.color.accentContrast),
      focusRing: themeConfig.accent,
    }
  }
  if (themeConfig.fontSans) tokens.font = { ...tokens.font, sans: themeConfig.fontSans }
  if (themeConfig.fontMono) tokens.font = { ...tokens.font, mono: themeConfig.fontMono }
  if (themeConfig.radius) {
    const r = String(themeConfig.radius)
    const px = /^\d+$/.test(r) ? `${r}px` : r
    tokens.radius = { ...tokens.radius, sm: px, md: px, lg: px, xl: px }
  }

  /* Arbitrary overrides ------------------------------------------------------ */

  // Accepts both nested (`{ color: { bg: '#fff' } }`) and flat
  // (`{ '--color-bg': '#fff' }`) forms, because both are natural to write.
  const { nested, flat } = splitTokenOverrides(themeConfig.tokens)
  tokens = mergeTokens(tokens, nested)

  /* Derived tokens ----------------------------------------------------------- */

  const density = DENSITY_SCALE[/** @type {keyof typeof DENSITY_SCALE} */ (themeConfig.density)] ?? 1
  tokens.space = scaleSpacing(tokens.space, density)

  tokens.layout = {
    ...tokens.layout,
    maxWidth: MAX_WIDTHS[/** @type {keyof typeof MAX_WIDTHS} */ (layout.maxWidth)] ?? tokens.layout.maxWidth,
  }

  const motionScale = MOTION_SCALE[/** @type {keyof typeof MOTION_SCALE} */ (animations.intensity)] ?? 1
  tokens.motion = { ...tokens.motion, scale: String(motionScale) }

  const vars = { ...flattenTokens(tokens), ...flat }

  return {
    presetId: preset.id,
    colorScheme: normalizeScheme(themeConfig.colorScheme) ?? preset.colorScheme,
    vars,
    css: toCss(vars),
  }
}

/**
 * Split user token overrides into nested groups and raw `--custom-property` entries.
 *
 * @param {Record<string, unknown>|undefined} overrides
 * @returns {{nested: Record<string, Record<string, string>>, flat: Record<string, string>}}
 */
function splitTokenOverrides(overrides) {
  /** @type {Record<string, Record<string, string>>} */
  const nested = {}
  /** @type {Record<string, string>} */
  const flat = {}
  if (!overrides || typeof overrides !== 'object') return { nested, flat }

  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith('--')) {
      if (typeof value === 'string' || typeof value === 'number') flat[key] = String(value)
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      /** @type {Record<string, string>} */
      const group = {}
      for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
        if (typeof v === 'string' || typeof v === 'number') group[k] = String(v)
      }
      if (Object.keys(group).length) nested[key] = group
      continue
    }
    // A bare `accent: '#f00'` at the top level is a common mistake; treat it as `color.accent`.
    if (typeof value === 'string' || typeof value === 'number') {
      nested.color = { ...(nested.color ?? {}), [key]: String(value) }
    }
  }
  return { nested, flat }
}

/**
 * Choose black or white text for a background colour, whichever has more contrast.
 *
 * @param {string} background
 * @param {string} fallback
 * @returns {string}
 */
function readableOn(background, fallback) {
  // Imported lazily to keep this module usable when contrast maths is not needed.
  const white = relativeContrast(background, '#ffffff')
  const black = relativeContrast(background, '#000000')
  if (white === null || black === null) return fallback
  return white >= black ? '#ffffff' : '#000000'
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number|null}
 */
function relativeContrast(a, b) {
  const parse = (/** @type {string} */ input) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(input).trim())
    if (!m) return null
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  }
  const ca = parse(a)
  const cb = parse(b)
  if (!ca || !cb) return null
  const lum = (/** @type {number[]} */ rgb) => {
    const ch = rgb.map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const l1 = lum(ca)
  const l2 = lum(cb)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** @param {unknown} value @returns {'dark'|'light'|undefined} */
function normalizeScheme(value) {
  return value === 'dark' || value === 'light' ? value : undefined
}

/**
 * Render variables as a `:root` rule.
 *
 * Values are sanitized: a custom property is written into a stylesheet, so an unescaped
 * `}` or `<` from a user config could break out of the rule or the `<style>` element.
 *
 * @param {Record<string, string>} vars
 * @returns {string}
 */
export function toCss(vars) {
  const body = Object.entries(vars)
    .filter(([name]) => /^--[a-z0-9-]+$/i.test(name))
    .map(([name, value]) => `  ${name}: ${sanitizeValue(value)};`)
    .join('\n')
  return `:root {\n${body}\n}`
}

/**
 * Strip characters that could terminate the declaration, the rule, or the `<style>` block.
 * @param {string} value
 * @returns {string}
 */
function sanitizeValue(value) {
  return String(value).replace(/[<>{};]/g, '').trim()
}

/**
 * Write a resolved theme onto a DOM element (normally `document.documentElement`).
 *
 * Also sets `color-scheme` so form controls, scrollbars and the browser's own UI match the
 * theme, and `data-theme` so a stylesheet can special-case a preset if it ever needs to.
 *
 * @param {ResolvedTheme} theme
 * @param {HTMLElement} [root]
 */
export function applyTheme(theme, root) {
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  for (const [name, value] of Object.entries(theme.vars)) {
    el.style.setProperty(name, value)
  }
  el.dataset.theme = theme.presetId
  el.style.colorScheme = theme.colorScheme
}

export { kebab }
