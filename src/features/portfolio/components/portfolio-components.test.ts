import fs from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { buildPortfolio } from "@/core/generate/build.js"
import { renderToStaticMarkup } from "react-dom/server"
import { siPython, siTensorflow } from "simple-icons"
import { describe, expect, it } from "vitest"

import { GitHubStars } from "@/components/github-stars"
import { ReactIcon, TsIcon } from "@/components/icons"
import {
  toPageSections,
  toTechStack,
  toTocItems,
} from "@/features/portfolio/data/adapter"
import { techIcon } from "@/features/portfolio/data/tech-icons"

/**
 * The portfolio's own sections, restored to his visual language.
 *
 * Each block here guards a defect the page actually shipped: a Stack headed by a bucket of
 * repository topics, marks drawn in a different style from his, a minimap setting nothing read,
 * and a "0" beside the GitHub mark whenever the star count could not be fetched.
 */

const iconMarkup = (name: string, slug?: string) => {
  const icon = techIcon(name, slug)
  return icon ? renderToStaticMarkup(icon) : ""
}

describe("the Stack reads like his", () => {
  const skill = (name: string, category: string) => ({ name, category })
  const built = buildPortfolio({
    config: { identity: { name: "Ada" } },
    sources: [
      {
        key: "github",
        profile: {
          identity: { name: "Ada" },
          skills: [
            skill("accessibility", "Other"),
            skill("Docker", "Infrastructure"),
            skill("Python", "Languages"),
            skill("Unusual Category Tech", "Robotics"),
            skill("React", "Frontend"),
          ],
        },
      },
    ],
  }) as unknown as { profile: Record<string, never> }

  it("orders categories for reading, with the catch-all last", () => {
    const categories = [
      ...new Set(toTechStack(built.profile).map((item) => item.categories[0])),
    ]
    // Imported first, "Other" used to head the section; now it closes it, and an unknown
    // category sits between the known ones and the catch-all.
    expect(categories).toEqual([
      "Languages",
      "Frontend",
      "Infrastructure",
      "Robotics",
      "Other",
    ])
  })

  it("draws known technologies as his filled marks, not outlines", () => {
    // One filled path in currentColor on a 24-unit box — the treatment of his inline Python.
    const python = iconMarkup("Python")
    expect(python).toContain('viewBox="0 0 24 24"')
    expect(python).toContain(`d="${siPython.path}"`)
    expect(python).toContain('fill="currentColor"')
    expect(iconMarkup("TensorFlow")).toContain(`d="${siTensorflow.path}"`)
  })

  it("keeps his own marks ahead of any other set", () => {
    // His TsIcon draws the same path Simple Icons ships, so markup cannot tell them apart; the
    // element's component can.
    expect(techIcon("TypeScript")?.type).toBe(TsIcon)
    expect(techIcon("React")?.type).toBe(ReactIcon)
  })

  it("resolves the names imported data actually uses", () => {
    for (const name of [
      "scikit-learn",
      "GitHub Actions",
      "Google Cloud",
      "HTML",
      "FastAPI",
      "Node.js",
      // GitHub's linguist names, which head the Languages row.
      "Java",
      "Shell",
      "Ruby",
      "PowerShell",
      "Dockerfile",
      "Mermaid",
      "PLpgSQL",
      "Claude Code",
    ]) {
      expect(iconMarkup(name), `${name} has no mark`).not.toBe("")
    }
    // Next.js used to be drawn as React; it has its own mark now.
    expect(iconMarkup("Next.js")).not.toBe(iconMarkup("React"))
    expect(iconMarkup("next")).toBe(iconMarkup("Next.js"))
    // Marks that used to be borrowed from a neighbour are now their own.
    expect(iconMarkup("GitHub Actions")).not.toBe(iconMarkup("GitHub"))
    expect(iconMarkup("Google Cloud")).not.toBe(iconMarkup("Google"))
  })

  it("falls back where a brand was withdrawn, and to nothing for a concept", () => {
    expect(iconMarkup("C#")).not.toBe("") // Tabler's mark
    expect(iconMarkup("RAG pipelines")).toBe("") // a pill without a glyph, not a wrong logo
  })

  it("imports marks by name, so client bundles never carry all of them", () => {
    // The icon module reaches client code through the adapter. A namespace import would ship
    // every one of Simple Icons' three thousand paths to the browser.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/features/portfolio/data/tech-icons.tsx"),
      "utf8"
    )
    expect(source).not.toMatch(
      /import\s+\*\s+as\s+\w+\s+from\s+["']simple-icons["']/
    )
    expect(source).toMatch(/from "simple-icons"/)
  })
})

describe("the section minimap names what is on the page", () => {
  it("lists every anchored section in page order, and nothing else", () => {
    const items = toTocItems([
      "profile",
      "hello",
      "overview",
      "stack",
      "experience",
      "certifications",
    ])
    expect(items).toEqual([
      { title: "About", url: "#hello", depth: 2 },
      { title: "Stack", url: "#stack", depth: 2 },
      { title: "Experience", url: "#experience", depth: 2 },
      { title: "Certifications", url: "#certs", depth: 2 },
    ])
  })

  it("follows the engine's visibility, so a hidden section is never offered", () => {
    const built = buildPortfolio({
      config: {
        identity: { name: "Ada", summary: "Hi." },
        sections: { education: false },
      },
    }) as unknown as { sections: { id: string; visible?: boolean }[] }
    const urls = toTocItems(toPageSections(built.sections)).map(
      (item) => item.url
    )
    expect(urls).toContain("#hello")
    expect(urls).not.toContain("#education")
  })

  it("no longer carries his page's anchors", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/features/portfolio/components/toc.tsx"),
      "utf8"
    )
    for (const anchor of [
      "#components",
      "#blog",
      "#sponsors",
      "#bookmarks",
      "#insights",
      "#ip",
    ]) {
      expect(source, `${anchor} is back`).not.toContain(`"${anchor}"`)
    }
  })
})

describe("the header's GitHub link", () => {
  const render = (count: number) =>
    renderToStaticMarkup(
      createElement(GitHubStars, { repo: "ada/engine", stargazersCount: count })
    )

  it("shows no bare zero when there is nothing to count", () => {
    const html = render(0)
    expect(html).not.toMatch(/>0</)
    expect(html).toContain("Source code on GitHub")
  })

  it("shows the count when there is one", () => {
    const html = render(1234)
    expect(html).toContain("1.2k")
    expect(html).toContain("GitHub stars")
  })

  it("sends no Authorization header without a token", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/nav-item-github.tsx"),
      "utf8"
    )
    // "Bearer undefined" is refused (401), which is why the count always read 0.
    expect(source).not.toMatch(
      /Authorization: `Bearer \$\{process\.env\.GITHUB_API_TOKEN\}`,\n\s+"X-GitHub/
    )
    expect(source).toMatch(/process\.env\.GITHUB_API_TOKEN\s*\n?\s*\?/)
  })
})
