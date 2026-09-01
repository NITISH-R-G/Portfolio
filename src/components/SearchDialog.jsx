import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useSearch } from '../hooks/useSearch'
import CopyMenu from './CopyMenu'

/**
 * Both libraries are code-split. They exist to decorate one interaction that most visitors
 * never open, and the previous milestone was spent taking work *out* of first paint — putting
 * a beam shader and a canvas animation into the initial bundle to garnish a closed dialog
 * would be the same mistake in a new costume.
 */
const BorderBeam = lazy(() => import('border-beam').then((m) => ({ default: m.BorderBeam })))
const ThinkingOrb = lazy(() => import('thinking-orbs').then((m) => ({ default: m.ThinkingOrb })))

/** Section labels, in the order results are grouped. */
const GROUP_LABELS = {
  projects: 'Projects',
  experience: 'Experience',
  skills: 'Skills',
  publications: 'Publications',
  education: 'Education',
  achievements: 'Achievements',
  certifications: 'Certifications',
  writing: 'Writing',
  packages: 'Packages',
  talks: 'Talks',
  hackathons: 'Hackathons',
  models: 'Models & datasets',
  videos: 'Videos',
  competitions: 'Competitive programming',
  languages: 'Languages',
}

/**
 * Questions, not keywords.
 *
 * These are the affordance that tells a visitor the box takes sentences. A list of noun
 * phrases teaches the opposite — people type what the examples look like, so the examples have
 * to look like what the search can actually do.
 */
const EXAMPLES = [
  'Which projects demonstrate computer vision?',
  'What did he build for accessibility?',
  'Where did he study?',
  'What companies has he worked with?',
]

/**
 * The search dialog.
 *
 * @param {{open: boolean, onClose: () => void, initialQuery?: string, onQueryChange?: (q: string) => void}} props
 */
export default function SearchDialog({ open, onClose, initialQuery = '', onQueryChange }) {
  const reducedMotion = useReducedMotion()
  const { ready, loading, error, prepare, search, understand, manifest } = useSearch()

  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)

  const inputRef = useRef(null)
  const listRef = useRef(null)
  const restoreRef = useRef(null)

  // Keeps typing responsive on a large portfolio: React renders the new keystroke at high
  // priority and the (heavier) result list at low priority, instead of blocking the input.
  const deferredQuery = useDeferredValue(query)

  /* Lifecycle ---------------------------------------------------------------- */

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    prepare()

    // Focus immediately, then again on the next frame. The immediate call is what works in a
    // background or non-composited tab, where `requestAnimationFrame` may not run at all; the
    // framed call is what wins in Safari, which can hand focus back to its own paint if you
    // only ask once. Asking twice is harmless and covers both.
    inputRef.current?.focus()
    const raf = requestAnimationFrame(() => inputRef.current?.focus())

    // The page behind a modal must not scroll with it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      // Return focus to whatever opened the dialog.
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus()
    }
  }, [open, prepare])

  useEffect(() => { setActive(0) }, [deferredQuery])

  // Mirror the query into the URL, debounced by React's deferred value rather than a timer —
  // the same signal that already gates result rendering, so the address bar cannot describe a
  // different query than the list beneath it.
  useEffect(() => {
    if (open) onQueryChange?.(deferredQuery)
  }, [open, deferredQuery, onQueryChange])

  // A query arriving from the URL (a shared link, or Back) has to reach the input.
  useEffect(() => {
    if (open && initialQuery && initialQuery !== query) setQuery(initialQuery)
    // Only when the incoming value changes; not on every keystroke, which would fight typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery])

  /* Results ------------------------------------------------------------------ */

  const results = useMemo(
    () => (ready && deferredQuery.trim() ? search(deferredQuery) : []),
    [ready, deferredQuery, search],
  )

  // How the question was read. Shown to the visitor, because a search that quietly decides a
  // question is "about education" should be able to say so — otherwise an unexpected result
  // set looks like a bug rather than an interpretation.
  const reading = useMemo(
    () => (ready && deferredQuery.trim() ? understand(deferredQuery) : null),
    [ready, deferredQuery, understand],
  )

  const groups = useMemo(() => {
    /** @type {Map<string, any[]>} */
    const byType = new Map()
    for (const result of results) {
      if (!byType.has(result.type)) byType.set(result.type, [])
      byType.get(result.type).push(result)
    }
    return [...byType.entries()]
  }, [results])

  // Flat order for keyboard navigation, which must match visual order exactly or the
  // highlight jumps around unpredictably.
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups])

  /* Keyboard ----------------------------------------------------------------- */

  const onKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (!flat.length) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1
        return (next + flat.length) % flat.length
      })
      return
    }
    if (event.key === 'Enter') {
      const result = flat[active]
      if (!result) return
      event.preventDefault()
      open_(result, onClose)
    }
  }, [flat, active, onClose])

  // Keep the highlighted row in view when navigating by keyboard.
  useEffect(() => {
    if (!listRef.current) return
    listRef.current
      .querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const showOrb = loading && !reducedMotion
  let index = -1

  return (
    <div className="search-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search this portfolio"
        onKeyDown={onKeyDown}
      >
        {/* Field --------------------------------------------------------------- */}

        <div className="search-field-shell">
          <Suspense fallback={null}>
            {/* The beam marks the field as *live* rather than decorating it: it runs while
                the field has focus and stops when it does not, so it is a state indicator
                rather than something permanently flickering at the top of the page.
                Suppressed entirely under reduced motion. */}
            <BorderBeam
              size="md"
              colorVariant="mono"
              theme="dark"
              active={focused && !reducedMotion}
              staticColors={reducedMotion}
              strength={0.55}
              duration={2.6}
              className="search-beam"
            >
              <div className="search-field">
                <Icon name="Search" size={16} aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  className="search-input"
                  placeholder="Search projects, experience, skills…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  aria-label="Search this portfolio"
                  aria-describedby="search-hint"
                  autoComplete="off"
                  spellCheck="false"
                />
                {showOrb && (
                  <Suspense fallback={null}>
                    <ThinkingOrb state="searching" size={20} theme="dark" aria-label="Preparing search" />
                  </Suspense>
                )}
                <button type="button" className="search-close" onClick={onClose} aria-label="Close search">
                  <kbd>Esc</kbd>
                </button>
              </div>
            </BorderBeam>
          </Suspense>
        </div>

        <p id="search-hint" className="sr-only">
          Results update as you type. Use the up and down arrow keys to move between results and Enter to open one.
        </p>

        {/* Results ------------------------------------------------------------- */}

        <div className="search-body" ref={listRef}>
          {error && (
            <p className="search-message search-message-error">
              {error} The rest of the portfolio is unaffected — scroll the page to browse it.
            </p>
          )}

          {!error && loading && (
            <p className="search-message">Preparing the index…</p>
          )}

          {!error && !loading && !query.trim() && (
            <div className="search-empty">
              <p className="search-message">
                Search across every project, role, skill and publication. Related words are matched too —
                “computer vision” finds work described as “object detection”.
              </p>
              <ul className="search-examples">
                {EXAMPLES.map((example) => (
                  <li key={example}>
                    <button type="button" onClick={() => { setQuery(example); inputRef.current?.focus() }}>
                      <Icon name="CornerDownLeft" size={12} aria-hidden="true" />
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!error && ready && query.trim() && !results.length && (
            <p className="search-message">
              No matching evidence found for “{query.trim()}”.
            </p>
          )}

          {/* What the search decided the question was about, and what it did with it. Stated
              plainly so an unexpected result set reads as an interpretation rather than a
              fault — and so “relevant” is never mistaken for “asserted”. */}
          {!error && ready && results.length > 0 && (reading?.description || results[0]?.reason === 'section') && (
            <p className="search-reading">
              <Icon name="Sparkles" size={12} aria-hidden="true" />
              {results[0]?.reason === 'section'
                ? `${reading?.description ?? 'Reading the section'} — listed entries, not keyword matches`
                : reading.description}
            </p>
          )}

          {groups.map(([type, items]) => (
            <section key={type} className="search-group" aria-label={GROUP_LABELS[type] ?? type}>
              <h2 className="search-group-label">{GROUP_LABELS[type] ?? type}</h2>
              <ul className="search-results" role="list">
                {items.map((result) => {
                  index += 1
                  return (
                    <SearchResultRow
                      key={result.id}
                      result={result}
                      index={index}
                      active={index === active}
                      onHover={setActive}
                      onOpen={() => open_(result, onClose)}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer -------------------------------------------------------------- */}

        <div className="search-footer">
          <span className="search-legend"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open <kbd>Esc</kbd> close</span>
          {results.length > 0 && (
            <CopyMenu
              results={results}
              query={query.trim()}
              person={manifest?.person?.name}
              source={manifest?.url}
              label="Copy results"
              align="left"
            />
          )}
          {manifest && (
            <a className="search-manifest-link" href="./portfolio.json" target="_blank" rel="noopener noreferrer">
              <Icon name="Braces" size={12} aria-hidden="true" />
              Machine-readable
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * One result.
 *
 * Renders *why* it matched, which is the whole reason this search is worth having over a
 * substring filter — a reader can tell a direct hit from a related-concept hit, and can see
 * what backs the record, without opening anything.
 */
function SearchResultRow({ result, index, active, onHover, onOpen }) {
  // Four kinds of match, kept distinct on purpose. Telling a reader "matched accessibility"
  // when the word never appears — it was reached through a related concept, or by reading the
  // section — is a small lie that undermines the evidence the rest of this panel is for.
  const exact = result.matched.filter((m) => m.kind === 'exact' || (m.direct && !m.kind)).map((m) => m.term)
  const concept = result.matched.filter((m) => m.kind === 'concept' || (!m.direct && !m.kind)).map((m) => m.term)
  const semantic = result.matched.filter((m) => m.kind === 'semantic').map((m) => m.term)
  const bySection = result.reason === 'section'
  const evidence = result.provenance?.evidence?.[0]?.label
  const source = result.provenance?.source

  return (
    <li>
      <button
        type="button"
        data-index={index}
        className={`search-result${active ? ' is-active' : ''}`}
        onMouseEnter={() => onHover(index)}
        onClick={onOpen}
        onFocus={() => onHover(index)}
      >
        <span className="search-result-main">
          <span className="search-result-title">{result.title}</span>
          {result.subtitle && <span className="search-result-subtitle">{result.subtitle}</span>}
        </span>

        <span className="search-result-meta">
          {exact.length > 0 && (
            <span className="search-why" title="These words appear in this entry">
              matched <strong>{exact.slice(0, 3).join(', ')}</strong>
            </span>
          )}
          {concept.length > 0 && (
            <span className="search-why search-why-related" title="Reached through a related concept — these words are not in this entry">
              related to {concept.slice(0, 2).join(', ')}
            </span>
          )}
          {semantic.length > 0 && (
            <span className="search-why search-why-related" title="This portfolio's own text associates these words with your query — they are not in this entry">
              associated with {semantic.slice(0, 2).join(', ')}
            </span>
          )}
          {bySection && (
            <span className="search-why search-why-related" title="Returned because your question named this section, not because a word matched">
              listed under {result.type}
            </span>
          )}
          {evidence && <span className="search-evidence">{evidence}</span>}
          {source && <span className="search-source">{source}</span>}
        </span>
      </button>
    </li>
  )
}

/**
 * Opening a result.
 *
 * An entity with a URL of its own opens it; everything else scrolls to the section that
 * contains it, because a search that finds something and then leaves the reader where they
 * were has not finished the job.
 *
 * @param {any} result @param {() => void} onClose
 */
function open_(result, onClose) {
  if (result.url) {
    window.open(result.url, '_blank', 'noopener,noreferrer')
    onClose()
    return
  }
  onClose()
  const section = document.getElementById(result.type) ?? document.getElementById('main-content')
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
