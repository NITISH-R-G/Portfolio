import type { Route } from "next"

import type { NavItem } from "@/types/nav"
import { SOCIAL } from "@/features/portfolio/data/social-links"
import { SITE, SITE_CONFIG } from "@/features/portfolio/data/adapter"
import { USER } from "@/features/portfolio/data/user"

/**
 * Upstream every field here is derived from his hand-written profile.
 *
 * Ours keeps that as the fallback — an unconfigured fork behaves identically — but lets config
 * win where it says something. Without that, the site title, description and keyword controls
 * would write values nothing reads, which is the one thing an admin control must never do.
 */
export const SITE_INFO = {
  name: SITE_CONFIG.site?.title || USER.displayName,
  url: SITE.url,
  ogImage: USER.ogImage,
  description: SITE_CONFIG.site?.description || USER.bio,
  keywords: SITE_CONFIG.seo?.keywords?.length
    ? (SITE_CONFIG.seo.keywords as string[])
    : USER.keywords,
  language: SITE_CONFIG.site?.language || "en",
}

export const LICENSE = {
  name: "MIT License",
  // The upstream licence this application is used under, which is a fact about the code
  // and correctly still points at his repository.
  url: "https://github.com/ncdai/chanhdai.com/blob/main/LICENSE",
}

export const META_THEME_COLORS = {
  light: "#ffffff",
  dark: "#09090b",
}

/**
 * Upstream this lists his component library, blocks, blog and sponsors pages, as a literal.
 *
 * A fork's pages are not his, so it is configuration: `navigation.items`, edited in the admin
 * and validated by `resolveNavigation` — which is also what stops an entry that his `Nav` could
 * render but never mark active. Empty is a complete configuration, and both nav components
 * already render nothing for an empty list, so neither needed changing.
 */
export const MAIN_NAV: NavItem<Route>[] = (
  (SITE_CONFIG.navigation?.items ?? []) as { title: string; href: string }[]
).map((item) => ({ title: item.title, href: item.href as Route }))

export const MOBILE_NAV: NavItem<Route>[] = [
  {
    title: "Home",
    href: "/",
  },
  ...MAIN_NAV,
]

export const X_HANDLE = SOCIAL.x.handle
export const GITHUB_USERNAME = SOCIAL.github.handle
export const SOURCE_CODE_GITHUB_REPO = "NITISH-R-G/Portfolio"
export const SOURCE_CODE_GITHUB_URL = "https://github.com/NITISH-R-G/Portfolio"


export const UTM_PARAMS = {
  // The host this portfolio is actually served from. Upstream this is his domain, which
  // would tag every outbound click as traffic from his site in the destination's analytics.
  utm_source: new URL(SITE.url || "https://example.com").hostname,
}
