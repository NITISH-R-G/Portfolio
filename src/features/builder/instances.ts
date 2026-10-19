import type { PropControls } from "./controls"
import type { ComponentManifest } from "./define"
import { validateProps } from "./validate"
import type { Issue } from "./validate"

/**
 * Instances: what the owner placed, as plain data.
 *
 * An instance is `{ id, component, version, props }` and nothing else. It names a component by
 * id, never by path or by code; it records the schema `version` its props were written under so
 * a later version of the component can migrate them; and its `props` are plain JSON the engine
 * has already confirmed contains nothing executable (`isPlainJson` in `core/config/resolve.js`).
 *
 * ## Ids are identities, never positions
 *
 * An array index is a position, and positions change the moment something is inserted, moved or
 * deleted. An id that is "the third one" would silently point at a different component after a
 * reorder, so anything that refers to an instance — selection, undo history, a future data
 * binding — would refer to the wrong thing. Each instance therefore gets a random id at
 * creation that never changes and is never reused.
 *
 * ## Full props are stored, not just changes
 *
 * `createInstance` and every update write *every* declared property, defaults included. That is
 * deliberate: a portfolio is a reproducible artefact, and one that changed appearance because a
 * component's default changed upstream would not be. Storing only the deltas would make the page
 * a function of both the file and whatever version of the code is deployed.
 *
 * Every function here is pure and returns a new array, so state can sit in React or a history
 * stack without aliasing. An id that is not found returns the same array — callers can compare
 * references to see whether anything happened.
 *
 * @module features/builder/instances
 */

export type ComponentInstance = {
  id: string
  component: string
  version: number
  props: Record<string, unknown>
}

/* Migration --------------------------------------------------------------------- */

export type Migration =
  | { status: "current" | "migrated"; instance: ComponentInstance }
  | { status: "too-new" | "failed"; instance: ComponentInstance; issue: Issue }

/**
 * Bring an instance up to the version of the component that will render it.
 *
 * Instances record the schema version their props were written under; the manifest records the
 * version it understands. When they differ the stored props are rewritten step by step
 * (`migrations[n]` takes version `n` to `n + 1`), so a renamed or re-typed property keeps
 * meaning what the owner chose rather than silently reverting to a default.
 *
 * Two cases cannot be migrated and are reported rather than guessed at:
 *
 * - **too-new** — saved by a *later* version of the application than this one knows. Rendering
 *   it would be interpreting props under rules that may have changed; downgrading would lose
 *   information. It is left exactly as stored and not rendered.
 * - **failed** — a migration threw. The original is kept untouched, so a bug in a migration
 *   cannot destroy the data it was meant to carry forward.
 *
 * Pure: the input instance is never mutated, and a migrated instance is a new object.
 */
export function migrateInstance<P extends PropControls>(
  manifest: ComponentManifest<P>,
  instance: ComponentInstance
): Migration {
  if (instance.version === manifest.version) return { status: "current", instance }

  if (instance.version > manifest.version) {
    return {
      status: "too-new",
      instance,
      issue: {
        path: "",
        level: "error",
        message: `Saved with version ${instance.version} of "${manifest.id}"; this application understands up to ${manifest.version}.`,
        blocking: true,
      },
    }
  }

  let props: Record<string, unknown> = instance.props
  try {
    for (let from = instance.version; from < manifest.version; from += 1) {
      props = manifest.migrations![from](props)
    }
  } catch (error) {
    return {
      status: "failed",
      instance,
      issue: {
        path: "",
        level: "error",
        message: `Could not upgrade "${manifest.id}" from version ${instance.version}: ${error instanceof Error ? error.message : "migration failed"}.`,
        blocking: true,
      },
    }
  }
  return { status: "migrated", instance: { ...instance, version: manifest.version, props } }
}

/* Identity ---------------------------------------------------------------------- */

const ID_PREFIX = "ci_"
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/**
 * A new instance id: `ci_` plus 12 characters from a 36-letter alphabet (about 62 bits).
 *
 * `crypto.getRandomValues` rather than `Math.random`, so ids cannot collide through a weak
 * generator. Rejection sampling avoids the modulo bias of reducing a byte to 36 symbols.
 */
export function newInstanceId(cryptoSource: Pick<Crypto, "getRandomValues"> = crypto): string {
  let out = ""
  const limit = 256 - (256 % ID_ALPHABET.length)
  while (out.length < 12) {
    const bytes = cryptoSource.getRandomValues(new Uint8Array(24))
    for (const byte of bytes) {
      if (byte < limit && out.length < 12) out += ID_ALPHABET[byte % ID_ALPHABET.length]
    }
  }
  return ID_PREFIX + out
}

/** A new instance of a component with every property at its default. */
export function createInstance<P extends PropControls>(
  manifest: ComponentManifest<P>,
  id: string = newInstanceId()
): ComponentInstance {
  const { props } = validateProps(manifest.props, {})
  return { id, component: manifest.id, version: manifest.version, props: { ...props } }
}

export function addInstance(
  list: readonly ComponentInstance[],
  instance: ComponentInstance,
  at: number = list.length
): ComponentInstance[] {
  if (list.some((existing) => existing.id === instance.id)) return [...list]
  const index = Math.max(0, Math.min(list.length, at))
  return [...list.slice(0, index), instance, ...list.slice(index)]
}

export function removeInstance(list: readonly ComponentInstance[], id: string): readonly ComponentInstance[] {
  return list.some((instance) => instance.id === id) ? list.filter((instance) => instance.id !== id) : list
}

/** Move one step up (`-1`) or down (`1`). At either end it is a no-op. */
export function moveInstance(
  list: readonly ComponentInstance[],
  id: string,
  delta: 1 | -1
): readonly ComponentInstance[] {
  const from = list.findIndex((instance) => instance.id === id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * Apply an edit and store the *validated* result.
 *
 * The patch is merged over the current props and the whole bag is run through the manifest's
 * controls, so what is saved is always something the renderer will accept, however the patch
 * was produced. Returns the issues too, so the inspector can show why an edit was adjusted.
 */
export function updateProps<P extends PropControls>(
  list: readonly ComponentInstance[],
  id: string,
  patch: Record<string, unknown>,
  manifest: ComponentManifest<P>
): { list: readonly ComponentInstance[]; issues: Issue[] } {
  const index = list.findIndex((instance) => instance.id === id)
  if (index === -1) return { list, issues: [] }

  // Migrate first. Validating version-1 props against version-2 controls and then stamping
  // version 2 on the result would turn an upgrade into silent data loss.
  const migrated = migrateInstance(manifest, list[index])
  if (migrated.status === "too-new" || migrated.status === "failed") {
    return { list, issues: [migrated.issue] }
  }

  const current = migrated.instance
  const merged = { ...current.props, ...patch }
  const { props, issues } = validateProps(manifest.props, merged)
  // Unknown keys in the existing props are dropped by validation; saving through here is what
  // cleans a hand-edited file.
  const next = [...list]
  next[index] = { ...current, props: { ...props } }
  return { list: next, issues }
}
