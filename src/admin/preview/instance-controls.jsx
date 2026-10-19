'use client'

/**
 * The inspector's controls for one component instance, generated from its manifest.
 *
 * Nothing here knows about any particular component. It walks `manifest.props` and draws the
 * input each control type calls for, so a new component with a manifest gets an inspector for
 * free, and — more to the point — every input drawn here corresponds to a declared, validated
 * property that the renderer reads. There is no way to put a control on screen that is not in
 * the manifest, which is what keeps "every visible control changes the real component" true by
 * construction rather than by discipline.
 *
 * A component that needs more than a flat list (`manifest.inspector`) replaces all of this with
 * its own editor and receives the same `props` / `onChange` contract.
 *
 * Values arrive already validated (the caller resolves the instance first), and edits leave as
 * `onChange({ [name]: value })`. The caller validates again before saving; this component does
 * not try to enforce the rules itself, so the rules live in exactly one place (`validate.ts`).
 *
 * @module admin/preview/instance-controls
 */

import { useId } from 'react'

import { Input } from '@/components/ui/input'

import { Field, Note, SelectField, TextArea, TextField, Toggle } from '../fields.jsx'

/** Radix `Select` cannot hold an empty string as a value, so "no override" gets a stand-in. */
const NONE = '__none__'
const CUSTOM = '__custom__'

/**
 * @param {{
 *   manifest: import('@/features/builder/registry').AnyManifest,
 *   props: Record<string, unknown>,
 *   onChange: (patch: Record<string, unknown>) => void,
 * }} props
 */
export function InstanceControls({ manifest, props, onChange }) {
  if (manifest.inspector) {
    const Custom = manifest.inspector
    return <Custom props={props} onChange={onChange} />
  }

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(manifest.props).map(([name, control]) => (
        <ControlField
          key={name}
          control={control}
          value={props[name]}
          onChange={(value) => onChange({ [name]: value })}
        />
      ))}
    </div>
  )
}

/**
 * One control. Exhaustive over the control types the validator knows; an unknown type renders a
 * visible notice rather than nothing, because a missing input is the quiet version of a dead
 * setting.
 */
function ControlField({ control, value, onChange }) {
  switch (control.type) {
    case 'text':
      return control.multiline ? (
        <TextArea
          label={control.label}
          help={control.help}
          value={value}
          placeholder={control.placeholder}
          rows={3}
          onChange={onChange}
        />
      ) : (
        <TextField
          label={control.label}
          help={control.help}
          value={value}
          placeholder={control.placeholder}
          onChange={onChange}
        />
      )

    case 'number':
      return <NumberField control={control} value={value} onChange={onChange} />

    case 'range':
      return <RangeField control={control} value={value} onChange={onChange} />

    case 'boolean':
      return <Toggle label={control.label} help={control.help} checked={value} onChange={onChange} />

    case 'select':
      return (
        <SelectField
          label={control.label}
          help={control.help}
          value={String(value)}
          options={control.options}
          onChange={onChange}
        />
      )

    case 'color':
      return <ColorField control={control} value={value} onChange={onChange} />

    case 'link':
      return (
        <TextField
          label={control.label}
          help={control.help ?? 'https://, mailto:, a path starting with /, or #anchor.'}
          value={value}
          placeholder="https://"
          onChange={onChange}
        />
      )

    default:
      return <Note tone="warning">This control type is not supported by the inspector yet.</Note>
  }
}

function NumberField({ control, value, onChange }) {
  const id = useId()
  return (
    <Field label={control.label} help={control.help} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={control.min}
        max={control.max}
        step={control.step ?? (control.integer ? 1 : 'any')}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          // An empty or half-typed box is not a number; keep the last good one rather than
          // saving NaN, which the validator would only throw back out.
          const next = event.target.valueAsNumber
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </Field>
  )
}

/**
 * A native range input. Deliberately not a custom slider: the platform control is keyboard
 * operable, announces its value, and honours `min`/`max`/`step` without any code of ours — so it
 * cannot disagree with the validator about what is allowed, because both read the same bounds.
 */
function RangeField({ control, value, onChange }) {
  const id = useId()
  const shown = `${value}${control.unit ? ` ${control.unit}` : ''}`
  return (
    <Field label={control.label} help={control.help} htmlFor={id}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          className="h-2 min-w-0 flex-1 accent-primary"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          aria-valuetext={shown}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
        <output htmlFor={id} className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {shown}
        </output>
      </div>
    </Field>
  )
}

/**
 * A theme colour or a fixed one.
 *
 * Theme colours come first and are the default path: they follow light and dark mode, where a
 * fixed `#rrggbb` is frozen. The custom option exists because it is sometimes what someone
 * wants, and only appears if the manifest allows it.
 */
function ColorField({ control, value, onChange }) {
  const id = useId()
  const isToken = typeof value === 'string' && value.startsWith('token:')
  const isCustom = typeof value === 'string' && value.startsWith('#')
  const selected = isCustom ? CUSTOM : isToken ? value : NONE

  const options = [
    { value: NONE, label: 'Theme default' },
    ...control.tokens.map((token) => ({ value: `token:${token}`, label: token.replace(/-/g, ' ') })),
    ...(control.allowCustom === false ? [] : [{ value: CUSTOM, label: 'Custom colour…' }]),
  ]

  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={control.label}
        help={control.help}
        value={selected}
        options={options}
        onChange={(next) => {
          if (next === NONE) onChange('')
          else if (next === CUSTOM) onChange(isCustom ? value : '#6366f1')
          else onChange(next)
        }}
      />
      {isCustom && (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="color"
            aria-label={`${control.label}, custom colour`}
            className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
            // `type=color` only understands #rrggbb; a short or alpha value is shown as its
            // opaque six-digit form and written back in that form on change.
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#6366f1'}
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="font-mono text-xs text-muted-foreground">{value}</span>
        </div>
      )}
    </div>
  )
}
