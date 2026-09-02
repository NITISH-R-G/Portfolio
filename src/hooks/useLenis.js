import { useEffect, useRef } from 'react'
import { useReducedMotion } from './useReducedMotion'

/**
 * Momentum scrolling, off unless asked for.
 *
 * ## Why it is opt-in now
 *
 * Smooth-scroll libraries replace the browser's scrolling with an animation that chases the
 * wheel. Done well it feels expensive; done at a 1.2s settle — the value this used to run —
 * the page keeps gliding long after the input stopped, and the gap between hand and page reads
 * as *lag* even though every frame is on time. The complaint that motivated this change was
 * exactly that, and no easing curve fixes it, because the problem is the delay itself.
 *
 * Native scrolling is not a downgrade here. It is the interaction every visitor's OS, mouse,
 * trackpad and accessibility settings are already tuned for, and it costs nothing per frame.
 * So `animations.smoothScroll` now defaults to `false`, and this hook does nothing at all
 * unless a portfolio owner deliberately turns it on.
 *
 * ## Two bugs this fixes for anyone who does turn it on
 *
 * **The frame loop was never cancelled.** `requestAnimationFrame(raf)` recursed
 * unconditionally, and cleanup called `lenis.destroy()` without ever cancelling the pending
 * frame — so the loop kept running for the life of the page, calling into a destroyed
 * instance every frame. Worse, any re-run of the effect (a change of reduced-motion
 * preference, or of the setting) started a *second* loop while the first kept going.
 *
 * **The library was imported eagerly.** It was in the initial bundle for every visitor,
 * including the majority for whom it now does nothing. It is dynamically imported instead.
 *
 * @param {{enabled?: boolean}} [options]
 */
export function useLenis({ enabled = false } = {}) {
  const lenisRef = useRef(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    // Reduced motion wins over the setting: a momentum animation is precisely the kind of
    // motion the preference exists to suppress.
    if (!enabled || reducedMotion) return undefined

    let frame = 0
    let instance = null
    let cancelled = false

    import('lenis').then(({ default: Lenis }) => {
      // The effect may have been cleaned up while the chunk was in flight. Without this, a
      // fast navigation leaves an instance nothing holds a reference to.
      if (cancelled) return

      instance = new Lenis({
        // Shorter than the previous 1.2s. The scroll should feel like it is following the
        // hand rather than catching up with it.
        duration: 0.9,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        touchMultiplier: 2,
      })
      lenisRef.current = instance

      const raf = (time) => {
        instance.raf(time)
        // Handle captured every frame, so cleanup can actually stop the loop.
        frame = requestAnimationFrame(raf)
      }
      frame = requestAnimationFrame(raf)
    })

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      instance?.destroy()
      lenisRef.current = null
    }
  }, [reducedMotion, enabled])

  return lenisRef
}
