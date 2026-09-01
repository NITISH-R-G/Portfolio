import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Search state in the URL.
 *
 * `?search=computer+vision` opens the dialog with that query already run, which is what makes
 * a search result something a person can send to someone else. Without it, "look at his
 * accessibility work" is a set of instructions rather than a link.
 *
 * Deliberately built on the History API alone. A router would be a large dependency to add for
 * one query parameter on a single-page portfolio, and the brief is explicit that one should
 * not be introduced just for this.
 *
 * Two behaviours worth stating, because both are easy to get subtly wrong:
 *
 * **Typing replaces, opening pushes.** Every keystroke pushing a history entry would turn one
 * search into forty presses of the back button. So opening the dialog pushes a single entry
 * and subsequent typing replaces it — back then means "leave search", which is what a person
 * expects it to mean.
 *
 * **The URL is not the source of truth while typing.** It is written *from* state and read
 * only on load and on `popstate`. Feeding it back into the input on every change would fight
 * the user's cursor.
 *
 * @param {{open: boolean, onOpen: () => void, onClose: () => void}} options
 */
export function useSearchUrl({ open, onOpen, onClose }) {
  const [initialQuery, setInitialQuery] = useState('')
  const pushedRef = useRef(false)

  /* Read on load and on back/forward ---------------------------------------- */

  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get('search')
      if (value !== null) {
        setInitialQuery(value)
        onOpen()
      } else {
        // Back out of a search: close, and let the dialog stop owning a history entry.
        pushedRef.current = false
        onClose()
      }
    }

    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
    // Deliberately once: this listens to the browser, not to React state. Re-subscribing on
    // every open/close would re-read the URL mid-interaction and reopen a dialog just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Write when the query changes -------------------------------------------- */

  const sync = useCallback((query, options = {}) => {
    const url = new URL(window.location.href)
    const trimmed = String(query ?? '').trim()

    // `closing: true` is passed by the dismissal path, because by then `open` is already false
    // in this hook's closure and the dialog has unmounted — without it the parameter survives
    // a close, and a later refresh silently reopens a search the visitor had dismissed.
    const active = open && !options.closing
    if (active && trimmed) url.searchParams.set('search', trimmed)
    else url.searchParams.delete('search')

    if (url.href === window.location.href) return

    if (active && !pushedRef.current) {
      // One entry for the whole search session, so Back leaves search rather than stepping
      // through every character that was typed.
      window.history.pushState({ search: true }, '', url)
      pushedRef.current = true
    } else {
      window.history.replaceState(window.history.state, '', url)
      if (!active) pushedRef.current = false
    }
  }, [open])

  return { initialQuery, sync }
}
