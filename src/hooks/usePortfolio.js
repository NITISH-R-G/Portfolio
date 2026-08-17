import { useMemo } from 'react'
import { loadPortfolio } from '../core/load.js'

/**
 * Runs the full build pipeline (config resolution → merge → override → rank → derive →
 * theme → SEO) — memoized at the module level in `core/load.js`, so every component calling
 * this hook shares one computed result, and `main.jsx` can apply the theme before the first
 * paint using the exact same object React renders from. No component reads
 * `portfolio.config.js` or the data files directly, which is what keeps the pipeline
 * swappable (a future SSR entry point or a CLI preview can call `buildPortfolio` the same
 * way without touching a component).
 *
 * @returns {import('../core/generate/build.js').BuiltPortfolio}
 */
export function usePortfolio() {
  return useMemo(() => loadPortfolio(), [])
}

/** @returns {import('../core/themes/apply.js').ResolvedTheme} */
export function useTheme() {
  return usePortfolio().theme
}

/** @returns {import('../core/schema/types.js').Identity} */
export function useIdentity() {
  return usePortfolio().profile.identity
}

/** @returns {{id: string, label: string, icon: string}[]} */
export function useNavigation() {
  return usePortfolio().navigation
}

/** @returns {import('../core/generate/sections.js').ResolvedSection[]} */
export function useSections() {
  return usePortfolio().sections
}
