import { createElement } from "react"
import type * as MotionReact from "motion/react"
import { renderToReadableStream } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SiteFooter } from "@/components/site-footer"
import { buildPortfolio } from "@/core/generate/build.js"
import {
  initials,
  toFooter,
  toPageSections,
  toUser,
} from "@/features/portfolio/data/adapter"

import { Hello } from "./hello"
import { ProfileHeader } from "./profile-header"

/**
 * The hero and its signature pieces, as a crawler and a screen reader receive them.
 *
 * The greeting, the spotlight mark and the footer word are decoration. The rule these tests hold
 * is that decoration never *is* the content: the name is a real `<h1>` and the summary a real
 * `<h2>` section in the server-rendered HTML, and every decorative piece is hidden from assistive
 * technology so nothing is announced twice.
 */

// Only the reduced-motion signal is stubbed, and only in the test that needs it.
const reducedMotion = vi.hoisted(() => ({ value: false }))
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>()
  return { ...actual, useReducedMotion: () => reducedMotion.value }
})

afterEach(() => {
  reducedMotion.value = false
})

async function render(element: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element)
  await stream.allReady
  return new Response(stream).text()
}

function built(config: Record<string, unknown> = {}) {
  return buildPortfolio({
    config: {
      identity: {
        name: "Ada K. Lovelace",
        headline: "Analytical Engine Programmer",
        summary: "Wrote the first published **algorithm** for a machine.",
      },
      ...config,
    },
  }) as unknown as {
    profile: Record<string, never>
    config: Record<string, never>
    sections: { id: string; visible?: boolean }[]
  }
}

const userFor = (config: Record<string, unknown> = {}) => {
  const b = built(config)
  return toUser(b.profile, b.config)
}

describe("the hero keeps its meaning without JavaScript", () => {
  it("renders the name as the page's h1, beside the decorative mark", async () => {
    const html = await render(createElement(ProfileHeader, { user: userFor() }))
    expect(html).toMatch(/<h1[^>]*>Ada K\. Lovelace<\/h1>/)
    expect(html).toContain("Fig. 1.")
  })

  it("draws the owner's monogram, hidden from assistive technology", async () => {
    const html = await render(createElement(ProfileHeader, { user: userFor() }))
    // The mark repeats the h1, so it is aria-hidden rather than announced twice.
    const mark = html.match(/<svg[^>]*viewBox="0 0 556 354"[^>]*>[\s\S]*?<\/svg>/)
    expect(mark, "the spotlight mark is missing").toBeTruthy()
    const openingTag = mark![0].slice(0, mark![0].indexOf(">"))
    expect(openingTag, "the mark is announced to assistive technology").toContain('aria-hidden="true"')
    expect(mark![0]).toContain(">AKL<")
  })

  it("shows no one else's artwork", async () => {
    // His SpotlightLogo draws his "CD" mark from fixed paths. None of them may reach this page.
    const html = await render(createElement(ProfileHeader, { user: userFor() }))
    expect(html).not.toContain("M333.05 256.58")
  })
})

describe("the About section", () => {
  it("is a real h2 with the summary as server-rendered prose", async () => {
    const html = await render(createElement(Hello, { user: userFor() }))
    expect(html).toMatch(/<h2[^>]*>About<\/h2>/)
    expect(html).toContain("<strong>algorithm</strong>")
  })

  it("keeps the greeting decorative, so it never stands in for the heading", async () => {
    const html = await render(createElement(Hello, { user: userFor() }))
    const greeting = html.match(/<div[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>/)
    expect(greeting, "the greeting is not hidden from assistive technology").toBeTruthy()
    expect(greeting![0]).not.toContain("About")
  })

  it("renders the same server markup whatever the reader's motion preference", async () => {
    // The server cannot know the preference; if the first client render acted on it, the
    // strokes would hydrate drawn over markup that has them undrawn.
    reducedMotion.value = false
    const moving = await render(createElement(Hello, { user: userFor() }))
    reducedMotion.value = true
    const still = await render(createElement(Hello, { user: userFor() }))
    expect(still).toBe(moving)
  })

  it("writes the complete English word at once under reduced motion", async () => {
    reducedMotion.value = true
    const html = await render(createElement(Hello, { user: userFor() }))
    // His English SVG is titled "hello"; with reduced motion it is the only word, drawn at once.
    expect(html).toContain("<title>hello</title>")
    expect(html).not.toMatch(/<title>(hola|xin chào)<\/title>/i)
  })

  it("renders nothing without a summary, rather than a heading over empty space", async () => {
    const html = await render(
      createElement(Hello, { user: { ...userFor(), about: "" } })
    )
    expect(html).toBe("")
  })

  it("comes straight after the hero in the page's reading order", () => {
    const order = toPageSections(built().sections)
    expect(order.slice(0, 2)).toEqual(["profile", "hello"])
  })
})

describe("monogram and wordmark come from the portfolio's data", () => {
  it("derives initials from spaces and dots alike, at most three", () => {
    expect(initials("Ada K. Lovelace")).toBe("AKL")
    expect(initials("Nitish R.G.")).toBe("NRG")
    expect(initials("Mononym")).toBe("M")
    expect(initials("A B C D E")).toBe("ABC")
    expect(initials("")).toBe("")
  })

  it("uses a configured monogram over the derived one", () => {
    expect(userFor({ profile: { monogram: "AL" } }).monogram).toBe("AL")
    expect(userFor().monogram).toBe("AKL")
  })

  it("sets the footer word to the first name, or the configured word, or none", () => {
    const b = built()
    expect(toFooter(b.config, b.profile).wordmark).toBe("ADA")
    const custom = built({ footer: { wordmark: "LOVELACE" } })
    expect(toFooter(custom.config, custom.profile).wordmark).toBe("LOVELACE")
    const off = built({ footer: { wordmark: false } })
    expect(toFooter(off.config, off.profile).wordmark).toBe(false)
  })

  it("renders the footer word with his FluidGradientText, hidden from assistive technology", async () => {
    const b = built()
    const html = await render(
      createElement(SiteFooter, { footer: toFooter(b.config, b.profile), social: [] })
    )
    expect(html).toMatch(/aria-hidden="true"[^>]*>[\s\S]*?<text[^>]*>ADA<\/text>/)
    expect(html).toContain("fluid_gradient_text_linear")
  })

  it("leaves the footer word out when it is turned off", async () => {
    const off = built({ footer: { wordmark: false } })
    const html = await render(
      createElement(SiteFooter, { footer: toFooter(off.config, off.profile), social: [] })
    )
    expect(html).not.toContain("fluid_gradient_text_linear")
  })
})
