'use client'

import { useMemo } from 'react'

import { THEMES } from '@/app/(preview)/lib/shadcn'
import { findSourceTheme } from '@/lib/source-theme'

/**
 * The theme the draft currently selects, resolved to his registry entry.
 *
 * One hook rather than each panel reaching for `config.sourceTheme` itself, so every preview in
 * the editor is showing the same theme and the picker in one panel moves the preview in another.
 *
 * @param {import('../state.js').Builder} builder
 */
export function useSourceTheme(builder) {
  const name = builder.built.config.sourceTheme ?? ''
  const item = useMemo(() => findSourceTheme(THEMES, name), [name])

  return {
    name,
    item,
    setTheme: (value) => builder.setConfig('sourceTheme', value),
  }
}
