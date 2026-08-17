import { useEffect, useState, useCallback, useRef } from 'react'
import { usePortfolio } from './hooks/usePortfolio'
import PortfolioShell from './components/PortfolioShell'
import Dock from './components/Dock'
import TopNav from './components/TopNav'
import UserCursor from './components/UserCursor'
import { useLenis } from './hooks/useLenis'
import { useScrollAnimation } from './hooks/useScrollAnimation'

function App() {
  const { sections, navigation, config } = usePortfolio()
  const [activeSection, setActiveSection] = useState(navigation[0]?.id ?? '')
  const portfolioSurfaceRef = useRef(null)

  useLenis({ enabled: config.animations.smoothScroll })
  useScrollAnimation()

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
        {navMode === 'top' && (
          <TopNav navigation={navigation} activeSection={activeSection} onNavigate={announceSection} />
        )}
        <div className="page-wrapper">
          <PortfolioShell sections={sections} shell={config.layout.shell} />
        </div>
        {navMode === 'dock' && <Dock activeSection={activeSection} onNavigate={announceSection} />}
      </div>
      <div id="navigation-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  )
}

export default App
