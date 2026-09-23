"use client"

import { useReducedMotion } from "motion/react"
import { useTheme } from "next-themes"

import { DotGridSpotlight } from "@/registry/components/dot-grid-spotlight"

import { SpotlightMark } from "./spotlight-mark"

/**
 * His dot values from `ProfileCover`, so the grid reads as a faint ground the spotlight lifts,
 * not as a pattern competing with the mark in front of it.
 */
const DOT_COLOR = {
  light: { default: "rgba(0, 0, 0, 0.06)", active: "rgba(0, 0, 0, 0.12)" },
  dark: { default: "rgba(255, 255, 255, 0.05)", active: "rgba(255, 255, 255, 0.1)" },
}

/**
 * The hero figure's art: his `DotGridSpotlight` as the ground and the owner's spotlight mark on
 * it — the two interactions of his `ProfileCover` and `ProfileHeader`, joined in the slot his
 * header reserves for them.
 *
 * Both answer the same pointer, so the grid brightens where the mark's outline lights up. With
 * reduced motion the grid's reach is zero (no dots follow the pointer) and the mark's spotlight
 * rests, leaving a still, legible figure.
 */
export function ProfileCoverArt({ monogram }: { monogram: string }) {
  const { resolvedTheme } = useTheme()
  const reduceMotion = useReducedMotion()
  const colors = DOT_COLOR[resolvedTheme === "dark" ? "dark" : "light"]

  return (
    <>
      <DotGridSpotlight
        className="absolute inset-0"
        dotColor={colors.default}
        activeDotColor={colors.active}
        interactionRadius={reduceMotion ? 0 : 128}
      />

      {monogram && (
        <div className="relative mx-auto w-full max-w-72 px-4 sm:max-w-80">
          <SpotlightMark text={monogram} />
        </div>
      )}
    </>
  )
}
