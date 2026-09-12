'use client'

/**
 * The presentation Connect and Sources share.
 *
 * The logic lives next door in `source-catalogue.js`; this is only the parts that draw. They are
 * separated because the interesting claims — which categories exist, what a search finds, what
 * action a platform may offer — are decidable without a renderer, and the engine's test runner
 * cannot load JSX.
 *
 * The visual language is his. Rows are separated by `border-line`, metadata is mono and small,
 * status is a dot rather than a coloured pill, and nothing is boxed unless it floats. The admin
 * has to read as the same product as the portfolio it edits.
 *
 * @module admin/panels/source-ui
 */

import { cn } from '@/lib/utils'

import Icon from '../icon.jsx'

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * His category nav.
 *
 * `BlocksNav` to the class — a horizontally scrolling row of mono uppercase entries divided by
 * the line rule, the current one washed with `accent-muted`, the overflow faded rather than cut.
 * His navigates between routes because his catalogue is paginated; this filters in place,
 * because a panel has nowhere to navigate to.
 */
export function CategoryNav({ value, onChange, groups, allLabel = 'All', allCount }) {
  return (
    // The rule sits on a wrapper, never on the scroller. `screen-line-bottom` draws a full-bleed
    // `200vw` pseudo-element, and inside `overflow-x-auto` that width is counted as scrollable
    // content — which pushed the whole page sideways. His own `BlocksNav` keeps the two apart for
    // the same reason.
    <div className="screen-line-bottom">
      <div className="no-scrollbar scroll-fade-x overflow-x-auto">
        <nav className="flex w-max items-center pr-2 whitespace-nowrap" aria-label="Filter by category">
          {[{ id: '', label: allLabel, count: allCount }, ...groups].map((group) => (
            <button
              key={group.id || 'all'}
              type="button"
              aria-current={group.id === value ? 'page' : undefined}
              onClick={() => onChange(group.id)}
              className="border-r border-line px-4 py-3 font-mono text-[.8125rem]/4 font-medium tracking-wide text-muted-foreground uppercase transition-[color,background-color] ease-out hover:bg-accent-muted aria-[current=page]:bg-accent-muted aria-[current=page]:text-foreground"
            >
              {group.label}
              {typeof group.count === 'number' && (
                <span className="ml-1.5 text-muted-foreground/60 tabular-nums">{group.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

/** The tones the health model already uses, mapped onto his colour tokens. */
const TONE_CLASS = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-destructive',
  info: 'bg-sky-500',
  muted: 'bg-muted-foreground/40',
}

/**
 * Status as a dot, not a badge.
 *
 * A row of coloured pills is the generic-dashboard look the admin is specifically not. A dot
 * carries the same three states at a fraction of the weight, and the word beside it does the
 * actual telling.
 */
export function StatusDot({ tone = 'muted', className }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-1.5 shrink-0 rounded-full', TONE_CLASS[tone] ?? TONE_CLASS.muted, className)}
    />
  )
}

/** A platform mark, in his icon-tile proportions. */
export function SourceMark({ name, className }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <Icon name={name || 'Link'} size={15} />
    </span>
  )
}

/**
 * The mono metadata line both panels use under a title.
 *
 * Separated by a middot rather than boxed, because these are facts about the row above them
 * rather than fields in their own right.
 */
export function Meta({ items, className }) {
  const shown = items.filter(Boolean)
  if (!shown.length) return null
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground', className)}>
      {shown.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden className="text-muted-foreground/40">·</span>}
          {item}
        </span>
      ))}
    </p>
  )
}
