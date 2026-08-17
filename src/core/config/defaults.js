/**
 * Configuration defaults.
 *
 * Every key here has a working value, so `portfolio.config.js` only ever needs to contain
 * what the user actually wants to change. A config of `{ identity: { name: 'Ada' } }` is
 * a complete, valid configuration.
 *
 * @module core/config/defaults
 */

/**
 * How a section's visibility is decided.
 * - `true`  — always render (even if it would be empty, so the user can see it is empty)
 * - `false` — never render
 * - `'auto'` — render only when there is enough data to justify it. See
 *   `core/generate/sections.js` for the per-section thresholds.
 *
 * @typedef {boolean|'auto'} SectionVisibility
 */

/**
 * The canonical section list. Order here is the default reading order of a portfolio and
 * is what `sectionOrder` falls back to. Every id must have a renderer registered in
 * `src/sections/registry.jsx`.
 *
 * @type {readonly string[]}
 */
export const SECTION_IDS = /** @type {const} */ ([
  'hero',
  'about',
  'stats',
  'projects',
  'experience',
  'education',
  'skills',
  'openSource',
  'competitive',
  'publications',
  'writing',
  'packages',
  'models',
  'videos',
  'hackathons',
  'talks',
  'achievements',
  'certifications',
  'languages',
  'contact',
])

/**
 * @returns {import('./types.js').PortfolioConfig}
 */
export function defaultConfig() {
  return {
    identity: {
      name: '',
      headline: '',
      summary: '',
      location: '',
      avatar: '',
      pronouns: '',
    },

    site: {
      /** Absolute URL the site will be served from. Used for canonical URLs and OG tags. */
      url: '',
      /**
       * Path the site is mounted at. `"/"` for a root domain, `"/repo-name/"` for a GitHub
       * Pages project site. This becomes Vite's `base` — the one setting most likely to
       * break a deployment, so `npm run setup` and `npm run doctor` both check it.
       */
      base: '/',
      title: '',
      titleTemplate: '%s',
      description: '',
      language: 'en',
      /** Path (relative to `public/`) of the social preview image. */
      ogImage: '',
    },

    theme: {
      /** Id of a preset in `core/themes/presets.js`. */
      preset: 'minimal-dark',
      /** Overrides applied on top of the preset. Any design token may be overridden. */
      tokens: {},
      /** Convenience shortcuts that expand into token overrides. */
      accent: '',
      fontSans: '',
      fontMono: '',
      radius: '',
      /** `'compact' | 'comfortable' | 'spacious'` */
      density: 'comfortable',
      /** `'dark' | 'light' | 'system'` — only meaningful for presets that define both. */
      colorScheme: '',
    },

    layout: {
      /** `'narrow' | 'default' | 'wide' | 'full'` */
      maxWidth: 'default',
      /** `'sidebar' | 'stacked'` — two-column rail, or a single scrolling column. */
      shell: 'sidebar',
      /** `'dock' | 'top' | 'none'` */
      navigation: 'dock',
      /** `'carousel' | 'grid' | 'list'` */
      projectLayout: 'carousel',
      /** `'cards' | 'timeline'` */
      experienceLayout: 'cards',
      /** `'circle' | 'rounded' | 'square'` */
      avatarStyle: 'circle',
      /** `'outline' | 'solid' | 'plain'` */
      socialIconStyle: 'outline',
      /** Show the custom cursor on fine-pointer devices. */
      customCursor: true,
    },

    animations: {
      /** `'none' | 'subtle' | 'standard' | 'expressive'` */
      intensity: 'standard',
      /** Smooth-scroll hijacking. Off is friendlier; on matches the original design. */
      smoothScroll: true,
      /**
       * Always honour `prefers-reduced-motion`. Exposed as config so it is visible, but
       * setting it to false is not supported and the UI ignores it.
       */
      respectReducedMotion: true,
    },

    /**
     * Section visibility. `'auto'` lets the generator decide from the data — this is what
     * makes an empty section disappear instead of rendering a heading with nothing under it.
     * @type {Record<string, SectionVisibility>}
     */
    sections: Object.fromEntries(SECTION_IDS.map((id) => [id, 'auto'])),

    /**
     * Render order. Any id omitted here is appended in `SECTION_IDS` order, so adding a
     * section later does not require editing this array.
     * @type {string[]}
     */
    sectionOrder: [...SECTION_IDS],

    /**
     * Per-section presentation overrides, keyed by section id, e.g.
     * `{ projects: { limit: 6, showAll: false } }`.
     * @type {Record<string, Record<string, unknown>>}
     */
    sectionOptions: {},

    /**
     * Connector configuration, keyed by connector id. A connector runs only when its entry
     * is present, `enabled` is not false, and it has the identifiers it needs.
     * @type {Record<string, Record<string, unknown>>}
     */
    dataSources: {},

    /**
     * Extra profile links shown in the sidebar, beyond what connectors contribute.
     * @type {Record<string, string>}
     */
    socialLinks: {},

    seo: {
      enabled: true,
      /** Emit JSON-LD Person / ProfilePage / WebSite structured data. */
      structuredData: true,
      /** Write `sitemap.xml` and `robots.txt` at build time. */
      sitemap: true,
      /** @type {string[]} */
      keywords: [],
      twitterHandle: '',
    },

    analytics: {
      /** `'' | 'endpoint'` — a POST endpoint receiving `{ events: [...] }`. */
      provider: '',
      /** Read from `VITE_ANALYTICS_ENDPOINT` when empty. */
      endpoint: '',
      respectDoNotTrack: true,
    },

    privacy: {
      /** Strip email addresses from the built output entirely. */
      hideEmail: false,
      /** Render the email obfuscated against naive scrapers. */
      obfuscateEmail: true,
      /** Never include imported records the connector marked private. */
      excludePrivateRepos: true,
      /** Show a "last updated / sourced from" line under imported sections. */
      showDataProvenance: true,
    },

    features: {
      /** Serve the local builder at /admin.html in dev. */
      admin: true,
      /** Generate resume.json, profile README and portfolio.json on `npm run export`. */
      exports: true,
      /** Render evidence lines under skills instead of a bare tag cloud. */
      evidenceMode: true,
    },

    deployment: {
      /** `'github-pages' | 'vercel' | 'netlify' | 'cloudflare' | 'static'` */
      target: 'static',
    },
  }
}
