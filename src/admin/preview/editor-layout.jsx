'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollFadeEffect } from '@/registry/components/scroll-fade-effect'

/**
 * The workbench: the portfolio is the canvas, the controls are an inspector over it.
 *
 * This used to be a two-column grid with a 22rem *controls* column first and the preview
 * squeezed into what was left — which is the shape of a settings dashboard, and it made the
 * thing being edited the smaller half of the screen. His own playgrounds do the opposite: the
 * component fills the page and a compact panel floats at its edge, so the answer to "what does
 * this do" is the biggest thing you can see.
 *
 * So from `xl` the inspector is absolutely positioned over the canvas's right edge, and the
 * canvas is given matching right padding so nothing renders underneath it. Below `xl` there is
 * no room to float anything: the two stack, preview first, because on a narrow screen seeing
 * what you are editing matters more than reaching the controls a second sooner.
 *
 * Both the inspector and — through `AdminEditor` — the navigation retract completely, which is
 * the state this layout exists for: the portfolio with nothing of the editor in front of it.
 * The choice is remembered for the session, because it is a working preference rather than a
 * document, and it should survive switching panels without surviving forever.
 *
 * @module admin/preview/editor-layout
 */

/**
 * The panel's own title and description, handed down by `Panel`.
 *
 * The workbench shows them in the inspector's header rather than as a page heading, because
 * with `LineNav` already naming the section a second title above the canvas is the duplicated
 * navigation this redesign is removing. Passing them through context rather than as props keeps
 * every panel's existing `<Panel title description>` wrapper untouched.
 */
const WorkbenchHeading = createContext({ title: undefined, description: undefined })

export function WorkbenchHeadingProvider({ title, description, children }) {
  return (
    <WorkbenchHeading.Provider value={{ title, description }}>
      {children}
    </WorkbenchHeading.Provider>
  )
}

/** Whether the editor chrome is retracted. Owned by `AdminEditor`, read here. */
const WorkbenchChrome = createContext({ immersive: false })

export function WorkbenchChromeProvider({ immersive, children }) {
  return (
    <WorkbenchChrome.Provider value={{ immersive }}>{children}</WorkbenchChrome.Provider>
  )
}

/**
 * A boolean remembered for the browsing session.
 *
 * `sessionStorage`, not `localStorage`: this is how the editor is arranged right now, not a
 * setting. It should survive switching panels and a reload, and not survive forever.
 *
 * Read in the initialiser, which is safe here and only here: the admin is mounted through
 * `next/dynamic` with `ssr: false`, so this component never renders on the server and there is
 * no hydration pass for the value to mismatch. Reading it in an effect instead would set state
 * during mount and re-render every panel underneath for a value already known.
 */
export function useSessionFlag(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(key)
      return stored === null ? fallback : stored === '1'
    } catch {
      // A blocked or unavailable sessionStorage costs the arrangement, not the session.
      return fallback
    }
  })

  const update = useCallback(
    (next) => {
      setValue(next)
      try {
        sessionStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* see above */
      }
    },
    [key],
  )

  return [value, update]
}

/**
 * Whether a transient overlay of his owns the Escape key right now.
 *
 * His popovers and sheets close on Escape themselves. Without this check the same keypress would
 * also collapse the inspector underneath them, so choosing a theme and pressing Escape would
 * shut the panel you were working in.
 */
function overlayOpen() {
  return Boolean(
    document.querySelector(
      '[data-slot=popover-content], [role=dialog], [data-state=open][role=listbox]',
    ),
  )
}

export function EditorLayout({ title, description, controls, preview, className }) {
  const inherited = useContext(WorkbenchHeading)
  const { immersive } = useContext(WorkbenchChrome)
  const heading = title ?? inherited.title
  const blurb = description ?? inherited.description
  const [open, setOpen] = useSessionFlag('admin-inspector-open', true)

  const showInspector = open && !immersive

  useEffect(() => {
    if (!showInspector) return
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || overlayOpen()) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showInspector, setOpen])

  return (
    <div className={cn('relative', className)}>
      {/*
        The gutter the floating inspector sits in.

        Expressed as a custom property rather than a toggled utility class: adding and removing
        `xl:pr-[23.5rem]` left the computed padding stuck at its old value, so the canvas never
        reclaimed the space. `pr-(--var)` is his own idiom, the same one `h-(--header-height)`
        uses throughout.

        Deliberately not transitioned. `transition-[padding]` over a `var()`-derived padding
        never settled — the variable read `0px` while the computed padding stayed `376px`,
        because a custom property change gives the engine nothing to interpolate and it holds the
        previous value. An animation that leaves the layout wrong is worse than no animation.
      */}
      <div
        className="min-w-0 xl:pr-(--inspector-gutter)"
        style={{ '--inspector-gutter': showInspector ? '23.5rem' : '0px' }}
      >
        {preview}
      </div>

      {/* Nothing of the editor is rendered in immersive mode — not a collapsed rail, not a
          handle. The reopen control lives in the floating cluster `AdminEditor` puts over the
          canvas, so there is exactly one way back and it is always in the same place. */}
      {!immersive && (
        <aside
          className={cn(
            'mt-8 xl:absolute xl:top-0 xl:right-0 xl:mt-0 xl:w-90',
            !open && 'xl:w-auto',
          )}
        >
          <div className="xl:sticky xl:top-[calc(var(--header-height)+1.5rem)]">
            {open ? (
              <div
                className={cn(
                  // His floating cluster: `SiteBottomNav` is the same recipe — popover surface,
                  // soft ring, shadow — so the inspector reads as part of his chrome rather than
                  // as a card from somewhere else.
                  'flex max-h-[calc(100dvh-var(--header-height)-3rem)] flex-col rounded-xl bg-popover shadow-md ring ring-foreground/10 dark:ring-foreground/20',
                )}
              >
                <div className="flex items-start gap-2 border-b border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tracking-tight">{heading}</p>
                    {blurb && (
                      <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
                        {blurb}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="-mr-1 shrink-0"
                    onClick={() => setOpen(false)}
                    aria-label="Hide the inspector"
                    title="Hide the inspector (Esc)"
                  >
                    <PanelRightCloseIcon />
                  </Button>
                </div>

                {/* His own scroll container, so the fade at the edges is the one his UI uses. */}
                <ScrollFadeEffect className="flex flex-col gap-5 overflow-y-auto p-4">
                  {controls}
                </ScrollFadeEffect>
              </div>
            ) : (
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-xl bg-popover shadow-md ring ring-foreground/10 dark:ring-foreground/20"
                onClick={() => setOpen(true)}
                aria-label="Show the inspector"
                title="Show the inspector"
              >
                <PanelRightOpenIcon />
              </Button>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

/**
 * A labelled group inside the inspector.
 *
 * Kept in his mono-uppercase register — the same one his panel headers and the block viewer's
 * toolbar use — so a group heading reads as a label rather than as another page title.
 */
export function Section({ title, description, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-pretty text-muted-foreground/80">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}
