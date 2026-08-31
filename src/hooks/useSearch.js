import { useCallback, useEffect, useRef, useState } from 'react'
import { usePortfolio } from './usePortfolio'

/**
 * Search, backed by the same code the npm package uses.
 *
 * The important structural point: this hook contains no search logic. Ranking, concept
 * expansion and provenance all live in `@portfolio-engine/agent`, which is published, tested
 * against a fictional portfolio, and usable without a browser. The UI is one consumer of that
 * abstraction rather than the place it lives — so what a recruiter sees in the search box and
 * what a developer gets from `portfolio.search()` can never drift apart.
 *
 * The index is built from the **canonical manifest**, not from rendered text. It is derived
 * in the browser from the already-loaded profile rather than fetched, so there is no extra
 * request and no chance of the page and the index describing different data.
 *
 * ## Why it loads lazily
 *
 * The search modules and the index are pulled in on first use, not at startup. Nobody has
 * searched yet when the page paints, and the previous milestone was spent removing work from
 * exactly that moment — shipping a ranking engine into the critical path to save 150ms on an
 * interaction that may never happen would undo it.
 *
 * That deferral is also the only genuine loading state in this interface, which is what makes
 * a spinner here honest rather than theatre.
 *
 * @returns {{
 *   ready: boolean,
 *   loading: boolean,
 *   error: string|null,
 *   prepare: () => void,
 *   search: (query: string) => import('@portfolio-engine/agent').SearchResult[],
 *   manifest: Record<string, any>|null,
 * }}
 */
export function useSearch() {
  const { profile, config } = usePortfolio()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Held in refs, not state: they are large, they never change once built, and putting them
  // in state would re-render every consumer for a value none of them read directly.
  const agentRef = useRef(null)
  const manifestRef = useRef(null)
  const startedRef = useRef(false)

  const prepare = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    setLoading(true)

    // Both imports are dynamic so neither lands in the initial bundle.
    Promise.all([
      import('@portfolio-engine/agent'),
      import('../core/standard/public.js'),
    ])
      .then(([{ PortfolioAgent }, { toPublicManifest }]) => {
        // Through the same privacy boundary the published manifest goes through, so the
        // search index can never surface a field the manifest deliberately withholds.
        const manifest = toPublicManifest(profile, {
          config,
          canonical: config?.site?.url || undefined,
        })
        manifestRef.current = manifest
        agentRef.current = PortfolioAgent.fromManifest(manifest, { strict: false })
        setReady(true)
      })
      .catch((err) => {
        // A failed index must not take the page with it — the portfolio is still readable.
        setError(err?.message ?? 'Search could not be loaded.')
      })
      .finally(() => setLoading(false))
  }, [profile, config])

  const search = useCallback((query) => {
    if (!agentRef.current || !query?.trim()) return []
    return agentRef.current.search(query, { limit: 24 })
  }, [])

  return { ready, loading, error, prepare, search, manifest: manifestRef.current }
}

/**
 * The Cmd/Ctrl-K contract, kept out of the dialog so the trigger button and the shortcut
 * cannot disagree about what "open" means.
 *
 * @param {() => void} onOpen
 */
export function useSearchShortcut(onOpen) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
      // Browsers bind Ctrl/Cmd-K to the address bar; without this the page never sees it.
      event.preventDefault()
      onOpen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}
