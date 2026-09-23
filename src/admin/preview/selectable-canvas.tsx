"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import type { CanvasRegion } from "./canvas-regions"
import { REGION_LABELS, stepRegion } from "./canvas-regions"

/**
 * The portfolio as a canvas you select parts of, the way a design tool does.
 *
 * The page inside is the real one (`PortfolioPreview` with `regions`), whose blocks carry
 * `data-canvas-region`. This layer only reads those marks: hovering outlines a block, clicking
 * selects it, and the inspector beside the canvas follows the selection.
 *
 * While the canvas is in this mode the page's own links and buttons do not fire — a click on a
 * project link selects Projects rather than leaving the editor, which is what a click on a
 * canvas means. The page's interactivity is still there in every other panel's preview.
 *
 * Keyboard: the canvas is one tab stop. ↑/↓ step through the blocks in page order, Enter opens
 * the selected block's full editor, Escape clears the selection (and only then, with nothing
 * selected, lets Escape reach the inspector). A polite live region names each selection, since
 * an outline is not something a screen reader can see.
 */
export function SelectableCanvas({
  selected,
  onSelect,
  onOpen,
  children,
  className,
}: {
  selected: CanvasRegion | null
  onSelect: (region: CanvasRegion | null) => void
  /** Enter on a selection: open that block's full editor. */
  onOpen?: (region: CanvasRegion) => void
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<CanvasRegion | null>(null)

  const regionAt = (target: EventTarget | null): HTMLElement | null => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-canvas-region]") : null
    return element && ref.current?.contains(element) ? element : null
  }

  const regions = (): HTMLElement[] =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-canvas-region]") ?? [])

  // Reflect hover and selection onto the blocks themselves, where the outline is drawn. Done on
  // the DOM rather than through props so the page's components stay the page's components.
  useEffect(() => {
    for (const element of regions()) {
      const id = element.dataset.canvasRegion
      element.toggleAttribute("data-canvas-hovered", id === hovered && id !== selected)
      element.toggleAttribute("data-canvas-selected", id === selected)
    }
  })

  // Keep a keyboard selection in view — the canvas scrolls inside its frame, not the page.
  useEffect(() => {
    if (!selected) return
    ref.current
      ?.querySelector<HTMLElement>(`[data-canvas-region="${selected}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const order = regions().map((element) => element.dataset.canvasRegion as CanvasRegion)
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      onSelect(stepRegion(order, selected, event.key === "ArrowDown" ? 1 : -1))
    } else if (event.key === "Escape" && selected) {
      // Claimed only when there is something to clear; otherwise Escape falls through to the
      // inspector's own "hide" binding, which checks `defaultPrevented`.
      event.preventDefault()
      onSelect(null)
    } else if (event.key === "Enter" && selected && event.target === ref.current) {
      event.preventDefault()
      onOpen?.(selected)
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label="Portfolio canvas. Use the up and down arrow keys to select a section, Enter to open its editor, and Escape to clear the selection."
      className={cn(
        "relative outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "[&_[data-canvas-region]]:relative [&_[data-canvas-region]]:cursor-default",
        // Hover: a quiet dashed outline. Selection: a solid one with the block's name on it.
        "[&_[data-canvas-hovered]]:outline-1 [&_[data-canvas-hovered]]:-outline-offset-1 [&_[data-canvas-hovered]]:outline-sky-500/60 [&_[data-canvas-hovered]]:outline-dashed",
        "[&_[data-canvas-selected]]:z-10 [&_[data-canvas-selected]]:outline-2 [&_[data-canvas-selected]]:-outline-offset-2 [&_[data-canvas-selected]]:outline-sky-500",
        "[&_[data-canvas-selected]]:before:pointer-events-none [&_[data-canvas-selected]]:before:absolute [&_[data-canvas-selected]]:before:top-0 [&_[data-canvas-selected]]:before:left-0 [&_[data-canvas-selected]]:before:z-20 [&_[data-canvas-selected]]:before:rounded-br-md [&_[data-canvas-selected]]:before:bg-sky-500 [&_[data-canvas-selected]]:before:px-1.5 [&_[data-canvas-selected]]:before:py-0.5 [&_[data-canvas-selected]]:before:font-mono [&_[data-canvas-selected]]:before:text-[0.6875rem] [&_[data-canvas-selected]]:before:text-white [&_[data-canvas-selected]]:before:content-[attr(data-canvas-label)]",
        className
      )}
      onPointerMove={(event) => {
        const region = regionAt(event.target)
        setHovered((region?.dataset.canvasRegion as CanvasRegion) ?? null)
      }}
      onPointerLeave={() => setHovered(null)}
      onClickCapture={(event) => {
        const region = regionAt(event.target)
        if (!region) return
        // The page's own link or button does not run: on a canvas a click selects.
        event.preventDefault()
        event.stopPropagation()
        onSelect(region.dataset.canvasRegion as CanvasRegion)
      }}
      onKeyDown={onKeyDown}
    >
      {children}

      <p className="sr-only" aria-live="polite">
        {selected ? `Selected: ${REGION_LABELS[selected]}` : ""}
      </p>
    </div>
  )
}
