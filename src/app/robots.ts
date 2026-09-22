import type { MetadataRoute } from "next"

import { SITE_INFO } from "@/config/site"

/**
 * Static export requires every route handler to declare that it is static; without it Next
 * cannot know the response is build-time constant. Upstream this runs on Vercel, where the
 * route is evaluated per request and the declaration is unnecessary.
 */
export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
      },
    ],
    sitemap: `${SITE_INFO.url}/sitemap.xml`,
  }
}
