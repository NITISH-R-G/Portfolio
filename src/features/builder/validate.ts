import type { Control, PropControls, ResolvedProps } from "./controls"

/**
 * Checking a value against the control that declares it.
 *
 * This is the single place that decides what a stored property may be, and it is used twice:
 * when the inspector saves an edit, and again when the page renders. Validating only on save
 * would trust the file on disk, and `src/data/config.json` is a file anyone can edit by hand or
 * that a later version of this application may have written. Validating only on render would
 * let the editor save things it cannot show.
 *
 * ## The rule for invalid values
 *
 * Never throw, never render a bad value, and never silently lose the rest. A value that fails
 * is replaced by the control's `default` and reported; every *other* property of the same
 * instance is unaffected, so one corrupt field does not blank a whole component. The one
 * exception is a `required` property that is empty: there is nothing sensible to show, so the
 * instance is marked unrenderable (`blocking`) instead of rendering an empty heading.
 *
 * Strings that end up in markup are inert by construction here (control characters removed,
 * length bounded, URLs and colours restricted to safe forms), but that is defence in depth: React
 * escapes text, and nothing in this layer ever builds HTML.
 *
 * @module features/builder/validate
 */

export type Issue = {
  /** The property, e.g. `text`. */
  path: string
  level: "error" | "warning"
  message: string
  /** The instance cannot be shown at all (an empty required value). */
  blocking?: boolean
}

export type PropsResult<P extends PropControls> = {
  /** Every declared property, with an invalid or missing one replaced by its default. */
  props: ResolvedProps<P>
  issues: Issue[]
  /** False when a required property is empty. */
  renderable: boolean
}

export const TEXT_MAX = 500
const LINK_MAX = 2000

// C0 control characters and DEL. Newline and tab are kept for multiline text only.
const CONTROL_ALL = /[\u0000-\u001F\u007F]+/g
const CONTROL_EXCEPT_NEWLINE_TAB = /[\u0000-\u0008\u000B-\u001F\u007F]/g
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const TOKEN_NAME = /^[a-z][a-z0-9-]*$/
const ANCHOR = /^#[\w-]*$/
const ROOT_RELATIVE = /^\/(?!\/)[^\s\\]*$/
const MAILTO = /^mailto:[^\s<>]+$/i

const fail = (path: string, message: string, blocking = false): Issue => ({
  path,
  level: "error",
  message,
  ...(blocking ? { blocking: true } : {}),
})
const warn = (path: string, message: string): Issue => ({ path, level: "warning", message })

/** Whether a string is a destination this layer will let through. */
export function isSafeLink(value: string): boolean {
  if (value.length > LINK_MAX) return false
  if (value.startsWith("#")) return ANCHOR.test(value)
  if (value.startsWith("/")) return ROOT_RELATIVE.test(value)
  if (/^mailto:/i.test(value)) return MAILTO.test(value)
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/** Decimal places in a step, so snapping `0.1` does not produce `0.30000000000000004`. */
const decimals = (step: number) => (String(step).split(".")[1] ?? "").length

/**
 * Validate one value.
 *
 * @returns the value to use (never invalid) and what was wrong with the one given.
 */
export function validateValue(
  control: Control,
  value: unknown,
  path: string
): { value: unknown; issues: Issue[] } {
  // Missing is not an error: a property added after an instance was saved simply takes its
  // default, which is what makes adding a control backward compatible.
  if (value === undefined) {
    const blocked = (control.type === "text" || control.type === "link") && control.required && control.default === ""
    return {
      value: control.default,
      issues: blocked ? [fail(path, `${control.label} is required.`, true)] : [],
    }
  }

  const invalid = (message: string) => ({ value: control.default, issues: [fail(path, message)] })

  switch (control.type) {
    case "text": {
      if (typeof value !== "string") return invalid(`${control.label} must be text.`)
      const issues: Issue[] = []
      let next = control.multiline
        ? value.replace(CONTROL_EXCEPT_NEWLINE_TAB, "")
        : value.replace(CONTROL_ALL, " ")
      const max = control.maxLength ?? TEXT_MAX
      if (next.length > max) {
        next = next.slice(0, max)
        issues.push(warn(path, `${control.label} was longer than ${max} characters and was shortened.`))
      }
      if (control.required && next.trim() === "") {
        issues.push(fail(path, `${control.label} is required.`, true))
      }
      return { value: next, issues }
    }

    case "number":
    case "range": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return invalid(`${control.label} must be a number.`)
      }
      const issues: Issue[] = []
      let next = value
      if (control.type === "number" && control.integer) next = Math.round(next)
      if (control.type === "range") {
        // Snap to the step grid so a hand-edited 1.234 becomes a value the slider can show.
        const snapped = Math.round((next - control.min) / control.step) * control.step + control.min
        next = Number(snapped.toFixed(decimals(control.step)))
      }
      const { min, max } = control
      if (min !== undefined && next < min) {
        next = min
        issues.push(warn(path, `${control.label} was below ${min} and was raised to it.`))
      } else if (max !== undefined && next > max) {
        next = max
        issues.push(warn(path, `${control.label} was above ${max} and was lowered to it.`))
      }
      return { value: next, issues }
    }

    case "boolean":
      return typeof value === "boolean" ? { value, issues: [] } : invalid(`${control.label} must be on or off.`)

    case "select": {
      const allowed = control.options.map((option) => option.value)
      return typeof value === "string" && allowed.includes(value)
        ? { value, issues: [] }
        : invalid(`${control.label} must be one of: ${allowed.join(", ")}.`)
    }

    case "color": {
      if (typeof value !== "string") return invalid(`${control.label} must be a colour.`)
      if (value === "") return { value, issues: [] }
      if (value.startsWith("token:")) {
        const name = value.slice("token:".length)
        return TOKEN_NAME.test(name) && control.tokens.includes(name)
          ? { value, issues: [] }
          : invalid(`${control.label} must be one of the theme colours: ${control.tokens.join(", ")}.`)
      }
      if (control.allowCustom !== false && HEX_COLOR.test(value)) {
        return { value: value.toLowerCase(), issues: [] }
      }
      return invalid(`${control.label} must be a theme colour${control.allowCustom === false ? "" : " or a #rrggbb value"}.`)
    }

    case "link": {
      if (typeof value !== "string") return invalid(`${control.label} must be a link.`)
      const next = value.trim()
      if (next === "") {
        return {
          value: "",
          issues: control.required ? [fail(path, `${control.label} is required.`, true)] : [],
        }
      }
      return isSafeLink(next)
        ? { value: next, issues: [] }
        : invalid(`${control.label} must start with https://, http://, mailto:, / or #.`)
    }

    default: {
      // A new Control type added without handling it here is a compile error, not a silent pass.
      const unhandled: never = control
      return unhandled
    }
  }
}

/**
 * Validate a whole property bag against a set of controls.
 *
 * Keys that no control declares are dropped and reported. That is the guarantee behind "nothing
 * is editable that was not declared": a stored `className` or `dangerouslySetInnerHTML` never
 * reaches the component, because there is no path from the file to the props except through a
 * declared, validated control.
 */
export function validateProps<P extends PropControls>(controls: P, input: unknown): PropsResult<P> {
  const issues: Issue[] = []
  const props: Record<string, unknown> = {}

  const given =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : undefined
  if (input !== undefined && !given) {
    issues.push(fail("", "Properties must be an object; defaults were used."))
  }

  for (const [name, control] of Object.entries(controls)) {
    const own = given && Object.prototype.hasOwnProperty.call(given, name) ? given[name] : undefined
    const result = validateValue(control, own, name)
    props[name] = result.value
    issues.push(...result.issues)
  }

  if (given) {
    for (const key of Object.keys(given)) {
      if (!Object.prototype.hasOwnProperty.call(controls, key)) {
        issues.push(warn(key, `"${key}" is not an editable property of this component and was ignored.`))
      }
    }
  }

  return {
    props: props as ResolvedProps<P>,
    issues,
    renderable: !issues.some((issue) => issue.blocking),
  }
}
