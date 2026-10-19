import type { ComponentType, ReactNode } from "react"

import type { PropControls, ResolvedProps } from "./controls"
import { validateValue } from "./validate"

/**
 * Declaring that a component is editable, and how.
 *
 * A shadcn registry item distributes *code*: files, dependencies, where they go. It does not say
 * which of a component's props a person should be able to change, or within what limits. A
 * manifest adds exactly that, as a layer on top that leaves the registry and the component
 * untouched:
 *
 *     registry item  →  manifest  →  instance  →  renderer  →  the real component
 *     (what to install) (what is editable) (what was chosen) (validates) (unchanged)
 *
 * Three levels of editing support are planned; this milestone has the middle one:
 *
 * 1. **Automatic** — infer safe controls from TypeScript types. *Not built.* It needs build-time
 *    type extraction (react-docgen-typescript or the compiler API), and inferring from types
 *    alone cannot know bounds or which props are internal; it will only ever *propose* a
 *    manifest for a human to review.
 * 2. **Manifest-driven** — controls declared explicitly, as here.
 * 3. **Custom inspector** — a component supplies its own editor (`inspector`) for what a flat
 *    list of controls cannot express. The hook exists and is honoured by the admin.
 *
 * ## The manifest holds the code binding; the instance holds only data
 *
 * `render` is a function, so a manifest cannot be stored as JSON — and that is the point. What
 * is saved in the portfolio's configuration is the *instance*: `{ id, component, version, props }`,
 * plain JSON. Which code runs for `component: "shimmering-text"` is decided here, by what this
 * application was built with. No stored value can name code, load a module or evaluate
 * anything.
 *
 * @module features/builder/define
 */

export type InspectorProps<P extends PropControls> = {
  props: ResolvedProps<P>
  /** Apply a partial change. Validated and saved by the caller. */
  onChange: (patch: Partial<ResolvedProps<P>>) => void
}

export type ComponentManifest<P extends PropControls = PropControls> = {
  /** Stable identity, stored in every instance. Lowercase letters, digits and `-`. */
  id: string
  title: string
  description?: string
  /** For grouping in the tray, e.g. "Text". */
  category: string
  /**
   * The schema version of *this component's props*. Bump it when a change would make stored
   * props mean something different (a renamed or re-typed property), and add a migration.
   * Adding a property with a default needs no bump: absent properties take their default.
   */
  version: number
  /**
   * The shadcn registry item this component came from, by `name` in `registry.json`. Optional
   * because a component written for this portfolio has none. When present, its dependencies
   * and licence are read from the registry rather than restated here.
   */
  registry?: { item: string }
  props: P
  render: (props: ResolvedProps<P>) => ReactNode
  /** `migrations[n]` rewrites props saved at version `n` into version `n + 1`. */
  migrations?: Record<number, (props: Record<string, unknown>) => Record<string, unknown>>
  /** Replaces the generated controls entirely. See level 3 above. */
  inspector?: ComponentType<InspectorProps<P>>
}

export class ManifestError extends Error {
  constructor(id: string, message: string) {
    super(`Component "${id}": ${message}`)
    this.name = "ManifestError"
  }
}

const ID = /^[a-z0-9][a-z0-9-]*$/
const PROP_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/
const RESERVED = new Set(["__proto__", "constructor", "prototype"])
export const MAX_CONTROLS = 32

/**
 * Declare an editable component.
 *
 * The definition itself is checked here, once, at load: a manifest that is wrong (a default that
 * fails its own constraints, a migration that skips a version) is a programming error and should
 * fail loudly in a test or at startup, not surface as a mysterious fallback in someone's saved
 * page.
 */
export function defineComponent<const P extends PropControls>(
  definition: ComponentManifest<P>
): ComponentManifest<P> {
  const { id } = definition

  if (!ID.test(id)) throw new ManifestError(id, "id must be lowercase letters, digits and '-'.")
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new ManifestError(id, "version must be an integer of 1 or more.")
  }
  if (!definition.title.trim()) throw new ManifestError(id, "title is required.")

  const names = Object.keys(definition.props)
  if (names.length > MAX_CONTROLS) throw new ManifestError(id, `at most ${MAX_CONTROLS} controls.`)

  for (const name of names) {
    if (!PROP_NAME.test(name) || RESERVED.has(name)) {
      throw new ManifestError(id, `"${name}" is not a usable property name.`)
    }
    const control = definition.props[name]

    if (control.type === "range" && !(control.min < control.max && control.step > 0)) {
      throw new ManifestError(id, `"${name}": a range needs min < max and a positive step.`)
    }
    if (control.type === "number" && control.min !== undefined && control.max !== undefined && control.min > control.max) {
      throw new ManifestError(id, `"${name}": min is above max.`)
    }
    if (control.type === "select") {
      if (control.options.length === 0) throw new ManifestError(id, `"${name}": a select needs options.`)
      const values = control.options.map((option) => option.value)
      if (new Set(values).size !== values.length) throw new ManifestError(id, `"${name}": duplicate option values.`)
    }

    // The default must be valid under the control's own rules, or "fall back to the default"
    // would fall back to something the validator then rejects.
    const check = validateValue(control, control.default, name)
    const required = control.type === "text" || control.type === "link" ? control.required : false
    const problems = check.issues.filter((issue) => !(required && issue.blocking))
    if (problems.length > 0) {
      throw new ManifestError(id, `"${name}": its default is not valid (${problems[0].message})`)
    }
  }

  for (const key of Object.keys(definition.migrations ?? {})) {
    const from = Number(key)
    if (!Number.isInteger(from) || from < 1 || from >= definition.version) {
      throw new ManifestError(
        id,
        `migration "${key}" must migrate a version below the current ${definition.version}.`
      )
    }
  }
  // Every step from 1 up to the current version needs a migration, or an old instance has no
  // path forward and would be stranded the first time the version is bumped.
  for (let from = 1; from < definition.version; from += 1) {
    if (!definition.migrations?.[from]) {
      throw new ManifestError(id, `version is ${definition.version} but there is no migration from version ${from}.`)
    }
  }

  return Object.freeze({ ...definition })
}
