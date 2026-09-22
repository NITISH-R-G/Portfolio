import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { NextConfig } from "next"

import portfolioConfig from "./portfolio.config.js"

/**
 * What the admin has published, if anything.
 *
 * `src/data/config.json` is written by the admin's Publish button and layers over the
 * hand-authored `portfolio.config.js` — the same order `core/load.node.js` uses. Reading it here
 * is what makes the admin's "Base path" field real: without it the value published fine and
 * changed nothing, which on a project site means every asset 404s on a deploy that built
 * cleanly. A missing or malformed file is simply no layer, because a fork that has never
 * published is the normal case rather than an error.
 */
type PublishedConfig = { site?: { base?: string } }

function publishedConfig(): PublishedConfig {
  try {
    // Narrowed to the one key this file reads rather than typed as a bag of `any`. Anything
    // else the admin publishes is the engine's business, not the Next config's.
    return JSON.parse(
      readFileSync(join(process.cwd(), "src/data/config.json"), "utf8")
    ) as PublishedConfig
  } catch {
    return {}
  }
}

/**
 * Component slugs that used to also render under /blog/<slug> (a shared MDX
 * pool) and were indexed there. After splitting content into category folders
 * they live only at /components/<slug>, so the legacy /blog URLs are permanently
 * redirected below to avoid 404s.
 *
 * This is a fixed snapshot of the previously-indexed slugs — components added
 * after the split were never on /blog and don't need an entry.
 */
const LEGACY_BLOG_COMPONENT_SLUGS = [
  "apple-hello-effect",
  "brand-assets-menu",
  "chevrons-up-down-icon",
  "code-block-command",
  "consent-manager",
  "copy-button",
  "dot-grid-spotlight",
  "elastic-slider",
  "fluid-gradient-text",
  "github-contributions",
  "github-stars",
  "glow-card-grid",
  "haptic",
  "icon-swap",
  "middle-truncation",
  "mobius-loop-icon",
  "react-wheel-picker",
  "scroll-fade-effect",
  "shimmering-text",
  "slide-to-unlock",
  "spinning-circular-text",
  "testimonial-spotlight",
  "testimonial",
  "testimonials-marquee",
  "text-flip",
  "theme-switcher",
  "theme-toggle-effect",
  "toc-minimap",
  "twemoji",
  "work-experience-component",
] as const

const legacyBlogComponentRedirects = LEGACY_BLOG_COMPONENT_SLUGS.map(
  (slug) => ({
    source: `/blog/${slug}`,
    destination: `/components/${slug}`,
    permanent: true,
  })
)

/**
 * The base path, read from the engine's own config so there is one source of truth. `doctor`
 * reports the same value, and GitHub Pages serves a project site from a subdirectory — getting
 * these two out of step is how every asset 404s on a deploy that built fine locally.
 *
 * Next wants "" for a root deployment and "/name" otherwise; `site.base` is stored with both
 * slashes ("/Portfolio/"), so the trailing one is trimmed here.
 */
const basePath = (
  publishedConfig()?.site?.base ??
  portfolioConfig?.site?.base ??
  "/"
).replace(/\/+$/, "")

const nextConfig: NextConfig = {
  /**
   * This fork deploys to GitHub Pages, which serves files and runs nothing. Every route in the
   * app is already prerendered (`○ Static` in the build output), so the export costs nothing:
   * upstream the same config runs on Vercel, where server rendering is available and used by
   * routes this fork does not have.
   *
   * `basePath` mirrors `site.base` in portfolio.config.js — Pages serves a project site from a
   * subdirectory, and every asset URL has to carry it.
   */
  output: "export",
  basePath,
  trailingSlash: true,

  /**
   * Stamped once per build and inlined. Reading the clock at render time would
   * instead report whenever a page was regenerated, which drifts on the ISR
   * routes and disagrees with the fully static ones.
   */
  env: {
    BUILD_TIMESTAMP: new Date().toISOString(),
    /**
     * The base path, for the few places that build a URL as a string.
     *
     * Next prefixes `<Link>` and the router automatically, but not a literal handed to an
     * iframe `src`. The block viewer does exactly that, so without this every block preview
     * 404s on a project site — verified: `/preview/hero-01/` is a 404 under `/Portfolio`.
     */
    NEXT_PUBLIC_BASE_PATH: basePath,

    /**
     * Where the admin's local write API is, during development only.
     *
     * The admin can connect a source, run an import and disconnect one, and all three need to
     * write files — which a static export has no way to do. In development those calls go to
     * `scripts/dev-api.mjs`, a loopback-bound sidecar process; `pnpm dev` starts it alongside
     * this server.
     *
     * The production branch of this ternary is the load-bearing one. An exported build sets
     * the variable to an empty string, `admin/api.js` sees no origin, and every write control
     * degrades to showing you the change to apply yourself rather than failing against an
     * endpoint that was never deployed. It is also why no API origin is ever baked into the
     * published site.
     */
    NEXT_PUBLIC_ADMIN_API:
      process.env.NODE_ENV === "development"
        ? process.env.PORTFOLIO_ADMIN_API ??
          `http://127.0.0.1:${process.env.PORTFOLIO_ADMIN_PORT ?? 4319}`
        : "",
  },
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["next-mdx-remote"],
  allowedDevOrigins: ["ncdai.localhost", "ncdai.local"],
  devIndicators: false,
  experimental: {
    // Rewrite barrel imports to deep imports so a single icon doesn't pull the
    // whole package into the module graph. Next already optimizes lucide-react,
    // @tabler/icons-react, date-fns and lodash-es by default; these are the
    // heavy icon packages this app uses that are NOT on that default list.
    optimizePackageImports: [
      "@hugeicons/react",
      "@hugeicons/core-free-icons",
      "@phosphor-icons/react",
      "@remixicon/react",
    ],
  },
  images: {
    // Static export ships no image optimizer, so the loader has to be a no-op.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.chanhdai.com",
        port: "",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
      },
    ],
    qualities: [75, 100],
  },
  compiler:
    process.env.NODE_ENV === "production"
      ? {
          removeConsole: {
            exclude: ["error"],
          },
        }
      : undefined,
  async redirects() {
    return [
      {
        source: "/:section(blog|components)/writing-effect-inspired-by-apple",
        destination: "/:section/apple-hello-effect",
        permanent: true,
      },
      {
        source: "/:section(blog|components)/work-experience",
        destination: "/:section/work-experience-component",
        permanent: true,
      },
      {
        source: "/:section(blog|components)/theme-switcher-component",
        destination: "/:section/theme-switcher",
        permanent: true,
      },
      {
        source: "/wall-of-love",
        destination: "/testimonials",
        permanent: true,
      },
      /**
       * /llms-full.txt used to serve the whole site as one document. It is now
       * covered by /llms.txt plus the per-section .md routes, so agents probing
       * the conventional URL land on the index instead of a 404.
       */
      {
        source: "/llms-full.txt",
        destination: "/llms.txt",
        permanent: true,
      },
      {
        source: "/blocks/content",
        destination: "/blocks/marketing",
        permanent: true,
      },
      {
        source: "/blocks/content/blog-01",
        destination: "/blocks/marketing/blog-01",
        permanent: true,
      },
      {
        source: "/blocks/content/blog-02",
        destination: "/blocks/marketing/blog-02",
        permanent: true,
      },
      {
        source: "/blocks/content/experience-01",
        destination: "/blocks/marketing/experience-01",
        permanent: true,
      },
      {
        source: "/blocks/content/team-01",
        destination: "/blocks/marketing/team-01",
        permanent: true,
      },
      {
        source: "/:section(blog|components)/:slug.mdx",
        destination: "/:section/:slug.md",
        permanent: true,
      },
      ...legacyBlogComponentRedirects,
    ]
  },
  async rewrites() {
    return {
      // beforeFiles so these run before prerendered pages are served;
      // afterFiles rewrites never fire for SSG pages on Vercel, which
      // silently breaks Accept-based markdown negotiation in production
      beforeFiles: [
        {
          source: "/:section(blog|components)/:slug.md",
          destination: "/doc.md/:slug",
        },
        {
          source: "/:section(blog|components)/:slug",
          destination: "/doc.md/:slug",
          has: [
            {
              type: "header",
              key: "accept",
              value: "(?<accept>.*text/markdown.*)",
            },
          ],
        },
        {
          source: "/index.md",
          destination: "/llms.txt",
        },
        {
          source: "/",
          destination: "/llms.txt",
          has: [
            {
              type: "header",
              key: "accept",
              value: "(?<accept>.*text/markdown.*)",
            },
          ],
        },
      ],
      afterFiles: [
        {
          source: "/rss",
          destination: "/blog/rss",
        },
        {
          source: "/registry/rss",
          destination: "/components/rss",
        },
      ],
    }
  },
}

export default nextConfig
