"use client"

import { useEffect } from "react"

import { THEMES } from "@/app/(preview)/lib/shadcn"
import { buildThemeCSSVarsForRoot } from "@/lib/source-theme"

/**
 * Applies the configured source theme to the portfolio.
 *
 * The theme list is his: `THEMES` in `(preview)/lib/shadcn.ts`, twenty-four shadcn themes each
 * carrying a complete `cssVars` block for light and dark. Upstream it exists so a block preview
 * can be rendered under a chosen theme; the tokens it sets are the same ones his portfolio
 * components read, so the same list drives the whole site with no new theme system invented.
 *
 * That matters for the admin: it means the theme picker offers *his* themes, not a set of names
 * we made up, and choosing one changes the rendered page because the variables it writes are the
 * variables his CSS already consumes.
 *
 * The stylesheet is emitted server-side by `SourceThemeStyle` below so there is no flash of the
 * default theme; this client component only re-applies it when the admin's draft changes it.
 */
export function SourceThemeStyle({ name }: { name?: string }) {
  const css = buildThemeCSSVarsForRoot(THEMES, name)
  if (!css) return null
  // Rendered into the document rather than injected: a theme that arrives after first paint is
  // a visible flash of the wrong colours on every page load.
  return <style id="source-theme-vars" dangerouslySetInnerHTML={{ __html: css }} />
}

/**
 * Re-applies the theme when the admin preview changes it in the same tab.
 *
 * The published site never uses this — it renders the committed theme server-side and stops.
 */
export function SourceThemeSync({ name }: { name?: string }) {
  useEffect(() => {
    const css = buildThemeCSSVarsForRoot(THEMES, name)
    let el = document.getElementById("source-theme-vars") as HTMLStyleElement | null
    if (!el) {
      el = document.createElement("style")
      el.id = "source-theme-vars"
      document.head.appendChild(el)
    }
    el.textContent = css
  }, [name])

  return null
}
