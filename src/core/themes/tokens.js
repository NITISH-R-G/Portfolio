/**
 * The design token contract.
 *
 * A theme is a plain object of tokens, not a stylesheet. Components never reference a theme
 * by name and never branch on one — they consume CSS custom properties, and a theme decides
 * what those properties contain. Adding a theme therefore touches exactly one file
 * (`presets.js`) and no component.
 *
 * Token names deliberately match the ones the original stylesheet already used, so the
 * existing visual design became themeable without being rewritten.
 *
 * @module core/themes/tokens
 */

/**
 * Every token the stylesheet may reference, with the value used when a theme does not
 * specify one. A theme that only sets `color.bg` still produces a complete, coherent UI.
 *
 * Grouped by concern purely for readability; the flattened CSS variable name is
 * `--{group}-{key}` with camelCase converted to kebab-case.
 *
 * @type {Record<string, Record<string, string>>}
 */
export const BASE_TOKENS = {
  color: {
    /* Surfaces, back to front. */
    bg: '#000000',
    page: '#000000',
    sidebar: '#030303',
    surface: '#080808',
    surface2: '#111111',
    surfaceHover: '#111111',

    /* Lines. */
    border: '#1a1a1a',
    borderStrong: '#2a2a2a',

    /* Text, most to least prominent. */
    text: '#f0f0f0',
    textMuted: '#999999',
    textFaint: '#666666',

    /* Accent. `accentContrast` must be readable *on* `accent`. */
    accent: '#f0f0f0',
    accentSecondary: '#999999',
    accentContrast: '#000000',

    /* Semantic. */
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',

    focusRing: 'rgba(255, 255, 255, 0.5)',
    selectionBg: 'rgba(255, 255, 255, 0.16)',
    selectionText: '#ffffff',
  },

  font: {
    sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    display: 'inherit',
  },

  text: {
    hero: 'clamp(1.5rem, 3vw, 1.875rem)',
    section: 'clamp(0.625rem, 1vw, 0.6875rem)',
    cardTitle: 'clamp(0.875rem, 1.2vw, 0.9375rem)',
    body: '0.8125rem',
    meta: '0.6875rem',
  },

  tracking: {
    label: '0.12em',
    heading: '-0.02em',
    body: '0',
  },

  leading: {
    hero: '1.25',
    body: '1.65',
    meta: '1.4',
  },

  weight: {
    body: '400',
    medium: '500',
    heading: '600',
    label: '600',
  },

  /** Base spacing scale. `density` multiplies these; see `scaleSpacing`. */
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '32px',
    8: '40px',
  },

  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '20px',
    full: '9999px',
  },

  shadow: {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 4px 16px rgba(0, 0, 0, 0.4)',
    lg: '0 12px 40px rgba(0, 0, 0, 0.5)',
  },

  /** Component-level tokens, so a theme can restyle cards without touching card CSS. */
  card: {
    bg: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    radius: 'var(--radius-lg)',
    shadow: 'var(--shadow-none)',
    hoverBorder: 'var(--color-border-strong)',
    hoverTransform: 'translateY(-2px)',
  },

  button: {
    radius: 'var(--radius-sm)',
    weight: '500',
  },

  /** Page background layer — a gradient, image or `none`. */
  backdrop: {
    image: 'none',
    size: 'auto',
    blend: 'normal',
  },

  motion: {
    /** Multiplier applied to every duration. Set to `0` by the `none` intensity. */
    scale: '1',
    ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fast: '0.18s',
    base: '0.26s',
    slow: '0.52s',
  },

  layout: {
    /** Content column cap. Overridden by `layout.maxWidth`. */
    maxWidth: '760px',
    sidebarWidth: 'clamp(320px, 26vw, 380px)',
    sectionGap: 'var(--space-8)',
  },
}

/** Spacing multipliers for the three density settings. */
export const DENSITY_SCALE = {
  compact: 0.75,
  comfortable: 1,
  spacious: 1.35,
}

/** Content-width values for `layout.maxWidth`. */
export const MAX_WIDTHS = {
  narrow: '620px',
  default: '760px',
  wide: '960px',
  full: '100%',
}

/** Motion multipliers for `animations.intensity`. */
export const MOTION_SCALE = {
  none: 0,
  subtle: 0.6,
  standard: 1,
  expressive: 1.4,
}

/**
 * Convert a camelCase token key to its CSS custom property suffix.
 * `surfaceHover` → `surface-hover`, `2` → `2`.
 *
 * @param {string} key
 * @returns {string}
 */
export function kebab(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Flatten a nested token object into `{ '--color-bg': '#000', ... }`.
 *
 * @param {Record<string, Record<string, string>>} groups
 * @returns {Record<string, string>}
 */
export function flattenTokens(groups) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [group, values] of Object.entries(groups)) {
    if (!values || typeof values !== 'object') continue
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) continue
      out[`--${kebab(group)}-${kebab(key)}`] = String(value)
    }
  }
  return out
}

/**
 * Apply a density multiplier to the spacing scale, rounding to whole pixels so borders and
 * text stay on the pixel grid.
 *
 * @param {Record<string, string>} space
 * @param {number} multiplier
 * @returns {Record<string, string>}
 */
export function scaleSpacing(space, multiplier) {
  if (multiplier === 1) return { ...space }
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, value] of Object.entries(space)) {
    const match = /^(-?[\d.]+)px$/.exec(String(value))
    out[key] = match ? `${Math.max(1, Math.round(Number(match[1]) * multiplier))}px` : value
  }
  return out
}

/**
 * Deep-merge token groups. Used to layer a preset over the base and user overrides over
 * the preset.
 *
 * @param {Record<string, Record<string, string>>} base
 * @param {Record<string, Record<string, string>>|undefined} patch
 * @returns {Record<string, Record<string, string>>}
 */
export function mergeTokens(base, patch) {
  /** @type {Record<string, Record<string, string>>} */
  const out = {}
  for (const [group, values] of Object.entries(base)) out[group] = { ...values }
  if (!patch || typeof patch !== 'object') return out
  for (const [group, values] of Object.entries(patch)) {
    if (!values || typeof values !== 'object') continue
    out[group] = { ...(out[group] ?? {}), ...values }
  }
  return out
}
