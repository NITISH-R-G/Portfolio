"use client"

import { useRef } from "react"
import { useInView, usePageInView } from "motion/react"

import { TextFlip } from "@/registry/components/text-flip"

export function FlipSentences({
  children,
  interval = 3,
  ...props
}: Omit<React.ComponentProps<"div">, "children" | "ref"> & {
  children: string[]
  /**
   * Seconds between flips. His `TextFlip` documents this prop and defaults it to 2; this
   * wrapper hard-coded 3. It is a prop rather than a constant so the admin can set it — see
   * `profile.flipInterval` in the config.
   */
  interval?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isPageInView = usePageInView()
  const isInView = useInView(ref)

  return (
    <div ref={ref} {...props}>
      <TextFlip
        className="shimmer font-mono text-sm text-balance text-muted-foreground shimmer-duration-1500 shimmer-once not-dark:shimmer-color-foreground"
        interval={interval}
        play={isPageInView && isInView}
      >
        {children}
      </TextFlip>
    </div>
  )
}
