import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { buildPortfolio } from "@/core/generate/build.js"
import { TechStack } from "@/features/portfolio/components/tech-stack"
import { toTechStack } from "@/features/portfolio/data/adapter"

/**
 * The last two stages of the skill-override chain: the adapter, and his component.
 *
 * `tests/skill-overrides.test.js` proves an override survives the engine. This proves the engine
 * output actually reaches the rendered pill — which is a separate claim, and the one that was
 * false for longest: his `TechStack` type has always required an icon and an href, and the
 * adapter passed `null` and `''` for both, so the pills were text even when the data was right.
 *
 * It renders the real component rather than asserting on its source. A source assertion would
 * have passed against every version of this code, including the ones that rendered nothing.
 */

/** Taken from the pipeline rather than restated, so the two cannot drift. */
type Overrides = NonNullable<Parameters<typeof buildPortfolio>[0]>["overrides"]

const built = (overrides?: Overrides) =>
  buildPortfolio({
    config: { identity: { name: "Test Person" } },
    manual: {
      projects: [
        { name: "Alpha", technologies: ["Docker", "TypeScript", "Redis"] },
        { name: "Beta", technologies: ["Docker", "TypeScript"] },
      ],
    },
    overrides,
  })

const PATCH = {
  records: {
    skills: {
      docker: { icon: "docker", url: "https://www.docker.com", category: "Containers" },
    },
  },
}

/** The stack exactly as the page builds it, from a real build. */
const stackOf = (overrides?: Overrides) => toTechStack(built(overrides).profile)

const render = (overrides?: Overrides) =>
  renderToStaticMarkup(TechStack({ items: stackOf(overrides) }) as never)

describe("what the adapter hands the component", () => {
  it("carries the chosen icon, href and category", () => {
    const item = stackOf(PATCH).find((entry) => entry.title === "Docker")!
    expect(item.icon).toBeTruthy()
    expect(item.href).toMatch(/^https:\/\/www\.docker\.com\/?$/)
    expect(item.categories).toEqual(["Containers"])
  })

  it("infers an icon from the name when none was chosen", () => {
    // Nobody configured TypeScript, and it still gets a logo — which is what makes an imported
    // stack look right with no work.
    expect(stackOf(PATCH).find((entry) => entry.title === "TypeScript")!.icon).toBeTruthy()
  })

  it("leaves href empty when the skill has no url", () => {
    expect(stackOf(PATCH).find((entry) => entry.title === "Redis")!.href).toBe("")
  })

  it("gives an unrecognised technology no icon rather than a broken one", () => {
    const odd = buildPortfolio({
      config: { identity: { name: "Test Person" } },
      manual: { skills: [{ name: "Some Internal Tool" }] },
    })
    expect(toTechStack(odd.profile)[0].icon).toBeNull()
  })
})

describe("what his TechStack renders", () => {
  it("draws a logo inside the pill for the overridden skill", () => {
    const html = render(PATCH)
    // The pill is the anchor or span; the logo is an svg inside it.
    const pill = html.match(/<a [^>]*href="https:\/\/www\.docker\.com\/?"[^>]*>[\s\S]*?<\/a>/)?.[0]
    expect(pill).toBeTruthy()
    expect(pill).toContain("<svg")
    expect(pill).toContain("Docker")
  })

  it("renders a pill with a url as an anchor that opens safely", () => {
    const html = render(PATCH)
    expect(html).toMatch(/<a [^>]*href="https:\/\/www\.docker\.com\/?"/)
    expect(html).toMatch(/<a [^>]*rel="noopener"/)
  })

  it("renders a pill with no url as a span, not an empty-href anchor", () => {
    // An `<a href="">` links to the page it is already on: a dead link to a reader and to a
    // screen reader. Every pill was one before the component learned to branch.
    const html = render(PATCH)
    expect(html).not.toMatch(/<a [^>]*href=""/)
    expect(html).toMatch(/<span[^>]*>(?:(?!<\/span>)[\s\S])*Redis/)
  })

  it("groups the pills under the overridden category", () => {
    const html = render(PATCH)
    expect(html).toContain("Containers")
    // The generator's own guess for Docker must not also appear as a group.
    expect(html).not.toContain("Infrastructure")
  })

  it("omits a hidden skill entirely", () => {
    const html = render({ hidden: { skills: ["docker"] } })
    expect(html).not.toContain("Docker")
    expect(html).toContain("TypeScript")
  })

  it("renders the pills in the pinned order", () => {
    const html = render({ order: { skills: ["redis", "typescript", "docker"] } })
    const positions = ["Redis", "TypeScript", "Docker"].map((name) => html.indexOf(name))
    expect(positions.every((at) => at >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})
