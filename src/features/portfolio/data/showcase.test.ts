import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { buildPortfolio } from "@/core/generate/build.js"
import { Showcase } from "@/features/portfolio/components/showcase"
import { toShowcase } from "@/features/portfolio/data/adapter"

/**
 * The showcase, from built profile to rendered card.
 *
 * `tests/showcase.test.js` proves the data survives the engine. This proves it reaches his
 * markup, and — more importantly — that the framing decision is honoured in the render rather
 * than only in the data. A card that quietly framed a site which refuses framing would show the
 * visitor a browser error page, and a card that refused an embeddable one would be needlessly
 * worse than the project list beside it.
 */

type Overrides = NonNullable<Parameters<typeof buildPortfolio>[0]>["overrides"]

const built = (overrides?: Overrides) =>
  buildPortfolio({ config: { identity: { name: "Someone Else" } }, overrides })

const RECORDS = {
  "manual-a": {
    name: "My SaaS",
    description: "Billing for small teams",
    liveUrl: "https://saas.test",
    repository: "https://github.com/someone/saas",
    showcase: true,
    category: "SaaS",
  },
  "manual-b": { name: "My Tool", liveUrl: "https://tool.test", showcase: true },
}

const itemsOf = (overrides?: Overrides) => toShowcase(built(overrides).profile)
/**
 * Rendered as an element, not called as a function.
 *
 * `Showcase` holds state for the category filter, and hooks only work inside a render — calling
 * the component directly threw as soon as it gained one. `createElement` rather than JSX because
 * the vitest suite matches `.test.ts`.
 */
const render = (overrides?: Overrides) =>
  renderToStaticMarkup(createElement(Showcase, { items: itemsOf(overrides) }))

const WITH = { records: { projects: RECORDS } } as Overrides

describe("what the adapter hands the showcase", () => {
  it("maps a marked project into an item", () => {
    const item = itemsOf(WITH).find((entry) => entry.title === "My SaaS")!
    expect(item.description).toBe("Billing for small teams")
    expect(item.category).toBe("SaaS")
    expect(item.url).toMatch(/^https:\/\/saas\.test\/?$/)
    expect(item.sourceUrl).toMatch(/github\.com\/someone\/saas/)
  })

  it("falls back to a category rather than leaving it empty", () => {
    expect(itemsOf(WITH).find((entry) => entry.title === "My Tool")!.category).toBe("Projects")
  })

  it("drops a marked project that has nothing to show", () => {
    // A card whose frame has no URL is a card of air.
    const items = itemsOf({
      records: { projects: { "manual-x": { name: "No URL", showcase: true } } },
    } as Overrides)
    expect(items).toHaveLength(0)
  })

  it("treats an unprobed url as not embeddable", () => {
    // The probe runs at build time over URLs that exist then. Anything it has not seen is
    // refused rather than optimistically framed.
    expect(itemsOf(WITH).every((entry) => entry.embeddable === false)).toBe(true)
  })
})

describe("what the component renders", () => {
  it("renders a card per item with his title and description markup", () => {
    const html = render(WITH)
    expect(html).toContain("My SaaS")
    expect(html).toContain("Billing for small teams")
    expect(html).toContain("My Tool")
  })

  it("links the title to the deployment, opened safely", () => {
    const html = render(WITH)
    expect(html).toMatch(/<a [^>]*href="https:\/\/saas\.test\/?"[^>]*rel="noopener"/)
  })

  it("shows a source link only when there is a repository", () => {
    const html = render(WITH)
    expect(html).toMatch(/href="https:\/\/github\.com\/someone\/saas[^"]*"/)
    // "My Tool" has none, so there must be exactly one Source link on the page.
    expect(html.match(/>Source</g)).toHaveLength(1)
  })

  it("uses the graceful fallback for a site that refuses framing", () => {
    const html = render(WITH)
    expect(html).toContain("does not allow being embedded")
    expect(html).toContain("Open live project")
    // And critically: no iframe is emitted for a refusal.
    expect(html).not.toContain("<iframe")
  })

  it("never emits an iframe on first render, even for an embeddable site", () => {
    // The frame is click-to-load, so a page of showcase cards makes no third-party request
    // until a visitor asks for one.
    const html = render(WITH)
    expect(html).not.toContain("<iframe")
  })

  it("renders nothing at all when no project is marked", () => {
    expect(render({ records: { projects: { "manual-c": { name: "Plain" } } } } as Overrides)).toBe(
      ""
    )
  })

  it("survives a malformed url without throwing", () => {
    const html = render({
      records: { projects: { "manual-d": { name: "Odd", liveUrl: "not a url", showcase: true } } },
    } as Overrides)
    // The schema drops an unusable url, so the item has nothing to frame and is left out
    // rather than rendering a broken card.
    expect(html).toBe("")
  })

  it("offers his category nav once there is more than one category", () => {
    // Two categories in RECORDS: "SaaS" and the "Projects" fallback. The nav is his
    // `BlocksNav` markup, so the assertion is on what that markup produces.
    const html = render(WITH)
    expect(html).toContain('aria-label="Filter the showcase by category"')
    expect(html).toContain("SaaS")
    expect(html).toMatch(/aria-current="page"[^>]*>All</)
  })

  it("offers no nav when every item shares one category", () => {
    // A filter whose only choices are "All" and the single answer is noise, not navigation.
    const html = render({
      records: {
        projects: {
          "manual-a": { name: "One", liveUrl: "https://one.test", showcase: true },
          "manual-b": { name: "Two", liveUrl: "https://two.test", showcase: true },
        },
      },
    } as Overrides)
    expect(html).toContain("One")
    expect(html).not.toContain('aria-label="Filter the showcase by category"')
  })

  it("prints the category on each card", () => {
    // Which is what makes the field visible even before anyone touches the filter.
    expect(render(WITH)).toMatch(/>SaaS</)
  })

  it("keeps the pinned order in the rendered output", () => {
    const html = render({
      records: { projects: RECORDS },
      order: { projects: ["manual-b", "manual-a"] },
    } as Overrides)
    expect(html.indexOf("My Tool")).toBeLessThan(html.indexOf("My SaaS"))
  })
})
