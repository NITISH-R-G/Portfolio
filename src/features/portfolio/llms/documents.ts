import type { PageSectionId, SocialLink } from "@/features/portfolio/data/adapter"
import type { Award } from "@/features/portfolio/types/awards"
import type { Certification } from "@/features/portfolio/types/certifications"
import type { Education } from "@/features/portfolio/types/education"
import type { Experience } from "@/features/portfolio/types/experiences"
import type { Project } from "@/features/portfolio/types/projects"
import type { TechStack } from "@/features/portfolio/types/tech-stack"
import type { User } from "@/features/portfolio/types/user"

/**
 * The page as Markdown, for language models and for people who would rather read text.
 *
 * His site publishes every page twice — as HTML and as `.md` beside it — and lists them in
 * `llms.txt`, so an assistant can be handed a clean document instead of scraping markup. This is
 * the same idea over this portfolio's own data: every string here comes from the build the page
 * renders from, so the Markdown cannot say anything the page does not.
 *
 * What it leaves out, deliberately: the email address and phone number (the page reveals those
 * behind a click, and a text file for machines is not the place for them), the vCard, and any
 * section with nothing in it. Nothing here is written for a ranking — it is the page, in text.
 *
 * Pure functions over a `PortfolioDocumentData` bag, so the tests can render a synthetic profile
 * and the routes the real one.
 */

export type PortfolioDocumentData = {
  user: User
  /** Absolute site URL including the base path, without a trailing slash. */
  siteUrl: string
  /** The page's visible sections, in page order — `PAGE_SECTIONS`. */
  sections: PageSectionId[]
  socialLinks: SocialLink[]
  stack: TechStack[]
  experiences: Experience[]
  projects: Project[]
  education: Education[]
  certifications: Certification[]
  awards: Award[]
}

export type PortfolioDocument = {
  /** The file name, e.g. `experience.md`, served beside the page. */
  file: string
  title: string
  /** One line for `llms.txt`. */
  summary: string
  markdown: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Link text cannot hold brackets, and a title from imported data sometimes does. */
function text(value: unknown): string {
  return String(value ?? "")
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * A Markdown link. A destination with whitespace, parentheses or angle brackets — imported URLs
 * occasionally have them — is wrapped in `<…>`, the CommonMark form that can hold them.
 */
function link(label: unknown, href?: string): string {
  const t = text(label)
  if (!href) return t
  const target = /[\s()<>]/.test(href)
    ? `<${href.replace(/[<>]/g, (c) => encodeURIComponent(c))}>`
    : href
  return `[${t}](${target})`
}

function period(range?: { start?: string; end?: string }): string {
  if (!range?.start) return ""
  return `${range.start} – ${range.end || "Present"}`
}

/** A line of facts joined with middots, skipping the empty ones. */
function facts(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part && part.trim()).join(" · ")
}

function block(...parts: (string | false | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join("\n\n")
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

function aboutBody(d: PortfolioDocumentData): string {
  return d.user.about.trim()
}

function stackBody(d: PortfolioDocumentData): string {
  // His component groups by first appearance; so does this, so the text reads in page order.
  const groups = new Map<string, string[]>()
  for (const item of d.stack) {
    const category = item.categories[0] ?? "Other"
    groups.set(category, [...(groups.get(category) ?? []), text(item.title)])
  }
  return [...groups].map(([category, names]) => `- **${category}:** ${names.join(", ")}`).join("\n")
}

function experienceBody(d: PortfolioDocumentData): string {
  return d.experiences
    .map((company) =>
      block(
        `### ${link(company.companyName, company.companyWebsite)}`,
        company.location && `Location: ${text(company.location)}`,
        ...company.positions.map((position) =>
          block(
            `**${text(position.title)}**`,
            facts(period(position.employmentPeriod), position.employmentType),
            position.description,
            position.skills?.length ? `Technologies: ${position.skills.map(text).join(", ")}` : ""
          )
        )
      )
    )
    .join("\n\n")
}

function projectsBody(d: PortfolioDocumentData): string {
  return d.projects
    .map((project) =>
      block(
        `### ${link(project.title, project.link)}`,
        period(project.period),
        project.description,
        project.skills.length ? `Technologies: ${project.skills.map(text).join(", ")}` : ""
      )
    )
    .join("\n\n")
}

function educationBody(d: PortfolioDocumentData): string {
  return d.education
    .map((entry) =>
      block(
        `### ${text(entry.school)}`,
        facts(text(entry.degree), text(entry.fieldOfStudy), period(entry.period)),
        entry.description
      )
    )
    .join("\n\n")
}

function certificationsBody(d: PortfolioDocumentData): string {
  return d.certifications
    .map((c) => `- ${link(c.title, c.credentialURL)}${facts(text(c.issuer), c.issueDate) ? ` — ${facts(text(c.issuer), c.issueDate)}` : ""}`)
    .join("\n")
}

function awardsBody(d: PortfolioDocumentData): string {
  return d.awards
    .map((award) =>
      block(
        `### ${link(award.title, award.referenceLink)}`,
        facts(text(award.prize), text(award.grade), award.date),
        award.description
      )
    )
    .join("\n\n")
}

/**
 * The sections that have a document, in the order the page shows them. A page section missing
 * here (the overview band, the contribution graph, showcase media, the marketing blocks) is
 * either contact details or pictures, and has no text worth a file of its own.
 */
const SECTION_DOCUMENTS: Partial<
  Record<
    PageSectionId,
    {
      file: string
      title: string
      summary: string
      body: (d: PortfolioDocumentData) => string
    }
  >
> = {
  hello: { file: "about.md", title: "About", summary: "Who they are, in their own words", body: aboutBody },
  stack: { file: "stack.md", title: "Stack", summary: "Languages, frameworks and tools, by category", body: stackBody },
  experience: { file: "experience.md", title: "Experience", summary: "Roles, dates and what the work involved", body: experienceBody },
  education: { file: "education.md", title: "Education", summary: "Schools, degrees and dates", body: educationBody },
  projects: { file: "projects.md", title: "Projects", summary: "What they have built, with links", body: projectsBody },
  awards: { file: "awards.md", title: "Awards", summary: "Rankings and recognition", body: awardsBody },
  certifications: { file: "certifications.md", title: "Certifications", summary: "Certificates, issuers and credential links", body: certificationsBody },
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

function identityHeader(d: PortfolioDocumentData): string {
  const { user } = d
  return block(
    `# ${text(user.displayName)}`,
    `> ${facts(text(user.jobTitle), text(user.address))}`,
    user.bio && text(user.bio)
  )
}

function linksBody(d: PortfolioDocumentData): string {
  const links = [
    d.siteUrl && `- Portfolio: ${d.siteUrl}/`,
    ...d.socialLinks.map((s) => `- ${text(s.title)}: ${s.href}`),
  ].filter(Boolean)
  return links.join("\n")
}

/** One document per visible section that has something to say, in page order. */
export function sectionDocuments(d: PortfolioDocumentData): PortfolioDocument[] {
  return d.sections.flatMap((id) => {
    const spec = SECTION_DOCUMENTS[id]
    if (!spec) return []
    const body = spec.body(d)
    if (!body.trim()) return []
    return [
      {
        file: spec.file,
        title: spec.title,
        summary: spec.summary,
        markdown: `${block(`# ${text(d.user.displayName)} — ${spec.title}`, body)}\n`,
      },
    ]
  })
}

/** The whole page as one Markdown document: `index.md`, and the body of `llms-full.txt`. */
export function pageMarkdown(d: PortfolioDocumentData): string {
  const sections = d.sections.flatMap((id) => {
    const spec = SECTION_DOCUMENTS[id]
    const body = spec?.body(d)
    return spec && body?.trim() ? [`## ${spec.title}\n\n${body}`] : []
  })
  const links = linksBody(d)
  return `${block(identityHeader(d), ...sections, links && `## Links\n\n${links}`)}\n`
}

/**
 * `llms.txt`, in the shape llmstxt.org describes: a title, a one-line summary, then lists of
 * links to the Markdown documents. Absolute URLs, because the file is read out of context.
 */
export function llmsTxt(d: PortfolioDocumentData): string {
  const base = d.siteUrl
  const docs = sectionDocuments(d)
  return `${block(
    identityHeader(d),
    `This is ${text(d.user.displayName)}'s portfolio. Every page is also available as Markdown; the files below hold the same content as the site.`,
    `## Portfolio\n\n${[
      `- [Full page](${base}/index.md): The whole portfolio as one document`,
      ...docs.map((doc) => `- [${doc.title}](${base}/${doc.file}): ${doc.summary}`),
    ].join("\n")}`,
    `## Optional\n\n- [Everything in one file](${base}/llms-full.txt): The full page, for a single fetch`
  )}\n`
}

/** `llms-full.txt`: the whole page, for a model that wants a single fetch. */
export function llmsFullTxt(d: PortfolioDocumentData): string {
  return pageMarkdown(d)
}

/** Every Markdown file the site serves, by file name — the routes' static params. */
export function markdownFiles(d: PortfolioDocumentData): Record<string, string> {
  return Object.fromEntries([
    ["index.md", pageMarkdown(d)],
    ...sectionDocuments(d).map((doc) => [doc.file, doc.markdown] as const),
  ])
}
