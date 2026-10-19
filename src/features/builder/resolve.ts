import type { ReactNode } from "react"

import { migrateInstance } from "./instances"
import type { ComponentInstance } from "./instances"
import type { AnyManifest, ManifestLookup } from "./registry"
import { validateProps } from "./validate"
import type { Issue } from "./validate"

/**
 * From a stored instance to something safe to render, or a reason it is not.
 *
 * Every instance takes the same four steps — find the manifest, migrate to its version, validate
 * the props against its controls, decide whether it can be shown — and each can end in a named,
 * non-throwing state. That is what "handle missing or incompatible components safely" means in
 * practice: a page with one bad instance still renders the rest, the editor says exactly what is
 * wrong with that one, and the stored data is left alone to be fixed rather than quietly
 * rewritten.
 *
 * | status              | cause                                                    | public page | editor          |
 * | ------------------- | -------------------------------------------------------- | ----------- | --------------- |
 * | `ok`                | known, current, valid                                    | rendered    | rendered        |
 * | `ok` (not renderable) | a required property is empty                           | nothing     | says why        |
 * | `unknown-component` | no manifest by that id (removed, or a typo)              | nothing     | placeholder     |
 * | `too-new`           | saved by a newer application than this one               | nothing     | placeholder     |
 * | `migration-failed`  | an upgrade step threw                                    | nothing     | placeholder     |
 *
 * @module features/builder/resolve
 */

export type ResolvedInstance =
  | {
      status: "ok"
      /** The instance as migrated to the manifest's version (not yet re-saved). */
      instance: ComponentInstance
      manifest: AnyManifest
      /** Every declared property, valid. */
      props: Record<string, unknown>
      issues: Issue[]
      renderable: boolean
      migrated: boolean
    }
  | {
      status: "unknown-component" | "too-new" | "migration-failed"
      instance: ComponentInstance
      issues: Issue[]
      renderable: false
    }

export function resolveInstance(instance: ComponentInstance, lookup: ManifestLookup): ResolvedInstance {
  const manifest = lookup(instance.component)
  if (!manifest) {
    return {
      status: "unknown-component",
      instance,
      renderable: false,
      issues: [
        {
          path: "",
          level: "error",
          message: `There is no component called "${instance.component}" in this application. It was removed, or the name is wrong. The saved settings are untouched.`,
          blocking: true,
        },
      ],
    }
  }

  const migration = migrateInstance(manifest, instance)
  if (migration.status === "too-new" || migration.status === "failed") {
    return {
      status: migration.status === "too-new" ? "too-new" : "migration-failed",
      instance,
      renderable: false,
      issues: [migration.issue],
    }
  }

  const { props, issues, renderable } = validateProps(manifest.props, migration.instance.props)
  return {
    status: "ok",
    instance: migration.instance,
    manifest,
    props: props as Record<string, unknown>,
    issues,
    renderable,
    migrated: migration.status === "migrated",
  }
}

/** What to draw for an instance, or `null` when it should not appear on the page. */
export function renderResolved(resolved: ResolvedInstance): ReactNode {
  if (resolved.status !== "ok" || !resolved.renderable) return null
  // The one place the types cannot follow. `props` was produced by `validateProps` against this
  // same manifest's controls, so it has exactly the shape `render` expects; but the registry
  // stores manifests with their prop types erased, so the compiler cannot see that link. The
  // guarantee is the validation above it, not this cast.
  return resolved.manifest.render(resolved.props as never)
}
