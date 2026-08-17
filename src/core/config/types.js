/**
 * Configuration types.
 *
 * Kept separate from `defaults.js` so that editors can offer completion on
 * `portfolio.config.js` through the `defineConfig` helper without importing runtime values.
 *
 * @module core/config/types
 */

/** @typedef {import('./defaults.js').SectionVisibility} SectionVisibility */

/**
 * @typedef {object} SiteConfig
 * @property {string} [url]            Absolute origin, e.g. `"https://ada.dev"`.
 * @property {string} [base]           Mount path, e.g. `"/"` or `"/portfolio/"`.
 * @property {string} [title]          Defaults to `"{name} — {headline}"`.
 * @property {string} [titleTemplate]
 * @property {string} [description]    Defaults to the identity summary.
 * @property {string} [language]
 * @property {string} [ogImage]
 */

/**
 * @typedef {object} ThemeConfig
 * @property {string} [preset]
 * @property {Record<string, string>} [tokens]
 * @property {string} [accent]
 * @property {string} [fontSans]
 * @property {string} [fontMono]
 * @property {string} [radius]
 * @property {'compact'|'comfortable'|'spacious'} [density]
 * @property {'dark'|'light'|'system'|''} [colorScheme]
 */

/**
 * @typedef {object} LayoutConfig
 * @property {'narrow'|'default'|'wide'|'full'} [maxWidth]
 * @property {'sidebar'|'stacked'} [shell]
 * @property {'dock'|'top'|'none'} [navigation]
 * @property {'carousel'|'grid'|'list'} [projectLayout]
 * @property {'cards'|'timeline'} [experienceLayout]
 * @property {'circle'|'rounded'|'square'} [avatarStyle]
 * @property {'outline'|'solid'|'plain'} [socialIconStyle]
 * @property {boolean} [customCursor]
 */

/**
 * @typedef {object} AnimationConfig
 * @property {'none'|'subtle'|'standard'|'expressive'} [intensity]
 * @property {boolean} [smoothScroll]
 * @property {boolean} [respectReducedMotion]
 */

/**
 * @typedef {object} SeoConfig
 * @property {boolean} [enabled]
 * @property {boolean} [structuredData]
 * @property {boolean} [sitemap]
 * @property {string[]} [keywords]
 * @property {string} [twitterHandle]
 */

/**
 * @typedef {object} AnalyticsConfig
 * @property {string} [provider]
 * @property {string} [endpoint]
 * @property {boolean} [respectDoNotTrack]
 */

/**
 * @typedef {object} PrivacyConfig
 * @property {boolean} [hideEmail]
 * @property {boolean} [obfuscateEmail]
 * @property {boolean} [excludePrivateRepos]
 * @property {boolean} [showDataProvenance]
 */

/**
 * @typedef {object} FeatureConfig
 * @property {boolean} [admin]
 * @property {boolean} [exports]
 * @property {boolean} [evidenceMode]
 */

/**
 * @typedef {object} DeploymentConfig
 * @property {'github-pages'|'vercel'|'netlify'|'cloudflare'|'static'} [target]
 */

/**
 * @typedef {object} ConfigIdentity
 * @property {string} [name]
 * @property {string} [headline]
 * @property {string} [summary]
 * @property {string} [location]
 * @property {string} [avatar]
 * @property {string} [pronouns]
 * @property {import('../schema/types.js').Availability} [availability]
 * @property {import('../schema/types.js').Contact} [contact]
 */

/**
 * The shape of `portfolio.config.js`. Every field is optional.
 *
 * @typedef {object} PortfolioConfig
 * @property {ConfigIdentity} [identity]
 * @property {SiteConfig} [site]
 * @property {ThemeConfig} [theme]
 * @property {LayoutConfig} [layout]
 * @property {AnimationConfig} [animations]
 * @property {Record<string, SectionVisibility>} [sections]
 * @property {string[]} [sectionOrder]
 * @property {Record<string, Record<string, unknown>>} [sectionOptions]
 * @property {Record<string, Record<string, unknown>>} [dataSources]
 * @property {Record<string, string>} [socialLinks]
 * @property {SeoConfig} [seo]
 * @property {AnalyticsConfig} [analytics]
 * @property {PrivacyConfig} [privacy]
 * @property {FeatureConfig} [features]
 * @property {DeploymentConfig} [deployment]
 */

/**
 * Identity helper for `portfolio.config.js`.
 *
 * Does nothing at runtime beyond returning its argument — its only job is to give editors
 * the type so users get completion and inline documentation while editing their config.
 *
 * @param {PortfolioConfig} config
 * @returns {PortfolioConfig}
 */
export function defineConfig(config) {
  return config
}

export {}
