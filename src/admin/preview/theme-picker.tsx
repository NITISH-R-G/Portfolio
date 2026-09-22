'use client'

import { useMemo } from 'react'
import { CheckIcon } from 'lucide-react'
import type { RegistryItem } from 'shadcn/schema'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/base/ui/tooltip'
import { ThemePalette } from '@/components/theme-palette'
import { THEMES } from '@/app/(preview)/lib/shadcn'

/**
 * His block-viewer theme picker, bound to the admin's draft.
 *
 * Structure, chrome and behaviour are his: a `Popover` whose trigger is the current theme's own
 * four-swatch palette, containing a `Command` list with a search field, a "Current theme" group
 * holding Default, and one group per theme source. The two things that changed are where the
 * list comes from — `THEMES`, the same registry his viewer reads — and what selecting does:
 * instead of a preview search param it writes `sourceTheme` into the draft config, which the
 * portfolio preview and the editor's own chrome both re-render from.
 *
 * `themes` upstream is a `Map` assembled server-side from his shadcn list plus tweakcn's remote
 * registry. The admin runs entirely in the browser and cannot await a network registry before
 * painting a control, so it reads the local list. Grouping still keys off `meta.source`, so a
 * tweakcn theme that reaches the local list appears in its own group with no change here.
 */
export function ThemePicker({
  value,
  onChange,
  theme,
}: {
  value?: string
  onChange: (name: string) => void
  theme?: RegistryItem
}) {
  const groups = useMemo(() => {
    const bySource = new Map<string, RegistryItem[]>()
    for (const item of THEMES) {
      const source = (item.meta?.source as string) ?? 'shadcn'
      const list = bySource.get(source) ?? []
      list.push(item)
      bySource.set(source, list)
    }
    return [...bySource.entries()]
  }, [])

  const label = theme?.title || theme?.name || 'Default'

  return (
    <Popover modal>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  className="bg-transparent px-1.75 shadow-none dark:border-border dark:bg-transparent dark:aria-expanded:bg-input/50"
                  variant="outline"
                  size="sm"
                  aria-label="Theme"
                >
                  <ThemePalette cssVars={theme?.cssVars} />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>

      <PopoverContent className="rounded-2xl p-0" align="end" alignOffset={-8}>
        <Command
          className={cn(
            '**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-10',
            '**:[[cmdk-group]]:px-2',
            '**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
            '[&_[cmdk-item]_svg]:size-5 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-2',
          )}
        >
          <CommandInput placeholder="Search theme…" />

          <CommandList className="min-h-80 scroll-fade">
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Current theme">
              <CommandItem onSelect={() => onChange('')}>
                <ThemePalette />
                Default
                {!value && <CheckIcon className="ml-auto" strokeWidth={3} />}
              </CommandItem>
            </CommandGroup>

            {groups.map(([source, items]) => (
              <CommandGroup key={source} heading={`${source} themes (${items.length})`}>
                {items.map((item) => (
                  <CommandItem
                    key={item.name}
                    value={`${item.title ?? ''} ${item.name}`}
                    onSelect={() => onChange(item.name)}
                  >
                    <ThemePalette cssVars={item.cssVars} />
                    {item.title || item.name}
                    {value === item.name && (
                      <CheckIcon className="ml-auto" strokeWidth={3} />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
