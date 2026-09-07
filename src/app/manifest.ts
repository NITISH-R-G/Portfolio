import type { MetadataRoute } from "next"

import { SITE_INFO } from "@/config/site"
import { USER } from "@/features/portfolio/data/user"

/**
 * The web app manifest.
 *
 * Upstream this is a static `manifest.webmanifest` holding his name, his description, and four
 * icons plus four screenshots served from `assets.chanhdai.com`. Every one of those is wrong on
 * a fork twice over: it puts his identity on someone else's installed app, and it makes the
 * fork's install experience depend on his infrastructure staying up and willing to serve it.
 *
 * A route rather than a file so it reads the same configuration everything else does. The icons
 * are the ones this repository actually ships, in `public/assets`; the screenshots are gone
 * because there are none to point at, and an install prompt with no screenshots is complete
 * while one pointing at a stranger's is not.
 */
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_INFO.name,
    short_name: USER.firstName || SITE_INFO.name,
    description: SITE_INFO.description,
    lang: SITE_INFO.language,
    icons: [
      {
        src: "./assets/favicon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "./assets/profile.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
    id: "/?utm_source=pwa",
    start_url: "./?utm_source=pwa",
    display: "standalone",
    scope: "./",
  }
}
