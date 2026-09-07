'use client'

import { useState } from 'react'
import type { RegistryItem } from 'shadcn/schema'

import { cn } from '@/lib/utils'
import { Separator } from '@/components/base/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/base/ui/toggle-group'
import { DesktopIcon, SmartPhoneIcon, TabletIcon } from '@/components/icons'

import { ThemePicker } from './theme-picker'

/**
 * The frame his block viewer draws around a live component, reused for the admin.
 *
 * Everything visible here is lifted from `(preview)/components/block-viewer.tsx`: the dotted
 * radial-gradient backdrop, the rounded inset-ring container, and the three-stop viewport
 * toggle — mobile / tablet / desktop, at his own 30% / 60% / 100%. His version drives a
 * resizable panel; this sets the width directly, which is the same effect without dragging a
 * whole resizable-panel dependency into the editor for a control that has three discrete stops.
 *
 * Width, not scale: a preview at 30% width reflows the way a phone does, because it *is* that
 * narrow. A scaled-down desktop layout would show the owner a shrunken desktop and tell them
 * nothing about how the page behaves on a phone.
 */

const WIDTHS: Record<string, string> = {
  mobile: '30%',
  tablet: '60%',
  desktop: '100%',
}

export function PreviewFrame({
  title,
  theme,
  onThemeChange,
  themeName,
  children,
  className,
  toolbar,
}: {
  title?: React.ReactNode
  /** The resolved registry item, for the picker's own swatch. */
  theme?: RegistryItem
  themeName?: string
  onThemeChange?: (name: string) => void
  children: React.ReactNode
  className?: string
  /** Extra controls, placed before the theme picker. */
  toolbar?: React.ReactNode
}) {
  const [size, setSize] = useState<keyof typeof WIDTHS>('desktop')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {title && (
          <div className="min-w-0 flex-1 truncate font-mono text-xs tracking-wide text-muted-foreground/80 uppercase">
            {title}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {toolbar}

          {onThemeChange && (
            <ThemePicker value={themeName} onChange={onThemeChange} theme={theme} />
          )}

          <div className="flex h-8 items-center gap-0.75 rounded-lg border p-0.75 max-sm:hidden">
            <ToggleGroup
              className="gap-0.75 *:data-[slot=toggle-group-item]:h-6 *:data-[slot=toggle-group-item]:min-w-6 *:data-[slot=toggle-group-item]:rounded-sm! *:data-[slot=toggle-group-item]:px-0"
              value={[size]}
              onValueChange={([value]: string[]) =>
                setSize((value as keyof typeof WIDTHS) || 'desktop')
              }
            >
              <ToggleGroupItem aria-label="Mobile" value="mobile">
                <SmartPhoneIcon />
              </ToggleGroupItem>

              <ToggleGroupItem aria-label="Tablet" value="tablet">
                <TabletIcon />
              </ToggleGroupItem>

              <ToggleGroupItem aria-label="Desktop" value="desktop">
                <DesktopIcon />
              </ToggleGroupItem>
            </ToggleGroup>

            <Separator
              orientation="vertical"
              className="data-vertical:h-4 data-vertical:self-center"
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          'relative overflow-hidden rounded-xl inset-ring inset-ring-border',
          // The canvas takes the viewport rather than sitting in a card. A preview shorter than
          // this leaves the backdrop showing, which is what a playground looks like; a preview
          // taller than it scrolls inside its own frame, so the inspector beside it stays put.
          'h-[calc(100dvh-var(--header-height)-6.5rem)] min-h-100 overflow-y-auto',
          // His backdrop, so a preview narrower than the frame reads as a viewport rather
          // than as a component that failed to fill its container.
          'bg-black/0.75 bg-[radial-gradient(var(--pattern-foreground)_1px,transparent_0)] bg-size-[10px_10px] bg-center',
          '[--pattern-foreground:var(--color-zinc-950)]/5',
          'dark:bg-white/0.75 dark:[--pattern-foreground:var(--color-white)]/5',
          className,
        )}
      >
        <div
          className="mx-auto transition-[width] duration-200"
          style={{ width: WIDTHS[size] }}
        >
          <div className="overflow-x-clip">{children}</div>
        </div>
      </div>
    </div>
  )
}
