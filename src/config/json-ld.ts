import type { Person } from "schema-dts"

import { SITE_INFO } from "@/config/site"
import { PORTFOLIO_DOCUMENT_DATA } from "@/features/portfolio/llms/data"
import {
  jsonLdIds,
  toPersonJsonLd,
} from "@/features/portfolio/seo/structured-data"

/**
 * Stable @id anchors so Google can merge JSON-LD nodes across separate
 * <script> blocks (and pages) into a single entity in the Knowledge Graph.
 * The "#fragment" keeps each node id distinct from the page URL itself.
 */
export const JSON_LD_ID = jsonLdIds(SITE_INFO.url)

/**
 * The owner, built from the portfolio's data (`toPersonJsonLd`) rather than written by hand:
 * job title, schools, current employer and technologies as the page shows them, and the
 * profiles marked `sameAs`.
 */
export const personJsonLd: Person = toPersonJsonLd(PORTFOLIO_DOCUMENT_DATA)
