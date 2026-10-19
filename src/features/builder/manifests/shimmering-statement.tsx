"use client"

import type { CSSProperties } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ShimmeringText } from "@/registry/components/shimmering-text"

import { cssColor } from "../color"

/**
 * `ShimmeringText`, as a line on the page.
 *
 * The registry component is a bare `<span>`: it has no size, no alignment and no notion of the
 * visitor's motion preference. This is the thin layer that makes it usable as a statement and
 * maps the *declared* properties onto what it actually takes — the manifest says what an owner
 * may change; this says what that does.
 *
 * Reduced motion is honoured here and not left to the owner. The shimmer runs forever, and a
 * setting that lets someone leave a perpetual animation on for visitors who have asked their
 * system not to show any is not a choice that should exist. `animate` is the owner's wish;
 * `useReducedMotion` is the visitor's, and the visitor's wins.
 *
 * `isStopped` is the component's own name for the inverse of `animate`; the manifest exposes the
 * positive form because "Animate: on" reads better in an inspector than "Stopped: off".
 */

const SIZE = {
  md: "text-xl sm:text-2xl",
  lg: "text-2xl sm:text-3xl",
  xl: "text-3xl sm:text-4xl",
} as const

const ALIGN = { left: "text-left", center: "text-center" } as const

export type ShimmeringStatementProps = {
  text: string
  size: keyof typeof SIZE
  align: keyof typeof ALIGN
  duration: number
  animate: boolean
  color: string
  shimmerColor: string
}

export function ShimmeringStatement({
  text,
  size,
  align,
  duration,
  animate,
  color,
  shimmerColor,
}: ShimmeringStatementProps) {
  const prefersReducedMotion = useReducedMotion()

  // Inline custom properties beat the component's own class defaults, which is what makes a
  // chosen colour take effect without editing the registry component. Only validated, formatted
  // values ever get here (`cssColor`).
  const style: Record<string, string> = {}
  const base = cssColor(color)
  const light = cssColor(shimmerColor)
  if (base) style["--color"] = base
  if (light) style["--shimmering-color"] = light

  return (
    <p
      className={cn(
        "font-heading font-medium tracking-tight text-balance",
        SIZE[size],
        ALIGN[align]
      )}
    >
      <ShimmeringText
        text={text}
        duration={duration}
        isStopped={!animate || Boolean(prefersReducedMotion)}
        style={style as CSSProperties}
      />
    </p>
  )
}
