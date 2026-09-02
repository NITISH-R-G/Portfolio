import { useEffect } from 'react'

/** Pixels of slack at each end — see the boundary check for why this is not zero. */
const EDGE_TOLERANCE = 8

/**
 * Let a vertical wheel scroll a horizontal strip.
 *
 * A horizontally-scrolling row is a normal thing to build and a hostile thing to use with a
 * mouse: a wheel produces `deltaY`, the strip scrolls on X, and nothing happens. This one also
 * hides its scrollbar, so before this hook there was no pointer gesture that moved it at all.
 *
 * ## The rule that keeps it from feeling like scroll-jacking
 *
 * The wheel is only taken when it can actually be used. If the strip is already at the end you
 * are pushing toward, the event is left alone and the page scrolls normally — so reaching the
 * last card and continuing to scroll carries you down the page instead of trapping you in a
 * row that has nothing left to show. That boundary release is the entire difference between
 * "the panel scrolls" and "the panel has stolen my wheel".
 *
 * Three gestures are deliberately *not* touched:
 *
 * - **A horizontal gesture** (`|deltaX| > |deltaY|`) — a trackpad swipe or a tilt wheel is
 *   already doing the right thing natively, and intercepting it would double the movement.
 * - **Zoom** (`ctrlKey`) — a pinch on a trackpad arrives as a ctrl-wheel, and hijacking it
 *   breaks browser zoom.
 * - **Touch** — native touch scrolling on this axis already works and needs no help.
 *
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {{enabled?: boolean, multiplier?: number}} [options]
 */
export function useHorizontalWheel(ref, { enabled = true, multiplier = 1 } = {}) {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return undefined

    /** @param {WheelEvent} event */
    const onWheel = (event) => {
      if (event.ctrlKey) return
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

      // `deltaMode` 1 is lines and 2 is pages — Firefox reports lines for a real mouse wheel,
      // so treating the number as pixels there would move by three pixels a tick.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
      const delta = event.deltaY * unit * multiplier
      if (!delta) return

      // Release only when the strip is already at the edge *in the direction being scrolled*.
      //
      // The previous version asked whether the attempted movement was smaller than the
      // tolerance, which is a different question and answers it wrongly for small deltas: a
      // trackpad emits three- and four-pixel ticks, so a slow horizontal gesture in the middle
      // of the strip looked like "nothing would move" and leaked to the page. Wheel ticks are
      // large enough to hide it; trackpads are not.
      //
      // The tolerance is load-bearing at the start edge and not defensive padding. Scroll-snap
      // and the track's own left padding hold the resting position a few pixels short of the
      // true start — this strip settles at 4, and re-snaps back there if you scroll it to 0. An
      // exact `scrollLeft <= 0` test therefore never fires, so a backward wheel at the first
      // card was captured on every tick and moved nothing: the wheel appeared dead precisely
      // where a visitor is most likely to try it.
      const max = element.scrollWidth - element.clientWidth
      const atStart = delta < 0 && element.scrollLeft <= EDGE_TOLERANCE
      const atEnd = delta > 0 && element.scrollLeft >= max - EDGE_TOLERANCE
      if (atStart || atEnd) return

      event.preventDefault()
      element.scrollLeft = Math.max(0, Math.min(max, element.scrollLeft + delta))
    }

    // Non-passive because it conditionally calls `preventDefault`. The condition above is what
    // keeps that honest: the default is only prevented on the frames where the strip is
    // genuinely consuming the scroll.
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [ref, enabled, multiplier])
}
