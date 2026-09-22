import type { RegistryItem } from "shadcn/schema"

import { cn } from "@/lib/utils"

/**
 * The four-swatch chip that stands for a theme.
 *
 * Lifted verbatim out of `(preview)/components/block-viewer.tsx`, which is where it was written
 * and where his block viewer's theme picker still uses it — the viewer now imports it from here
 * rather than declaring its own. The admin's theme picker uses the same component, so the two
 * pickers cannot drift apart, and neither can invent a swatch the theme does not actually
 * define: each square is painted from the theme's own `cssVars`, with the current token as the
 * fallback so the "Default" entry shows the palette in force rather than a blank.
 */
export const THEME_PALETTE_KEYS = [
  "primary",
  "accent",
  "muted",
  "secondary",
] as const

export function ThemePalette({
  cssVars,
  className,
}: {
  cssVars?: RegistryItem["cssVars"]
  className?: string
}) {
  return (
    <div className={cn("flex shrink-0 gap-0.5", className)}>
      {THEME_PALETTE_KEYS.map((key) => (
        <div
          key={key}
          className={cn(
            "flex h-4 w-2.5 shrink-0 rounded-xs inset-ring-1 inset-ring-foreground/15",
            "bg-(--color-palette) dark:bg-(--color-palette-dark)"
          )}
          style={
            {
              "--color-palette": cssVars?.light?.[key] ?? `var(--${key})`,
              "--color-palette-dark": cssVars?.dark?.[key] ?? `var(--${key})`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
