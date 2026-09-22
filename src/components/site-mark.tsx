import { USER } from '@/features/portfolio/data/user'

/**
 * The site's brand mark.
 *
 * Upstream this slot holds `ChanhDaiMark`, the "CD" logotype. That mark is explicitly excluded
 * from the MIT grant by his TRADEMARK.md, which asks forks to replace the branding — so the
 * component is not used here, and this renders the portfolio owner's own initials in its place.
 *
 * Deliberately a wordmark rather than an imported image: the identity comes from the same
 * profile data as everything else, so a fork that changes its owner changes its mark with it,
 * and there is no asset to forget to swap.
 */
export function SiteMark({ className, ...props }: React.ComponentProps<'span'>) {
  const initials = USER.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <span
      className={className}
      style={{ letterSpacing: '0.02em' }}
      aria-label={USER.displayName}
      {...props}
    >
      {initials || USER.displayName}
    </span>
  )
}
