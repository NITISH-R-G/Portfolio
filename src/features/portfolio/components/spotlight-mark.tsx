"use client"

import { useEffect, useId, useRef } from "react"
import type { Transition } from "motion/react"
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react"

import { metalClickSound } from "@/lib/soundcn/metal-click"
import { useSound } from "@/hooks/soundcn/use-sound"

/**
 * The owner's monogram, lit by a spotlight that follows the cursor.
 *
 * This is his `SpotlightLogo` (registry: `spotlight-logo`) with one thing swapped, exactly the
 * one its docblock invites: the artwork. His draws his own isometric "CD" mark, which is his
 * identity and not ours to ship — so the letters here come from the portfolio's data (the
 * configured `profile.monogram`, or the name's initials) and are drawn as type rather than as
 * someone's hand-made paths.
 *
 * Everything else is his, unchanged in behaviour and tuning:
 * - a `radialGradient` whose centre springs toward the pointer, laid over the outline as a
 *   second stroke — the spotlight;
 * - the diagonal hatch fill;
 * - `whileTap="pressed"` sinking the mark on its spring, with his metal click;
 * - no tracking when the mark is off screen, on a device without hover, or when the reader
 *   has asked for reduced motion (the spotlight then rests at the centre).
 *
 * Decorative: the name it stands for is the page's `<h1>`, so the SVG is hidden from assistive
 * technology rather than announced twice.
 */

const transition: Transition = {
  type: "spring",
  mass: 0.5,
  damping: 18,
  stiffness: 200,
}

/** Matches his mark's proportions, so the figure it sits in keeps its shape. */
const WIDTH = 556
const HEIGHT = 354

export function SpotlightMark({ text }: { text: string }) {
  const id = useId()
  const ids = {
    facePattern: `spotlight-mark-face-pattern-${id}`,
    radialGradient: `spotlight-mark-radial-gradient-${id}`,
  }

  const ref = useRef<SVGSVGElement>(null)
  const [play] = useSound(metalClickSound)

  const shouldReduceMotion = useReducedMotion()
  const isInView = useInView(ref, { margin: "80px" })

  const mouseX = useMotionValue(0.5)
  const mouseY = useMotionValue(0.5)

  const cx = useSpring(useTransform(mouseX, [0, 1], [0, WIDTH]), {
    stiffness: 300,
    damping: 30,
    mass: 0.1,
  })
  const cy = useSpring(useTransform(mouseY, [0, 1], [0, HEIGHT]), {
    stiffness: 300,
    damping: 30,
    mass: 0.1,
  })

  useEffect(() => {
    if (shouldReduceMotion || !isInView) return
    if (window.matchMedia("(hover: none)").matches) return

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX / window.innerWidth)
      mouseY.set(e.clientY / window.innerHeight)
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [shouldReduceMotion, isInView, mouseX, mouseY])

  // One glyph run, drawn four times — fill, hatch, outline, spotlight — like his `<use>` copies
  // of one path. A single definition keeps the layers aligned to the pixel.
  const glyphs = (
    <text
      x="50%"
      y="50%"
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: text.length > 2 ? 208 : 256,
        fontWeight: 700,
        letterSpacing: "-0.04em",
      }}
    >
      {text}
    </text>
  )

  return (
    <motion.svg
      ref={ref}
      className="h-auto w-full touch-manipulation [--pattern:color-mix(in_oklab,var(--foreground)_12%,var(--background))] [--stroke:color-mix(in_oklab,var(--foreground)_16%,var(--background))]"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      initial="normal"
      whileTap="pressed"
      onTap={() => play()}
    >
      <defs>
        <pattern
          id={ids.facePattern}
          x="0"
          y="0"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M-1 1l2 -2M0 10l10 -10M9 11l2 -2"
            stroke="var(--pattern)"
            strokeWidth="1"
          />
        </pattern>

        <motion.radialGradient
          id={ids.radialGradient}
          cx={cx}
          cy={cy}
          r="200"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            className="dark:[stop-color:#fff]"
            stopColor="var(--color-zinc-700)"
          />
          <stop
            className="dark:[stop-color:var(--color-zinc-600)]"
            offset="1"
            stopColor="var(--color-zinc-400)"
            stopOpacity="0"
          />
        </motion.radialGradient>
      </defs>

      {/* `y`, not a transform string — his fix: Motion runs transform strings on WAAPI, which
          would let the layers drift apart mid-press. */}
      <motion.g
        variants={{ normal: { y: 0 }, pressed: { y: 12 } }}
        transition={transition}
      >
        <g className="fill-background">{glyphs}</g>
        <g fill={`url(#${ids.facePattern})`}>{glyphs}</g>
        <g stroke="var(--stroke)" strokeWidth="2">
          {glyphs}
        </g>
        <g stroke={`url(#${ids.radialGradient})`} strokeWidth="2">
          {glyphs}
        </g>
      </motion.g>
    </motion.svg>
  )
}
