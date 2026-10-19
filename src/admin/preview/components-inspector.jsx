'use client'

/**
 * Adding, ordering and editing the components placed on the page.
 *
 * Two surfaces, because they answer different questions. The **tray** answers "what can I add?"
 * and is available even when nothing has been placed — which matters, because the page hides the
 * `composed` section until it has content, so there is no region on the canvas to select yet.
 * The **list and editor** answer "what is here, and how do I change it?".
 *
 * This file holds no state about the page. It is given the instances and returns a new list
 * through `onChange`; the canvas panel owns saving it (`setConfig('components.instances', …)`),
 * so there is exactly one write path and one place a liveness probe has to look.
 *
 * Every edit goes through `updateProps`, which migrates and validates before storing, so what
 * lands in the configuration is always something the renderer will accept — however the inspector
 * produced it.
 *
 * @module admin/preview/components-inspector
 */

import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  addInstance,
  createInstance,
  moveInstance,
  removeInstance,
  updateProps,
} from '@/features/builder/instances'
import { MANIFESTS, getManifest } from '@/features/builder/registry'
import { describeRegistryItem } from '@/features/builder/registry-info'
import { resolveInstance } from '@/features/builder/resolve'

import { Note } from '../fields.jsx'
import { Section } from './editor-layout.jsx'
import { InstanceControls } from './instance-controls.jsx'

/**
 * What can be added. Reads the real registry of installed components, so a manifest added to
 * `features/builder/registry.ts` appears here with no change to this file.
 *
 * @param {{onAdd: (manifest: import('@/features/builder/registry').AnyManifest) => void}} props
 */
export function ComponentTray({ onAdd }) {
  return (
    <Section
      title="Add a component"
      description="Components installed in this portfolio. Each is a real component from the shadcn registry, made editable by a manifest."
    >
      <ul className="flex flex-col gap-2">
        {MANIFESTS.map((manifest) => {
          const info = describeRegistryItem(manifest)
          return (
            <li key={manifest.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{manifest.title}</p>
                  <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                    {manifest.category}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => onAdd(manifest)}
                  aria-label={`Add ${manifest.title}`}
                >
                  <PlusIcon />
                  Add
                </Button>
              </div>
              {manifest.description && (
                <p className="text-xs text-pretty text-muted-foreground">{manifest.description}</p>
              )}
              {info && <RegistryFacts info={info} />}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/**
 * What the registry itself says. Dependencies are read from `registry.json`; the licence is
 * shown as declared, and when the item declares none that is stated rather than guessed — the
 * one fact an installer screen most wants to get right and cannot verify from here.
 */
function RegistryFacts({ info }) {
  if (!info.found) {
    return (
      <p className="text-xs text-destructive">
        Names a registry item (<code>{info.item}</code>) that is not in this repository&apos;s registry.
      </p>
    )
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      <dt className="text-muted-foreground">Registry</dt>
      <dd className="font-mono">{info.item}</dd>
      <dt className="text-muted-foreground">Needs</dt>
      <dd className="font-mono">{info.dependencies.length ? info.dependencies.join(', ') : 'nothing extra'}</dd>
      <dt className="text-muted-foreground">Licence</dt>
      <dd>
        {info.license ?? 'Not declared by the registry item. See LICENSES/ in this repository.'}
      </dd>
    </dl>
  )
}

/**
 * The placed components, with ordering, removal and a generated editor for the selected one.
 *
 * @param {{
 *   instances: readonly import('@/features/builder/instances').ComponentInstance[],
 *   selectedId: string|null,
 *   onSelect: (id: string|null) => void,
 *   onChange: (next: readonly import('@/features/builder/instances').ComponentInstance[]) => void,
 * }} props
 */
export function ComponentsInspector({ instances, selectedId, onSelect, onChange }) {
  // What the last edit had to adjust ("raised to 0.4"). Kept briefly so a change the validator
  // made is visible once, instead of the value silently snapping.
  const [adjusted, setAdjusted] = useState([])

  const resolved = instances.map((instance) => resolveInstance(instance, getManifest))
  const selected = resolved.find((entry) => entry.instance.id === selectedId)

  const edit = (patch) => {
    if (!selected || selected.status !== 'ok') return
    const { list, issues } = updateProps(instances, selected.instance.id, patch, selected.manifest)
    onChange(list)
    setAdjusted(issues.filter((issue) => issue.level === 'warning' || issue.level === 'error'))
  }

  const titleOf = (entry) =>
    entry.status === 'ok' ? entry.manifest.title : `Unknown: ${entry.instance.component}`

  return (
    <>
      <Section
        title="On the page"
        description={
          instances.length === 0
            ? 'Nothing placed yet. Add a component below.'
            : 'In the order they appear.'
        }
      >
        <ul className="flex flex-col gap-1">
          {resolved.map((entry, index) => {
            const label = titleOf(entry)
            const isSelected = entry.instance.id === selectedId
            return (
              <li
                key={entry.instance.id}
                className={`flex items-center gap-1 rounded-lg border p-1.5 ${isSelected ? 'border-sky-500 bg-sky-500/5' : ''}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setAdjusted([])
                    onSelect(isSelected ? null : entry.instance.id)
                  }}
                >
                  {label}
                  {!(entry.status === 'ok' && entry.renderable) && (
                    <span className="ml-2 font-mono text-[0.6875rem] text-destructive">not shown</span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  onClick={() => onChange(moveInstance(instances, entry.instance.id, -1))}
                  aria-label={`Move ${label} up`}
                >
                  <ChevronUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === resolved.length - 1}
                  onClick={() => onChange(moveInstance(instances, entry.instance.id, 1))}
                  aria-label={`Move ${label} down`}
                >
                  <ChevronDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    if (isSelected) onSelect(null)
                    onChange(removeInstance(instances, entry.instance.id))
                  }}
                  aria-label={`Remove ${label}`}
                >
                  <Trash2Icon />
                </Button>
              </li>
            )
          })}
        </ul>
      </Section>

      {selected && selected.status !== 'ok' && (
        <Section title={titleOf(selected)}>
          <Note tone="error">{selected.issues[0]?.message}</Note>
        </Section>
      )}

      {selected && selected.status === 'ok' && (
        <Section title={selected.manifest.title} description={selected.manifest.description}>
          <InstanceControls manifest={selected.manifest} props={selected.props} onChange={edit} />

          {!selected.renderable && (
            <Note tone="warning">
              This is not shown on your page until the required fields above are filled in.
            </Note>
          )}
          {[...new Set([...adjusted, ...selected.issues].map((issue) => issue.message))].map((message) => (
            <Note key={message} tone="warning">{message}</Note>
          ))}
          {selected.migrated && (
            <Note>
              Saved with an older version of this component. It is shown upgraded, and is rewritten
              the next time you change something.
            </Note>
          )}
        </Section>
      )}
    </>
  )
}

/** Add a freshly created instance of a component to the end of the list. */
export function addComponent(instances, manifest) {
  const instance = createInstance(manifest)
  return { list: addInstance(instances, instance), instance }
}
