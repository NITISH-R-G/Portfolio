import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import * as fileRoute from "@/app/(llms)/[file]/route"
import * as llmsFullRoute from "@/app/(llms)/llms-full.txt/route"
import * as llmsRoute from "@/app/(llms)/llms.txt/route"
import {
  markdownUrlFor,
  PageActions,
  viewOptionItems,
} from "@/features/portfolio/components/page-actions"
import { USER } from "@/features/portfolio/data/adapter"
import { PORTFOLIO_DOCUMENT_DATA } from "@/features/portfolio/llms/data"
import {
  llmsFullTxt,
  llmsTxt,
  markdownFiles,
  pageMarkdown,
  sectionDocuments,
  type PortfolioDocumentData,
} from "@/features/portfolio/llms/documents"
import type { User } from "@/features/portfolio/types/user"

/**
 * The page as Markdown and the actions that hand it on.
 *
 * The claims worth guarding: the text says what the page says and in the same order; a hidden or
 * empty section has no file; nothing private reaches a file written for machines; and the menu's
 * links carry the page's address and nothing else.
 */

const EMAIL = "ada@example.com"
const PHONE = "+15550100"

const user = {
  displayName: "Ada Lovelace",
  jobTitle: "Analyst",
  address: "London",
  bio: "Notes on the engine.",
  about: "I write programs for machines that do not exist yet.",
  emailB64: Buffer.from(EMAIL).toString("base64"),
  phoneNumberB64: Buffer.from(PHONE).toString("base64"),
} as unknown as User

const data = (overrides: Partial<PortfolioDocumentData> = {}): PortfolioDocumentData => ({
  user,
  siteUrl: "https://ada.example/Portfolio",
  sections: ["profile", "hello", "overview", "stack", "experience", "projects", "certifications"],
  socialLinks: [{ name: "github", title: "GitHub", handle: "ada", href: "https://github.com/ada" }],
  stack: [
    { key: "python", title: "Python", href: "", categories: ["Languages"] },
    { key: "react", title: "React", href: "", categories: ["Frontend"] },
    { key: "c", title: "C", href: "", categories: ["Languages"] },
  ] as PortfolioDocumentData["stack"],
  experiences: [
    {
      id: "engine",
      companyName: "Analytical [Engine] Co",
      companyWebsite: "https://engine.example",
      positions: [
        {
          id: "p1",
          title: "Programmer",
          employmentPeriod: { start: "1842" },
          description: "- Wrote Note G",
          skills: ["Punch cards"],
        },
      ],
    },
  ],
  projects: [],
  education: [],
  certifications: [
    {
      title: "Bernoulli numbers",
      issuer: "Royal Society",
      issueDate: "1843-01-01",
      credentialID: "G",
      credentialURL: "https://cert.example/g",
    },
  ],
  awards: [],
  ...overrides,
})

describe("the page as Markdown", () => {
  it("says what the page says, in the page's order", () => {
    const md = pageMarkdown(data())
    expect(md.startsWith("# Ada Lovelace\n")).toBe(true)
    expect(md).toContain("> Analyst · London")
    expect(md).toContain("I write programs for machines")
    const order = ["## About", "## Stack", "## Experience", "## Certifications", "## Links"].map(
      (heading) => md.indexOf(heading)
    )
    expect(order.every((at) => at > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("keeps the Stack grouped by category as the page groups it", () => {
    expect(pageMarkdown(data())).toContain("- **Languages:** Python, C\n- **Frontend:** React")
  })

  it("writes roles with their dates, links and technologies", () => {
    const md = pageMarkdown(data())
    // Brackets in imported names would break the link, so they are dropped from link text.
    expect(md).toContain("### [Analytical Engine Co](https://engine.example)")
    expect(md).toContain("1842 – Present")
    expect(md).toContain("Technologies: Punch cards")
    expect(md).toContain("- [Bernoulli numbers](https://cert.example/g) — Royal Society · 1843-01-01")
  })

  it("keeps a link intact when its URL has spaces or parentheses", () => {
    const md = pageMarkdown(
      data({
        experiences: [
          { id: "x", companyName: "Odd Co", companyWebsite: "https://odd.example/a b)", positions: [] },
        ],
      })
    )
    expect(md).toContain("### [Odd Co](<https://odd.example/a b)>)")
  })

  it("never carries the email address or phone number", () => {
    const everything = [
      pageMarkdown(data()),
      llmsTxt(data()),
      llmsFullTxt(data()),
      ...Object.values(markdownFiles(data())),
    ].join("\n")
    for (const secret of [EMAIL, PHONE, user.emailB64, user.phoneNumberB64]) {
      expect(everything).not.toContain(secret)
    }
  })

  it("gives a hidden section no file and no mention", () => {
    const files = markdownFiles(data({ sections: ["profile", "hello", "stack"] }))
    expect(Object.keys(files)).toEqual(["index.md", "about.md", "stack.md"])
    expect(llmsTxt(data({ sections: ["profile", "hello", "stack"] }))).not.toContain("experience.md")
    expect(files["index.md"]).not.toContain("## Experience")
  })

  it("gives an empty section no file, even when it is visible", () => {
    const docs = sectionDocuments(data({ sections: ["hello", "projects"] }))
    expect(docs.map((doc) => doc.file)).toEqual(["about.md"])
    // Nor a heading over nothing in the full page.
    expect(pageMarkdown(data({ sections: ["hello", "projects"] }))).not.toContain("## Projects")
  })
})

describe("llms.txt", () => {
  const txt = llmsTxt(data())

  it("follows the llmstxt.org shape: a title, a summary, then lists of links", () => {
    expect(txt.startsWith("# Ada Lovelace\n\n> Analyst · London")).toBe(true)
    expect(txt).toMatch(/\n## Portfolio\n\n- \[Full page\]\(https:\/\/ada\.example\/Portfolio\/index\.md\): /)
    expect(txt).toContain("- [About](https://ada.example/Portfolio/about.md): ")
    expect(txt).toContain("## Optional\n\n- [Everything in one file](https://ada.example/Portfolio/llms-full.txt)")
  })

  it("links only to files that exist", () => {
    const files = new Set(Object.keys(markdownFiles(data())))
    const linked = [...txt.matchAll(/\/Portfolio\/([\w-]+\.md)\)/g)].map((m) => m[1])
    expect(linked.length).toBeGreaterThan(1)
    for (const file of linked) expect(files.has(file), file).toBe(true)
  })
})

describe("the built site's documents", () => {
  const files = markdownFiles(PORTFOLIO_DOCUMENT_DATA)

  it("are the owner's, and not the upstream author's", () => {
    expect(files["index.md"]).toContain(`# ${USER.displayName}`)
    const all = Object.values(files).join("\n") + llmsTxt(PORTFOLIO_DOCUMENT_DATA)
    for (const foreign of ["chanhdai", "ncdai", "Chánh Đại"]) {
      expect(all).not.toContain(foreign)
    }
  })

  it("serve each file from its route, and refuse any other name", async () => {
    const params = fileRoute.generateStaticParams().map((p) => p.file)
    expect(params).toContain("index.md")
    expect(params.sort()).toEqual(Object.keys(files).sort())
    expect(fileRoute.dynamic).toBe("force-static")
    expect(fileRoute.dynamicParams).toBe(false)

    const ok = await fileRoute.GET(new Request("http://x/index.md"), {
      params: Promise.resolve({ file: "index.md" }),
    })
    expect(ok.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8")
    expect(await ok.text()).toBe(files["index.md"])

    const missing = await fileRoute.GET(new Request("http://x/secret.md"), {
      params: Promise.resolve({ file: "secret.md" }),
    })
    expect(missing.status).toBe(404)
  })

  it("serve llms.txt and llms-full.txt as static text", async () => {
    expect(llmsRoute.dynamic).toBe("force-static")
    expect(llmsFullRoute.dynamic).toBe("force-static")
    expect(await llmsRoute.GET().text()).toBe(llmsTxt(PORTFOLIO_DOCUMENT_DATA))
    expect(await llmsFullRoute.GET().text()).toBe(pageMarkdown(PORTFOLIO_DOCUMENT_DATA))
  })
})

describe("the page actions", () => {
  it("point at the page's Markdown under the base path", () => {
    expect(markdownUrlFor("/Portfolio")).toBe("/Portfolio/index.md")
    expect(markdownUrlFor("/Portfolio/")).toBe("/Portfolio/index.md")
    expect(markdownUrlFor("")).toBe("/index.md")
    expect(markdownUrlFor(undefined)).toBe("/index.md")
  })

  it("hand each assistant the Markdown URL and nothing else", () => {
    const url = "https://ada.example/Portfolio/index.md"
    const items = viewOptionItems(url)
    expect(items.map((item) => item.title)).toEqual([
      "View as Markdown",
      "Open in ChatGPT",
      "Open in Claude",
      "Open in v0",
    ])
    expect(items[0].href).toBe(url)
    for (const item of items.slice(1)) {
      const query = new URL(item.href).searchParams
      const prompt = query.get("q") ?? ""
      expect(prompt).toBe(`Read ${url}, I want to ask questions about it.`)
    }
    expect(new URL(items[1].href).origin).toBe("https://chatgpt.com")
    expect(new URL(items[2].href).origin).toBe("https://claude.ai")
    expect(new URL(items[3].href).origin).toBe("https://v0.app")
  })

  it("render a labelled copy button and menu trigger", () => {
    const html = renderToStaticMarkup(createElement(PageActions, { markdownUrl: "/Portfolio/index.md" }))
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Page actions"')
    expect(html).toContain("Copy page")
    expect(html).toContain('aria-label="More ways to read this page"')
  })
})
