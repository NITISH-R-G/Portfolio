import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { usePortfolio } from './hooks/usePortfolio'
import PortfolioShell from './components/PortfolioShell'
import Dock from './components/Dock'
import TopNav from './components/TopNav'
import UserCursor from './components/UserCursor'
import SearchTrigger from './components/SearchTrigger'
import CopyMenu from './components/CopyMenu'
import { useLenis } from './hooks/useLenis'
import { useScrollAnimation } from './hooks/useScrollAnimation'
import { useSearchShortcut } from './hooks/useSearch'
import { useSearchUrl } from './hooks/useSearchUrl'

// The dialog and everything it pulls in (ranking, border-beam, thinking-orbs) stay out of the
// initial bundle. Most visitors read the page and never open search; those who do wait one
// network round-trip on an interaction they chose.
const SearchDialog = lazy(() => import('./components/SearchDialog'))

function App() {
  const { sections, navigation, config, profile } = usePortfolio()
  const [activeSection, setActiveSection] = useState(navigation[0]?.id ?? '')
  const [searchOpen, setSearchOpen] = useState(false)
  const portfolioSurfaceRef = useRef(null)
  const syncSearchUrlRef = useRef(null)

  useLenis({ enabled: config.animations.smoothScroll })
  useScrollAnimation()

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    // Drop `?search=` on dismissal. The dialog has unmounted by now, so it cannot do this
    // itself — and a parameter left behind would reopen the search on the next refresh.
    syncSearchUrlRef.current?.('', { closing: true })
  }, [])
  useSearchShortcut(openSearch)

  // `?search=` makes a result set linkable — the difference between sending someone a search
  // and sending them instructions for performing one.
  const { initialQuery, sync: syncSearchUrl } = useSearchUrl({
    open: searchOpen, onOpen: openSearch, onClose: () => setSearchOpen(false),
  })
  // Held in a ref so `closeSearch` can reach the latest `sync` without depending on it —
  // the two are mutually referential and a direct dependency would recreate both every render.
  syncSearchUrlRef.current = syncSearchUrl

  // A rough count of what is searchable, so the trigger can say so rather than claiming
  // capability in the abstract.
  const searchable = Object.entries(profile).reduce(
    (total, [key, value]) => (key === 'stats' || !Array.isArray(value) ? total : total + value.length),
    0,
  )

  const announceSection = useCallback((sectionId) => {
    const statusEl = document.getElementById('navigation-status')
    const label = navigation.find((n) => n.id === sectionId)?.label ?? sectionId
    if (statusEl) statusEl.textContent = `Navigated to ${label} section`
  }, [navigation])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { threshold: 0.4, rootMargin: '0px 0px -60% 0px' },
    )

    const observed = document.querySelectorAll('.content-section')
    observed.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [sections])

  const navMode = config.layout.navigation

  return (
    <>
      {config.layout.customCursor && <UserCursor surfaceRef={portfolioSurfaceRef} />}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div ref={portfolioSurfaceRef} className={`portfolio-surface shell-${config.layout.shell}`}>
        <div className="search-bar">
          <SearchTrigger onOpen={openSearch} count={searchable} />
          {/* The whole profile, as text or as grounded model context. Sits beside search
              because both answer the same question — "let me get at what is in here". */}
          <CopyMenu
            profile={profile}
            config={config}
            person={profile.identity?.name}
            source={config.site?.url || undefined}
            label="Copy profile"
          />
        </div>
        {navMode === 'top' && (
          <TopNav navigation={navigation} activeSection={activeSection} onNavigate={announceSection} />
        )}
        <div className="page-wrapper">
          <PortfolioShell sections={sections} shell={config.layout.shell} />
        </div>
        {navMode === 'dock' && <Dock activeSection={activeSection} onNavigate={announceSection} />}
      </div>

      <Suspense fallback={null}>
        {searchOpen && (
          <SearchDialog
            open={searchOpen}
            onClose={closeSearch}
            initialQuery={initialQuery}
            onQueryChange={syncSearchUrl}
          />
        )}
      </Suspense>

      <div id="navigation-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  )
}

export default App
