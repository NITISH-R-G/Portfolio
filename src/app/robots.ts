import type { MetadataRoute } from "next"

import { SITE_INFO } from "@/config/site"
import { SITE } from "@/features/portfolio/data/adapter"

/**
 * Static export requires every route handler to declare that it is static; without it Next
 * cannot know the response is build-time constant. Upstream this runs on Vercel, where the
 * route is evaluated per request and the declaration is unnecessary.
 */
export const dynamic = "force-static"

/** `/admin/` under the base path — `site.base` is stored with both slashes ("/Portfolio/"). */
function adminPath(base: string | undefined): string {
  return `/${String(base ?? "/").replace(/^\/+|\/+$/g, "")}/admin/`.replace(/^\/\//, "/")
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // The editor is for the owner, and every admin page also carries `noindex`. Crawlers
        // read robots.txt only at a host's root, so on a project site (…github.io/Portfolio/)
        // this file is advisory and the meta tag is what actually keeps the admin out; on a
        // custom domain served from the root, this rule applies as well.
        disallow: [adminPath(SITE.base)],
      },
    ],
    sitemap: `${SITE_INFO.url}/sitemap.xml`,
  }
}
