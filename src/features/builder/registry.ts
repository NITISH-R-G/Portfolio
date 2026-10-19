import type { ComponentManifest } from "./define"
import { shimmeringText } from "./manifests/shimmering-text"

/**
 * The components this application was built with, and can therefore render.
 *
 * This is a closed list on purpose. A saved instance names a component by id, and the id is
 * looked up *here* — it is never used to import a module, fetch a script or resolve a path. The
 * set of code that can run for any stored value is exactly this array, fixed at build time and
 * reviewed in a pull request like any other code.
 *
 * Adding a component means installing it (the shadcn CLI writes the source files into the
 * repository, where they are reviewed), writing a manifest for it, and adding it below. There is
 * deliberately no path from "a registry offers a component" to "it is running" that skips both
 * a human review and a build. Browsing a registry and installing from this screen is
 * Milestone 4; it will end at a pull request, not at a hot-loaded module.
 */
// Stored without a props generic: `render` takes `ResolvedProps<P>`, which is contravariant, so
// a manifest with specific props is not assignable to one with the general `PropControls`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyManifest = ComponentManifest<any>

export const MANIFESTS: readonly AnyManifest[] = Object.freeze([shimmeringText])

const BY_ID = new Map<string, AnyManifest>(MANIFESTS.map((manifest) => [manifest.id, manifest]))

if (BY_ID.size !== MANIFESTS.length) {
  // Two manifests sharing an id would make "which code runs for this instance" ambiguous.
  throw new Error("Duplicate component ids in the builder registry.")
}

export function getManifest(id: string): AnyManifest | undefined {
  return BY_ID.get(id)
}

export type ManifestLookup = (id: string) => AnyManifest | undefined
