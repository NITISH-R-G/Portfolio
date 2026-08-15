/**
 * Resolve an asset path against the site's configured mount path.
 *
 * `core/schema/profile.js` intentionally normalizes image references as relative paths
 * (`"assets/profile.svg"`) rather than resolving them, because that normalization also runs
 * in Node (import scripts, tests) where `import.meta.env` does not exist. Resolution against
 * the deployed base path only makes sense in the browser, at render time — which is what
 * this does.
 *
 * Without it, a portfolio deployed to a GitHub Pages project site (`base: "/my-repo/"`)
 * would request `/assets/profile.svg` from the domain root and 404, instead of
 * `/my-repo/assets/profile.svg`.
 *
 * @module lib/assetUrl
 */

/**
 * @param {string|undefined} path
 * @returns {string|undefined}
 */
export function assetUrl(path) {
  if (!path) return path
  // Absolute URLs and data URIs are already resolvable as-is.
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
  return `${base}${path.replace(/^\/+/, '')}`
}
