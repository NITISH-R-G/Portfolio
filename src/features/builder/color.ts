/**
 * A validated colour value, as the CSS that draws it.
 *
 * The inverse of what `validate.ts` accepts for a `color` control: `""` means "no override",
 * `"token:primary"` becomes `var(--primary)` so the colour tracks the theme (and dark mode)
 * rather than freezing whatever it was when chosen, and `"#rrggbb"` is passed through.
 *
 * This only ever *formats* values that already passed validation. It does not re-validate,
 * and it must not be handed a raw string from storage — a free-form value reaching a `style`
 * attribute is how `url(...)` and other surprises get in. Anything that is not exactly one of
 * the two accepted forms returns `undefined` here as a second line of defence.
 */
export function cssColor(value: string): string | undefined {
  if (value.startsWith("token:")) {
    const name = value.slice("token:".length)
    return /^[a-z][a-z0-9-]*$/.test(name) ? `var(--${name})` : undefined
  }
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : undefined
}
