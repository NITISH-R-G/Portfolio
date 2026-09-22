import type { RegistryItem } from "shadcn/schema"

/**
 * Turn one of his registry themes into a stylesheet.
 *
 * His own `applyThemeCSSVars` writes the same variables, but scoped for the block-preview
 * iframe and applied imperatively from an effect. The portfolio needs them on `:root`, rendered
 * with the document, so the page never paints in the wrong colours first. This is that same
 * transformation with the scope changed — the token names and values are entirely his.
 *
 * His dark tokens live under `cssVars.dark`, and his site switches with a `.dark` class on the
 * root element, so that is the selector used here.
 */

/** Theme names his registry actually ships, for validating configuration against. */
export function sourceThemeNames(themes: RegistryItem[]): string[] {
  return themes.map((theme) => theme.name).filter((name): name is string => Boolean(name))
}

/** The registry entry for a configured name, or `undefined` for "his own defaults". */
export function findSourceTheme(
  themes: RegistryItem[],
  name?: string
): RegistryItem | undefined {
  if (!name) return undefined
  return themes.find((theme) => theme.name === name)
}

/** The swatch an admin picker shows for a theme: its own primary, background and border. */
export function sourceThemeSwatch(themes: RegistryItem[], name: string) {
  const theme = findSourceTheme(themes, name)
  const light = (theme?.cssVars?.light ?? {}) as Record<string, string>
  const dark = (theme?.cssVars?.dark ?? {}) as Record<string, string>
  return {
    name,
    title: theme?.title ?? name,
    primary: dark.primary ?? light.primary ?? "",
    background: dark.background ?? light.background ?? "",
    border: dark.border ?? light.border ?? "",
    accent: dark.accent ?? light.accent ?? "",
  }
}

/** His own guard: a key that is not a plain identifier cannot be a custom property. */
function isValidCSSVarName(name: string) {
  return /^[a-z0-9-]+$/i.test(name)
}

function toCSSVars(vars: Record<string, string> | undefined, indent = "  "): string {
  if (!vars) return ""
  return Object.entries(vars)
    .filter(([k, v]) => v && typeof v === "string" && v.trim() && isValidCSSVarName(k))
    .map(([k, v]) => `${indent}--${k}: ${v.trim()};`)
    .join("\n")
}

/**
 * @param themes his registry list
 * @param name the configured theme, or undefined to change nothing
 * @returns a stylesheet, or `""` when the name is unknown — an unknown theme leaves his own
 *   defaults in place rather than emitting a half-applied palette.
 */
export function buildThemeCSSVarsForRoot(themes: RegistryItem[], name?: string): string {
  const theme = findSourceTheme(themes, name)
  if (!theme?.cssVars) return ""

  const light = toCSSVars(theme.cssVars.light as Record<string, string> | undefined)
  const dark = toCSSVars(theme.cssVars.dark as Record<string, string> | undefined)

  return [light && `:root {\n${light}\n}`, dark && `.dark {\n${dark}\n}`]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * The same variables, confined to one subtree.
 *
 * This is what lets the admin show two things at once: the editor's own chrome in the theme the
 * owner is actually running, and a live portfolio preview in the theme they are *considering*.
 * Writing to `:root` could only ever show one of them, and previewing a theme by navigating away
 * from the picker is exactly the comparison the picker exists to make possible.
 *
 * The shared tokens (`cssVars.theme` — fonts, radius) go in the light block, as his own builder
 * does, because they are not scheme-dependent.
 *
 * @param selector a CSS selector for the subtree, e.g. `[data-portfolio-preview]`
 */
export function buildScopedThemeCSSVars(
  theme: RegistryItem | undefined,
  selector: string
): string {
  if (!theme?.cssVars) return ""

  const shared = toCSSVars(theme.cssVars.theme as Record<string, string> | undefined)
  const light = toCSSVars(theme.cssVars.light as Record<string, string> | undefined)
  const dark = toCSSVars(theme.cssVars.dark as Record<string, string> | undefined)

  const lightBlock = [shared, light].filter(Boolean).join("\n")

  return [
    lightBlock && `${selector} {\n${lightBlock}\n}`,
    // Both forms: the class may sit above the subtree (the usual case) or on it.
    dark && `.dark ${selector},\n${selector}.dark {\n${dark}\n}`,
  ]
    .filter(Boolean)
    .join("\n\n")
}
