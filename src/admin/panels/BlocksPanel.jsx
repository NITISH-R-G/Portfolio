'use client'

/**
 * Blocks.
 *
 * The canvas is his `Blocks` section — the same component the home page renders, showing the
 * same six registry items at the same size. The inspector holds the one control that genuinely
 * exists for it.
 *
 * That there is only one control is the honest answer rather than a thin panel. Blocks are his
 * component registry, not portfolio data: nothing about them is per-owner, so there is no title
 * to edit, no ordering to pin and no per-block setting to expose. What an owner actually decides
 * is whether the strip appears at all — and because it has no profile data behind it, `'auto'`
 * cannot answer that from the content the way it can for projects or awards, which is why the
 * section defaults off and this is a deliberate choice rather than an inference.
 *
 * The full viewer — Preview/Code tabs, category navigation, viewport stops, theme picker — is a
 * route, not a component that can be lifted into a panel, so this links to it rather than
 * rebuilding a lesser copy of it here.
 *
 * @module admin/panels/BlocksPanel
 */

import { ArrowUpRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { Note, Panel, TriState } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function BlocksPanel({ builder }) {
  const { built, setConfig } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const setting = built.config.sections?.blocks
  const section = (built.sections ?? []).find((entry) => entry.id === 'blocks')

  return (
    <Panel
      workbench
      title="Blocks"
      description="The component registry this application ships, shown on your home page."
    >
      <EditorLayout
        controls={
          <>
            <Section
              title="On the home page"
              description={
                section
                  ? `Currently ${section.visible ? 'shown' : 'hidden'}.`
                  : undefined
              }
            >
              <TriState
                value={setting === 'auto' ? undefined : setting}
                onChange={(value) =>
                  setConfig('sections.blocks', value === undefined ? 'auto' : value)
                }
              />
              <p className="text-xs text-pretty text-muted-foreground">
                Auto cannot decide this one: unlike your projects or awards, the strip has no
                profile data behind it, so “enough content to justify it” is always true. Show
                and Hide are the real choices.
              </p>
            </Section>

            <Section title="The full viewer">
              <Button variant="outline" size="sm" className="gap-2 self-start" asChild>
                <a href="../blocks/" target="_blank" rel="noopener">
                  Open Blocks
                  <ArrowUpRightIcon />
                </a>
              </Button>
              <p className="text-xs text-pretty text-muted-foreground">
                Preview and Code tabs, category navigation, the viewport stops and the theme
                picker all live on that route. It is a page rather than a component, so it opens
                rather than embedding.
              </p>
            </Section>

            <Note>
              Blocks are his registry, identical for every fork, so there is nothing per-owner to
              edit here. Ordering and titles come from the registry itself.
            </Note>
          </>
        }
        preview={
          <PreviewFrame
            title="Blocks"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={built} theme={theme} section="blocks" />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
