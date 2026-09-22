import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isEffectOn, effectParams, activeEffects, EFFECT_REGISTRY } from '../src/core/effects/resolve.js'
import { resolveConfig } from '../src/core/config/resolve.js'
import { defaultConfig } from '../src/core/config/defaults.js'

/**
 * The decorative effects layer.
 *
 * What this is really testing is a precedence table. Five gates decide whether an effect
 * renders, two of them are accessibility guarantees that configuration must never be able to
 * argue with, and the interesting failures are all combinations — an effect enabled with its
 * target off, a target on with the master switch off, everything on but the visitor asking for
 * reduced motion. Those are cheap to enumerate here and nearly impossible to check by clicking.
 */

const ROOT = join(import.meta.dirname, '..')
/**
 * Read a source file, or fail.
 *
 * This used to return `''` for a missing file, which quietly turned every `assert.ok(!/x/...)`
 * into a tautology — two tests here went on passing for months after the files they were about
 * were deleted. A test that cannot fail is not evidence.
 */
const source = (relative) => readFileSync(join(ROOT, relative), 'utf8')

/** Whether a source file exists at all, for assertions about absence. */
const exists = (relative) => existsSync(join(ROOT, relative))

/** A config as the site actually sees it — through the resolver, defaults filled in. */
const resolved = (overrides = {}) => resolveConfig(overrides).config

describe('defaults, and configs written before effects existed', () => {
  test('a config with no effects block keeps working', () => {
    // Backwards compatibility is the whole reason `enabled` is checked against `=== false`
    // rather than truthiness: absent means "not configured", not "off".
    const config = resolved({})
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu'), true)
    assert.equal(isEffectOn(config, 'borderBeam', 'searchField'), true)
  })

  test('every configured target has a component that reads it', { skip: 'pending re-integration into the chanhdai app' }, () => {
    // The rule that removed the old `dock` target when its component was deleted: a target
    // nothing renders is a switch in the admin that does nothing, which is worse than no
    // switch at all. `copyMenu` is the only place the goo is claimed to appear, so it had
    // better be the only place it is offered.
    const { effects } = defaultConfig()
    assert.deepEqual(Object.keys(effects.liquidGooey.targets), ['copyMenu'])
    assert.equal(effects.liquidGooey.targets.copyMenu, true)
    assert.match(source('src/components/CopyMenu.jsx'), /target="copyMenu"/)
  })

  test('every registry target has a default, and every default is in the registry', () => {
    // The two lists drifting apart is how a setting becomes unreachable from the admin, or a
    // control appears for something no component reads.
    const { effects } = defaultConfig()
    for (const [name, spec] of Object.entries(EFFECT_REGISTRY)) {
      const configured = Object.keys(effects[name]?.targets ?? {})
      assert.deepEqual(configured.sort(), Object.keys(spec.targets).sort(), name)
    }
  })
})

describe('the gates, in order', () => {
  const everythingOn = () => resolved({
    effects: { liquidGooey: { targets: { copyMenu: true } } },
  })

  test('reduced motion beats every setting', () => {
    // The gate configuration cannot reach past. A portfolio does not get to insist on motion
    // because its owner liked the look.
    const config = everythingOn()
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu', { reducedMotion: false }), true)
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu', { reducedMotion: true }), false)
    assert.equal(isEffectOn(config, 'borderBeam', 'searchField', { reducedMotion: true }), false)
    assert.deepEqual(activeEffects(config, { reducedMotion: true }), [])
  })

  test('animation intensity "none" means none, decoration included', () => {
    // Otherwise the setting would be a lie: motion switched off while the goo kept morphing.
    const config = resolved({
      animations: { intensity: 'none' },
      effects: { liquidGooey: { targets: { copyMenu: true } } },
    })
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu'), false)
    assert.deepEqual(activeEffects(config), [])
  })

  test('the master switch removes everything', () => {
    const config = resolved({ effects: { enabled: false } })
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu'), false)
    assert.equal(isEffectOn(config, 'borderBeam', 'searchField'), false)
    assert.deepEqual(activeEffects(config), [])
  })

  test('one effect off leaves the others alone', () => {
    // "Liquid Gooey off but Border Beam on" — the combination the milestone asked for by name.
    const config = resolved({ effects: { liquidGooey: { enabled: false } } })
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu'), false)
    assert.equal(isEffectOn(config, 'borderBeam', 'searchField'), true)
    assert.deepEqual(activeEffects(config), ['borderBeam'])
  })

  test('the inverse combination works too', () => {
    const config = resolved({ effects: { borderBeam: { enabled: false } } })
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu'), true)
    assert.equal(isEffectOn(config, 'borderBeam', 'searchField'), false)
    assert.deepEqual(activeEffects(config), ['liquidGooey'])
  })

  test('a target can be switched off without disabling the effect', () => {
    const config = resolved({ effects: { liquidGooey: { targets: { copyMenu: false } } } })
    assert.equal(isEffectOn(config, 'liquidGooey', 'copyMenu'), false)
    assert.equal(isEffectOn(config, 'liquidGooey'), true, 'the effect itself is still on')
  })

  test('an effect with every target off is not active anywhere', () => {
    // The distinction that decides whether a library gets downloaded.
    const config = resolved({ effects: { liquidGooey: { targets: { copyMenu: false } } } })
    assert.equal(isEffectOn(config, 'liquidGooey'), true)
    assert.ok(!activeEffects(config).includes('liquidGooey'), 'nothing to render, nothing to load')
  })

  test('an unknown target is never on, however it is configured', () => {
    const config = resolved({ effects: { liquidGooey: { targets: { copyMenu: true } } } })
    assert.equal(isEffectOn(config, 'liquidGooey', 'nowhere'), false)
    assert.equal(isEffectOn(config, 'noSuchEffect', 'copyMenu'), false)
  })
})

describe('invalid configuration falls back instead of breaking the page', () => {
  const issuesFor = (overrides) => resolveConfig(overrides).issues.filter((i) => i.path?.startsWith('effects'))

  test('a non-numeric blur keeps the default and reports why', () => {
    const { config } = resolveConfig({ effects: { liquidGooey: { blur: 'quite a lot' } } })
    assert.equal(config.effects.liquidGooey.blur, 7)
    assert.match(issuesFor({ effects: { liquidGooey: { blur: 'quite a lot' } } })[0].message, /number/)
  })

  test('negative and non-finite values are refused', () => {
    // These reach an SVG filter. `NaN` there blanks the element rather than failing loudly.
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      const { config } = resolveConfig({ effects: { liquidGooey: { contrast: bad } } })
      assert.equal(config.effects.liquidGooey.contrast, 20, String(bad))
    }
  })

  test('a non-boolean toggle keeps the default', () => {
    const { config } = resolveConfig({ effects: { enabled: 'yes', liquidGooey: { enabled: 1 } } })
    assert.equal(config.effects.enabled, true)
    assert.equal(config.effects.liquidGooey.enabled, true)
  })

  test('an unknown transition or size falls back to a supported one', () => {
    const { config } = resolveConfig({ effects: { borderBeam: { size: 'enormous' } } })
    assert.equal(config.effects.borderBeam.size, 'md')
  })

  test('unknown effects and targets are dropped, with an issue each', () => {
    const issues = issuesFor({
      effects: { sparkles: { enabled: true }, liquidGooey: { targets: { everywhere: true } } },
    })
    assert.ok(issues.some((i) => /Unknown effect "sparkles"/.test(i.message)))
    assert.ok(issues.some((i) => /Unknown target "everywhere"/.test(i.message)))

    const { config } = resolveConfig({ effects: { sparkles: { enabled: true } } })
    assert.equal(config.effects.sparkles, undefined, 'it must not survive into the config')
  })

  test('a malformed effects block is replaced wholesale', () => {
    for (const bad of ['on', 42, [], null]) {
      const { config } = resolveConfig({ effects: bad })
      assert.equal(config.effects.liquidGooey.blur, 7, String(bad))
    }
  })

  test('every issue is a warning — bad effect config never fails a build', () => {
    const issues = issuesFor({ effects: { liquidGooey: { blur: 'x', contrast: -1 }, nope: {} } })
    assert.ok(issues.length > 0)
    for (const issue of issues) assert.equal(issue.level, 'warning', issue.path)
  })
})

describe('parameters reach the effect, and only real ones exist', () => {
  test('params exclude the decisions already made', () => {
    const params = effectParams(resolved({}), 'liquidGooey')
    assert.ok(!('enabled' in params) && !('targets' in params))
    assert.equal(params.blur, 7)
  })

  test('every configurable parameter is one the library actually accepts', () => {
    // The rule against fake configuration: a setting the implementation ignores is worse than
    // no setting, because it looks like it worked. These are the props on liquid-gooey's own
    // `GooeyProps` in the installed version.
    const supported = new Set(['blur', 'contrast', 'fill', 'shadow', 'filterPadding', 'waviness', 'wavinessFreq'])
    for (const key of Object.keys(effectParams(resolved({}), 'liquidGooey'))) {
      assert.ok(supported.has(key), `${key} is configurable but not a real liquid-gooey prop`)
    }
  })

  test('an override survives resolution', () => {
    const config = resolved({ effects: { liquidGooey: { blur: 12, contrast: 30, fill: 'var(--x)' } } })
    assert.equal(config.effects.liquidGooey.blur, 12)
    assert.equal(config.effects.liquidGooey.contrast, 30)
    assert.equal(config.effects.liquidGooey.fill, 'var(--x)')
  })
})

describe.skip('the components ask the layer rather than deciding for themselves', () => {
  test('LiquidSurface is driven by config, not hard-coded numbers', () => {
    const component = source('src/components/LiquidSurface.jsx')
    assert.match(component, /useEffectSetting\('liquidGooey'/)
    assert.ok(!/blur = 7/.test(component), 'the hard-coded default must be gone')
    assert.ok(!/contrast = 20/.test(component))
  })

  test('the copy menu names its target', () => {
    assert.match(source('src/components/CopyMenu.jsx'), /target="copyMenu"/)
  })

  test('Border Beam is gated by the same layer', () => {
    const dialog = source('src/components/SearchDialog.jsx')
    assert.match(dialog, /useEffectSetting\('borderBeam', 'searchField'\)/)
    assert.match(dialog, /active=\{focused && beam\.on\}/)
  })

  test('the thinking orb is NOT switchable, because it is not decoration', () => {
    // It reports a real wait. Removing it would remove information, which is the line between
    // an effect and a control — and the reason this layer is called "decorative".
    assert.ok(!Object.keys(EFFECT_REGISTRY).includes('thinkingOrb'))
  })
})

/**
 * The effects layer currently has no renderer.
 *
 * The components that consumed it — the liquid surface, the search dialog's goo — were part of
 * the presentation layer that this repository replaced with the upstream application. The
 * resolver above is still correct and still tested, because the configuration is real and an
 * exported config still carries it. What is gone is the admin panel, and that is the point: a
 * control whose value nothing reads tells the owner it did something when it did not.
 *
 * These two tests are a tripwire in both directions. Add a consumer and the first fails, which
 * is the reminder to put the controls back. Add controls with no consumer and the second fails.
 */
describe('effects have no control while they have no consumer', () => {
  const CONSUMERS = ['src/components', 'src/features', 'src/app']

  const filesUnder = (dir) => {
    const out = []
    const walk = (current) => {
      if (!existsSync(current)) return
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const next = join(current, entry.name)
        if (entry.isDirectory()) walk(next)
        else if (/\.(t|j)sx?$/.test(entry.name)) out.push(next)
      }
    }
    walk(join(ROOT, dir))
    return out
  }

  test('nothing in the application reads the effects config', () => {
    const readers = CONSUMERS.flatMap(filesUnder).filter((file) =>
      /\bconfig\.effects\b|useEffectSetting|isEffectOn/.test(readFileSync(file, 'utf8'))
    )

    assert.deepEqual(
      readers,
      [],
      'an effect gained a consumer — restore the admin controls for it, or this config is ' +
        'again a setting that changes nothing'
    )
  })

  test('and so the admin offers no effects controls', () => {
    const panels = filesUnder('src/admin/panels').filter((file) =>
      /setConfig\((['`])effects\./.test(readFileSync(file, 'utf8'))
    )

    assert.deepEqual(
      panels,
      [],
      'effects controls exist with nothing rendering them'
    )
  })
})
