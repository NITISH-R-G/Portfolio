import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'

export default function CertGallery({ certs, reducedMotion }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const openLightbox = (i) => setLightboxIndex(i)
  const closeLightbox = () => setLightboxIndex(null)

  const goNext = useCallback(() => {
    setLightboxIndex(prev => prev !== null ? (prev + 1) % certs.length : null)
  }, [certs.length])

  const goPrev = useCallback(() => {
    setLightboxIndex(prev => prev !== null ? (prev - 1 + certs.length) % certs.length : null)
  }, [certs.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    const handleKey = (e) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [lightboxIndex, goNext, goPrev])

  const hasImages = certs.some(c => c.image)

  return (
    <>
      {/* Thumbnail grid */}
      <div className="cert-grid">
        {certs.map((cert, i) => (
          <motion.button
            key={cert.id}
            className="cert-thumb"
            onClick={() => openLightbox(i)}
            whileHover={!reducedMotion ? { y: -2, borderColor: 'var(--color-border-strong)' } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {cert.image ? (
              <img src={cert.image} alt={cert.imageAlt || cert.title} className="cert-thumb-img" />
            ) : (
              <div className="cert-thumb-placeholder">
                <span className="cert-thumb-issuer">{cert.issuer || '?'}</span>
              </div>
            )}
            <div className="cert-thumb-info">
              <h3 className="cert-thumb-title">{cert.title}</h3>
              {cert.issuer && <p className="cert-thumb-issuer-text">{cert.issuer}</p>}
              {cert.date && <p className="cert-thumb-date">{cert.date}</p>}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            className="cert-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeLightbox}
          >
            <motion.div
              className="cert-lightbox-content"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Close */}
              <button className="cert-lightbox-close" onClick={closeLightbox} aria-label="Close">
                ✕
              </button>

              {/* Prev/Next */}
              {certs.length > 1 && (
                <>
                  <button className="cert-lightbox-nav cert-lightbox-prev" onClick={goPrev} aria-label="Previous certification">
                    ‹
                  </button>
                  <button className="cert-lightbox-nav cert-lightbox-next" onClick={goNext} aria-label="Next certification">
                    ›
                  </button>
                </>
              )}

              {/* Main image area */}
              <div className="cert-lightbox-image-area">
                {certs[lightboxIndex].image ? (
                  <img
                    src={certs[lightboxIndex].image}
                    alt={certs[lightboxIndex].imageAlt || certs[lightboxIndex].title}
                    className="cert-lightbox-image"
                  />
                ) : (
                  <div className="cert-lightbox-placeholder">
                    <span className="cert-lightbox-placeholder-text">{certs[lightboxIndex].issuer || 'Certificate'}</span>
                  </div>
                )}
              </div>

              {/* Info panel */}
              <div className="cert-lightbox-info">
                <h3 className="cert-lightbox-title">{certs[lightboxIndex].title}</h3>
                <div className="cert-lightbox-meta">
                  {certs[lightboxIndex].issuer && <span>{certs[lightboxIndex].issuer}</span>}
                  {certs[lightboxIndex].date && <span>{certs[lightboxIndex].date}</span>}
                  {certs[lightboxIndex].credential && <span>{certs[lightboxIndex].credential}</span>}
                </div>
                {certs[lightboxIndex].description && (
                  <p className="cert-lightbox-desc">{certs[lightboxIndex].description}</p>
                )}

                {/* Thumbnail strip */}
                {certs.length > 1 && (
                  <div className="cert-lightbox-strip">
                    {certs.map((cert, i) => (
                      <button
                        key={cert.id}
                        className={`cert-strip-thumb ${i === lightboxIndex ? 'cert-strip-active' : ''}`}
                        onClick={() => setLightboxIndex(i)}
                        aria-label={`View ${cert.title}`}
                      >
                        {cert.image ? (
                          <img src={cert.image} alt="" className="cert-strip-img" />
                        ) : (
                          <div className="cert-strip-placeholder">{cert.issuer?.[0] || '?'}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Counter */}
                <p className="cert-lightbox-counter">
                  {lightboxIndex + 1} / {certs.length}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
