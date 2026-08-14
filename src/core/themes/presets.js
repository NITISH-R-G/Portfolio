/**
 * Built-in themes.
 *
 * A preset is a partial token object. Anything it does not set falls through to
 * `BASE_TOKENS`, so a theme only has to describe what makes it distinct.
 *
 * Every preset is checked by `tests/themes.test.js` against WCAG AA contrast for body text,
 * muted text and accent-on-accent-contrast. A theme that fails is a bug, not a style choice —
 * choosing a look must never cost a user their readability.
 *
 * @module core/themes/presets
 */

/**
 * @typedef {object} ThemePreset
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'dark'|'light'} colorScheme
 * @property {Record<string, Record<string, string>>} tokens
 */

/** @type {ThemePreset[]} */
export const THEME_PRESETS = [
  {
    id: 'minimal-dark',
    name: 'Minimal Dark',
    description: 'Near-black monochrome with hairline borders. Restrained and content-first.',
    colorScheme: 'dark',
    tokens: {},
  },

  {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'The same restraint on paper white.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#ffffff',
        page: '#ffffff',
        sidebar: '#fafafa',
        surface: '#fafafa',
        surface2: '#f4f4f4',
        surfaceHover: '#f0f0f0',
        border: '#e6e6e6',
        borderStrong: '#cfcfcf',
        text: '#111111',
        textMuted: '#5c5c5c',
        textFaint: '#767676',
        accent: '#111111',
        accentSecondary: '#5c5c5c',
        accentContrast: '#ffffff',
        focusRing: 'rgba(0, 0, 0, 0.55)',
        selectionBg: 'rgba(0, 0, 0, 0.12)',
        selectionText: '#000000',
      },
      shadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.06)',
        md: '0 4px 16px rgba(0, 0, 0, 0.08)',
        lg: '0 12px 40px rgba(0, 0, 0, 0.10)',
      },
    },
  },

  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Warm paper, serif headings, generous measure. Reads like a printed profile.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#fbf9f4',
        page: '#fbf9f4',
        sidebar: '#f5f1e8',
        surface: '#f5f1e8',
        surface2: '#efe9dc',
        surfaceHover: '#eae3d3',
        border: '#e0d8c6',
        borderStrong: '#c4b89e',
        text: '#22201b',
        textMuted: '#5a544a',
        textFaint: '#6f6759',
        accent: '#7c2d12',
        accentSecondary: '#9a3412',
        accentContrast: '#fbf9f4',
        focusRing: 'rgba(124, 45, 18, 0.6)',
        selectionBg: 'rgba(124, 45, 18, 0.14)',
        selectionText: '#22201b',
      },
      font: {
        display: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
      },
      text: {
        hero: 'clamp(1.75rem, 3.4vw, 2.25rem)',
        body: '0.875rem',
      },
      leading: { body: '1.75' },
      tracking: { heading: '-0.01em' },
      radius: { sm: '2px', md: '3px', lg: '4px', xl: '6px' },
      card: { shadow: 'var(--shadow-none)' },
      shadow: {
        sm: '0 1px 2px rgba(60, 45, 20, 0.07)',
        md: '0 4px 16px rgba(60, 45, 20, 0.09)',
        lg: '0 12px 40px rgba(60, 45, 20, 0.12)',
      },
    },
  },

  {
    id: 'glass',
    name: 'Glass',
    description: 'Translucent panels over a soft gradient field.',
    colorScheme: 'dark',
    tokens: {
      color: {
        bg: '#0b1020',
        page: '#0b1020',
        sidebar: 'rgba(255, 255, 255, 0.04)',
        surface: 'rgba(255, 255, 255, 0.06)',
        surface2: 'rgba(255, 255, 255, 0.09)',
        surfaceHover: 'rgba(255, 255, 255, 0.12)',
        border: 'rgba(255, 255, 255, 0.12)',
        borderStrong: 'rgba(255, 255, 255, 0.26)',
        text: '#f2f5ff',
        textMuted: '#a9b4d0',
        textFaint: '#8e99b8',
        accent: '#7dd3fc',
        accentSecondary: '#c4b5fd',
        accentContrast: '#06121f',
        focusRing: 'rgba(125, 211, 252, 0.7)',
        selectionBg: 'rgba(125, 211, 252, 0.24)',
        selectionText: '#ffffff',
      },
      backdrop: {
        image:
          'radial-gradient(60rem 40rem at 12% -10%, rgba(99, 102, 241, 0.28), transparent 60%), ' +
          'radial-gradient(50rem 36rem at 88% 8%, rgba(14, 165, 233, 0.22), transparent 60%)',
      },
      radius: { sm: '10px', md: '16px', lg: '22px', xl: '28px' },
      card: {
        bg: 'var(--color-surface)',
        shadow: '0 8px 32px rgba(2, 6, 23, 0.45)',
      },
      shadow: {
        sm: '0 2px 8px rgba(2, 6, 23, 0.35)',
        md: '0 8px 32px rgba(2, 6, 23, 0.45)',
        lg: '0 20px 60px rgba(2, 6, 23, 0.55)',
      },
    },
  },

  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Monospace throughout, phosphor green, square corners.',
    colorScheme: 'dark',
    tokens: {
      color: {
        bg: '#0a0e0a',
        page: '#0a0e0a',
        sidebar: '#0d130d',
        surface: '#0d130d',
        surface2: '#121a12',
        surfaceHover: '#162116',
        border: '#1d2b1d',
        borderStrong: '#2f472f',
        text: '#d7ffd7',
        textMuted: '#7fbf7f',
        textFaint: '#6aa46a',
        accent: '#4ade80',
        accentSecondary: '#22d3ee',
        accentContrast: '#04160a',
        focusRing: 'rgba(74, 222, 128, 0.7)',
        selectionBg: 'rgba(74, 222, 128, 0.25)',
        selectionText: '#ffffff',
      },
      font: {
        sans: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      },
      radius: { sm: '0px', md: '0px', lg: '0px', xl: '0px', full: '0px' },
      tracking: { label: '0.18em', heading: '0' },
      card: { shadow: 'var(--shadow-none)' },
    },
  },

  {
    id: 'academic',
    name: 'Academic',
    description: 'Serif, high contrast, publication-forward. Built for research profiles.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#ffffff',
        page: '#ffffff',
        sidebar: '#f7f8fa',
        surface: '#f7f8fa',
        surface2: '#eef1f5',
        surfaceHover: '#e7ebf1',
        border: '#dde2e9',
        borderStrong: '#b4bdc9',
        text: '#0f172a',
        textMuted: '#4a5568',
        textFaint: '#64748b',
        accent: '#1d4ed8',
        accentSecondary: '#0f766e',
        accentContrast: '#ffffff',
        focusRing: 'rgba(29, 78, 216, 0.6)',
        selectionBg: 'rgba(29, 78, 216, 0.14)',
        selectionText: '#0f172a',
      },
      font: {
        display: "'Iowan Old Style', 'Times New Roman', Georgia, serif",
      },
      text: { body: '0.875rem' },
      leading: { body: '1.7' },
      radius: { sm: '3px', md: '4px', lg: '6px', xl: '8px' },
      card: { shadow: 'var(--shadow-none)' },
      shadow: {
        sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
        md: '0 4px 16px rgba(15, 23, 42, 0.08)',
        lg: '0 12px 40px rgba(15, 23, 42, 0.10)',
      },
    },
  },

  {
    id: 'neo-brutalist',
    name: 'Neo-Brutalist',
    description: 'Thick black rules, hard offset shadows, one loud accent.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#fffdf5',
        page: '#fffdf5',
        sidebar: '#ffe97a',
        surface: '#ffffff',
        surface2: '#fff4c2',
        surfaceHover: '#ffe97a',
        border: '#000000',
        borderStrong: '#000000',
        text: '#000000',
        textMuted: '#3d3d3d',
        textFaint: '#525252',
        accent: '#1d4ed8',
        accentSecondary: '#be123c',
        accentContrast: '#ffffff',
        focusRing: 'rgba(0, 0, 0, 0.85)',
        selectionBg: '#ffe97a',
        selectionText: '#000000',
      },
      weight: { body: '500', heading: '800', label: '800' },
      tracking: { heading: '-0.03em', label: '0.08em' },
      radius: { sm: '0px', md: '0px', lg: '0px', xl: '0px', full: '9999px' },
      shadow: {
        sm: '2px 2px 0 #000000',
        md: '4px 4px 0 #000000',
        lg: '8px 8px 0 #000000',
      },
      card: {
        border: '2px solid #000000',
        shadow: 'var(--shadow-md)',
        hoverTransform: 'translate(-2px, -2px)',
      },
    },
  },

  {
    id: 'developer',
    name: 'Developer',
    description: 'Slate dark with a blue accent and monospace metadata. Editor-adjacent.',
    colorScheme: 'dark',
    tokens: {
      color: {
        bg: '#0f172a',
        page: '#0f172a',
        sidebar: '#111c33',
        surface: '#16233d',
        surface2: '#1c2c4a',
        surfaceHover: '#22355a',
        border: '#233252',
        borderStrong: '#3b5488',
        text: '#e6edf7',
        textMuted: '#9db0cf',
        textFaint: '#8296b7',
        accent: '#60a5fa',
        accentSecondary: '#34d399',
        accentContrast: '#06122a',
        focusRing: 'rgba(96, 165, 250, 0.7)',
        selectionBg: 'rgba(96, 165, 250, 0.26)',
        selectionText: '#ffffff',
      },
      radius: { sm: '4px', md: '6px', lg: '8px', xl: '12px' },
      card: { shadow: 'var(--shadow-sm)' },
    },
  },

  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Light, navy-accented and conservative. Safe for recruiter-facing profiles.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#ffffff',
        page: '#f8fafc',
        sidebar: '#ffffff',
        surface: '#ffffff',
        surface2: '#f1f5f9',
        surfaceHover: '#e8eef5',
        border: '#e2e8f0',
        borderStrong: '#b0bccb',
        text: '#0f2038',
        textMuted: '#4a5a70',
        textFaint: '#64748b',
        accent: '#0b4f9e',
        accentSecondary: '#0e7490',
        accentContrast: '#ffffff',
        focusRing: 'rgba(11, 79, 158, 0.6)',
        selectionBg: 'rgba(11, 79, 158, 0.12)',
        selectionText: '#0f2038',
      },
      radius: { sm: '4px', md: '6px', lg: '8px', xl: '12px' },
      card: { shadow: 'var(--shadow-sm)' },
      shadow: {
        sm: '0 1px 3px rgba(15, 32, 56, 0.08)',
        md: '0 4px 16px rgba(15, 32, 56, 0.10)',
        lg: '0 12px 40px rgba(15, 32, 56, 0.12)',
      },
    },
  },

  {
    id: 'creative',
    name: 'Creative',
    description: 'Deep plum with a warm gradient field and rounded, lifted cards.',
    colorScheme: 'dark',
    tokens: {
      color: {
        bg: '#140b1f',
        page: '#140b1f',
        sidebar: '#1c1029',
        surface: '#1f1330',
        surface2: '#291a3e',
        surfaceHover: '#33214c',
        border: '#33224a',
        borderStrong: '#573a7a',
        text: '#f7eeff',
        textMuted: '#bda7d4',
        textFaint: '#a48fbd',
        accent: '#f0abfc',
        accentSecondary: '#fdba74',
        accentContrast: '#1a0b25',
        focusRing: 'rgba(240, 171, 252, 0.7)',
        selectionBg: 'rgba(240, 171, 252, 0.26)',
        selectionText: '#ffffff',
      },
      backdrop: {
        image:
          'radial-gradient(55rem 38rem at 100% 0%, rgba(217, 70, 239, 0.22), transparent 62%), ' +
          'radial-gradient(45rem 34rem at 0% 12%, rgba(251, 146, 60, 0.16), transparent 60%)',
      },
      radius: { sm: '10px', md: '16px', lg: '24px', xl: '32px' },
      card: {
        shadow: '0 10px 36px rgba(10, 4, 18, 0.5)',
        hoverTransform: 'translateY(-4px)',
      },
    },
  },

  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Pure greyscale on light. No colour at all, anywhere.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#ffffff',
        page: '#ffffff',
        sidebar: '#f2f2f2',
        surface: '#f7f7f7',
        surface2: '#ededed',
        surfaceHover: '#e4e4e4',
        border: '#dcdcdc',
        borderStrong: '#a8a8a8',
        text: '#0a0a0a',
        textMuted: '#565656',
        textFaint: '#6e6e6e',
        accent: '#0a0a0a',
        accentSecondary: '#565656',
        accentContrast: '#ffffff',
        success: '#3f3f3f',
        warning: '#565656',
        danger: '#1a1a1a',
        focusRing: 'rgba(0, 0, 0, 0.6)',
        selectionBg: 'rgba(0, 0, 0, 0.12)',
        selectionText: '#000000',
      },
      radius: { sm: '0px', md: '2px', lg: '2px', xl: '4px' },
      card: { shadow: 'var(--shadow-none)' },
      shadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.07)',
        md: '0 4px 16px rgba(0, 0, 0, 0.08)',
        lg: '0 12px 40px rgba(0, 0, 0, 0.10)',
      },
    },
  },

  {
    id: 'swiss',
    name: 'Swiss',
    description: 'Grid-led, tight tracking, a single red accent. International typographic style.',
    colorScheme: 'light',
    tokens: {
      color: {
        bg: '#ffffff',
        page: '#ffffff',
        sidebar: '#ffffff',
        surface: '#ffffff',
        surface2: '#f4f4f4',
        surfaceHover: '#ebebeb',
        border: '#111111',
        borderStrong: '#111111',
        text: '#111111',
        textMuted: '#4d4d4d',
        textFaint: '#666666',
        accent: '#d40000',
        accentSecondary: '#111111',
        accentContrast: '#ffffff',
        focusRing: 'rgba(212, 0, 0, 0.7)',
        selectionBg: 'rgba(212, 0, 0, 0.15)',
        selectionText: '#111111',
      },
      font: {
        sans: "'Helvetica Neue', Helvetica, Inter, Arial, sans-serif",
      },
      tracking: { heading: '-0.035em', label: '0.06em' },
      weight: { heading: '700', label: '700' },
      radius: { sm: '0px', md: '0px', lg: '0px', xl: '0px', full: '9999px' },
      card: {
        border: '1px solid var(--color-border)',
        shadow: 'var(--shadow-none)',
        hoverTransform: 'none',
      },
    },
  },
]

/** @type {Map<string, ThemePreset>} */
const BY_ID = new Map(THEME_PRESETS.map((t) => [t.id, t]))

/**
 * Look up a preset. Falls back to `minimal-dark` rather than throwing, so a typo in config
 * yields a working site with a warning instead of a blank page.
 *
 * @param {string|undefined} id
 * @returns {ThemePreset}
 */
export function getPreset(id) {
  return BY_ID.get(String(id ?? '')) ?? /** @type {ThemePreset} */ (BY_ID.get('minimal-dark'))
}

/** @returns {string[]} */
export function listPresetIds() {
  return THEME_PRESETS.map((t) => t.id)
}
