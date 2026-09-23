import { Fragment } from "react"
import type { Metadata } from "next"
import { JsonLdScript } from "@/lib/json-ld"
import { cn } from "@/lib/utils"
import { Awards } from "@/features/portfolio/components/awards"
import { Blocks } from "@/features/portfolio/components/blocks"
import { Certifications } from "@/features/portfolio/components/certifications"
import { Education } from "@/features/portfolio/components/education"
import { Experiences } from "@/features/portfolio/components/experiences"
import { GitHubContributions } from "@/features/portfolio/components/github-contributions"
import { Hello } from "@/features/portfolio/components/hello"
import { Overview } from "@/features/portfolio/components/overview"
import { PageActions } from "@/features/portfolio/components/page-actions"
import { ProfileHeader } from "@/features/portfolio/components/profile-header"
import { Projects } from "@/features/portfolio/components/projects"
import { Showcase } from "@/features/portfolio/components/showcase"
import { SocialLinks } from "@/features/portfolio/components/social-links"
import { TechStack } from "@/features/portfolio/components/tech-stack"
import { TOC } from "@/features/portfolio/components/toc"
import { Timeline } from "@/features/portfolio/components/timeline"
import {
  LAYOUT_NAVIGATION,
  PAGE_SECTIONS,
  PROFILE_OPTIONS,
  TOC_ITEMS,
} from "@/features/portfolio/data/adapter"
import type { PageSectionId } from "@/features/portfolio/data/adapter"
import { PORTFOLIO_DOCUMENT_DATA } from "@/features/portfolio/llms/data"
import {
  toProfilePageJsonLd,
  toProjectsJsonLd,
} from "@/features/portfolio/seo/structured-data"

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    // The same page as Markdown (src/app/(llms)), announced so an agent can find it.
    types: { "text/markdown": "/index.md" },
  },
}

/**
 * The page's blocks, keyed by the id the engine decides visibility and order for.
 *
 * Upstream this is a literal sequence of components. It is a map here so that
 * `config.sections` and `config.sectionOrder` mean something — a visibility toggle that no
 * renderer consults is exactly the kind of control this fork is not allowed to offer. The
 * components, their props and the markup around them are unchanged; only *which* of them run,
 * and in what order, is now data.
 *
 * `overview` renders two of his panels because they are one block of the page: how to reach the
 * person. They have always appeared together and separating them would leave the social row
 * floating under the contribution graph.
 */
const SECTIONS: Record<PageSectionId, () => React.ReactNode> = {
  profile: () => <ProfileHeader flipInterval={PROFILE_OPTIONS.flipInterval} />,
  hello: () => <Hello actions={<PageActions />} />,
  overview: () => (
    <>
      <Overview />
      <SocialLinks />
    </>
  ),
  github: () => <GitHubContributions />,
  stack: () => <TechStack />,
  showcase: () => <Showcase />,
  blocks: () => <Blocks />,
  experience: () => <Experiences />,
  education: () => <Education />,
  projects: () => <Projects />,
  awards: () => <Awards />,
  certifications: () => <Certifications />,
  timeline: () => <Timeline />,
}

/**
 * Sections that upstream runs together without a divider between them, because they read as one
 * band: the overview grid, the social row and the contribution graph sit directly under the
 * header. Keeping that grouping is why this is a set rather than a separator after every block.
 */
const NO_SEPARATOR_BEFORE = new Set<PageSectionId>(["overview", "github"])

export default function HomePage() {
  const sections = PAGE_SECTIONS

  return (
    <>
      <JsonLdScript data={toProfilePageJsonLd(PORTFOLIO_DOCUMENT_DATA, new Date())} />
      {PROJECTS_JSON_LD && <JsonLdScript data={PROJECTS_JSON_LD} />}
      {LAYOUT_NAVIGATION === "minimap" && <TOC items={TOC_ITEMS} />}

      <div className="[--separator-height:--spacing(8)] **:data-[slot=panel]:scroll-mt-[calc(var(--header-height)+var(--separator-height))]">
        <div className="mx-auto md:max-w-3xl">
          {sections.map((id, index) => (
            <Fragment key={id}>
              {index > 0 && !NO_SEPARATOR_BEFORE.has(id) && <Separator />}
              {SECTIONS[id]()}
            </Fragment>
          ))}

          {sections.length > 0 && <Separator />}
        </div>
      </div>
    </>
  )
}

/** Projects with a public repository, as `SoftwareSourceCode`; null when there are none. */
const PROJECTS_JSON_LD = toProjectsJsonLd(PORTFOLIO_DOCUMENT_DATA)

function Separator({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "stripe-divider h-(--separator-height) w-full border-x",
        className
      )}
    />
  )
}
