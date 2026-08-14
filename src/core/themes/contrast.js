/**
 * WCAG contrast maths.
 *
 * Used by the theme test suite to prove every built-in theme is readable, and by the admin
 * builder to warn a user in real time when a custom accent colour would fail. Themes are a
 * presentation choice; legibility is not.
 *
 * @module core/themes/contrast
 */

/**
 * Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` into 0–255 channels plus alpha.
 * Returns `null` for anything else (named colours, `var(...)`, gradients) so callers can
 * skip rather than guess.
 *
 * @param {string} input
 * @returns {{r: number, g: number, b: number, a: number}|null}
 */
export function parseColor(input) {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()

  let m = /^#([0-9a-f]{3,8})$/.exec(value)
  if (m) {
    const hex = m[1]
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = [...hex].map((c) => parseInt(c + c, 16))
      return { r, g, b, a: hex.length === 4 ? a / 255 : 1 }
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      return { r, g, b, a }
    }
    return null
  }

  m = /^rgba?\(([^)]+)\)$/.exec(value)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null
    const [r, g, b] = parts
    const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1
    return { r, g, b, a }
  }

  return null
}

/**
 * Composite a possibly-translucent colour over an opaque backdrop.
 * Necessary for themes like Glass whose surfaces are `rgba(255,255,255,0.06)` — measuring
 * their contrast without compositing would give a meaningless answer.
 *
 * @param {{r:number,g:number,b:number,a:number}} fg
 * @param {{r:number,g:number,b:number,a:number}} bg
 * @returns {{r:number,g:number,b:number,a:number}}
 */
export function composite(fg, bg) {
  if (fg.a >= 1) return fg
  const a = fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  }
}

/**
 * Relative luminance per WCAG 2.x.
 *
 * @param {{r:number,g:number,b:number}} color
 * @returns {number}
 */
export function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Contrast ratio between two colours, 1–21. Translucent foregrounds are composited over the
 * given background first.
 *
 * Returns `null` when either colour cannot be parsed, so a caller can distinguish "fails"
 * from "unknown".
 *
 * @param {string} foreground
 * @param {string} background
 * @returns {number|null}
 */
export function contrastRatio(foreground, background) {
  const bg = parseColor(background)
  const fgRaw = parseColor(foreground)
  if (!bg || !fgRaw) return null
  const fg = composite(fgRaw, { ...bg, a: 1 })
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * WCAG AA thresholds. Large text is 18.66px bold or 24px regular.
 */
export const AA_NORMAL = 4.5
export const AA_LARGE = 3
export const AAA_NORMAL = 7

/**
 * Check a resolved token set for contrast failures.
 *
 * Only the pairs that carry meaning are checked: body text and muted text against both the
 * page and card surfaces, and the accent's own contrast colour. Decorative pairs (borders,
 * backdrops) are excluded because a failing ratio there is not a readability problem.
 *
 * @param {Record<string, string>} vars  Flattened CSS variables, e.g. `{'--color-bg': '#000'}`.
 * @returns {{pair: string, ratio: number, required: number}[]}  Failures only.
 */
export function checkContrast(vars) {
  const get = (/** @type {string} */ name) => vars[name] ?? ''
  const bg = get('--color-bg')

  /** Resolve a token that may itself be `var(--other)`, one level deep. */
  const resolve = (/** @type {string} */ value) => {
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(String(value).trim())
    return m ? (vars[m[1]] ?? '') : value
  }

  /** @type {{name: string, fg: string, bg: string, required: number}[]} */
  const pairs = [
    { name: 'text on page', fg: get('--color-text'), bg, required: AA_NORMAL },
    { name: 'muted text on page', fg: get('--color-text-muted'), bg, required: AA_NORMAL },
    { name: 'faint text on page', fg: get('--color-text-faint'), bg, required: AA_LARGE },
    { name: 'text on surface', fg: get('--color-text'), bg: resolve(get('--color-surface')), required: AA_NORMAL },
    { name: 'muted text on surface', fg: get('--color-text-muted'), bg: resolve(get('--color-surface')), required: AA_NORMAL },
    { name: 'accent on page', fg: get('--color-accent'), bg, required: AA_LARGE },
    { name: 'accent-contrast on accent', fg: get('--color-accent-contrast'), bg: get('--color-accent'), required: AA_NORMAL },
  ]

  /** @type {{pair: string, ratio: number, required: number}[]} */
  const failures = []
  for (const pair of pairs) {
    // Translucent surfaces are composited over the page background before measuring.
    const surface = parseColor(pair.bg)
    const page = parseColor(bg)
    const effectiveBg = surface && page && surface.a < 1
      ? rgbString(composite(surface, { ...page, a: 1 }))
      : pair.bg

    const ratio = contrastRatio(pair.fg, effectiveBg)
    if (ratio === null) continue // unparseable (gradient, keyword) — not a failure
    if (ratio + 1e-9 < pair.required) {
      failures.push({ pair: pair.name, ratio: Math.round(ratio * 100) / 100, required: pair.required })
    }
  }
  return failures
}

/** @param {{r:number,g:number,b:number}} c */
function rgbString({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}
