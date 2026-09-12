"use client"

import { Fragment, useMemo } from "react"
import type { RegistryItem } from "shadcn/schema"

import { cn } from "@/lib/utils"
import { SiteFooter } from "@/components/site-footer"
import { Awards } from "@/features/portfolio/components/awards"
import { Blocks } from "@/features/portfolio/components/blocks"
import { Certifications } from "@/features/portfolio/components/certifications"
import { Education } from "@/features/portfolio/components/education"
import { Experiences } from "@/features/portfolio/components/experiences"
import { Overview } from "@/features/portfolio/components/overview"
import { ProfileHeader } from "@/features/portfolio/components/profile-header"
import { Projects } from "@/features/portfolio/components/projects"
import { Showcase } from "@/features/portfolio/components/showcase"
import { SocialLinks } from "@/features/portfolio/components/social-links"
import { TechStack } from "@/features/portfolio/components/tech-stack"
import { Timeline } from "@/features/portfolio/components/timeline"
import {
  toAwards,
  toCertifications,
  toEducation,
  toExperiences,
  toFooter,
  toPageSections,
  toProfileOptions,
  toProjects,
  toShowcase,
  toSocialLinks,
  toTechStack,
  toTimeline,
  toUser,
} from "@/features/portfolio/data/adapter"
import type {
  EngineConfig,
  EngineProfile,
  PageSectionId,
} from "@/features/portfolio/data/adapter"

import { ThemeScope } from "./theme-scope"

/**
 * The admin's live preview.
 *
 * There is deliberately no admin renderer here. Every section below is the component the
 * deployed site renders, imported from the same path the site's own page imports it from; the
 * only difference is that it is handed data from the draft instead of from the committed build.
 * That is possible because the mapping between the two — `toProjects`, `toUser` and the rest —
 * is the same function the site's data modules are defined by, and because the order and
 * visibility come from `toPageSections`, the same function his page calls.
 *
 * The consequence worth stating plainly: a control that appears to work here works on the
 * published site, because there is nothing in between that could interpret it differently. And
 * a section that renders wrong here renders wrong there. The preview is not a reassurance; it
 * is the actual thing, drawn early.
 *
 * `GitHubContributions` is the one section the page has that this does not. Its data module is
 * `server-only` — it reaches GitHub's GraphQL API with a token — so it cannot be evaluated in
 * the browser at all. Drawing a placeholder graph in its place would be a picture of a feature,
 * which is the one thing this component exists to avoid, so it is absent and said to be absent.
 */

export type PreviewSection = PageSectionId | "all" | "footer"

/**
 * What a panel asks to see: everything, one block, or the handful its controls actually reach.
 *
 * An array rather than one value because a panel's controls do not always land in a single
 * block — the profile editor writes the name into his `ProfileHeader` and the contact details
 * into `Overview`, and showing only the first left half its fields looking inert.
 */
export type PreviewSections = PreviewSection | PreviewSection[]

export type BuiltPortfolio = {
  profile: EngineProfile
  config: EngineConfig
  sections?: { id: string; visible?: boolean }[]
}

/** His page's own grouping: these follow the block before them with no divider. */
const NO_SEPARATOR_BEFORE = new Set<PageSectionId>(["overview", "github"])

export function PortfolioPreview({
  built,
  theme,
  section = "all",
  className,
}: {
  built: BuiltPortfolio
  theme?: RegistryItem
  section?: PreviewSections
  className?: string
}) {
  const { profile, config } = built

  // Recomputed only when the draft changes. The mapping is cheap, but `built` is rebuilt on
  // every keystroke in the editor and these arrays are the identity React reconciles against.
  const data = useMemo(
    () => ({
      user: toUser(profile, config),
      social: toSocialLinks(profile),
      stack: toTechStack(profile),
      experiences: toExperiences(profile),
      education: toEducation(profile),
      projects: toProjects(profile),
      showcase: toShowcase(profile),
      awards: toAwards(profile),
      certifications: toCertifications(profile),
      timeline: toTimeline(profile, config),
      footer: toFooter(config),
      profileOptions: toProfileOptions(config),
    }),
    [profile, config]
  )

  const blocks: Record<PageSectionId, () => React.ReactNode> = {
    profile: () => (
      <ProfileHeader
        user={data.user}
        flipInterval={data.profileOptions.flipInterval}
      />
    ),
    overview: () => (
      <>
        <Overview user={data.user} />
        <SocialLinks links={data.social} />
      </>
    ),
    // Server-only upstream; see the note above. Named rather than silently skipped, because a
    // gap in the preview that is never explained reads as a bug in the preview.
    github: () => <UnavailableSection label="GitHub contributions" />,
    stack: () => <TechStack items={data.stack} />,
    showcase: () => <Showcase items={data.showcase} />,
    blocks: () => <Blocks />,
    experience: () => <Experiences experiences={data.experiences} />,
    education: () => <Education education={data.education} />,
    projects: () => <Projects projects={data.projects} />,
    awards: () => <Awards awards={data.awards} />,
    certifications: () => (
      <Certifications certifications={data.certifications} />
    ),
    timeline: () => (
      <Timeline
        birthYear={data.timeline.birthYear}
        milestones={data.timeline.milestones}
      />
    ),
  }

  // Editing a section shows it whether or not it is currently visible — you are looking at it
  // in order to decide, and hiding it from its own editor is unhelpful.
  const requested = Array.isArray(section) ? section : [section]
  const wantsAll = requested.includes("all")
  const wantsFooter = wantsAll || requested.includes("footer")

  const ordered = wantsAll
    ? toPageSections(built.sections)
    : requested.filter(
        (id): id is PageSectionId => id !== "all" && id !== "footer"
      )

  return (
    <ThemeScope
      theme={theme}
      data-portfolio-preview=""
      className={cn(
        // His page wrapper, verbatim: the panel scroll offset and separator height the sections
        // are drawn against. Without it the screen lines land in the wrong places.
        "bg-background text-foreground [--separator-height:--spacing(8)]",
        "**:data-[slot=panel]:scroll-mt-4",
        className
      )}
    >
      <div className="mx-auto md:max-w-3xl">
        {ordered.map((id, index) => (
          <Fragment key={id}>
            {index > 0 && !NO_SEPARATOR_BEFORE.has(id) && <Separator />}
            {blocks[id]()}
          </Fragment>
        ))}

        {ordered.length > 0 && <Separator />}
      </div>

      {wantsFooter && <SiteFooter footer={data.footer} social={data.social} />}
    </ThemeScope>
  )
}

/** His page separator. Copied rather than imported because it is local to his page module. */
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

function UnavailableSection({ label }: { label: string }) {
  return (
    <div className="border-x border-line px-4 py-6 text-center text-sm text-balance text-muted-foreground">
      <p>
        <strong className="font-medium text-foreground">{label}</strong> is
        rendered on the published page but cannot be previewed here — it is
        fetched on the server at build time, so the browser has no way to
        produce it.
      </p>
    </div>
  )
}
