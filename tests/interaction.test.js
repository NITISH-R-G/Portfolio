import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

/**
 * Guards for the interaction fixes: the custom cursor, the scroll conflict, and the horizontal
 * wheel. Structural rather than timing-based — a frame-rate assertion on a shared runner is
 * flaky, and a flaky test gets muted, at which point it guards nothing. What can be asserted
 * deterministically is the set of conditions that caused the problems in the first place.
 */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('the custom cursor is gone, not hidden', () => {
  test('the component no longer exists', () => {
    assert.equal(existsSync(new URL('../src/components/UserCursor.jsx', import.meta.url)), false)
  })

  test('nothing renders or configures it', () => {
    // Removing the runtime work was the point. A component still mounted behind a flag would
    // keep its pointer listeners and its animation frame loop alive for anyone who enabled it.
    for (const path of ['../src/App.jsx', '../src/core/config/defaults.js', '../src/core/config/types.js']) {
      const source = read(path)
      assert.ok(!/UserCursor|customCursor/.test(source), `${path} still references the cursor`)
    }
  })

  test('no cursor-hiding styles survive', () => {
    const css = read('../src/styles/global.css')
    assert.ok(!css.includes('custom-cursor-active'), 'cursor-hiding rules still present')
    assert.ok(!css.includes('.cursor-ring'), 'cursor element styles still present')
    assert.ok(!/cursor:\s*none/.test(css), 'something still hides the native cursor')
  })
})

describe('one scroll system, not two', () => {
  test('CSS does not impose smooth scrolling globally', () => {
    // `scroll-behavior: smooth` on the root animated the same scrollTop the momentum library
    // was driving, and silently overrode the `behavior: 'auto'` that call sites pass under
    // reduced motion.
    const css = read('../src/styles/global.css')

    // Every rule whose selector mentions `html`, wherever it appears in the file — including
    // inside media queries, which is where the second one lives. Slicing at the first `a {`
    // only covered whatever happened to be declared above that point, so a
    // `scroll-behavior: smooth` added anywhere later would have gone unnoticed.
    //
    // Comments are stripped first: they contain braces, which would otherwise split a
    // selector from its body.
    const rules = css.replace(/[/][*][^]*?[*][/]/g, '')
    const htmlRules = [...rules.matchAll(/([^{}]+)[{]([^{}]*)[}]/g)]
      .filter(([, selector]) => /(?:^|[\s,>+~])html(?:$|[\s,:.[])/.test(selector.trim() + ' '))

    assert.ok(htmlRules.length > 0, 'no html rule found — the selector convention changed')

    for (const [, selector, body] of htmlRules) {
      assert.ok(
        !/scroll-behavior:[\s]*smooth/.test(body),
        `${selector.trim()} forces smooth scrolling, which overrides behavior: 'auto' at call sites`,
      )
    }
  })

  test('momentum scrolling is opt-in', () => {
    assert.match(read('../src/core/config/defaults.js'), /smoothScroll:\s*false/)
  })

  test('the frame loop is cancellable and the library is lazy', () => {
    const source = read('../src/hooks/useLenis.js')
    // The original recursed with `requestAnimationFrame(raf)` and never captured the handle,
    // so cleanup could not stop it: the loop ran for the life of the page against a destroyed
    // instance, and a second effect run started a second loop alongside it.
    assert.match(source, /cancelAnimationFrame/)
    assert.match(source, /frame = requestAnimationFrame/)
    assert.ok(!/^import Lenis from 'lenis'/m.test(source), 'must not be a static import')
  })
})

describe('the horizontal strip takes the wheel', () => {
  const source = read('../src/hooks/useHorizontalWheel.js')

  test('a horizontal gesture and pinch-zoom are left alone', () => {
    // Intercepting either would double a trackpad swipe or break browser zoom.
    assert.match(source, /event\.ctrlKey/)
    assert.match(source, /Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\)/)
  })

  test('line and page delta modes are converted', () => {
    // Firefox reports `deltaMode: 1` (lines) for a real wheel; treating that as pixels moves
    // the strip three pixels a tick.
    assert.match(source, /deltaMode === 1/)
  })

  test('the gesture is released at the boundaries rather than trapped', () => {
    assert.match(source, /EDGE_TOLERANCE/)
    assert.match(source, /Math\.max\(0, Math\.min\(max/)
  })

  test('the tolerance exists because snap holds the strip off its true edge', () => {
    // Scroll-snap plus the track's padding rest this strip at 4, so `scrollLeft <= 0` never
    // fires and a backward wheel at the first card was captured forever.
    assert.match(source, /const EDGE_TOLERANCE = \d+/)
  })

  test('the track no longer snaps mandatorily', () => {
    const css = read('../src/styles/global.css')
    assert.ok(!css.includes('scroll-snap-type: x mandatory'), 'mandatory snap clamps the scroll range')
    assert.match(css, /scroll-snap-type: x proximity/)
  })
})
