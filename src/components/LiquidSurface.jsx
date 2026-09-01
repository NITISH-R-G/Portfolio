import { createContext, lazy, Suspense, useContext } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * A liquid surface: two adjacent controls rendered as one connected mass.
 *
 * This exists for exactly one kind of relationship — **a compact control and the surface it
 * opens, close enough to touch.** When the copy button opens its menu, the two are 4px apart,
 * and the goo bridges that gap into a neck so the panel reads as having been extruded from the
 * button rather than having appeared on top of it. That is a statement about state ("these are
 * one control in two configurations"), which is the only thing that justifies the cost.
 *
 * It is deliberately unsuitable for anything else, and the guardrails are structural rather
 * than advisory:
 *
 *   - **Nothing renders until `active`.** Closed, this component is a plain `<div>`; the
 *     library is never imported, no SVG filter exists, and no observer or frame loop can run.
 *     The effect cannot leak into idle cost because when idle there is nothing to leak.
 *   - **Plain merge only.** The library's shape-physics engine (`morph.shape`) is a spring
 *     simulation on a rAF loop. It is not used. The merge is a static SVG filter, and the
 *     motion comes from the CSS keyframe that was already animating this panel — so the
 *     morph adds a filter, not an animation loop.
 *   - **Smallest possible surface.** The group wraps one menu, never a section, never a page.
 *
 * @module components/LiquidSurface
 */

const Liquid = lazy(() => import('liquid-gooey').then((m) => ({ default: m.Liquid })))
const LiquidItem = lazy(() => import('liquid-gooey').then((m) => ({ default: m.Liquid.Item })))

/** Whether the surrounding surface is currently liquid. */
const LiquidContext = createContext(false)

/**
 * @param {{
 *   active?: boolean,
 *   fill?: string,
 *   blur?: number,
 *   contrast?: number,
 *   shadow?: string,
 *   filterPadding?: number,
 *   className?: string,
 *   children: React.ReactNode,
 * }} props
 */
export default function LiquidSurface({
  active = false,
  fill = 'var(--color-surface-2)',
  blur = 7,
  contrast = 20,
  shadow,
  filterPadding = 24,
  className = '',
  children,
}) {
  const reducedMotion = useReducedMotion()

  // Reduced motion takes the plain path — not a slower morph, no morph. The state change is
  // carried by the panel appearing, `aria-expanded`, and the menu's own contents, none of
  // which depend on this. Someone who asked for less motion loses a visual flourish and no
  // information.
  const liquid = active && !reducedMotion

  if (!liquid) {
    return <div className={`liquid-surface ${className}`.trim()}>{children}</div>
  }

  return (
    <LiquidContext.Provider value>
      {/* `fallback` is the un-morphed markup, so the control is fully usable during the
          chunk fetch and stays usable forever if the fetch fails — a menu that cannot open
          because a visual effect did not download would be an absurd trade. */}
      <Suspense fallback={<div className={`liquid-surface ${className}`.trim()}>{children}</div>}>
        <Liquid
          className={`liquid-surface is-liquid ${className}`.trim()}
          fill={fill}
          blur={blur}
          contrast={contrast}
          {...(shadow ? { shadow } : {})}
          // The filter region is the group's box plus this slack, and a piece outside it is
          // not merged at all — so an absolutely-positioned panel needs enough padding to fall
          // inside. Kept as tight as the geometry allows: this is raster area on every
          // repaint of the effect, and it exists only while the menu is open.
          filterPadding={filterPadding}
        >
          {children}
        </Liquid>
      </Suspense>
    </LiquidContext.Provider>
  )
}

/**
 * One piece of the liquid mass.
 *
 * Renders a plain wrapper when the surface is not liquid, so the same tree serves both paths
 * and the DOM shape does not change between them — which is what keeps focus, ARIA and
 * keyboard behaviour identical whether the effect is on or off.
 *
 * @param {{observe?: boolean, className?: string, children: React.ReactNode}} props
 */
export function LiquidPiece({ observe = false, className = '', children }) {
  const liquid = useContext(LiquidContext)

  if (!liquid) return <div className={className}>{children}</div>

  return (
    <Suspense fallback={<div className={className}>{children}</div>}>
      {/* `observe` tracks the child's rect while CSS animates it, so the silhouette follows
          the panel in. It is bounded by that animation rather than running continuously. */}
      <LiquidItem observe={observe} className={className}>
        {children}
      </LiquidItem>
    </Suspense>
  )
}
