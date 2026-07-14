import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { track, AnalyticsEvents } from '../lib/analytics'

function getFocusable(container) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

export default function CertGallery({ certs, reducedMotion }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const triggerRef = useRef(null)
  const dialogRef = useRef(null)
  const prevFocus = useRef(null)

  const openLightbox = useCallback((i, triggerEl) => {
    prevFocus.current = triggerEl || null
    setLightboxIndex(i)
    track(AnalyticsEvents.CERT_OPEN, { title: certs[i]?.title || '' })
  }, [certs])

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null)
    prevFocus.current?.focus()
    prevFocus.current = null
  }, [])

  const goNext = useCallback(() => {
    setLightboxIndex(prev => prev !== null ? (prev + 1) % certs.length : null)
  }, [certs.length])

  const goPrev = useCallback(() => {
    setLightboxIndex(prev => prev !== null ? (prev - 1 + certs.length) % certs.length : null)
  }, [certs.length])

  // Focus trap + keyboard
  useEffect(() => {
    if (lightboxIndex === null) return

    const dialog = dialogRef.current
    if (dialog) {
      const focusable = getFocusable(dialog)
      if (focusable.length > 0) {
        requestAnimationFrame(() => focusable[0].focus())
      }
    }

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        closeLightbox()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable(dialogRef.current)
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [lightboxIndex, goNext, goPrev, closeLightbox])

  const dialogId = 'cert-detail'
  const currentCert = lightboxIndex !== null ? certs[lightboxIndex] : null

  return (
    <>
      {/* Thumbnail grid */}
      <div className="cert-grid">
        {certs.map((cert, i) => (
          <button
            key={cert.id}
            className="cert-thumb"
            onClick={(e) => openLightbox(i, e.currentTarget)}
            aria-label={`View details: ${cert.title}`}
          >
            {cert.image ? (
              <img src={cert.image} alt={cert.imageAlt || cert.title} className="cert-thumb-img" width="400" height="300" loading="lazy" decoding="async" />
            ) : (
              <div className="cert-thumb-placeholder">
                <span className="cert-thumb-initial">{cert.issuer?.[0] || '?'}</span>
              </div>
            )}
            <div className="cert-thumb-info">
              <h3 className="cert-thumb-title">{cert.title}</h3>
              {cert.issuer && <p className="cert-thumb-issuer-text">{cert.issuer}</p>}
              {cert.date && <p className="cert-thumb-date">{cert.date}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox Dialog */}
      <AnimatePresence>
        {lightboxIndex !== null && currentCert && (
          <div className="cert-lightbox" role="presentation">
            <motion.div
              className="cert-lightbox-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={closeLightbox}
              aria-hidden="true"
            />
            <motion.div
              ref={dialogRef}
              className="cert-lightbox-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${dialogId}-title`}
              aria-describedby={`${dialogId}-desc`}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Close */}
              <button className="cert-lightbox-close" onClick={closeLightbox} aria-label="Close dialog">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>

              {/* Main image area */}
              <div className="cert-lightbox-image-area">
                {currentCert.image ? (
                  <img
                    src={currentCert.image}
                    alt={currentCert.imageAlt || currentCert.title}
                    className="cert-lightbox-image"
                    width="900"
                    height="700"
                    decoding="async"
                  />
                ) : (
                  <div className="cert-lightbox-placeholder">
                    <span className="cert-lightbox-placeholder-initial">{currentCert.issuer?.[0] || '?'}</span>
                    <span className="cert-lightbox-placeholder-name">{currentCert.issuer || 'Certificate'}</span>
                  </div>
                )}
              </div>

              {/* Info panel */}
              <div className="cert-lightbox-info">
                <div className="cert-lightbox-info-top">
                  <div className="cert-lightbox-info-text">
                    <h3 className="cert-lightbox-title" id={`${dialogId}-title`}>{currentCert.title}</h3>
                    <div className="cert-lightbox-meta">
                      {currentCert.issuer && <span className="cert-meta-tag">{currentCert.issuer}</span>}
                      {currentCert.date && <span className="cert-meta-tag">{currentCert.date}</span>}
                      {currentCert.credential && <span className="cert-meta-tag cert-meta-accent">{currentCert.credential}</span>}
                    </div>
                    {currentCert.description && (
                      <p className="cert-lightbox-desc" id={`${dialogId}-desc`}>{currentCert.description}</p>
                    )}
                  </div>
                </div>

                {/* Thumbnail strip */}
                {certs.length > 1 && (
                  <div className="cert-lightbox-strip" role="tablist" aria-label="Certificate thumbnails">
                    {certs.map((cert, i) => (
                      <button
                        key={cert.id}
                        role="tab"
                        aria-selected={i === lightboxIndex}
                        aria-label={`View ${cert.title}`}
                        className={`cert-strip-thumb ${i === lightboxIndex ? 'cert-strip-active' : ''}`}
                        onClick={() => setLightboxIndex(i)}
                        tabIndex={i === lightboxIndex ? 0 : -1}
                      >
                        {cert.image ? (
                          <img src={cert.image} alt="" className="cert-strip-img" width="60" height="45" loading="lazy" decoding="async" />
                        ) : (
                          <div className="cert-strip-placeholder">{cert.issuer?.[0] || '?'}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Counter + nav */}
                <div className="cert-lightbox-footer">
                  {certs.length > 1 && (
                    <div className="cert-lightbox-nav-group">
                      <button
                        className="cert-lightbox-nav-btn"
                        onClick={goPrev}
                        aria-label="Previous certification"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        className="cert-lightbox-nav-btn"
                        onClick={goNext}
                        aria-label="Next certification"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  )}
                  <p className="cert-lightbox-counter" aria-live="polite">
                    {lightboxIndex + 1} / {certs.length}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
