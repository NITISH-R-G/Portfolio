import fs from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type * as MotionReact from "motion/react"

import { buildPortfolio } from "@/core/generate/build.js"
import { PAGE_SECTION_BY_ENGINE_ID } from "@/features/portfolio/data/adapter"

import {
  REGION_LABELS,
  REGION_PANEL,
  engineSectionFor,
  moveInOrder,
  stepRegion,
} from "./preview/canvas-regions"
import type { CanvasRegion } from "./preview/canvas-regions"
import { PortfolioPreview } from "./preview/portfolio-preview"
import { SelectableCanvas } from "./preview/selectable-canvas"

// The hero's animations read the reduced-motion preference, which has no answer in Node.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>()
  return { ...actual, useReducedMotion: () => true }
})

/**
 * The admin canvas: the real page, selectable a block at a time.
 *
 * What is pinned here is the model — which blocks exist, what each one is shown by, where its
 * full editor lives, how the arrow keys walk them — and the markup contract between the canvas
 * and the page. Pointer and keyboard behaviour run in the browser, and are verified there.
 */

const ROOT = process.cwd()

describe("canvas regions", () => {
  it("name every block the page can render, and the footer", () => {
    const pageIds = new Set(Object.values(PAGE_SECTION_BY_ENGINE_ID))
    for (const id of pageIds) expect(REGION_LABELS, id).toHaveProperty(id)
    expect(REGION_LABELS.footer).toBe("Footer")
  })

  it("open an editor that exists", () => {
    // The admin's own panel list, read from the shell, so a renamed panel breaks this.
    const shell = fs.readFileSync(path.join(ROOT, "src/admin/AdminEditor.jsx"), "utf8")
    const panels = new Set([...shell.matchAll(/\{ id: '([a-z]+)', title:/g)].map((m) => m[1]))
    expect(panels.size).toBeGreaterThan(10)
    for (const [region, panel] of Object.entries(REGION_PANEL)) {
      expect(panels.has(panel), `${region} → ${panel}`).toBe(true)
    }
  })

  it("are shown or hidden by their engine section", () => {
    expect(engineSectionFor("profile")).toBe("hero")
    expect(engineSectionFor("hello")).toBe("about")
    expect(engineSectionFor("stack")).toBe("skills")
    expect(engineSectionFor("awards")).toBe("achievements")
    expect(engineSectionFor("footer")).toBeNull()
  })
})

describe("stepping through the blocks", () => {
  const order: CanvasRegion[] = ["profile", "hello", "stack", "footer"]

  it("starts at the top going down, and at the bottom going up", () => {
    expect(stepRegion(order, null, 1)).toBe("profile")
    expect(stepRegion(order, null, -1)).toBe("footer")
  })

  it("moves one block at a time and stops at the ends", () => {
    expect(stepRegion(order, "hello", 1)).toBe("stack")
    expect(stepRegion(order, "hello", -1)).toBe("profile")
    expect(stepRegion(order, "footer", 1)).toBe("footer")
    expect(stepRegion(order, "profile", -1)).toBe("profile")
  })

  it("recovers when the selection has left the page", () => {
    // Hiding the selected block removes it from the order; the next arrow press starts over.
    expect(stepRegion(order, "timeline", 1)).toBe("profile")
    expect(stepRegion([], "hello", 1)).toBeNull()
  })
})

describe("moving a block", () => {
  it("swaps with the next rendered section, skipping ones with no renderer", () => {
    // `publications` has no component in this application; moving About down past it would
    // otherwise look like a click that did nothing.
    const order = ["hero", "about", "publications", "skills"]
    expect(moveInOrder(order, "about", 1)).toEqual(["hero", "skills", "publications", "about"])
    expect(moveInOrder(order, "about", -1)).toEqual(["about", "hero", "publications", "skills"])
  })

  it("skips hidden neighbours, so a move always changes what is on the page", () => {
    // Blocks is hidden: moving Showcase down past it alone would look like nothing happened.
    const order = ["showcase", "blocks", "experience"]
    const visible = new Set(["showcase", "experience"])
    expect(moveInOrder(order, "showcase", 1, visible)).toEqual(["experience", "blocks", "showcase"])
    // A hidden block that is still selected can itself be moved.
    expect(moveInOrder(order, "blocks", 1, visible)).toEqual(["showcase", "experience", "blocks"])
  })

  it("leaves the order alone at the ends", () => {
    const order = ["hero", "about"]
    expect(moveInOrder(order, "hero", -1)).toEqual(order)
    expect(moveInOrder(order, "about", 1)).toEqual(order)
    expect(moveInOrder(order, "missing", 1)).toEqual(order)
  })
})

describe("the page as a canvas", () => {
  const CONFIG = {
    identity: { name: "Ada Lovelace", headline: "Analyst", summary: "Notes on the engine." },
    sections: { blocks: false },
  }
  const built = buildPortfolio({ config: CONFIG }) as unknown as Parameters<typeof PortfolioPreview>[0]["built"]

  const render = (regions: boolean) =>
    renderToStaticMarkup(createElement(PortfolioPreview, { built, regions }))

  it("marks each visible block and the footer as a region, with its label", () => {
    const html = render(true)
    const marked = [...html.matchAll(/data-canvas-region="([a-z]+)"/g)].map((m) => m[1])
    expect(marked[0]).toBe("profile")
    expect(marked).toContain("hello")
    expect(marked.at(-1)).toBe("footer")
    expect(html).toContain('data-canvas-label="About"')
  })

  it("makes a region's contents inert, so a click selects instead of navigating", () => {
    const html = render(true)
    const regions = html.match(/data-canvas-region="[a-z]+"[^>]*><div inert="">/g) ?? []
    expect(regions.length).toBe((html.match(/data-canvas-region=/g) ?? []).length)
  })

  it("leaves every other preview interactive", () => {
    const html = render(false)
    expect(html).not.toContain("data-canvas-region")
    expect(html).not.toContain("inert")
  })

  it("draws the minimap only when layout.navigation asks for it", () => {
    // Two anchored sections at least — About and Experience here — or there is nothing to map.
    const withRoles = (navigation: "minimap" | "none") =>
      buildPortfolio({
        config: { ...CONFIG, layout: { navigation } },
        manual: { experience: [{ company: "Engine Co", role: "Analyst", dates: { start: "1842" } }] },
      }) as unknown as Parameters<typeof PortfolioPreview>[0]["built"]
    const MINIMAP = "@[64rem]:block"
    expect(renderToStaticMarkup(createElement(PortfolioPreview, { built: withRoles("minimap") }))).toContain(MINIMAP)
    expect(renderToStaticMarkup(createElement(PortfolioPreview, { built: withRoles("none") }))).not.toContain(MINIMAP)
  })

  it("is one labelled, focusable group with a live selection announcement", () => {
    const html = renderToStaticMarkup(
      createElement(
        SelectableCanvas,
        { selected: "hello", onSelect: () => {} } as unknown as Parameters<typeof SelectableCanvas>[0],
        "page"
      )
    )
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('role="group"')
    expect(html).toMatch(/aria-label="Portfolio canvas\. Use the up and down arrow keys/)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain("Selected: About")
  })
})
