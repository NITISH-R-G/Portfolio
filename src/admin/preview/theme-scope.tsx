'use client'

import { useId } from 'react'
import type { RegistryItem } from 'shadcn/schema'

import { cn } from '@/lib/utils'
import { buildScopedThemeCSSVars } from '@/lib/source-theme'

/**
 * Renders its children under one of his registry themes.
 *
 * The theme is applied by writing his own `cssVars` to a selector that matches only this
 * subtree, so the admin can show the editor chrome in one palette and a portfolio preview in
 * another at the same time. That is not a stylistic preference — it is what makes the theme
 * picker usable, because comparing themes means seeing the candidate applied to real components
 * while the controls you are clicking stay where they were.
 *
 * `useId` gives each instance its own class, so two previews under two different themes on the
 * same screen do not overwrite each other's variables.
 *
 * A missing or unknown theme emits nothing at all and the subtree simply inherits — which is
 * exactly what "Default" means, and is why it is not special-cased anywhere else.
 */
export function ThemeScope({
  theme,
  className,
  children,
  ...props
}: {
  theme?: RegistryItem
  className?: string
  children: React.ReactNode
} & React.ComponentProps<'div'>) {
  const scope = `theme-scope-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const css = buildScopedThemeCSSVars(theme, `.${scope}`)

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <div className={cn(scope, className)} {...props}>
        {children}
      </div>
    </>
  )
}
