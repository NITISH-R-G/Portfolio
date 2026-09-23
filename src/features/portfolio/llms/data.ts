import {
  AWARDS,
  CERTIFICATIONS,
  EDUCATION,
  EXPERIENCES,
  PAGE_SECTIONS,
  PROJECTS,
  SITE,
  SOCIAL_LINKS,
  TECH_STACK,
  USER,
} from "@/features/portfolio/data/adapter"

import type { PortfolioDocumentData } from "./documents"

/** The built portfolio, as the Markdown documents read it — the same constants the page renders. */
export const PORTFOLIO_DOCUMENT_DATA: PortfolioDocumentData = {
  user: USER,
  siteUrl: SITE.url,
  sections: PAGE_SECTIONS,
  socialLinks: SOCIAL_LINKS,
  stack: TECH_STACK,
  experiences: EXPERIENCES,
  projects: PROJECTS,
  education: EDUCATION,
  certifications: CERTIFICATIONS,
  awards: AWARDS,
}
