import { PAGE_SECTION_BY_ENGINE_ID } from "@/features/portfolio/data/adapter"
import type { PageSectionId } from "@/features/portfolio/data/adapter"

/**
 * The parts of the page the canvas lets you select, and what each one is edited by.
 *
 * A region is a block of the real page — the same `PageSectionId`s the site renders, plus the
 * footer — so selecting one on the canvas selects exactly the thing a visitor sees. Nothing here
 * describes a component; it only names regions and says where their controls live, which is
 * why it is plain data and can be tested without a DOM.
 */

export type CanvasRegion = PageSectionId | "footer"

export const REGION_LABELS: Record<CanvasRegion, string> = {
  profile: "Header",
  hello: "About",
  overview: "Contact & links",
  github: "Contributions",
  stack: "Stack",
  showcase: "Showcase",
  blocks: "Blocks",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  awards: "Awards",
  certifications: "Certifications",
  timeline: "Timeline",
  footer: "Footer",
}

/** The admin panel holding each region's full editor — its content, not just its placement. */
export const REGION_PANEL: Record<CanvasRegion, string> = {
  profile: "profile",
  hello: "profile",
  overview: "profile",
  github: "sources",
  stack: "skills",
  showcase: "showcase",
  blocks: "blocks",
  experience: "experience",
  education: "records",
  projects: "projects",
  awards: "records",
  certifications: "records",
  timeline: "timeline",
  footer: "footer",
}

/**
 * The engine section a page region is shown or hidden by — `sections.<id>` in the config.
 * `null` for the footer, which is not a section and has its own `footer.enabled`.
 */
export function engineSectionFor(region: CanvasRegion): string | null {
  if (region === "footer") return null
  const entry = Object.entries(PAGE_SECTION_BY_ENGINE_ID).find(([, page]) => page === region)
  return entry ? entry[0] : null
}

/**
 * The region `delta` steps from `current` in page order, for the arrow keys.
 *
 * With nothing selected, Down starts at the top and Up at the bottom — the two places a reader's
 * eye goes. It stops at the ends rather than wrapping: wrapping from the footer to the header
 * moves the canvas a whole page, which reads as a jump, not a step.
 */
export function stepRegion(
  order: readonly CanvasRegion[],
  current: CanvasRegion | null,
  delta: 1 | -1
): CanvasRegion | null {
  if (order.length === 0) return null
  const index = current ? order.indexOf(current) : -1
  if (index === -1) return delta > 0 ? order[0] : order[order.length - 1]
  return order[Math.min(order.length - 1, Math.max(0, index + delta))]
}

/**
 * Swap a region's engine section with its neighbour in `sectionOrder`.
 *
 * Moves among the sections that are actually on the page — skipping engine sections this
 * application has no renderer for and, when `visible` is given, sections currently hidden —
 * otherwise "move down" would sometimes appear to do nothing, having swapped with an invisible
 * neighbour. The moved section itself always counts, since a hidden block can stay selected.
 * Returns the order unchanged when there is nowhere to go.
 */
export function moveInOrder(
  order: readonly string[],
  engineId: string,
  delta: 1 | -1,
  visible?: ReadonlySet<string>
): string[] {
  const rendered = order.filter(
    (id) => PAGE_SECTION_BY_ENGINE_ID[id] && (!visible || visible.has(id) || id === engineId)
  )
  const at = rendered.indexOf(engineId)
  const target = rendered[at + delta]
  if (at === -1 || target === undefined) return [...order]
  const next = [...order]
  const a = next.indexOf(engineId)
  const b = next.indexOf(target)
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}
