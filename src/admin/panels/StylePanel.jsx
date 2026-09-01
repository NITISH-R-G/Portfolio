/**
 * Step 5: "Choose your style".
 *
 * Every control here writes a single config value, and the preview repaints from the real
 * theme resolver — so what the swatches show is what the site will render, including the
 * contrast-corrected accent foreground.
 *
 * @module admin/panels/StylePanel
 */

import { useEffect } from 'react'
import { THEME_PRESETS } from '../../core/themes/presets.js'
import { applyTheme, resolveTheme } from '../../core/themes/apply.js'
import { Panel, SelectField, TextField, Toggle, Note, Grid } from '../fields.jsx'
import { getPath } from '../state.js'

const DENSITIES = [
  { value: 'compact', label: 'Compact — more on screen' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious — more breathing room' },
]

const WIDTHS = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'default', label: 'Default' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full width' },
]

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function StylePanel({ builder }) {
  const { built, configDraft, setConfig } = builder
  const { config, theme } = built

  // Repaint the builder itself as the user chooses, so the chrome around the controls is
  // the theme being configured rather than a fixed one — the fastest way to judge a theme
  // is to be looking at it.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const value = (path, fallback) => getPath(configDraft, path, getPath(config, path, fallback))

  return (
    <Panel
      title="Style"
      description="Themes are configuration, not code. Everything below writes one value into portfolio.config.js."
    >
      <h3 className="admin-subheading">Theme</h3>
      <div className="theme-grid">
        {THEME_PRESETS.map((preset) => {
          const selected = config.theme.preset === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              className={`theme-card${selected ? ' theme-card-active' : ''}`}
              onClick={() => setConfig('theme.preset', preset.id)}
              aria-pressed={selected}
            >
              <span className="theme-swatches" aria-hidden="true">
                {swatchesOf(preset).map((colour, i) => (
                  <span key={i} className="theme-swatch" style={{ background: colour }} />
                ))}
              </span>
              <span className="theme-card-name">{preset.name}</span>
              <span className="theme-card-description">{preset.description}</span>
            </button>
          )
        })}
      </div>

      <h3 className="admin-subheading">Colour and type</h3>
      <Grid>
        <TextField
          label="Accent colour"
          value={value('theme.accent', '')}
          onChange={(v) => setConfig('theme.accent', v)}
          placeholder={theme.vars?.['--color-accent'] ?? '#6366f1'}
          help="Overrides the preset's accent. The readable foreground is computed for you."
        />
        <TextField
          label="Corner radius"
          value={value('theme.radius', '')}
          onChange={(v) => setConfig('theme.radius', v)}
          placeholder="12px"
          help="A bare number is read as pixels. 0 gives square corners."
        />
      </Grid>
      <Grid>
        <TextField
          label="Body font"
          value={value('theme.fontSans', '')}
          onChange={(v) => setConfig('theme.fontSans', v)}
          placeholder="Inter, system-ui, sans-serif"
          help="A full CSS font stack. Include a system fallback so the page renders before any webfont loads."
        />
        <TextField
          label="Monospace font"
          value={value('theme.fontMono', '')}
          onChange={(v) => setConfig('theme.fontMono', v)}
          placeholder="ui-monospace, SFMono-Regular, monospace"
        />
      </Grid>

      <h3 className="admin-subheading">Layout</h3>
      <Grid>
        <SelectField
          label="Shell"
          value={value('layout.shell', 'sidebar')}
          onChange={(v) => setConfig('layout.shell', v)}
          options={[
            { value: 'sidebar', label: 'Sidebar — identity rail beside content' },
            { value: 'stacked', label: 'Stacked — one column' },
          ]}
        />
        <SelectField
          label="Navigation"
          value={value('layout.navigation', 'dock')}
          onChange={(v) => setConfig('layout.navigation', v)}
          options={[
            { value: 'dock', label: 'Floating dock' },
            { value: 'top', label: 'Top bar' },
            { value: 'none', label: 'None' },
          ]}
        />
      </Grid>
      <Grid>
        <SelectField
          label="Density"
          value={value('theme.density', 'comfortable')}
          onChange={(v) => setConfig('theme.density', v)}
          options={DENSITIES}
        />
        <SelectField
          label="Content width"
          value={value('layout.maxWidth', 'default')}
          onChange={(v) => setConfig('layout.maxWidth', v)}
          options={WIDTHS}
        />
      </Grid>
      <Grid>
        <SelectField
          label="Projects"
          value={value('layout.projectLayout', 'carousel')}
          onChange={(v) => setConfig('layout.projectLayout', v)}
          options={[
            { value: 'carousel', label: 'Carousel' },
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
        />
        <SelectField
          label="Experience"
          value={value('layout.experienceLayout', 'cards')}
          onChange={(v) => setConfig('layout.experienceLayout', v)}
          options={[
            { value: 'cards', label: 'Cards' },
            { value: 'timeline', label: 'Timeline' },
          ]}
        />
      </Grid>
      <Grid>
        <SelectField
          label="Avatar shape"
          value={value('layout.avatarStyle', 'circle')}
          onChange={(v) => setConfig('layout.avatarStyle', v)}
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' },
          ]}
        />
        <SelectField
          label="Social icons"
          value={value('layout.socialIconStyle', 'outline')}
          onChange={(v) => setConfig('layout.socialIconStyle', v)}
          options={[
            { value: 'outline', label: 'Outline' },
            { value: 'solid', label: 'Solid' },
            { value: 'plain', label: 'Plain' },
          ]}
        />
      </Grid>

      <h3 className="admin-subheading">Motion</h3>
      <SelectField
        label="Animation intensity"
        value={value('animations.intensity', 'standard')}
        onChange={(v) => setConfig('animations.intensity', v)}
        options={[
          { value: 'none', label: 'None' },
          { value: 'subtle', label: 'Subtle' },
          { value: 'standard', label: 'Standard' },
          { value: 'expressive', label: 'Expressive' },
        ]}
      />
      <Toggle
        label="Smooth scrolling"
        checked={value('animations.smoothScroll', false)}
        onChange={(v) => setConfig('animations.smoothScroll', v)}
        help="Momentum scrolling on pointer devices. Off by default: native scrolling is what your visitor's mouse, trackpad and accessibility settings are already tuned for."
      />

      <Note icon="Info">
        <code>prefers-reduced-motion</code> is always honoured regardless of these settings, so
        a visitor who has asked their system for less motion gets it.
      </Note>
    </Panel>
  )
}

/**
 * Four representative colours per preset, for the theme cards.
 *
 * Resolved through the real theme resolver rather than read off the preset's own tokens,
 * because a preset only declares what it *changes* — `minimal-dark` declares nothing at
 * all, inheriting the base tokens entirely, and reading its raw tokens would produce four
 * blank swatches. Computed once at module load, since presets are static.
 */
const SWATCHES = Object.fromEntries(THEME_PRESETS.map((preset) => {
  const { vars } = resolveTheme({ theme: { preset: preset.id } })
  return [preset.id, [
    vars['--color-bg'],
    vars['--color-surface'],
    vars['--color-accent'],
    vars['--color-text'],
  ].filter(Boolean)]
}))

const swatchesOf = (preset) => SWATCHES[preset.id] ?? []
