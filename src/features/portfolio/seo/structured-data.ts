import type { ItemList, Person, ProfilePage, WithContext } from "schema-dts"

import type { PortfolioDocumentData } from "@/features/portfolio/llms/documents"

/**
 * Structured data for the portfolio, from the same data the page renders.
 *
 * Upstream his Person node is a hand-written literal about him. Ours is built here, so it can
 * only state what the page states: the job title, the schools, the current employer, the
 * technologies, the public profiles the owner marked as theirs. Nothing is added for a search
 * engine that a reader could not see — structured data that disagrees with the page is worse
 * than none, and no amount of it guarantees a ranking.
 *
 * Every node carries a stable `@id` under the site URL, so the WebSite, ProfilePage, Person and
 * project nodes in separate `<script>` blocks resolve to one entity.
 */

export function jsonLdIds(siteUrl: string) {
  return {
    website: `${siteUrl}/#website`,
    person: `${siteUrl}/#person`,
    projects: `${siteUrl}/#projects`,
  } as const
}

/** A root-relative asset path (`/Portfolio/assets/…`) as an absolute URL on the site's origin. */
function absolute(siteUrl: string, path: string): string | undefined {
  if (!path) return undefined
  try {
    return new URL(path, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString()
  } catch {
    return undefined
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

/** A GitHub repository URL, and only that — a README anchor or a query is not the repository. */
export function repositoryUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (url.hostname !== "github.com") return undefined
    const [owner, repo] = url.pathname.split("/").filter(Boolean)
    return owner && repo ? `https://github.com/${owner}/${repo}` : undefined
  } catch {
    return undefined
  }
}

export function toPersonJsonLd(d: PortfolioDocumentData): Person {
  const ids = jsonLdIds(d.siteUrl)
  const { user } = d

  // Only what the page shows: a hidden section's records are not claimed here either.
  const shown = new Set(d.sections)
  const current = shown.has("experience")
    ? d.experiences.filter((company) => company.isCurrentEmployer)
    : []
  const schools = shown.has("education") ? unique(d.education.map((entry) => entry.school)) : []
  const stack = shown.has("stack") ? d.stack : []

  return {
    "@type": "Person",
    "@id": ids.person,
    name: user.displayName,
    ...(user.username ? { alternateName: [user.username], identifier: user.username } : {}),
    url: `${d.siteUrl}/`,
    ...(absolute(d.siteUrl, user.avatar) ? { image: absolute(d.siteUrl, user.avatar) } : {}),
    ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
    ...(user.bio ? { description: user.bio } : {}),
    ...(user.address ? { homeLocation: { "@type": "Place", name: user.address } } : {}),
    ...(current.length
      ? {
          worksFor: current.map((company) => ({
            "@type": "Organization" as const,
            name: company.companyName,
            ...(company.companyWebsite ? { url: company.companyWebsite } : {}),
          })),
        }
      : {}),
    ...(schools.length
      ? {
          alumniOf: schools.map((name) => ({
            "@type": "EducationalOrganization" as const,
            name,
          })),
        }
      : {}),
    ...(stack.length ? { knowsAbout: unique(stack.map((item) => item.title)) } : {}),
    // Only the profiles the owner marked as their own (`sameAs`), never every link on the page.
    sameAs: d.socialLinks.filter((link) => link.sameAs).map((link) => link.href),
  }
}

export function toProfilePageJsonLd(
  d: PortfolioDocumentData,
  modified: Date
): WithContext<ProfilePage> {
  const ids = jsonLdIds(d.siteUrl)
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${d.siteUrl}/`,
    url: `${d.siteUrl}/`,
    name: `${d.user.displayName}${d.user.jobTitle ? ` – ${d.user.jobTitle}` : ""}`,
    isPartOf: { "@id": ids.website },
    // When the content was last built. There is no honest creation date to state: the build
    // cannot know when the owner first published, so none is claimed.
    dateModified: modified.toISOString(),
    mainEntity: { "@id": ids.person },
  }
}

/**
 * The projects whose link is a public GitHub repository, as `SoftwareSourceCode`.
 *
 * Only those: a project without a repository is not source code anyone can read, and calling it
 * that would be the kind of claim structured data must not make. `null` when there are none, or
 * when the Projects section is hidden, so the page renders no list it does not show.
 */
export function toProjectsJsonLd(d: PortfolioDocumentData): WithContext<ItemList> | null {
  if (!d.sections.includes("projects")) return null
  const ids = jsonLdIds(d.siteUrl)
  const repos = d.projects.flatMap((project) => {
    const codeRepository = repositoryUrl(project.link)
    return codeRepository ? [{ project, codeRepository }] : []
  })
  if (repos.length === 0) return null

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": ids.projects,
    name: `Projects by ${d.user.displayName}`,
    itemListElement: repos.map(({ project, codeRepository }, index) => ({
      "@type": "ListItem" as const,
      position: index + 1,
      item: {
        "@type": "SoftwareSourceCode" as const,
        name: project.title,
        ...(project.description ? { description: project.description } : {}),
        codeRepository,
        url: project.link,
        ...(project.skills.length ? { keywords: project.skills.join(", ") } : {}),
        author: { "@id": ids.person },
      },
    })),
  }
}
