/**
 * The one data boundary between our engine and his application.
 *
 * Everything above this file is his: his components, his types, his layout, his CSS. Everything
 * below it is ours: connectors, normalization, provenance, ranking. This module is the only
 * place the two meet, and it exists so that neither side has to know about the other — his
 * components keep reading `USER`, `PROJECTS`, `EXPERIENCES` and the rest exactly as they always
 * did, and our engine keeps producing one normalized `Profile` exactly as it always did.
 *
 * The rule for anything added here: shape-mapping only. No fetching, no connector logic, no
 * ranking — those belong in the engine, and spreading them into the presentation layer is what
 * this boundary exists to prevent.
 *
 * ## Why the mapping is a set of functions
 *
 * Each `toX(profile)` below is exported, and the module constants underneath are those same
 * functions applied to the composed build output. The public site is unaffected — `PROJECTS` is
 * still `PROJECTS` — but the admin can run the *identical* mapping over a draft that only exists
 * in the editor's memory, hand the result to the *identical* component, and get a preview that
 * is the real thing rather than a drawing of it. One mapping, two callers; there is no second
 * rendering path to keep in agreement with this one.
 */

/**
 * Composed by `scripts/compose.mjs` before every dev run and build. It is the engine's output
 * frozen as data, which is what lets this module be imported from client components too — a
 * loader that read the filesystem here would drag `node:fs` into the browser chunk, because
 * `USER` and `SOCIAL` are imported on both sides of the server boundary.
 */
import composed from '@/data/generated/portfolio.json'
/**
 * Written by `scripts/probe-embeddable.mjs`: for each hosted URL, whether the site
 * advertises that it may be framed. Absent entries mean "never probed", which is treated
 * as not embeddable — offering a preview that renders a browser error page is worse than
 * offering a link.
 */
import embeddable from '@/data/generated/embeddable.json'

import type { Award } from '../types/awards'
import type { Certification } from '../types/certifications'
import type { Education } from '../types/education'
import type { Experience, ExperiencePosition } from '../types/experiences'
import type { Project } from '../types/projects'
import type { SocialProfile } from '../types/social-links'
import type { TechStack } from '../types/tech-stack'
import type { User } from '../types/user'
import { techIcon } from './tech-icons'

type PortfolioDate = { iso?: string; precision?: 'year' | 'month' | 'day'; display?: string }
type DateRange = { start?: PortfolioDate; end?: PortfolioDate; current?: boolean }

/**
 * One record as the engine produced it.
 *
 * The engine is JavaScript with JSDoc types, so none of its shapes reach TypeScript's checker:
 * these values genuinely are unknown-shaped at this boundary, and annotating them more tightly
 * here would assert a guarantee nothing enforces. Naming the looseness once, in one place, is
 * both more honest and easier to find than repeating `any` at every mapping site — which is
 * what the lint rule is really asking for.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above */
export type EngineRecord = Record<string, any>

/** The engine's normalized profile. */
export type EngineProfile = EngineRecord
/** The engine's resolved configuration. */
export type EngineConfig = EngineRecord

const profile = composed.profile as EngineProfile
const config = composed.config as EngineConfig

/**
 * The composed profile itself.
 *
 * Exported for the one consumer that needs the engine's own shape rather than his components' —
 * the search index, which is built from the normalized profile through the public-manifest
 * boundary so it can never surface a field the published manifest withholds. Everything else
 * should use the mapped exports below.
 */
export const PROFILE: EngineProfile = profile

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * His period strings are `"MM.YYYY"` or `"YYYY"`, hand-written. Ours are ISO with a stated
 * `precision`, so the precision decides whether a month is meaningful rather than the string's
 * shape — a record imported as year-only must not claim January.
 */
function period(date?: PortfolioDate): string {
  if (!date) return ''
  if (date.display) return date.display
  if (!date.iso) return ''
  const [year, month] = String(date.iso).split('-')
  if (date.precision === 'year' || !month) return year ?? ''
  return `${month}.${year}`
}

/** His award and certification dates are ISO-ish (`YYYY-MM`, `YYYY-MM-DD`). */
function isoDate(date?: PortfolioDate): string {
  return date?.iso ? String(date.iso) : ''
}

/** `end` omitted means "Present" in his components, so a current role must not supply one. */
function range(dates?: DateRange): { start: string; end?: string } {
  const start = period(dates?.start)
  if (dates?.current) return { start }
  const end = period(dates?.end)
  return end ? { start, end } : { start }
}

/**
 * A path inside `public/`, resolved against the deployment's base path.
 *
 * Config holds these relative — `assets/profile.svg` — which resolves against whatever URL the
 * browser is currently on. That is correct at the site root and wrong everywhere else: on a
 * project site the admin lives at `/Portfolio/admin/`, so the avatar resolved to
 * `/Portfolio/admin/assets/profile.svg` and 404'd, showing its alt text where a face should be.
 * Verified before this existed: the nested path was a 404 while the root path was a 200.
 *
 * Absolute URLs and root-relative paths are returned untouched, which is what every connector
 * produces, so this only affects values a person typed by hand.
 */
function asset(path?: string): string {
  const value = String(path ?? '').trim()
  if (!value) return ''
  if (/^(?:[a-z]+:|\/\/|\/)/i.test(value)) return value
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
  return `${base}/${value.replace(/^\.?\//, '')}`
}

const slug = (value: string, fallback: string) =>
  (String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    || fallback)

/* -------------------------------------------------------------------------- */
/* USER                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * His `phoneNumberB64` / `emailB64` are base64 so the address is not sitting in the served HTML
 * for a scraper to lift. That intent is preserved rather than bypassed — the values are encoded
 * here, at build time, exactly as his hand-written data file holds them.
 */
const b64 = (value?: string) => {
  if (!value) return ''
  // `btoa` in the browser, `Buffer` in Node — this module is evaluated on both sides.
  const s = String(value)
  return typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf8').toString('base64')
}

export function toUser(p: EngineProfile, c: EngineConfig): User {
  const identity = p.identity ?? {}
  // `Contact` is its own block in the schema (`core/schema/types.js`). Reading `identity.email`
  // directly found nothing and encoded an empty string, which his Overview renders as a present
  // but blank row — the failure mode that looks like a design choice rather than a bug.
  const contact = identity.contact ?? {}
  const nameParts = String(identity.name ?? '').trim().split(/\s+/)

  return {
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' '),
    displayName: identity.name ?? '',
    username: p.socials?.github?.split('/').filter(Boolean).pop() ?? '',
    // Not imported by any connector, and guessing would be worse than declining to say.
    gender: 'non-binary',
    pronouns: identity.pronouns ?? '',
    bio: identity.summary ?? '',
    /**
     * His `FlipSentences` rotates these under the name. Ours are the headline plus whatever the
     * availability line says — the two standing statements a profile actually carries.
     */
    flipSentences: [identity.headline, identity.availability?.label].filter(Boolean) as string[],
    address: identity.location ?? '',
    /**
     * `privacy.hideEmail` means the address is not published at all.
     *
     * It was already enforced in `core/standard/public.js`, which strips the address from the
     * exported manifest and therefore from the search index. It was *not* enforced here, so a
     * portfolio with the setting on still printed the address in the page his Overview
     * renders — the setting worked everywhere except the place a reader actually looks.
     *
     * The base64 encoding upstream uses is not privacy and is not treated as such: it stops a
     * naive scraper reading the served HTML, which is what `obfuscateEmail` is for. Hiding is
     * a separate decision and omits the value.
     */
    phoneNumberB64: c.privacy?.hideEmail === true ? '' : b64(contact.phone),
    emailB64: c.privacy?.hideEmail === true ? '' : b64(contact.email),
    website: contact.website || c.site?.url || '',
    jobTitle: identity.headline ?? '',
    jobs: (p.experience ?? [])
      .filter((role: EngineRecord) => role?.dates?.current)
      .map((role: EngineRecord) => ({
        title: role.role ?? '',
        company: role.company ?? '',
        website: role.website ?? '',
        experienceId: slug(role.company, 'experience'),
      })),
    about: identity.summary ?? '',
    avatar: asset(identity.avatar),
    // His avatar-lights variants are his own artwork; a fork supplies none and the component
    // falls back to the plain avatar.
    avatarVariants: [] as unknown as User['avatarVariants'],
    ogImage: asset(c.site?.ogImage),
    namePronunciationUrl: '',
    keywords: (p.skills ?? []).slice(0, 20).map((s: EngineRecord) => s.name),
    timeZone: identity.timeZone ?? 'UTC',
    // Feeds `new Date(...).toISOString()` in the page's JSON-LD, which throws on an empty
    // string. Unlike a certification's issue date this one is genuinely synthesizable — it
    // is when this site's data was first generated, not a claim about the person.
    dateCreated: (p.meta?.generatedAt ?? new Date().toISOString()).slice(0, 10),
  }
}

export const USER: User = toUser(profile, config)

/**
 * The site block, from our config rather than an environment variable.
 *
 * Upstream `SITE_INFO.url` reads `NEXT_PUBLIC_APP_URL` and falls back to his domain. Ours is
 * already in `portfolio.config.js`, where `doctor` and the deploy guard read it from, so the
 * env var would be a second place the same fact could live and disagree.
 */
/**
 * The resolved config, for the few places his application needs a setting rather than content
 * — the source theme in the root layout, the footer rows, the effect switches.
 */
export const SITE_CONFIG = config

export const SITE = {
  url: String(config.site?.url ?? '').replace(/\/+$/, ''),
  base: config.site?.base ?? '/',
  ogImage: config.site?.ogImage ?? '',
}

/**
 * The footer's rows, from config.
 *
 * Upstream these are hard-coded facts about his own site — what it is deployed on, which
 * analytics it uses, what inspired it. The *shape* (a label with one or more values, each
 * optionally a link) is reusable and is what his markup renders; the content is not, so it
 * comes from `footer.items` and is editable without touching the component.
 */
export type FooterValue = { text: string; href?: string }
export type FooterItem = { label: string; values: FooterValue[] }
export type FooterConfig = {
  enabled: boolean
  showSocialLinks: boolean
  showSourceCode: boolean
  showDmca: boolean
  items: FooterItem[]
}

export function toFooter(c: EngineConfig): FooterConfig {
  return {
    enabled: c.footer?.enabled !== false,
    showSocialLinks: c.footer?.showSocialLinks !== false,
    showSourceCode: c.footer?.showSourceCode !== false,
    // Upstream this badge is always present. It asserts a DMCA registration, which is a claim
    // about a specific site rather than a design choice, so it defaults off for a fork.
    showDmca: c.footer?.showDmca === true,
    items: (c.footer?.items ?? []) as FooterItem[],
  }
}

export const FOOTER: FooterConfig = toFooter(config)

/**
 * The profile header's one configurable parameter.
 *
 * `TextFlip.interval` — his own prop, in seconds — reached through `FlipSentences`. Exported
 * separately from `USER` because it is a presentation setting rather than a fact about the
 * person, and `USER` is his type.
 */
export function toProfileOptions(c: EngineConfig): { flipInterval: number } {
  return { flipInterval: Number(c.profile?.flipInterval ?? 3) }
}

export const PROFILE_OPTIONS = toProfileOptions(config)

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which blocks his home page is made of.
 *
 * The engine decides *whether* a section renders — `'auto'` from the data, or forced on or off
 * by `config.sections` — and in what order, and it does so for a taxonomy that is wider than
 * this application's page. This is the map between the two, and it is deliberately explicit
 * rather than derived: an engine section with no entry here has no renderer in this application,
 * which is a fact the admin needs to be able to state rather than guess at.
 *
 * `contact` covers the overview grid and the social row, because that is what those two panels
 * are: how to reach the person. `hero` is the profile header.
 */
export type PageSectionId =
  | 'profile'
  | 'overview'
  | 'github'
  | 'stack'
  | 'blocks'
  | 'experience'
  | 'education'
  | 'projects'
  | 'awards'
  | 'certifications'

export const PAGE_SECTION_BY_ENGINE_ID: Record<string, PageSectionId> = {
  hero: 'profile',
  contact: 'overview',
  github: 'github',
  skills: 'stack',
  blocks: 'blocks',
  experience: 'experience',
  education: 'education',
  projects: 'projects',
  achievements: 'awards',
  certifications: 'certifications',
}

type EngineSection = { id: string; visible?: boolean }

/** The page's sections, in the engine's order, with the hidden ones dropped. */
export function toPageSections(sections: EngineSection[] | undefined): PageSectionId[] {
  return (sections ?? [])
    .filter((section) => section.visible)
    .map((section) => PAGE_SECTION_BY_ENGINE_ID[section.id])
    .filter((id): id is PageSectionId => Boolean(id))
}

export const PAGE_SECTIONS: PageSectionId[] = toPageSections(
  (composed as { sections?: EngineSection[] }).sections,
)

/* -------------------------------------------------------------------------- */
/* Collections                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether a hosted URL may be framed, as measured at build time.
 *
 * Exported because the admin needs the same answer for a URL the owner has just typed: a
 * project whose deployment refuses framing must show the fallback in the editor's preview for
 * the same reason it does on the site, and the only honest source for that is the probe.
 */
export function framePolicy(url?: string): { embeddable: boolean; reason?: string } {
  if (!url) return { embeddable: false }
  const entry = (embeddable as Record<string, { embeddable?: boolean; reason?: string }>)[url]
  return { embeddable: Boolean(entry?.embeddable), reason: entry?.reason }
}

export function toProjects(p: EngineProfile): Project[] {
  return (p.projects ?? []).map((project: EngineRecord, i: number) => {
    // The embedded preview. `preview: false` switches it off for a project whose deployment is
    // private, rate-limited, or simply not worth framing; absent means "yes, if there is a URL".
    const previewUrl =
      project.preview === false ? undefined : (project.previewUrl || project.liveUrl || undefined)
    const policy = framePolicy(previewUrl)

    return {
      id: project.id || slug(project.name, `project-${i}`),
      title: project.name ?? '',
      period: {
        start: period(project.date),
        ...(project.status === 'active' || project.status === 'wip'
          ? {}
          : { end: period(project.updatedAt) }),
      },
      link: project.liveUrl || project.repository || project.links?.[0]?.url || '',
      skills: project.technologies ?? [],
      description: project.description,
      logo: asset(project.image),
      previewUrl,
      screenshot: asset(project.image),
      previewEmbeddable: policy.embeddable,
      previewBlockedReason: policy.reason,
    }
  })
}

export const PROJECTS: Project[] = toProjects(profile)

/**
 * His model nests positions under a company; ours is one record per role. Consecutive records
 * naming the same company are one continuous stint — grouping every match regardless of
 * position would merge two separate spells years apart and reorder everything between them.
 */
export function toExperiences(p: EngineProfile): Experience[] {
  const groups: Experience[] = []
  for (const [i, role] of (p.experience ?? []).entries() as [number, EngineRecord][]) {
    const position: ExperiencePosition = {
      id: role.id || slug(`${role.company}-${role.role}`, `position-${i}`),
      title: role.role ?? '',
      employmentPeriod: range(role.dates),
      employmentType: role.employmentType
        ? String(role.employmentType).replace(/-/g, ' ').replace(/^./, (c: string) => c.toUpperCase())
        : undefined,
      description: [role.description, ...(role.highlights ?? []).map((h: string) => `- ${h}`)]
        .filter(Boolean)
        .join('\n\n') || undefined,
      skills: role.technologies,
    }

    const last = groups[groups.length - 1]
    if (last && last.companyName === role.company) {
      last.positions.push(position)
      last.location ??= role.location
      last.isCurrentEmployer ||= Boolean(role.dates?.current)
      continue
    }

    groups.push({
      id: slug(role.company, `experience-${i}`),
      companyName: role.company ?? '',
      companyWebsite: role.website,
      location: role.location,
      locationType: /remote/i.test(role.location ?? '') ? 'Remote' : undefined,
      positions: [position],
      isCurrentEmployer: Boolean(role.dates?.current),
    })
  }
  return groups
}

export const EXPERIENCES: Experience[] = toExperiences(profile)

export function toEducation(p: EngineProfile): Education[] {
  return (p.education ?? []).map((e: EngineRecord, i: number) => ({
    id: e.id || slug(e.institution, `education-${i}`),
    school: e.institution ?? '',
    degree: e.degree,
    fieldOfStudy: e.field,
    period: range(e.dates),
    description: [e.description, ...(e.achievements ?? []).map((a: string) => `- ${a}`)]
      .filter(Boolean)
      .join('\n\n') || undefined,
    skills: e.courses,
  }))
}

export const EDUCATION: Education[] = toEducation(profile)

export function toCertifications(p: EngineProfile): Certification[] {
  return (p.certifications ?? []).map((c: EngineRecord) => ({
    title: c.name ?? '',
    issuer: c.issuer ?? '',
    issuerLogoURL: asset(c.image),
    // His `issuerIconName` indexes a closed map of brand marks for the issuers *he* holds
    // certificates from. Ours arrive from arbitrary data, so the component's own generic
    // fallback is the honest branch.
    issueDate: isoDate(c.date),
    credentialID: c.credentialId,
    credentialURL: c.credentialUrl,
  } as Certification))
}

export const CERTIFICATIONS: Certification[] = toCertifications(profile)

export function toAwards(p: EngineProfile): Award[] {
  return (p.achievements ?? []).map((a: EngineRecord, i: number) => ({
    id: a.id || slug(a.title, `award-${i}`),
    prize: a.rank ?? '',
    title: a.title ?? '',
    date: isoDate(a.date),
    grade: a.organization ?? '',
    description: a.description,
    referenceLink: a.url,
  }))
}

export const AWARDS: Award[] = toAwards(profile)

/**
 * His stack entries link each technology to its homepage and carry a brand icon. Ours are
 * derived from evidence across connectors and have neither, so the link is dropped and the
 * category comes from our own grouping — the same axis his `categories` field uses.
 *
 * The key needs care. `slug()` strips everything outside `[a-z0-9]`, which collapses "C", "C++"
 * and "C#" onto the same string — three React children sharing a key, which the reconciler
 * resolves by dropping or duplicating siblings. That is not a cosmetic warning: it broke every
 * collapsible on the page, because a row could no longer be matched to its own state. So the
 * two symbols that actually distinguish language names are spelled out before slugging, and the
 * index disambiguates anything still colliding.
 */
export function toTechStack(p: EngineProfile): TechStack[] {
  const seen = new Set<string>()
  const keyFor = (name: string, index: number) => {
    const base = slug(
      String(name).replace(/\+/g, '-plus').replace(/#/g, '-sharp'),
      `skill-${index}`,
    )
    if (seen.has(base)) return `${base}-${index}`
    seen.add(base)
    return base
  }

  return (p.skills ?? []).map((s: EngineRecord, i: number) => ({
    key: keyFor(s.name, i),
    title: s.name,
    // Empty is meaningful: his component renders a plain pill rather than a link, because a
    // technology nobody gave a homepage for should not link to the page it is already on.
    href: typeof s.url === 'string' ? s.url : '',
    /**
     * His type requires an element and his markup has always had a slot for one; ours used to
     * pass `null`, so every pill was text. `techIcon` resolves the explicit slug first and
     * falls back to the name, so an imported stack gets recognisable marks with nothing
     * configured, and an unknown technology renders without a glyph rather than broken.
     */
    icon: techIcon(s.name, s.icon) as unknown as TechStack['icon'],
    categories: [s.category ?? 'Other'],
  }))
}

export const TECH_STACK: TechStack[] = toTechStack(profile)

/* -------------------------------------------------------------------------- */
/* Social                                                                      */
/* -------------------------------------------------------------------------- */

const SOCIAL_TITLES: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', linkedin: 'LinkedIn', x: 'X', twitter: 'X',
  huggingface: 'Hugging Face', orcid: 'ORCID', stackoverflow: 'Stack Overflow',
  leetcode: 'LeetCode', youtube: 'YouTube', npm: 'npm', pypi: 'PyPI',
}

/**
 * Platforms his components index by name rather than iterating — `SOCIAL.x.handle` in the
 * footer, `SOCIAL.github` in the header. On his data those keys always exist; on imported data
 * they may not, and the property access throws before anything renders.
 *
 * So every directly-indexed key is guaranteed present. A platform nobody connected gets an
 * empty `href`, which his components render as a link to nowhere rather than crashing — and
 * `SOCIAL_LINKS`, which is what the visible social row iterates, still contains only the
 * profiles that were actually imported.
 */
const REQUIRED_KEYS = ['github', 'linkedin', 'x'] as const
const placeholder = (name: string): SocialProfile => ({
  title: SOCIAL_TITLES[name] ?? name,
  handle: '',
  href: '',
  sameAs: false,
})

function importedSocials(p: EngineProfile): Record<string, SocialProfile> {
  return Object.fromEntries(
    Object.entries(p.socials ?? {})
      .filter(([, href]) => typeof href === 'string' && href)
      .map(([platform, href]) => [
        platform,
        {
          title: SOCIAL_TITLES[platform] ?? platform.replace(/^./, (c) => c.toUpperCase()),
          handle: String(href).replace(/\/+$/, '').split('/').pop() ?? '',
          href: String(href),
          sameAs: true,
        },
      ]),
  )
}

export function toSocial(p: EngineProfile): Record<string, SocialProfile> {
  return {
    ...Object.fromEntries(REQUIRED_KEYS.map((k) => [k, placeholder(k)])),
    ...importedSocials(p),
  }
}

/** Only what was actually imported — the placeholders above are not real profiles. */
export function toSocialLinks(p: EngineProfile): SocialLink[] {
  return Object.entries(importedSocials(p)).map(([name, entry]) => ({ name, ...entry }))
}

export const SOCIAL: Record<string, SocialProfile> = toSocial(profile)

/**
 * Upstream this is `keyof typeof SOCIAL` over a hand-written literal, so it is a closed union of
 * his platforms. Ours is built from whatever connectors ran, so the set is open — which is what
 * lets `SOCIAL_ICONS` fall back to a generic icon for a platform his site never had.
 */
export type SocialName = string
export type SocialLink = SocialProfile & { name: SocialName }

export const SOCIAL_LINKS: SocialLink[] = toSocialLinks(profile)
