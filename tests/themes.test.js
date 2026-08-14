import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { THEME_PRESETS, getPreset, listPresetIds } from '../src/core/themes/presets.js'
import { resolveTheme, toCss } from '../src/core/themes/apply.js'
import { contrastRatio, checkContrast, parseColor, composite } from '../src/core/themes/contrast.js'
import { BASE_TOKENS, flattenTokens, scaleSpacing, kebab } from '../src/core/themes/tokens.js'
import { resolveConfig } from '../src/core/config/resolve.js'

/** Resolve a theme the way the app does: through a resolved config. */
const themeFor = (theme = {}, rest = {}) =>
  resolveTheme(resolveConfig({ theme, ...rest }).config)

describe('token flattening', () => {
  test('produces kebab-case css variables', () => {
    const vars = flattenTokens({ color: { surfaceHover: '#111' }, space: { 1: '4px' } })
    assert.equal(vars['--color-surface-hover'], '#111')
    assert.equal(vars['--space-1'], '4px')
  })

  test('kebab handles camelCase and digits', () => {
    assert.equal(kebab('surfaceHover'), 'surface-hover')
    assert.equal(kebab('accentContrast'), 'accent-contrast')
    assert.equal(kebab('2'), '2')
  })

  test('density scaling adjusts px values and leaves others alone', () => {
    const scaled = scaleSpacing({ 1: '4px', x: '1rem' }, 1.5)
    assert.equal(scaled[1], '6px')
    assert.equal(scaled.x, '1rem')
    assert.equal(scaleSpacing({ 1: '4px' }, 1)[1], '4px')
  })
})

describe('contrast maths', () => {
  test('parses the colour forms themes actually use', () => {
    assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 })
    assert.deepEqual(parseColor('#000000'), { r: 0, g: 0, b: 0, a: 1 })
    assert.deepEqual(parseColor('rgba(255, 255, 255, 0.5)'), { r: 255, g: 255, b: 255, a: 0.5 })
    assert.equal(parseColor('rebeccapurple'), null)
    assert.equal(parseColor('var(--x)'), null)
  })

  test('known ratios', () => {
    assert.equal(Math.round(contrastRatio('#ffffff', '#000000')), 21)
    assert.equal(Math.round(contrastRatio('#000000', '#000000')), 1)
  })

  test('composites translucent colours before measuring', () => {
    const over = composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 })
    assert.equal(Math.round(over.r), 128)
    assert.equal(over.a, 1)
  })

  test('returns null rather than guessing for unparseable colours', () => {
    assert.equal(contrastRatio('linear-gradient(red, blue)', '#fff'), null)
  })
})

describe('built-in themes', () => {
  test('there are at least a dozen, with unique ids', () => {
    assert.ok(THEME_PRESETS.length >= 12, `expected >= 12 themes, got ${THEME_PRESETS.length}`)
    assert.equal(new Set(listPresetIds()).size, THEME_PRESETS.length)
  })

  test('every theme declares required metadata', () => {
    for (const preset of THEME_PRESETS) {
      assert.ok(preset.id, 'id')
      assert.ok(preset.name, `${preset.id}: name`)
      assert.ok(preset.description, `${preset.id}: description`)
      assert.ok(['dark', 'light'].includes(preset.colorScheme), `${preset.id}: colorScheme`)
    }
  })

  for (const preset of THEME_PRESETS) {
    test(`"${preset.id}" meets WCAG AA for every readable pair`, () => {
      const { vars } = themeFor({ preset: preset.id })
      const failures = checkContrast(vars)
      assert.deepEqual(
        failures, [],
        `${preset.id} contrast failures: ${failures.map((f) => `${f.pair} ${f.ratio}:1 (needs ${f.required}:1)`).join('; ')}`,
      )
    })

    test(`"${preset.id}" resolves a complete token set`, () => {
      const { vars } = themeFor({ preset: preset.id })
      // Every base token must survive resolution, or a component's var() falls back to nothing.
      for (const name of Object.keys(flattenTokens(BASE_TOKENS))) {
        assert.ok(name in vars, `${preset.id} is missing ${name}`)
      }
    })
  }

  test('an unknown preset falls back instead of throwing', () => {
    assert.equal(getPreset('does-not-exist').id, 'minimal-dark')
    assert.equal(themeFor({ preset: 'nope' }).presetId, 'minimal-dark')
  })
})

describe('theme customization', () => {
  test('accent shortcut sets accent and an automatically readable contrast colour', () => {
    const light = themeFor({ accent: '#ffee00' })
    assert.equal(light.vars['--color-accent'], '#ffee00')
    assert.equal(light.vars['--color-accent-contrast'], '#000000', 'dark text on a light accent')

    const dark = themeFor({ accent: '#12005e' })
    assert.equal(dark.vars['--color-accent-contrast'], '#ffffff', 'light text on a dark accent')
  })

  test('radius shortcut accepts a bare number', () => {
    const { vars } = themeFor({ radius: '0' })
    assert.equal(vars['--radius-md'], '0px')
    assert.equal(themeFor({ radius: '1rem' }).vars['--radius-lg'], '1rem')
  })

  test('nested token overrides win over the preset', () => {
    const { vars } = themeFor({ preset: 'terminal', tokens: { color: { bg: '#123456' } } })
    assert.equal(vars['--color-bg'], '#123456')
    assert.equal(vars['--radius-md'], '0px', 'unrelated preset tokens survive')
  })

  test('flat --custom-property overrides are supported', () => {
    const { vars } = themeFor({ tokens: { '--color-bg': '#abcdef', '--my-own': '3px' } })
    assert.equal(vars['--color-bg'], '#abcdef')
    assert.equal(vars['--my-own'], '3px')
  })

  test('a top-level colour shorthand is interpreted as a colour token', () => {
    const { vars } = themeFor({ tokens: { textMuted: '#abcabc' } })
    assert.equal(vars['--color-text-muted'], '#abcabc')
  })

  test('density scales the spacing ramp', () => {
    assert.equal(themeFor({ density: 'compact' }).vars['--space-8'], '30px')
    assert.equal(themeFor({ density: 'comfortable' }).vars['--space-8'], '40px')
    assert.equal(themeFor({ density: 'spacious' }).vars['--space-8'], '54px')
  })

  test('layout max width feeds a token', () => {
    assert.equal(resolveTheme(resolveConfig({ layout: { maxWidth: 'wide' } }).config).vars['--layout-max-width'], '960px')
    assert.equal(resolveTheme(resolveConfig({ layout: { maxWidth: 'full' } }).config).vars['--layout-max-width'], '100%')
  })

  test('animation intensity feeds the motion scale, and none means zero', () => {
    assert.equal(resolveTheme(resolveConfig({ animations: { intensity: 'none' } }).config).vars['--motion-scale'], '0')
    assert.equal(resolveTheme(resolveConfig({ animations: { intensity: 'expressive' } }).config).vars['--motion-scale'], '1.4')
  })

  test('colorScheme can be forced', () => {
    assert.equal(themeFor({ preset: 'minimal-dark', colorScheme: 'light' }).colorScheme, 'light')
    assert.equal(themeFor({ preset: 'minimal-light' }).colorScheme, 'light')
  })
})

describe('css emission', () => {
  test('emits a :root rule', () => {
    const css = toCss({ '--color-bg': '#000', '--space-1': '4px' })
    assert.match(css, /^:root \{/)
    assert.match(css, /--color-bg: #000;/)
  })

  test('strips characters that could break out of the rule or the style element', () => {
    const css = toCss({ '--x': 'red; } body { display:none' })
    assert.ok(!css.includes('}'.repeat(1) + ' body'), 'must not allow rule escape')
    assert.ok(!/[<>]/.test(css))
  })

  test('drops variable names that are not valid custom properties', () => {
    const css = toCss({ 'color': 'red', '--ok': 'blue' })
    assert.ok(!css.includes('color: red'))
    assert.ok(css.includes('--ok: blue'))
  })
})
