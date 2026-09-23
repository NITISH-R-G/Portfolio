import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import robots from "@/app/robots"
import { JSON_LD_ID, personJsonLd } from "@/config/json-ld"
import { SITE, USER } from "@/features/portfolio/data/adapter"
import type { PortfolioDocumentData } from "@/features/portfolio/llms/documents"
import {
  repositoryUrl,
  toPersonJsonLd,
  toProfilePageJsonLd,
  toProjectsJsonLd,
} from "@/features/portfolio/seo/structured-data"
import type { User } from "@/features/portfolio/types/user"

/**
 * Search metadata that can only say what the page says.
 *
 * The defects these guard were real: a Person node with a relative image and nothing but a name,
 * a creation date that was really the build date, a gender published that no one had stated,
 * and an admin that robots.txt never mentioned.
 */

const EMAIL = "ada@example.com"

const data = (overrides: Partial<PortfolioDocumentData> = {}): PortfolioDocumentData => ({
  user: {
    displayName: "Ada Lovelace",
    username: "ada",
    jobTitle: "Analyst",
    bio: "Notes on the engine.",
    address: "London",
    avatar: "/Portfolio/assets/ada.png",
    gender: "non-binary",
    emailB64: Buffer.from(EMAIL).toString("base64"),
  } as unknown as User,
  siteUrl: "https://ada.example/Portfolio",
  sections: ["profile", "hello", "stack", "experience", "education", "projects"],
  socialLinks: [
    { name: "github", title: "GitHub", handle: "ada", href: "https://github.com/ada", sameAs: true },
    { name: "blog", title: "Blog", handle: "", href: "https://someone-else.example" },
  ],
  stack: [
    { key: "python", title: "Python", href: "", categories: ["Languages"] },
    { key: "python-2", title: "Python", href: "", categories: ["Languages"] },
  ] as PortfolioDocumentData["stack"],
  experiences: [
    { id: "now", companyName: "Engine Co", companyWebsite: "https://engine.example", isCurrentEmployer: true, positions: [] },
    { id: "then", companyName: "Old Co", positions: [] },
  ],
  projects: [
    { id: "a", title: "Note G", period: { start: "1843" }, link: "https://github.com/ada/note-g#readme", skills: ["Python"], description: "Bernoulli numbers." },
    { id: "b", title: "Loom", period: { start: "1840" }, link: "https://loom.example", skills: [] },
  ],
  education: [{ id: "e", school: "Home tutors", period: { start: "1830" } }],
  certifications: [],
  awards: [],
  ...overrides,
})

describe("the Person node", () => {
  const person = toPersonJsonLd(data()) as unknown as Record<string, unknown>

  it("states what the page states", () => {
    expect(person["@id"]).toBe("https://ada.example/Portfolio/#person")
    expect(person.name).toBe("Ada Lovelace")
    expect(person.jobTitle).toBe("Analyst")
    expect(person.description).toBe("Notes on the engine.")
    expect(person.homeLocation).toEqual({ "@type": "Place", name: "London" })
    expect(person.alumniOf).toEqual([{ "@type": "EducationalOrganization", name: "Home tutors" }])
    expect(person.knowsAbout).toEqual(["Python"])
  })

  it("names only the current employer", () => {
    expect(person.worksFor).toEqual([
      { "@type": "Organization", name: "Engine Co", url: "https://engine.example" },
    ])
  })

  it("gives an absolute image, as structured data requires", () => {
    expect(person.image).toBe("https://ada.example/Portfolio/assets/ada.png")
  })

  it("claims only the profiles the owner marked as theirs", () => {
    expect(person.sameAs).toEqual(["https://github.com/ada"])
  })

  it("publishes no gender, email or phone", () => {
    const json = JSON.stringify(person)
    expect(json).not.toContain("gender")
    expect(json).not.toContain("non-binary")
    expect(json).not.toContain(EMAIL)
    expect(json).not.toMatch(/"(email|telephone)"/)
  })

  it("leaves out what the data does not have, rather than stating it empty", () => {
    const bare = toPersonJsonLd(
      data({
        user: { displayName: "Ada" } as unknown as User,
        experiences: [],
        education: [],
        stack: [],
      })
    ) as unknown as Record<string, unknown>
    for (const key of ["jobTitle", "worksFor", "alumniOf", "knowsAbout", "image", "homeLocation"]) {
      expect(bare, key).not.toHaveProperty(key)
    }
  })
})

describe("a hidden section", () => {
  it("is not claimed in structured data either", () => {
    const person = toPersonJsonLd(data({ sections: ["profile", "hello"] })) as unknown as Record<string, unknown>
    for (const key of ["knowsAbout", "worksFor", "alumniOf"]) {
      expect(person, key).not.toHaveProperty(key)
    }
    expect(toProjectsJsonLd(data({ sections: ["profile", "hello"] }))).toBeNull()
  })
})

describe("the ProfilePage node", () => {
  const page = toProfilePageJsonLd(data(), new Date("2026-01-02T03:04:05Z")) as unknown as Record<string, unknown>

  it("points at the Person and the WebSite by id", () => {
    expect(page.mainEntity).toEqual({ "@id": "https://ada.example/Portfolio/#person" })
    expect(page.isPartOf).toEqual({ "@id": "https://ada.example/Portfolio/#website" })
    expect(page.url).toBe("https://ada.example/Portfolio/")
  })

  it("claims no creation date the build cannot know", () => {
    expect(page).not.toHaveProperty("dateCreated")
    expect(page.dateModified).toBe("2026-01-02T03:04:05.000Z")
  })
})

describe("projects as source code", () => {
  it("lists only projects with a public repository, by the repository's URL", () => {
    const list = toProjectsJsonLd(data()) as unknown as { itemListElement: { item: Record<string, unknown> }[] }
    expect(list.itemListElement).toHaveLength(1)
    const item = list.itemListElement[0].item
    expect(item["@type"]).toBe("SoftwareSourceCode")
    expect(item.codeRepository).toBe("https://github.com/ada/note-g")
    expect(item.author).toEqual({ "@id": "https://ada.example/Portfolio/#person" })
  })

  it("renders nothing when no project has one", () => {
    expect(toProjectsJsonLd(data({ projects: [] }))).toBeNull()
  })

  it("recognises a repository and nothing else", () => {
    expect(repositoryUrl("https://github.com/a/b/tree/main")).toBe("https://github.com/a/b")
    expect(repositoryUrl("https://github.com/a")).toBeUndefined()
    expect(repositoryUrl("https://gitlab.com/a/b")).toBeUndefined()
    expect(repositoryUrl("not a url")).toBeUndefined()
  })
})

describe("the built site's search metadata", () => {
  it("describes the owner, under the site's own ids", () => {
    const person = personJsonLd as unknown as Record<string, unknown>
    expect(person.name).toBe(USER.displayName)
    expect(person["@id"]).toBe(JSON_LD_ID.person)
    expect(JSON_LD_ID.person.startsWith(SITE.url)).toBe(true)
    expect(JSON.stringify(person)).not.toMatch(/chanhdai|ncdai/i)
  })

  it("keeps the admin out of robots.txt's allowance", () => {
    const rules = robots().rules
    const rule = Array.isArray(rules) ? rules[0] : rules
    const base = String(SITE.base).replace(/^\/+|\/+$/g, "")
    expect(rule.disallow).toEqual([base ? `/${base}/admin/` : "/admin/"])
    expect(robots().sitemap).toBe(`${SITE.url}/sitemap.xml`)
  })

  it("publishes no gender in Open Graph", () => {
    const layout = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8")
    expect(layout).not.toMatch(/gender:\s*USER\.gender/)
  })
})
