'use client'

/**
 * Theme.
 *
 * The list is his — `THEMES` from `(preview)/lib/shadcn.ts`, the registry his block previews
 * read — and so is the picker, which is his block-viewer control bound to our draft instead of
 * to a preview search param. Nothing here is a name we invented; a theme that is not in his
 * registry cannot be offered, because the swatches and the variables both come from the same
 * entry.
 *
 * The layout is the point. A grid of named swatches with a thumbnail beside it is a theme
 * *list*; this puts the whole portfolio on the canvas and the swatches in the inspector, so
 * clicking down the list repaints a real page rather than a legend. That is the comparison the
 * picker exists to make possible, and it is why the swatches are a single scrolling column here
 * rather than a wide grid — they sit beside the thing they change.
 *
 * Selecting also re-themes the editor itself — see `AdminEditor` — so the comparison includes
 * the chrome the owner will be sitting in.
 *
 * @module admin/panels/ThemePanel
 */

import { THEMES } from '@/app/(preview)/lib/shadcn'
import { cn } from '@/lib/utils'
import { ThemePalette } from '@/components/theme-palette'

import { Note, Panel } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

const OPTIONS = [{ name: '', title: 'Default', cssVars: undefined }, ...THEMES]

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ThemePanel({ builder }) {
  const { name, item, setTheme } = useSourceTheme(builder)

  return (
    <Panel
      workbench
      title="Theme"
      description="Selecting one rewrites the colour variables every component reads — including this editor's."
    >
      <EditorLayout
        controls={
          <>
            <Section title={`${OPTIONS.length} themes`}>
              <div className="flex flex-col gap-0.5">
                {OPTIONS.map((option) => (
                  <button
                    key={option.name || 'default'}
                    type="button"
                    aria-pressed={name === option.name}
                    onClick={() => setTheme(option.name ?? '')}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                      name === option.name
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {/* His block-viewer swatch, painted from the theme's own cssVars. */}
                    <ThemePalette cssVars={option.cssVars} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {option.title || option.name}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Note>
              The canvas is the real portfolio: the same components the deployed page renders,
              under this theme&apos;s own variables. Nothing is live for visitors until you
              publish.
            </Note>
          </>
        }
        preview={
          <PreviewFrame
            title={item?.title ?? item?.name ?? 'Default theme'}
            theme={item}
            themeName={name}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={builder.built} theme={item} />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
