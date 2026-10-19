import registry from "../../../registry.json"

import type { AnyManifest } from "./registry"

/**
 * What the shadcn registry says about a component, read rather than restated.
 *
 * A manifest names its registry item and nothing else about it. Dependencies, files, author and
 * licence are read from `registry.json` at the point they are shown, because a copy kept in the
 * manifest is a second source of truth that goes wrong the first time the registry changes.
 *
 * **Licence is reported as declared, and when nothing is declared that is said.** None of the 64
 * items in this repository's `registry.json` carries a `license` field (the schema allows one);
 * the upstream notice is in `LICENSES/`. Inventing "MIT" here because it is probably true would be
 * exactly the kind of confident-but-unchecked claim an installer screen must not make.
 *
 * Imported only from the admin: it pulls the whole registry file into the bundle, which the
 * public page has no use for.
 *
 * @module features/builder/registry-info
 */

type RegistryItem = {
  name: string
  title?: string
  description?: string
  dependencies?: string[]
  registryDependencies?: string[]
  files?: { path: string; type: string; target?: string }[]
  author?: string
  docs?: string
  license?: string
}

export type RegistryInfo = {
  item: string
  found: boolean
  title?: string
  dependencies: string[]
  registryDependencies: string[]
  files: string[]
  author?: string
  docs?: string
  /** The item's own `license` field, or `null` if it declares none. */
  license: string | null
}

export function describeRegistryItem(manifest: AnyManifest): RegistryInfo | null {
  if (!manifest.registry) return null
  const item = (registry.items as RegistryItem[]).find((entry) => entry.name === manifest.registry!.item)
  if (!item) {
    return { item: manifest.registry.item, found: false, dependencies: [], registryDependencies: [], files: [], license: null }
  }
  return {
    item: item.name,
    found: true,
    title: item.title,
    dependencies: item.dependencies ?? [],
    registryDependencies: item.registryDependencies ?? [],
    files: (item.files ?? []).map((file) => file.target ?? file.path),
    author: item.author,
    docs: item.docs,
    license: item.license ?? null,
  }
}
