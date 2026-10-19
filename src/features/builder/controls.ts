/**
 * The vocabulary of editable properties.
 *
 * A component is not editable because it has props. TypeScript describes what a component
 * *accepts*; it says nothing about which of those are meant to be changed by a person, within
 * what limits, or how a sensible control for them would look. A prop interface exposes
 * `className`, callbacks, refs and internal flags that must never become knobs. So editability
 * is declared, one property at a time, and nothing is editable that was not declared.
 *
 * Each control carries what is needed to do three things consistently from one definition:
 * draw an input for it (`label`, `help`, bounds), check a value against it (`validate.ts`), and
 * fall back when a stored value is no longer valid (`default`). That is why a control is data
 * and not a component: the validator and the inspector read the same object, so they cannot
 * disagree about what is allowed.
 *
 * ## What exists, and what does not yet
 *
 * Implemented: `text`, `number`, `range`, `boolean`, `select`, `color`, `link`.
 *
 * Designed for but **not built** (each is a new member of the `Control` union, and the exhaustive
 * switches in `validate.ts` and the inspector make adding one a compile error until both handle
 * it): rich text, icon, media, spacing and layout, responsive overrides, slots and children.
 * They are listed in `docs/sync-and-builder.md` under Milestone 4 rather than stubbed here,
 * because a control that validates nothing and renders nothing is the dead setting this
 * project exists to avoid.
 *
 * @module features/builder/controls
 */

type Base = {
  /** The label beside the input. */
  label: string
  /** One line of guidance under it. */
  help?: string
}

export type TextControl = Base & {
  type: "text"
  default: string
  /** An empty value makes the instance unrenderable rather than rendering nothing visible. */
  required?: boolean
  multiline?: boolean
  /** Longer values are truncated with a warning. Defaults to 500. */
  maxLength?: number
  placeholder?: string
}

export type NumberControl = Base & {
  type: "number"
  default: number
  min?: number
  max?: number
  step?: number
  integer?: boolean
}

/** A bounded number edited with a slider. Unlike `number`, both bounds are required. */
export type RangeControl = Base & {
  type: "range"
  default: number
  min: number
  max: number
  step: number
  /** Shown beside the value, e.g. "s". */
  unit?: string
}

export type BooleanControl = Base & {
  type: "boolean"
  default: boolean
}

export type SelectOption<V extends string = string> = { value: V; label: string }

export type SelectControl<V extends string = string> = Base & {
  type: "select"
  default: V
  options: readonly SelectOption<V>[]
}

/**
 * A colour that follows the theme where it can.
 *
 * The value is a string in one of three forms: `""` (no override — the component's own colour),
 * `"token:<name>"` (a theme variable such as `primary`, so the colour changes with the theme and
 * with dark mode), or `"#rrggbb"` (a fixed colour, if `allowCustom`). It is deliberately not an
 * arbitrary CSS colour: a free-form string reaching a `style` attribute is a path for
 * `url(...)` and for values that break the page.
 */
export type ColorControl = Base & {
  type: "color"
  default: string
  /** Theme variable names offered, without the `--`. */
  tokens: readonly string[]
  /** Allow a fixed `#rrggbb` as well. Defaults to true. */
  allowCustom?: boolean
}

/** A destination. `https:`, `http:`, `mailto:`, a root-relative path, or an in-page `#anchor`. */
export type LinkControl = Base & {
  type: "link"
  default: string
  required?: boolean
}

export type Control =
  | TextControl
  | NumberControl
  | RangeControl
  | BooleanControl
  | SelectControl
  | ColorControl
  | LinkControl

export type PropControls = Record<string, Control>

/** What a control resolves to once validated. */
export type ControlValue<C> = C extends TextControl
  ? string
  : C extends NumberControl | RangeControl
    ? number
    : C extends BooleanControl
      ? boolean
      : C extends SelectControl<infer V>
        ? V
        : C extends ColorControl | LinkControl
          ? string
          : never

export type ResolvedProps<P extends PropControls> = {
  [K in keyof P]: ControlValue<P[K]>
}

/* Constructors ------------------------------------------------------------------ */
// Thin on purpose: they exist so a manifest reads as a declaration and so `default` can be
// omitted where there is an obvious one. They add no behaviour the types do not describe.

export const text = (
  options: Omit<TextControl, "type" | "default"> & { default?: string }
): TextControl => ({ type: "text", default: "", ...options })

export const number = (
  options: Omit<NumberControl, "type" | "default"> & { default?: number }
): NumberControl => ({ type: "number", default: options.min ?? 0, ...options })

export const range = (options: Omit<RangeControl, "type" | "default"> & { default?: number }): RangeControl => ({
  type: "range",
  default: options.min,
  ...options,
})

export const boolean = (
  options: Omit<BooleanControl, "type" | "default"> & { default?: boolean }
): BooleanControl => ({ type: "boolean", default: false, ...options })

// An empty `options` is a mistake, but not one for this constructor to crash on: it would throw
// a bare TypeError from inside a manifest file. `defineComponent` reports it, by component name.
export const select = <const V extends string>(
  options: Omit<SelectControl<V>, "type" | "default"> & { default?: V }
): SelectControl<V> => ({
  type: "select",
  default: options.options[0]?.value as V,
  ...options,
})

export const color = (
  options: Omit<ColorControl, "type" | "default"> & { default?: string }
): ColorControl => ({ type: "color", default: "", ...options })

export const link = (
  options: Omit<LinkControl, "type" | "default"> & { default?: string }
): LinkControl => ({ type: "link", default: "", ...options })
