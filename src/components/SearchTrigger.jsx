import Icon from './Icon'

/**
 * The always-visible entry point to search.
 *
 * Deliberately shaped like a field rather than an icon button. An icon asks the reader to
 * guess; a field that says what it searches tells them, and tells them this portfolio is
 * searchable at all — which is the thing most visitors would otherwise never discover.
 *
 * The shortcut hint is hidden on touch, where `⌘K` is meaningless and would just be noise
 * next to a control you tap.
 *
 * @param {{onOpen: () => void, count?: number}} props
 */
export default function SearchTrigger({ onOpen, count }) {
  return (
    <button type="button" className="search-trigger" onClick={onOpen} aria-haspopup="dialog">
      <Icon name="Search" size={15} aria-hidden="true" />
      <span className="search-trigger-label">
        Search{typeof count === 'number' && count > 0 ? ` ${count} entries` : ' this portfolio'}
      </span>
      <kbd className="search-trigger-kbd" aria-hidden="true">
        <span className="search-trigger-mod" />K
      </kbd>
    </button>
  )
}
