import type { MetadataRoute } from "next"

import { absoluteUrl } from "@/lib/utils"

/**
 * Static export requires every route handler to declare that it is static; without it Next
 * cannot know the response is build-time constant. Upstream this runs on Vercel, where the
 * route is evaluated per request and the declaration is unnecessary.
 */
export const dynamic = "force-static"

/**
 * Upstream this enumerates his docs, blocks and blog posts. A portfolio built from connector
 * data is a single page, so that is what the sitemap says.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ]
}
