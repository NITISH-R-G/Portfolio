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
  // The order his page renders in. The ten ids above the break each map onto one of his
  // components — see `PAGE_SECTION_BY_ENGINE_ID` in the portfolio adapter — so this list is
  // the page's default reading order, not an abstract one.
  'hero',
  'contact',
  'github',
  'skills',
  'showcase',
  'blocks',
  'experience',
  'education',
  'projects',
  'achievements',
  'certifications',

  // Known to the engine, imported and ranked, but with no component in this application that
  // draws them. They stay in the taxonomy because the data is real and an exported
  // `portfolio.json` or `resume.json` still carries it.
  'about',
  'stats',
  'openSource',
  'competitive',
  'publications',
  'writing',
  'packages',
  'models',
  'videos',
  'hackathons',
  'talks',
  'languages',
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

    /**
     * Layout.
     *
     * There is one shell — the ported centred column — so there is no setting to choose one.
     * The options that remain are the ones the components actually implement.
     */
    /**
     * The source theme.
     *
     * One of the twenty-four names in his `THEMES` registry — the shadcn theme list his block
     * previews already use. Each carries a complete `cssVars` block for the same tokens his
     * portfolio components read, which is why choosing one moves the whole site.
     *
     * Empty means "his own defaults", which is what an unmodified fork looks like.
     */
    sourceTheme: '',

    layout: {
      /** `'narrow' | 'default' | 'wide' | 'full'` — the content column's cap. */
      maxWidth: 'default',
      /** `'minimap' | 'none'` — the section navigation in the right margin, xl and up. */
      navigation: 'minimap',
      /** `'circle' | 'rounded' | 'square'` — the profile header's avatar. */
      avatarStyle: 'circle',
    },

    /**
     * The footer.
     *
     * `items` is the definition list upstream renders: each entry is one label with one or
     * more values, and a value with a `href` becomes a link. The defaults describe *this*
     * engine rather than the upstream author's own hosting choices.
     */
    footer: {
      enabled: true,
      /** The social icon row beneath the list. Drawn from the imported `socials`. */
      showSocialLinks: true,
      /** The "Source code / GitHub" row. Off for a portfolio whose repository is private. */
      showSourceCode: true,
      /**
       * The DMCA protection badge upstream always renders. It asserts a registration for a
       * specific site, which a fork does not inherit, so it is off unless deliberately turned
       * on with `NEXT_PUBLIC_DMCA_URL` pointing at the owner's own record.
       */
      showDmca: false,
      items: [
        { label: 'Built with', values: [{ text: 'An open-source portfolio engine' }] },
        { label: 'Data', values: [{ text: 'portfolio.json', href: './portfolio.json' }] },
      ],
    },

    /**
     * The profile header.
     *
     * `flipInterval` is his `TextFlip`'s own `interval` prop, in seconds, surfaced because
     * `FlipSentences` renders it under the name on every page. Nothing else about the header is
     * configurable, because nothing else about it is a prop.
     */
    profile: {
      flipInterval: 3,
    },

    /**
     * The site header's navigation.
     *
     * `items` is what upstream's `MAIN_NAV` holds — a title and an in-app path per entry,
     * rendered by his `NavDesktop` and `NavMobile`. Empty is a complete configuration and is
     * what an unmodified fork looks like: both components render nothing for an empty list.
     */
    navigation: {
      /** @type {{title: string, href: string}[]} */
      items: [],
    },

    animations: {
      /** `'none' | 'subtle' | 'standard' | 'expressive'` */
      intensity: 'standard',
      /** Smooth-scroll hijacking. Off is friendlier; on matches the original design. */
      smoothScroll: false,
      /**
       * Always honour `prefers-reduced-motion`. Exposed as config so it is visible, but
       * setting it to false is not supported and the UI ignores it.
       */
      respectReducedMotion: true,
    },

    /**
     * Decorative effects, each independently switchable.
     *
     * Separate from `animations` on purpose, and subordinate to it. `animations` owns *motion*
     * — how fast things move, and whether they move at all — and stays the single authority on
     * that. This block owns *decoration*: the goo, the beam, the ambient flourishes that a
     * portfolio is entirely usable without. Two questions, two homes, one hierarchy.
     *
     * The subordination is what keeps it from becoming a competing switch. Whatever is set
     * here, an effect is off when `animations.intensity` is `'none'` or when the visitor has
     * asked for reduced motion. Configuration can only ever take decoration away, never
     * insist on it.
     *
     * Every effect follows the same shape — `enabled`, its own parameters, and a `targets` map
     * naming the places it may appear — so adding one is a data change plus a component that
     * asks whether it is on.
     */
    effects: {
      /** The master switch. `false` removes every decorative effect from the render path. */
      enabled: true,

      /**
       * Liquid Gooey: adjacent controls rendered as one connected mass.
       *
       * Parameter names and defaults mirror the library's own (`liquid-gooey` v0.2), so what
       * is configurable here is exactly what the implementation honours — nothing is accepted
       * and quietly ignored.
       */
      liquidGooey: {
        enabled: true,
        /** Goo blur sigma in px: how far apart pieces begin to bridge. */
        blur: 7,
        /** Alpha-contrast slope: how sharp the liquid edge reads. */
        contrast: 20,
        /** Surface fill. Empty means "inherit the theme's surface token". */
        fill: '',
        /** `box-shadow` syntax, painted on the merged silhouette. Empty for none. */
        shadow: '',
        /** Filter-region slack in px, for pieces travelling outside the group box. */
        filterPadding: 24,
        /** Px of edge undulation. 0 keeps the calm edge, which is the honest default. */
        waviness: 0,
        /** Noise frequency of that undulation; lower is longer and lazier. */
        wavinessFreq: 0.02,
        /**
         * Where it is allowed to appear. The effect says "these controls are one object", so
         * a target only earns a `true` when that is true of it. Defaults are deliberately
         * conservative: one place, where it means something.
         */
        targets: {
          /** The copy button and the panel it extrudes, 4px apart. */
          copyMenu: true,
          /** The floating navigation cluster. Off by default — see docs/effects.md. */
        },
      },

      /** Border Beam: a travelling highlight that marks a field as live. */
      borderBeam: {
        enabled: true,
        /** `'sm' | 'md' | 'lg'` */
        size: 'md',
        targets: {
          /** The search input, while it has focus. */
          searchField: true,
        },
      },
    },

    /**
     * Section visibility. `'auto'` lets the generator decide from the data — this is what
     * makes an empty section disappear instead of rendering a heading with nothing under it.
     * @type {Record<string, SectionVisibility>}
     */
    sections: {
      ...Object.fromEntries(SECTION_IDS.map((id) => [id, 'auto'])),
      /**
       * Off unless asked for. Every other section is `'auto'` because the generator can look at
       * the data and decide; this one has no data behind it — the component registry is part of
       * the application, not of anyone's profile — so `'auto'` would mean "always", and a
       * portfolio with nothing in it would still render a strip of components.
       *
       * `showcase` is the opposite and stays `'auto'`: it is built from the owner's own
       * projects, so the data answers the question.
       */
      blocks: false,
    },

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

    admin: {
      /**
       * Origin of the publishing Worker, e.g. `https://portfolio-admin.you.workers.dev`.
       *
       * Empty by default, and empty is a complete configuration: the builder then behaves
       * exactly as it always has — show the changes, let you commit them yourself. Publishing
       * is an addition to that flow, not a replacement for it, so a fork with no Cloudflare
       * account is not a fork with a broken admin.
       *
       * Only an origin is ever stored here, never a token: the whole point of the Worker is
       * that credentials stay on the far side of it.
       */
      api: '',
    },
  }
}
