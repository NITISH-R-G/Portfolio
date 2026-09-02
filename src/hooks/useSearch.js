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
  // Tracks the embedding model separately from the index: lexical search must be usable the
  // instant the index is ready, while ~23 MB of weights are still arriving in the background.
  const [semanticState, setSemanticState] = useState('idle')

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
        const agent = PortfolioAgent.fromManifest(manifest, { strict: false })
        agentRef.current = agent
        setReady(true)

        // Precomputed document vectors: 63 kB, shipped with the site. Loading them costs
        // nothing meaningful and does not imply the model — the model is fetched only when a
        // query actually needs embedding.
        import('../data/generated/embeddings.json')
          .then(({ default: index }) => { agent.useEmbeddings(index) })
          .catch(() => { /* Built without embeddings. Lexical search is unaffected. */ })
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

  /**
   * Search with embeddings, falling back to lexical rather than failing.
   *
   * The first call fetches the model, which is why this reports its own state: a visitor sees
   * lexical results immediately and better ones a moment later, instead of an empty panel and
   * a spinner. If the weights never arrive — offline, blocked, an old browser — the lexical
   * results simply stand, and nothing tells the visitor that anything is missing, because from
   * their side nothing is.
   */
  const semanticSearch = useCallback(async (query) => {
    const agent = agentRef.current
    if (!agent || !query?.trim()) return []
    if (!agent._vectors?.size) return agent.search(query, { limit: 24 })

    setSemanticState((state) => (state === 'ready' ? state : 'loading'))
    try {
      const results = await agent.semanticSearch(query, { limit: 24 })
      setSemanticState('ready')
      return results
    } catch {
      setSemanticState('unavailable')
      return agent.search(query, { limit: 24 })
    }
  }, [])

  /**
   * How the agent read a question, without running it.
   *
   * Same parser the results came from, so the explanation shown to the visitor can never
   * describe a different interpretation than the one that produced the list.
   */
  const understand = useCallback((query) => {
    if (!agentRef.current || !query?.trim()) return null
    return agentRef.current.understand(query)
  }, [])

  return {
    ready, loading, error, prepare, search, semanticSearch, understand,
    semanticState, manifest: manifestRef.current,
  }
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
