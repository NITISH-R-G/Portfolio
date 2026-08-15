import { Suspense, lazy } from 'react'

const CaseStudyCard = lazy(() => import('../components/CaseStudyCard'))

/**
 * Renders any collection as a list of `CaseStudyCard`s.
 *
 * This is what makes the section system extensible without touching the UI: a new
 * collection (publications, packages, hackathons, a user's own `custom.volunteering`)
 * only needs an adapter function in `sections/adapt.js` — this component and its markup
 * never change.
 *
 * @param {{records: unknown[], adapt: (record: any) => import('./adapt.js').CaseStudyProps, icon?: string}} props
 */
export default function GenericSection({ records, adapt, icon }) {
  if (!records || records.length === 0) return null
  return (
    <div className="case-study-list">
      <Suspense fallback={null}>
        {records.map((record, i) => {
          const item = adapt(record)
          return <CaseStudyCard key={item.id || i} item={item} icon={icon} />
        })}
      </Suspense>
    </div>
  )
}
