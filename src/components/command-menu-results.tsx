"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AwardIcon,
  BoxIcon,
  BriefcaseBusinessIcon,
  FileTextIcon,
  GraduationCapIcon,
  LayersIcon,
  SearchIcon,
} from "lucide-react"

import { CommandGroup, CommandItem } from "@/components/ui/command"
import { useSearch } from "@/hooks/useSearch"

/**
 * Portfolio results inside his command menu.
 *
 * The menu itself is unchanged — his dialog, his input, his groups, his footer. This adds one
 * group above them, fed by the engine's own ranker (`@portfolio-engine/agent`, the same code the
 * npm package exposes), so what a reader types into Cmd-K searches the portfolio's actual
 * records rather than only the fixed list of links.
 *
 * ## Why the values carry the query
 *
 * cmdk filters its items by scoring `value` against what was typed, and his menu relies on that
 * for its own groups. Semantic results are the opposite case: "what did they build with
 * postgres" should surface a project whose visible text contains none of those words, and cmdk
 * would score it zero and drop it. Rather than turning filtering off — which would break every
 * group he wrote — each result's `value` is prefixed with the raw query, so cmdk always keeps it
 * and our ranking decides the order. His groups keep filtering exactly as before.
 *
 * ## Why it degrades quietly
 *
 * The index and the embedding model are fetched on first use. Before they arrive there are no
 * results and the menu is his menu; when the index lands, lexical results appear; when the
 * weights land, semantic ones replace them. A reader is never shown a spinner for a search they
 * did not ask for, and if the weights never arrive the lexical results simply stand — from the
 * reader's side nothing is missing, so nothing claims to be.
 */

/**
 * Keyed on the engine's collection names, which is what `SearchResult.type` carries — see the
 * typedef in `packages/agent/src/search.js`. A type with no entry falls back to the search glyph
 * rather than to a wrong one.
 */
const ICONS: Record<string, React.ReactNode> = {
  projects: <BoxIcon />,
  experience: <BriefcaseBusinessIcon />,
  education: <GraduationCapIcon />,
  skills: <LayersIcon />,
  certifications: <AwardIcon />,
  achievements: <AwardIcon />,
  publications: <FileTextIcon />,
}

/** The agent's own result shape, narrowed to what this list renders. */
export type SearchResult = {
  id: string
  type: string
  title: string
  subtitle?: string
  url?: string
}

export function CommandMenuResults({
  query,
  open,
  onSelect,
}: {
  query: string
  open: boolean
  onSelect: (result: SearchResult) => void
}) {
  const { prepare, ready, search, semanticSearch } = useSearch()

  // Build the index the first time the dialog opens, not on page load: nobody has searched yet
  // when the page paints, and the ranker has no business in that critical path.
  useEffect(() => {
    if (open) prepare()
  }, [open, prepare])

  const trimmed = query.trim()
  const active = ready && trimmed.length >= 2

  /**
   * Lexical results, computed during render rather than pushed into state from an effect.
   *
   * `search` is synchronous and pure once the index exists, so there is nothing to synchronise —
   * deriving it means the list is correct on the same paint as the keystroke, with no
   * intermediate render showing the previous query's results.
   */
  const lexical = useMemo(
    () => (active ? (search(trimmed) as SearchResult[]) : []),
    [active, trimmed, search]
  )

  /**
   * The semantic pass, which genuinely is asynchronous — it may have to fetch model weights.
   *
   * Stored with the query it answered, so a slow response for an old query cannot replace a
   * newer one's results: the guard is a value comparison rather than a cancellation flag, which
   * also survives the effect re-running for an unrelated reason.
   */
  const [semantic, setSemantic] = useState<{ query: string; results: SearchResult[] }>({
    query: "",
    results: [],
  })

  useEffect(() => {
    if (!active) return
    let live = true
    semanticSearch(trimmed).then((better) => {
      if (!live || !Array.isArray(better) || !better.length) return
      setSemantic({ query: trimmed, results: better as SearchResult[] })
    })
    return () => {
      live = false
    }
  }, [active, trimmed, semanticSearch])

  const items = useMemo(() => {
    const best = semantic.query === trimmed && semantic.results.length ? semantic.results : lexical
    return best.slice(0, 8)
  }, [semantic, trimmed, lexical])

  if (!items.length) return null

  return (
    <CommandGroup heading="Portfolio results">
      {items.map((result, index) => (
        <CommandItem
          key={result.id ?? `${result.type}-${index}`}
          // See the note above: the query prefix is what keeps cmdk from filtering out a
          // semantically-matched result whose text does not contain the words typed.
          value={`${query} ${result.title} ${result.id ?? index}`}
          onSelect={() => onSelect(result)}
        >
          {ICONS[result.type] ?? <SearchIcon />}

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{result.title}</span>
            {result.subtitle && (
              <span className="truncate text-xs text-muted-foreground">
                {result.subtitle}
              </span>
            )}
          </span>

          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {result.type}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
