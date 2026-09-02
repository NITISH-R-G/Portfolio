import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Guards for the liquid copy menu.
 *
 * These are deliberately *structural* rather than performance measurements. The honest reason:
 * an FPS or frame-timing assertion run in CI on a shared runner is flaky, and a flaky
 * performance test gets muted within a month — at which point it protects nothing. What can be
 * asserted deterministically is the set of properties that make the effect cheap in the first
 * place, and those are the ones that would silently rot:
 *
 *   - the library is never imported until the menu opens
 *   - the physics engine (the only rAF loop on offer) is never switched on
 *   - the filtered surface is one menu, never a section or a page
 *   - reduced motion takes the plain path
 *
 * The frame behaviour itself was profiled by hand in a real browser; the numbers are in the
 * milestone report rather than invented here.
 */

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const liquidSurface = source('../src/components/LiquidSurface.jsx')
const copyMenu = source('../src/components/CopyMenu.jsx')
const css = source('../src/styles/global.css')

describe('liquid surface: cost is opt-in', () => {
  test('the library is dynamically imported, never statically', () => {
    // A static import would put ~49 kB of SVG-filter engine into the main bundle for every
    // visitor, including the ones who never open a menu.
    assert.match(liquidSurface, /lazy\(\s*\(\)\s*=>\s*import\('liquid-gooey'\)/)
    assert.ok(!/^import .*from 'liquid-gooey'/m.test(liquidSurface), 'must not be a static import')
  })

  test('nothing liquid renders unless the surface is active', () => {
    // The structural guarantee behind "no persistent animation loop when idle": when closed
    // there is no group, no filter, and no library code in the document at all.
    assert.match(liquidSurface, /if \(!liquid\) \{[\s\S]*?return <div/)
  })

  test('reduced motion takes the plain path, not a slower morph', () => {
    assert.match(liquidSurface, /const liquid = active && !reducedMotion/)
  })

  test('the shape-physics engine is never enabled', () => {
    // `morph.shape` is the spring simulation that runs on requestAnimationFrame. Plain merge
    // is a static filter. Turning this on would reintroduce exactly the class of cost the
    // previous motion milestone removed.
    assert.ok(!/morph\s*=\s*\{[^}]*shape/.test(liquidSurface), 'morph.shape must stay off')
    assert.ok(!liquidSurface.includes('shape: true'))
  })

  test('a failed or pending chunk still renders a usable menu', () => {
    // Suspense fallbacks are the un-morphed markup, so a visual effect failing to download
    // can never stop the control from working.
    const fallbacks = liquidSurface.match(/fallback=\{<div/g) ?? []
    assert.ok(fallbacks.length >= 1, 'group must fall back to plain markup')
  })
})

describe('liquid surface: the filtered area stays small', () => {
  test('only the copy menu is wrapped — no section, nav or page container', () => {
    assert.match(copyMenu, /<LiquidSurface/)
    for (const forbidden of ['App.jsx', 'MainContent.jsx', 'PortfolioShell.jsx', 'Sidebar.jsx']) {
      const file = source(`../src/components/${forbidden}`.replace('components/App.jsx', 'App.jsx'))
        ?? ''
      assert.ok(!file.includes('LiquidSurface'), `${forbidden} must not wrap a large surface`)
    }
  })

  test('the filter region is bounded rather than unbounded', () => {
    // filterPadding is raster area on every repaint of the effect. It has to reach the panel
    // and no further.
    const match = copyMenu.match(/filterPadding=\{(\d+)\}/)
    assert.ok(match, 'filterPadding must be set explicitly')
    assert.ok(Number(match[1]) <= 200, `filterPadding ${match[1]} is larger than the panel needs`)
  })
})

describe('liquid surface: the plain path is untouched', () => {
  test('the inert wrapper adds no box', () => {
    // `display: contents` means a closed menu lays out exactly as it did before the feature
    // existed — no extra box, no changed geometry.
    assert.match(css, /\.liquid-surface \{ display: contents; \}/)
  })

  test('every liquid style is scoped to .is-liquid', () => {
    // If any of these leaked out of the `.is-liquid` scope they would apply with the effect
    // off, including under reduced motion.
    const rules = [...css.matchAll(/^\.copy-menu-liquid[^{]*\{/gm)].map((m) => m[0])
    assert.ok(rules.length > 0)
    for (const rule of rules) {
      assert.ok(rule.includes('.is-liquid'), `unscoped liquid rule: ${rule.trim()}`)
    }
  })

  test('the CSS parses — no stray text outside a comment', () => {
    // A real bug this caught during development: an unbalanced comment silently swallowed the
    // next rule, so a fix appeared to do nothing. Comment delimiters must balance.
    const opens = (css.match(/\/\*/g) ?? []).length
    const closes = (css.match(/\*\//g) ?? []).length
    assert.equal(opens, closes, 'unbalanced CSS comment delimiters')
  })
})

describe('liquid surface: state never depends on the effect', () => {
  test('open/closed is communicated by ARIA, not by the morph', () => {
    assert.match(copyMenu, /aria-expanded=\{open\}/)
    assert.match(copyMenu, /aria-haspopup="menu"/)
    assert.match(copyMenu, /role="menu"/)
  })

  test('the copied state is announced as text, not only as a visual change', () => {
    assert.match(copyMenu, /role="status"/)
    assert.match(copyMenu, /aria-live="polite"/)
    assert.match(copyMenu, /Copied to clipboard/)
  })

  test('keyboard dismissal and focus return survive the wrapper', () => {
    assert.match(copyMenu, /event\.key !== 'Escape'/)
    assert.match(copyMenu, /buttonRef\.current\?\.focus\(\)/)
  })
})
