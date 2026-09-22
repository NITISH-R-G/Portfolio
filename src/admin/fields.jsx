/**
 * The admin's form controls, built on the source design system.
 *
 * Every control here wraps a component from `src/components/ui` — his shadcn primitives, the
 * same ones the public portfolio uses. That is deliberate and is the point of this file: the
 * panels import from here and nowhere else, so rebuilding this module on his primitives moved
 * the whole admin onto his design system without touching a single panel.
 *
 * The previous version rendered bare elements against hand-written classes in `admin.css`. That
 * stylesheet is gone; nothing below references it.
 *
 * @module admin/fields
 */

import { useId } from 'react'
import { InfoIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { WorkbenchHeadingProvider } from './preview/editor-layout.jsx'

/**
 * How each state reads, and how loudly.
 *
 * Only `missing` is tinted. The other three are all *correct* states — a value can be imported,
 * configured or overridden and be exactly right — so colouring them would turn a provenance
 * label into a severity signal and teach people to clear the yellow ones.
 */
const STATE_TONE = {
  imported: 'text-muted-foreground',
  configured: 'text-muted-foreground',
  overridden: 'text-muted-foreground',
  missing: 'text-muted-foreground/70',
  default: 'text-muted-foreground/70',
}

/**
 * Where a field's value came from, in three or four words.
 *
 * The engine has tracked layers and provenance since the beginning, and none of it was visible
 * in the editor: every field looked identical whether it had been imported from GitHub, written
 * in the config file, or typed over the top. That is the difference between "I can change this"
 * and "I do not know what I am about to lose", and it is the whole reason the claims model
 * exists — so it belongs on the label, not in a separate provenance screen nobody opens.
 *
 * Built from `fieldState`/`presentationState` in `core/identity/explain.js`, which read the
 * resolver's own ranking. This renders that decision; it never makes one.
 *
 * @param {{state: import('@/core/identity/explain.js').FieldState}} props
 */
export function StateBadge({ state }) {
  if (!state) return null

  // Naming the source is the useful half — "Imported" alone still leaves you guessing which of
  // eleven connected platforms said it.
  const text = state.source && state.state === 'imported'
    ? `${state.label} from ${state.source}`
    : state.label

  return (
    <span
      className={cn(
        'shrink-0 font-mono text-[0.625rem] tracking-wide uppercase select-none',
        STATE_TONE[state.state] ?? 'text-muted-foreground',
      )}
      // The underlying value is the answer to "what happens if I press Revert", which is the
      // question the button itself cannot answer. Kept as a title rather than always-on text:
      // it matters at the moment of hesitating, and would be noise on every other field.
      title={state.underlying ? `Reverting restores: ${state.underlying}` : undefined}
    >
      {text}
    </span>
  )
}

/**
 * One labelled control.
 *
 * `overridden` marks a value the user has changed away from what the sources imported, and
 * `onRevert` puts it back — the pair is what keeps "edited by me" distinguishable from
 * "imported", which is the whole reason this engine tracks provenance.
 */
export function Field({ label, help, children, overridden, onRevert, htmlFor, state }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          <StateBadge state={state} />
        </Label>
        {overridden && onRevert && (
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 text-muted-foreground"
            onClick={onRevert}
            title="Revert to the imported value"
          >
            <Undo2Icon />
            Revert
          </Button>
        )}
      </div>
      {children}
      {help && <p className="text-xs text-pretty text-muted-foreground">{help}</p>}
    </div>
  )
}

export function TextField({
  label, value, onChange, placeholder, help, type = 'text', overridden, onRevert, state,
}) {
  const id = useId()
  return (
    <Field label={label} help={help} overridden={overridden} onRevert={onRevert} htmlFor={id} state={state}>
      <Input
        id={id}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

export function TextArea({
  label, value, onChange, placeholder, help, rows = 4, overridden, onRevert, state,
}) {
  const id = useId()
  return (
    <Field label={label} help={help} overridden={overridden} onRevert={onRevert} htmlFor={id} state={state}>
      <Textarea
        id={id}
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

export function SelectField({ label, value, onChange, options, help }) {
  const id = useId()
  return (
    <Field label={label} help={help} htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

/**
 * A boolean.
 *
 * His primitives have no switch, so this is his `Toggle` semantics expressed with a native
 * checkbox — which keeps the control keyboard-operable and announced correctly without
 * inventing a component he does not have.
 */
export function Toggle({ label, checked, onChange, help }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3 py-1.5">
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {help && <p className="text-xs text-pretty text-muted-foreground">{help}</p>}
      </div>
    </div>
  )
}

/**
 * Three states: inherit, on, off.
 *
 * "Inherit" is not the same as "off" — it means the section has not been decided and the
 * generator's own judgement applies. Collapsing the two would make an auto-hidden section
 * indistinguishable from one the owner deliberately hid.
 */
export function TriState({ value, onChange, disabled }) {
  const states = [
    { value: undefined, label: 'Auto' },
    { value: true, label: 'Show' },
    { value: false, label: 'Hide' },
  ]
  return (
    <div className="inline-flex items-center rounded-lg border border-border p-0.5" role="group">
      {states.map((state) => (
        <button
          key={String(state.label)}
          type="button"
          disabled={disabled}
          aria-pressed={value === state.value}
          onClick={() => onChange(state.value)}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-medium transition-colors',
            'disabled:pointer-events-none disabled:opacity-50',
            value === state.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {state.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A titled group of controls.
 *
 * Two modes. A plain panel renders its own heading, which is right for the surfaces that are
 * genuinely documents — connecting a source, reading import health, publishing — where there is
 * no component to preview and a heading is the only thing naming the page.
 *
 * `workbench` is for the editors that render the real portfolio. There the heading moves into
 * the inspector, because `LineNav` already names the section and a second title above the canvas
 * is duplicated navigation. Nothing else about the panel changes, which is why this is a flag
 * rather than a different component.
 */
export function Panel({ title, description, workbench, children }) {
  if (workbench) {
    return (
      <WorkbenchHeadingProvider title={title} description={description}>
        {children}
      </WorkbenchHeadingProvider>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && <h2 className="font-heading text-xl font-medium tracking-tight">{title}</h2>}
          {description && (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * `warn` and `error` are accepted alongside `warning` because the older panels spell it those
 * ways. Silently treating them as `info` is how a warning ends up looking like a footnote.
 */
const ALERT_TONES = new Set(['warning', 'warn', 'error'])

export function Note({ tone = 'info', children }) {
  const alert = ALERT_TONES.has(tone)
  return (
    <div
      role={alert ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        alert
          ? 'border-destructive/30 bg-destructive/5 text-foreground'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      {alert ? (
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <div className="text-pretty [&_a]:underline [&_code]:font-mono [&_code]:text-xs">
        {children}
      </div>
    </div>
  )
}

/** Two columns from `sm` up; one below, so nothing is half a field wide on a phone. */
export function Grid({ children }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}

export { Separator }
