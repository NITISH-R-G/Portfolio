import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'

/**
 * Copy → Markdown | Prompt.
 *
 * The interaction a recruiter is meant to have: see a project they like, copy it as a prompt,
 * paste it into whichever assistant they already use, and interrogate it. That only works if
 * the control is discoverable without being noise — so it is a single quiet button that opens
 * two options, not two buttons shouting on every card.
 *
 * The generators live in `@portfolio-engine/agent`, loaded on first use. A recruiter who never
 * copies anything never downloads them, and the Markdown a person copies from the page is
 * byte-identical to what `portfolio.toMarkdown()` produces for an agent.
 *
 * @param {{
 *   entity?: Record<string, any>,
 *   type?: string,
 *   profile?: Record<string, any>,
 *   config?: Record<string, any>,
 *   person?: string,
 *   source?: string,
 *   label?: string,
 *   align?: 'left'|'right',
 * }} props
 */
export default function CopyMenu({ entity, type, profile, config, person, source, label = 'Copy', align = 'right' }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle')
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  /* Dismissal ---------------------------------------------------------------- */

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Focus goes back where it came from, or a keyboard user is stranded at the top of the
      // document with no idea what they just closed.
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /* Copying ------------------------------------------------------------------ */

  const copy = useCallback(async (format) => {
    setState('working')
    try {
      const agent = await import('@portfolio-engine/agent')

      let text
      if (entity) {
        text = format === 'prompt'
          ? agent.entityToPrompt(entity, { type, person, source })
          : agent.entityToMarkdown(entity)
      } else {
        // Built here, through the same privacy boundary the published file goes through, so
        // what a person copies can never contain something the manifest withholds.
        const { toPublicManifest } = await import('../core/standard/public.js')
        const manifest = toPublicManifest(profile, { config, canonical: source })
        text = format === 'prompt'
          ? agent.manifestToPrompt(manifest)
          : agent.manifestToMarkdown(manifest)
      }

      await writeClipboard(text)
      setState('copied')
      setOpen(false)
      // Long enough to read, short enough not to linger over the next interaction.
      setTimeout(() => setState('idle'), 1800)
    } catch {
      setState('failed')
      setTimeout(() => setState('idle'), 2400)
    }
  }, [entity, type, profile, config, person, source])

  const busy = state === 'working'

  return (
    <div className={`copy-menu copy-menu-${align}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`copy-menu-trigger${state === 'copied' ? ' is-copied' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The visible text is hidden on narrow screens to keep the control from overflowing,
        // so the button needs a name that does not depend on it.
        aria-label={label}
        disabled={busy}
      >
        <Icon name={state === 'copied' ? 'Check' : state === 'failed' ? 'AlertTriangle' : 'Copy'} size={13} />
        <span className="copy-menu-label">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : label}</span>
      </button>

      {open && (
        <div className="copy-menu-panel" role="menu">
          <button type="button" role="menuitem" className="copy-menu-item" onClick={() => copy('markdown')}>
            <Icon name="FileText" size={14} />
            <span>
              <strong>Markdown</strong>
              <em>Clean text for a doc or email</em>
            </span>
          </button>
          <button type="button" role="menuitem" className="copy-menu-item" onClick={() => copy('prompt')}>
            <Icon name="Sparkles" size={14} />
            <span>
              <strong>Prompt</strong>
              <em>Grounded context for ChatGPT, Claude or Gemini</em>
            </span>
          </button>
        </div>
      )}

      {/* Announced to screen readers, which see no colour change and no icon swap. */}
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </div>
  )
}

/**
 * Write to the clipboard, with a path for browsers that refuse the async API.
 *
 * `navigator.clipboard` is unavailable on insecure origins and can reject on a permissions
 * policy — both of which are ordinary rather than exotic, so the fallback is not optional.
 *
 * @param {string} text
 */
async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through — a rejected permission is not a reason to give up entirely.
    }
  }

  const area = document.createElement('textarea')
  area.value = text
  // Off-screen rather than hidden: a `display: none` element cannot be selected, so the
  // legacy path silently copies nothing.
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()

  try {
    const ok = document.execCommand('copy')
    if (!ok) throw new Error('copy rejected')
  } finally {
    document.body.removeChild(area)
  }
}
