'use client'

/**
 * The admin shell.
 *
 * The model is his component playground, not a settings dashboard. The portfolio is the canvas
 * and fills the page; the controls are a compact inspector at its edge; navigation is his own
 * `LineNav` rather than a boxed sidebar of icon rows. What was here before — a 14rem list of
 * bordered buttons beside a 22rem column of form cards, with the portfolio squeezed into
 * whatever remained — made the thing being edited the smallest element on screen.
 *
 * `LineNav` is his registry component, used unmodified. It is built for hash targets, which is
 * exactly what the admin's panels already are, so the nav needed no adaptation: the href *is*
 * the panel id. Its click handler is intercepted only to stop the browser jumping the document,
 * because the panel swap is a render rather than a scroll.
 *
 * The editor is themed by the draft as well. Choosing a theme writes `sourceTheme`, this writes
 * that theme's variables to the admin document's `:root`, and the chrome repaints along with the
 * canvas — because the fastest way to judge a theme is to be sitting in it. The published site
 * is untouched: it renders the committed theme server-side, from its own document.
 *
 * @module admin/AdminEditor
 */

import { useEffect, useState } from 'react'
import { DownloadIcon, ExternalLinkIcon, MenuIcon, TriangleAlertIcon } from 'lucide-react'
import { MinimizeIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { SiteMark } from '@/components/site-mark'
import { FullScreenIcon } from '@/components/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/base/ui/tooltip'
import { LineNav } from '@/registry/components/line-nav'
import { ScrollFadeEffect } from '@/registry/components/scroll-fade-effect'
import { THEMES } from '@/app/(preview)/lib/shadcn'
import { buildThemeCSSVarsForRoot } from '@/lib/source-theme'

import {
  useSessionFlag,
  WorkbenchChromeProvider,
} from './preview/editor-layout.jsx'
import { useBuilder } from './state.js'
import ConnectPanel from './panels/ConnectPanel.jsx'
import SourcesPanel from './panels/SourcesPanel.jsx'
import ConflictsPanel from './panels/ConflictsPanel.jsx'
import ProfilePanel from './panels/ProfilePanel.jsx'
import ProjectsPanel from './panels/ProjectsPanel.jsx'
import ExperiencePanel from './panels/ExperiencePanel.jsx'
import SkillsPanel from './panels/SkillsPanel.jsx'
import RecordsPanel from './panels/RecordsPanel.jsx'
import BlocksPanel from './panels/BlocksPanel.jsx'
import ShowcasePanel from './panels/ShowcasePanel.jsx'
import ThemePanel from './panels/ThemePanel.jsx'
import NavigationPanel from './panels/NavigationPanel.jsx'
import FooterPanel from './panels/FooterPanel.jsx'
import SettingsPanel from './panels/SettingsPanel.jsx'
import ExportPanel from './panels/ExportPanel.jsx'

/**
 * The sections, in the order an owner works through them: connect the sources, correct what came
 * back, decide how it looks, publish.
 *
 * `canvas` marks the panels that render the real portfolio. Those get the playground layout; the
 * rest are documents — connecting a source, reading import health, publishing — and are laid out
 * as a reading column, because inventing a preview for them would mean inventing a component.
 */
const SECTIONS = [
  { id: 'connect', title: 'Connect', component: ConnectPanel },
  { id: 'sources', title: 'Imports', component: SourcesPanel },
  { id: 'conflicts', title: 'Conflicts', component: ConflictsPanel },
  { id: 'profile', title: 'Profile', component: ProfilePanel, canvas: true },
  { id: 'projects', title: 'Projects', component: ProjectsPanel, canvas: true },
  { id: 'experience', title: 'Experience', component: ExperiencePanel, canvas: true },
  { id: 'skills', title: 'Skills', component: SkillsPanel, canvas: true },
  { id: 'records', title: 'Education & awards', component: RecordsPanel, canvas: true },
  { id: 'showcase', title: 'Showcase', component: ShowcasePanel, canvas: true },
  { id: 'blocks', title: 'Blocks', component: BlocksPanel, canvas: true },
  { id: 'navigation', title: 'Navigation', component: NavigationPanel, canvas: true },
  { id: 'footer', title: 'Footer', component: FooterPanel, canvas: true },
  { id: 'theme', title: 'Theme', component: ThemePanel, canvas: true },
  { id: 'settings', title: 'Settings', component: SettingsPanel },
  { id: 'save', title: 'Publish', component: ExportPanel },
]

const NAV_ITEMS = SECTIONS.map((section) => ({
  title: section.title,
  href: `#${section.id}`,
}))

export default function AdminEditor() {
  const builder = useBuilder()
  const [active, setActive] = useState('connect')
  const [menuOpen, setMenuOpen] = useState(false)
  /**
   * Immersive mode: the portfolio with none of the editor in front of it.
   *
   * Retracts the header, the navigation and the inspector together, because the point is not to
   * reclaim a few pixels but to look at the page as a visitor will. One floating control brings
   * it all back, and Escape does the same.
   */
  const [immersive, setImmersive] = useSessionFlag('admin-immersive', false)

  // Read on mount rather than in the initialiser: this component is server-rendered first, and
  // `window` does not exist there. The hash keeps a panel linkable and survives a reload, which
  // matters because reloading is how the owner checks a draft actually took effect.
  useEffect(() => {
    const fromHash = () => setActive(window.location.hash.slice(1) || 'connect')
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  const { built, dirty } = builder
  const sourceTheme = built.config.sourceTheme ?? ''

  /**
   * Repaint the editor in the theme being configured.
   *
   * Written to this document's `:root`, so it covers the chrome *and* anything the canvas
   * inherits rather than scopes for itself. The public site never runs this — it renders the
   * committed theme with its own document — and the style element is removed on unmount so a
   * client-side navigation away from the admin does not leave the palette behind.
   */
  useEffect(() => {
    const css = buildThemeCSSVarsForRoot(THEMES, sourceTheme)
    let el = document.getElementById('admin-theme-vars')
    if (!el) {
      el = document.createElement('style')
      el.id = 'admin-theme-vars'
      document.head.appendChild(el)
    }
    el.textContent = css
    return () => el.remove()
  }, [sourceTheme])

  useEffect(() => {
    if (!immersive) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setImmersive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [immersive, setImmersive])

  const go = (id) => {
    // `replaceState`, not `location.hash = id`: assigning to the hash pushes a history entry,
    // so switching panels filled the back button with the editor's own tabs. The hash still
    // survives a reload, which is the only reason it is in the URL.
    window.history.replaceState(null, '', `#${id}`)
    setActive(id)
    setMenuOpen(false)
  }

  const section = SECTIONS.find((entry) => entry.id === active) ?? SECTIONS[0]
  const Panel = section.component
  const errors = built.configIssues.filter((issue) => issue.level === 'error')

  const nav = (
    <LineNav
      items={NAV_ITEMS}
      activeHref={`#${section.id}`}
      // The admin's hash is a panel selector, not a scroll target; scrolling to it on mount
      // would move the page for a heading that does not exist.
      scrollActiveIntoView={false}
      onItemClick={(item, event) => {
        event.preventDefault()
        go(item.href.slice(1))
      }}
    />
  )

  return (
    <WorkbenchChromeProvider immersive={immersive}>
    <div className="min-h-dvh">
      <header
        className={cn(
          'sticky top-0 z-50 max-w-screen overflow-x-clip bg-background px-2',
          immersive && 'hidden',
        )}
      >
        <div className="screen-line-top screen-line-bottom mx-auto flex h-(--header-height) max-w-[110rem] items-center gap-2 border-x pr-2 pl-2 after:z-1 sm:gap-3 md:pl-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            {/* His `Sheet` is Radix, not Base UI — so the trigger composes with `asChild`, not
                the `render` prop his Base UI components take. Passing `render` silently rendered
                Radix's own bare button instead of this one, unstyled and unnamed. */}
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden">
                <MenuIcon />
                <span className="sr-only">Open sections</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <ScrollFadeEffect className="h-full overflow-y-auto px-6 py-4">
                {nav}
              </ScrollFadeEffect>
            </SheetContent>
          </Sheet>

          <SiteMark className="shrink-0 text-base font-semibold tracking-tight max-lg:hidden" />

          <div className="min-w-0">
            <p className="truncate text-sm font-medium tracking-tight">
              {built.profile.identity.name || 'Unnamed portfolio'}
            </p>
          </div>

          <div className="flex-1" />

          {errors.length > 0 && (
            <button
              type="button"
              onClick={() => go('settings')}
              className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-xs text-destructive"
              title={errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}
            >
              <TriangleAlertIcon className="size-3.5" />
              {errors.length}
            </button>
          )}

          {dirty && (
            <span
              className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
              title="You have changes that are not in a file yet"
            >
              unsaved
            </span>
          )}

          {/* `asChild`, not `render`: `components/ui/button` is his shadcn Button (radix `Slot`),
              not the Base UI one — the two spell composition differently. */}
          <Button variant="ghost" size="icon-sm" className="max-sm:hidden" asChild>
            <a href="../" title="View the published portfolio">
              <ExternalLinkIcon />
              <span className="sr-only">View portfolio</span>
            </a>
          </Button>

          {/* His block-viewer toolbar control, doing the same job: get the chrome out of the
              way and look at the thing. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setImmersive(true)}
                  aria-label="Hide the editor"
                >
                  <FullScreenIcon className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Hide the editor</TooltipContent>
          </Tooltip>

          <Button size="sm" className="gap-2" onClick={() => go('save')}>
            <DownloadIcon />
            Publish
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[110rem] gap-8 px-4 md:px-6">
        {/* `max-lg:hidden` rather than `hidden lg:block`: the max-* form is the idiom his
            components use throughout, and it states the rule once instead of twice. */}
        <aside
          className={cn(
            'sticky top-(--header-height) h-fit w-44 shrink-0 max-lg:hidden',
            immersive && 'hidden',
          )}
        >
          {nav}
        </aside>

        <main
          className={cn(
            'min-w-0 flex-1',
            immersive ? 'py-0' : 'py-6',
            !section.canvas && !immersive && 'md:max-w-3xl',
          )}
        >
          <Panel builder={builder} />
        </main>
      </div>

      {/*
        The way back.

        His `SiteBottomNav` is the same object — a small cluster fixed over the page on the
        popover surface with a soft ring — so the one piece of editor left on screen belongs to
        his chrome rather than announcing itself as an admin overlay. It names the section it
        will return to, because after a minute of reading the page it is genuinely easy to
        forget which panel is behind it.
      */}
      {immersive && (
        <div className="fixed bottom-[calc(--spacing(4)+env(safe-area-inset-bottom,0))] left-1/2 z-50 flex w-fit -translate-x-1/2 items-center gap-1 rounded-xl bg-popover py-1 pr-1 pl-3 shadow-md ring ring-foreground/10 dark:ring-foreground/20">
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {section.title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setImmersive(false)}
            aria-label="Show the editor"
          >
            <MinimizeIcon />
            Edit
          </Button>
        </div>
      )}
    </div>
    </WorkbenchChromeProvider>
  )
}
