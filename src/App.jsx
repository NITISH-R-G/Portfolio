import { portfolioData, initializeTheme } from './data/portfolio'
import { useEffect, useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import FloatingNav from './components/FloatingNav'
import CursorFollower from './components/CursorFollower'
import { useLenis } from './hooks/useLenis'
import { useScrollAnimation } from './hooks/useScrollAnimation'

function App() {
  const [activeSection, setActiveSection] = useState('intro')
  useLenis()
  useScrollAnimation()
  
  useEffect(() => {
    initializeTheme(portfolioData.site.theme)
  }, [])
  
  const announceSection = useCallback((sectionId) => {
    const statusEl = document.getElementById('navigation-status')
    if (statusEl) {
      const labels = {
        about: 'About',
        skills: 'Skills',
        intro: 'Intro',
        projects: 'Projects',
        experience: 'Experience',
        education: 'Education',
        contact: 'Contact'
      }
      statusEl.textContent = `Navigated to ${labels[sectionId] || sectionId} section`
    }
  }, [])
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { threshold: 0.4, rootMargin: '0px 0px -60% 0px' }
    )
    
    const sections = document.querySelectorAll('.content-section')
    sections.forEach(section => observer.observe(section))
    
    return () => observer.disconnect()
  }, [])
  
  return (
    <>
      <CursorFollower />
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="page-wrapper">
        <Sidebar />
        <MainContent />
        <FloatingNav activeSection={activeSection} onNavigate={announceSection} />
      </div>
      <div id="navigation-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  )
}

export default App