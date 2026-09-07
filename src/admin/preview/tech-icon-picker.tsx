'use client'

import { CheckIcon, XIcon } from 'lucide-react'

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
  TECH_ICON_OPTIONS,
  techIcon,
} from '@/features/portfolio/data/tech-icons'

/**
 * Choose the logo for a technology.
 *
 * The same control his block viewer uses for themes — a `Popover` whose trigger shows the
 * current choice, containing a `Command` list with a search field — because the problem is the
 * same one: pick a named thing out of a list too long to lay out, and see what you are picking.
 * There is no icon picker in the source to reuse directly, so this is the smallest thing that
 * matches the pattern he already has, rather than a new kind of control.
 *
 * The trigger renders the actual icon that will appear in the pill, so the choice is verified
 * before the popover closes.
 *
 * "Automatic" is the default and is not the same as "none": it lets `techIcon` infer a mark from
 * the technology's own name, which is how a stack imported from connector evidence gets logos
 * with nobody configuring anything. Clearing back to it is one click.
 */
export function TechIconPicker({
  name,
  value,
  onChange,
}: {
  /** The technology's name, for the automatic case. */
  name: string
  /** The chosen slug, or empty for automatic. */
  value?: string
  onChange: (slug: string) => void
}) {
  const resolved = techIcon(name, value)
  const inferred = techIcon(name)
  const label =
    TECH_ICON_OPTIONS.find((option) => option.slug === value)?.label ??
    (inferred ? 'Automatic' : 'None')

  return (
    <Popover modal>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 font-normal"
            aria-label="Choose a logo"
          >
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center',
                '[&_svg]:size-4 [&_svg]:text-muted-foreground',
              )}
              aria-hidden
            >
              {resolved}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-xs">{label}</span>
          </Button>
        }
      />

      <PopoverContent className="w-64 rounded-2xl p-0" align="start">
        <Command
          className={cn(
            '**:[[cmdk-group]]:px-2',
            '**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground',
            '**:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-1.5',
          )}
        >
          <CommandInput placeholder="Search logo…" />

          <CommandList className="max-h-72 scroll-fade">
            <CommandEmpty>No logo found.</CommandEmpty>

            <CommandGroup heading="Default">
              <CommandItem value="automatic" onSelect={() => onChange('')}>
                <span className="flex size-4 items-center justify-center [&_svg]:size-4" aria-hidden>
                  {inferred ?? <XIcon className="text-muted-foreground" />}
                </span>
                {inferred ? 'Automatic' : 'None available'}
                {!value && <CheckIcon className="ml-auto size-4" strokeWidth={3} />}
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading={`Logos (${TECH_ICON_OPTIONS.length})`}>
              {TECH_ICON_OPTIONS.map((option) => (
                <CommandItem
                  key={option.slug}
                  value={`${option.label} ${option.slug}`}
                  onSelect={() => onChange(option.slug)}
                >
                  <span
                    className="flex size-4 items-center justify-center [&_svg]:size-4"
                    aria-hidden
                  >
                    {techIcon(undefined, option.slug)}
                  </span>
                  {option.label}
                  {value === option.slug && (
                    <CheckIcon className="ml-auto size-4" strokeWidth={3} />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
