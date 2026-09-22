'use client'

/**
 * The list-and-fields half of a record editor.
 *
 * Shared by the experience, education, certification and award panels — not because those are
 * "the same thing", but because selecting a record, reordering it, hiding it and reverting it
 * are the same four actions in every one of them, and writing that plumbing four times is how
 * three of the four end up subtly different. What is *not* shared is the field list and the
 * preview: each panel names the fields its own component reads, and previews that component.
 *
 * @module admin/preview/record-editor
 */

import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  Undo2Icon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { recordKey } from '../../core/schema/merge.js'
import { TextArea, TextField } from '../fields.jsx'
import { Section } from './editor-layout.jsx'

export function useRecordSelection(builder, collection, selectedId) {
  const records = builder.built.profile[collection] ?? []
  const selected =
    records.find((record) => recordKey(collection, record) === selectedId) ?? records[0]
  return {
    records,
    selected,
    activeId: selected ? recordKey(collection, selected) : null,
    hiddenIds: builder.overrides.hidden?.[collection] ?? [],
  }
}

export function RecordList({
  builder,
  collection,
  records,
  activeId,
  onSelect,
  label,
  title = (record) => record.name ?? record.title ?? '(untitled)',
}) {
  const { overrides, toggleHidden, move } = builder

  return (
    <Section title={label} description={`${records.length} in render order.`}>
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
        {records.map((record, index) => {
          const id = recordKey(collection, record)
          return (
            <li key={id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={id === activeId ? 'true' : undefined}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  id === activeId
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {title(record)}
                {overrides.records?.[collection]?.[id] && (
                  <span className="ml-1.5 font-mono text-[0.65rem] text-muted-foreground">
                    edited
                  </span>
                )}
              </button>

              <Button
                variant="ghost"
                size="icon-xs"
                disabled={index === 0}
                onClick={() => move(collection, id, -1)}
                aria-label="Move up"
              >
                <ChevronUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={index === records.length - 1}
                onClick={() => move(collection, id, 1)}
                aria-label="Move down"
              >
                <ChevronDownIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => toggleHidden(collection, id)}
                aria-label="Hide"
                title="Hide from the portfolio"
              >
                <EyeOffIcon />
              </Button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

export function HiddenList({ builder, collection, hiddenIds }) {
  if (!hiddenIds.length) return null
  return (
    <Section
      title="Hidden"
      description="Not rendered, and excluded from the counts in your stats."
    >
      <ul className="flex flex-col gap-1">
        {hiddenIds.map((id) => (
          <li key={id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {id}
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="gap-1"
              onClick={() => builder.toggleHidden(collection, id)}
            >
              <EyeIcon />
              Show
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/**
 * The fields for one record.
 *
 * `fields` is a list of `{ key, label, type, help, placeholder }`. `type` may be `text`, `url`,
 * `textarea` or `list` — `list` edits a string array as comma-separated text, which is how
 * technologies, courses and highlights are stored.
 */
export function RecordFields({ builder, collection, record, id, fields, title }) {
  const { overrides, patchRecord, revert } = builder
  const edited = Boolean(overrides.records?.[collection]?.[id])
  const patch = (values) => patchRecord(collection, id, values)

  return (
    <Section title={title ?? 'Details'}>
      {fields.map((field) => {
        const value = getIn(record, field.key)

        if (field.type === 'textarea') {
          return (
            <TextArea
              key={field.key}
              label={field.label}
              rows={field.rows ?? 4}
              help={field.help}
              value={value ?? ''}
              onChange={(next) => patch(setIn(record, field.key, next))}
            />
          )
        }

        if (field.type === 'list') {
          return (
            <TextField
              key={field.key}
              label={field.label}
              help={field.help ?? 'Comma-separated.'}
              value={(value ?? []).join(', ')}
              onChange={(next) =>
                patch(
                  setIn(
                    record,
                    field.key,
                    next
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  ),
                )
              }
            />
          )
        }

        return (
          <TextField
            key={field.key}
            label={field.label}
            type={field.type ?? 'text'}
            help={field.help}
            placeholder={field.placeholder}
            value={value ?? ''}
            onChange={(next) => patch(setIn(record, field.key, next))}
          />
        )
      })}

      {edited && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 self-start"
          onClick={() => revert(collection, id)}
        >
          <Undo2Icon />
          Revert to imported values
        </Button>
      )}
    </Section>
  )
}

/**
 * Dotted paths, so a field can name `dates.start.iso` without every panel growing its own
 * nesting logic.
 *
 * `setIn` takes the record because `patchRecord` merges shallowly: writing `{ dates: { start } }`
 * would replace the whole `dates` object and silently drop `end` and `current`. So each level is
 * spread over what is already there, and editing a start date leaves the end date alone.
 */
function getIn(record, key) {
  return key.split('.').reduce((value, part) => (value == null ? value : value[part]), record)
}

function setIn(record, key, value) {
  const [head, ...rest] = key.split('.')
  if (!rest.length) return { [head]: value }
  const child = record?.[head] ?? {}
  return { [head]: { ...child, ...setIn(child, rest.join('.'), value) } }
}
