import { COMPOSED_INSTANCES } from "@/features/portfolio/data/adapter"
import { getManifest } from "@/features/builder/registry"
import type { ManifestLookup } from "@/features/builder/registry"
import { renderResolved, resolveInstance } from "@/features/builder/resolve"
import type { ComponentInstance } from "@/features/builder/instances"

import { Panel, PanelContent } from "./panel"

/**
 * The components an owner placed from the builder, in the order they placed them.
 *
 * Each stored instance is resolved (manifest found, migrated, validated) and only the ones that
 * come out renderable are drawn. Nothing else appears and nothing throws: an instance whose
 * component was removed, or whose required text is empty, simply is not on the public page,
 * while the editor shows what is wrong with it. The section as a whole is absent when nothing
 * renders — the engine already hides it when there are no instances, and this covers the case
 * where there are instances and none of them can be shown, so a heading-less empty panel never
 * appears.
 *
 * `instances` and `lookup` are props, defaulting to the built portfolio and the real registry,
 * so the admin preview renders this same component over its draft and a test can render it over
 * a synthetic manifest.
 */
export function Composed({
  instances = COMPOSED_INSTANCES,
  lookup = getManifest,
}: {
  instances?: readonly ComponentInstance[]
  lookup?: ManifestLookup
}) {
  const shown = instances
    .map((instance) => ({ instance, resolved: resolveInstance(instance, lookup) }))
    .filter(({ resolved }) => resolved.status === "ok" && resolved.renderable)

  if (shown.length === 0) return null

  return (
    <Panel id="composed">
      <PanelContent className="flex flex-col gap-6">
        {shown.map(({ instance, resolved }) => (
          // The id is the stable identity — never the index — so a reorder moves the element
          // rather than re-mounting it, and so the editor can point at exactly this instance.
          <div
            key={instance.id}
            data-component={instance.component}
            data-instance={instance.id}
          >
            {renderResolved(resolved)}
          </div>
        ))}
      </PanelContent>
    </Panel>
  )
}
