import { Suspense, lazy } from 'react'
import { formatDate } from '../core/schema/date.js'

const CertGallery = lazy(() => import('../components/CertGallery'))

/**
 * @param {{certifications: import('../core/schema/types.js').CertificationItem[], reducedMotion: boolean}} props
 */
export default function CertificationsSection({ certifications, reducedMotion }) {
  if (!certifications || certifications.length === 0) return null

  const certs = certifications.map((c) => ({
    id: c.id,
    title: c.name,
    issuer: c.issuer,
    date: formatDate(c.date),
    credential: c.credentialId,
    image: c.image,
    imageAlt: c.imageAlt,
    description: c.description,
  }))

  return (
    <Suspense fallback={null}>
      <CertGallery certs={certs} reducedMotion={reducedMotion} />
    </Suspense>
  )
}
