/**
 * Vite plugin: bake SEO metadata into the HTML at build time.
 *
 * `main.jsx` already replaces the placeholder meta tag once the bundle runs, which covers
 * anything with a JavaScript engine. Crawlers and social-card scrapers largely do not have
 * one — a link shared to Slack, LinkedIn or X is unfurled by a fetcher that reads the raw
 * HTML and nothing else. Metadata that only exists after hydration is metadata those
 * readers never see.
 *
 * So the same `generateSeo` output is injected into `index.html` during the build, and the
 * runtime replacement becomes a no-op that keeps `npm run dev` accurate. The sitemap,
 * robots.txt and the public agent manifest are emitted from the same data.
 *
 * @module scripts/lib/seoPlugin
 */

import { generateSitemap, generateRobots } from '../../src/core/generate/seo.js'
import { toPublicManifest } from '../../src/core/standard/public.js'
import { MANIFEST_FILENAME } from '../../src/core/standard/discovery.js'
import { loadBuiltPortfolio, PATHS, relative, fs, path } from './portfolio.mjs'

/**
 * @returns {import('vite').Plugin}
 */
export function portfolioSeo() {
  /** @type {Awaited<ReturnType<typeof loadBuiltPortfolio>>|null} */
  let built = null
  let isBuild = false

  return {
    name: 'portfolio-seo',
    enforce: 'post',

    configResolved(config) {
      isBuild = config.command === 'build'
    },

    /**
     * Rebuilt per HTML transform rather than cached across the whole process, so that
     * editing portfolio.config.js or a data file during `npm run dev` is reflected on the
     * next reload instead of requiring a server restart.
     */
    async transformIndexHtml(html, ctx) {
      // The admin builder is a tool, not a page anyone should find in a search result.
      if (ctx.path.includes('admin')) {
        return html.replace(
          '<meta id="seo-head"',
          '<meta name="robots" content="noindex, nofollow">\n  <meta id="seo-head"',
        )
      }

      built = await loadBuiltPortfolio()
      const { seo, config } = built

      let output = html

      // `lang` matters for screen readers choosing a voice, and is trivially derivable.
      const language = config.site.language || 'en'
      output = output.replace(/<html\b([^>]*)\blang="[^"]*"/i, `<html$1lang="${escapeAttr(language)}"`)

      output = output.replace(/<title>[\s\S]*?<\/title>/i, '')

      // The placeholder is a single self-closing meta tag; replacing it in place keeps the
      // generated tags where the author put them rather than appending to the end of head.
      const marker = /<meta id="seo-head"[^>]*>/i
      output = marker.test(output)
        ? output.replace(marker, seo.html)
        : output.replace(/<\/head>/i, `${seo.html}\n</head>`)

      return output
    },

    /**
     * Emit sitemap.xml and robots.txt into the build output.
     *
     * Written through Vite's asset pipeline rather than to `public/`, so they are always
     * generated from current data and never go stale in the repository.
     */
    generateBundle() {
      if (!isBuild || !built) return
      const { config, profile, seo } = built

      /* The public manifest ------------------------------------------------- */

      // Emitted even when SEO/sitemap generation is switched off, and even without
      // `site.url`: those settings govern how *search engines* see the page, and the manifest
      // is for agents reading a portfolio someone handed them directly. A person who turned
      // off sitemaps did not thereby ask for their portfolio to be unreadable by tools.
      if (config.agent?.manifest !== false) {
        const manifest = toPublicManifest(profile, {
          config,
          canonical: seo?.canonical,
          generatedAt: new Date().toISOString(),
        })
        this.emitFile({
          type: 'asset',
          fileName: MANIFEST_FILENAME,
          source: `${JSON.stringify(manifest, null, 2)}\n`,
        })
        console.log(`  ${relative(path.join(PATHS.dist, MANIFEST_FILENAME))} generated (public manifest)`)
      }

      /* Sitemap and robots --------------------------------------------------- */

      if (config.seo?.enabled === false || config.seo?.sitemap === false) return
      if (!config.site.url) return

      const sitemap = generateSitemap(config, { lastmod: today() })
      const robots = generateRobots(config)

      if (sitemap) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
      if (robots) this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })

      console.log(`  ${relative(path.join(PATHS.dist, 'sitemap.xml'))} and robots.txt generated for ${seo.canonical}`)
    },

    /**
     * A stale `public/sitemap.xml` or `public/robots.txt` from before this plugin existed
     * would be copied over the generated one, silently shipping another person's URLs.
     */
    buildStart() {
      if (!isBuild) return
      for (const name of ['sitemap.xml', 'robots.txt']) {
        const stale = path.join(PATHS.public, name)
        if (!fs.existsSync(stale)) continue
        const contents = fs.readFileSync(stale, 'utf8')
        if (contents.includes('generated by portfolio-engine')) continue
        console.warn(
          `[portfolio] ${relative(stale)} exists and will override the generated one. ` +
          'Delete it unless you meant to hand-write it.',
        )
      }
    },
  }
}

const today = () => new Date().toISOString().slice(0, 10)

/** @param {string} value */
const escapeAttr = (value) => String(value).replace(/[<>"'&]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] ?? c
))
