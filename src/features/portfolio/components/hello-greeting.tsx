"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, useReducedMotion } from "motion/react"

import { AppleHelloEffectEnglish } from "@/registry/components/apple-hello-effect/apple-hello-effect-english"
import { AppleHelloEffectHindi } from "@/registry/components/apple-hello-effect/apple-hello-effect-hindi"
import { AppleHelloEffectSpanish } from "@/registry/components/apple-hello-effect/apple-hello-effect-spanish"
import { AppleHelloEffectVietnamese } from "@/registry/components/apple-hello-effect/apple-hello-effect-vietnamese"

/**
 * His Apple "hello", written in every language his registry draws, then settling on English.
 *
 * These are the registry's own components, not a reconstruction: each variant is a set of
 * hand-drawn strokes that write themselves in, reports `onAnimationComplete` when the last
 * stroke lands, and fades out through `AnimatePresence` — the `exit` its SVG already declares.
 * The sequence only chains them. There are four because there are four; a "Bonjour" would mean
 * inventing handwriting the registry does not have.
 *
 * Decorative, and hidden from assistive technology: the section's real heading is the `<h2>`
 * beside it, which is in the server-rendered HTML whether or not this ever runs.
 *
 * With reduced motion there is no sequence and no drawing — the English word appears complete
 * (its strokes at zero duration), so the panel keeps its shape and its greeting.
 */

const SEQUENCE = [
  AppleHelloEffectEnglish,
  AppleHelloEffectSpanish,
  AppleHelloEffectHindi,
  AppleHelloEffectVietnamese,
] as const

/** How long a finished word stays on screen before the next begins writing. */
const HOLD_MS = 900

export function HelloGreeting() {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [settled, setSettled] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const advance = () => {
    if (settled) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (index < SEQUENCE.length - 1) setIndex(index + 1)
      else setSettled(true)
    }, HOLD_MS)
  }

  const Word = settled || reduceMotion ? AppleHelloEffectEnglish : SEQUENCE[index]
  const key = reduceMotion ? "still" : settled ? "settled" : String(index)

  return (
    // A fixed height, so the words — which differ in width — never move the text below.
    <div className="flex h-14 items-center sm:h-16" aria-hidden>
      <AnimatePresence mode="wait" initial={!reduceMotion}>
        <Word
          key={key}
          className="h-full w-auto"
          durationScale={reduceMotion ? 0 : 1}
          onAnimationComplete={reduceMotion ? undefined : advance}
        />
      </AnimatePresence>
    </div>
  )
}
