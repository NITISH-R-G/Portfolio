"use client"

import { useMemo, useState } from "react"
import { ArrowUpRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { SHOWCASE } from "@/features/portfolio/data/adapter"
import type { ShowcaseItem } from "@/features/portfolio/data/adapter"

import { Panel, PanelHeader, PanelTitle, PanelTitleSup } from "../panel"
import { PanelTitleCopy } from "../panel-title-copy"
import { ProjectPreview } from "../projects/project-preview"

const ID = "showcase"
const ALL = "All"

/**
 * Deployed projects, shown large.
 *
 * This is his Blocks section pointed at the owner's own work. The chrome is his and unchanged —
 * the panel header, the two-column grid with the border guides running behind it, the hover
 * wash, the heading-and-description block — because that layout is what makes a catalogue read
 * as a catalogue. What differs is what fills each card: `BlockItem` renders a mockup component
 * keyed by registry name and links into `/blocks/...`, neither of which exists for someone's
 * deployed SaaS, so the card holds `ProjectPreview` and links to the deployment.
 *
 * `ProjectPreview` is reused rather than reimplemented, which is what keeps the security
 * property intact: whether a site may be framed was decided at build time by reading its own
 * headers, a refusal shows the fallback and a link, and nothing here tries to get around it.
 * The frame is 16/10 with the same dotted backdrop as `MockupFrame`, so the two read alike.
 *
 * Nothing about this component knows whose portfolio it is. Every item comes from projects the
 * owner marked `showcase: true`; an engine user with none sees no section at all.
 */
export function Showcase({ items = SHOWCASE }: { items?: ShowcaseItem[] }) {
  /**
   * The categories the owner actually used, in the order their projects appear.
   *
   * His own `blockCategories` is a fixed list because his blocks are a fixed catalogue. A
   * portfolio's are whatever its owner typed, so they are derived — which also means the filter
   * cannot offer a category with nothing behind it.
   */
  const categories = useMemo(() => {
    const seen: string[] = []
    for (const item of items) {
      if (!seen.includes(item.category)) seen.push(item.category)
    }
    return seen
  }, [items])

  const [active, setActive] = useState(ALL)

  if (items.length === 0) return null

  // One category is not a choice, and a filter offering "All" and the only answer is noise.
  const showFilter = categories.length > 1
  const shown =
    showFilter && active !== ALL
      ? items.filter((item) => item.category === active)
      : items

  return (
    <Panel id={ID}>
      <PanelHeader>
        <PanelTitle>
          <a href={`#${ID}`}>Showcase</a>
          <PanelTitleSup>({items.length})</PanelTitleSup>
          <PanelTitleCopy id={ID} />
        </PanelTitle>
      </PanelHeader>

      {showFilter && (
        // His `BlocksNav`, to the class: a scrolling row of mono uppercase entries divided by
        // the line rule, the current one washed with `accent-muted`. His navigates between
        // routes because his catalogue is paginated by category; this filters in place, because
        // a portfolio section has nowhere to navigate to.
        <div className="no-scrollbar scroll-fade-x screen-line-bottom overflow-x-auto">
          <nav
            className="flex w-max items-center pr-2 whitespace-nowrap"
            aria-label="Filter the showcase by category"
          >
            {[ALL, ...categories].map((category) => (
              <button
                key={category}
                type="button"
                aria-current={category === active ? "page" : undefined}
                onClick={() => setActive(category)}
                className="border-r border-line p-4 font-mono text-[.8125rem]/4 font-medium tracking-wide text-muted-foreground uppercase transition-[color,background-color] ease-out hover:bg-accent-muted aria-[current=page]:bg-accent-muted aria-[current=page]:text-foreground"
              >
                {category}
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="relative py-4">
        {/* His guide lines, sitting behind the grid rather than bordering the cards. */}
        <div
          className="pointer-events-none absolute inset-0 -z-1 grid grid-cols-1 gap-4 max-sm:hidden sm:grid-cols-2"
          aria-hidden
        >
          <div className="border-r border-line" />
          <div className="border-l border-line" />
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shown.map((item, index) => (
            <li
              key={item.id}
              className={cn(
                "max-sm:screen-line-top max-sm:screen-line-bottom",
                "sm:nth-[2n+1]:screen-line-top sm:nth-[2n+1]:screen-line-bottom"
              )}
            >
              <ShowcaseCard item={item} index={index} />
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

/**
 * One card, in his `BlockItem` layout.
 *
 * The heading is not the whole-card link `BlockItem` uses. That component covers its card with
 * an absolutely-positioned anchor, which works when the card is an inert mockup and does not
 * when the card contains a button the visitor has to press to load the preview — the overlay
 * would swallow the click. So the title is an ordinary link and the card is not one.
 */
function ShowcaseCard({ item, index }: { item: ShowcaseItem; index: number }) {
  return (
    <div className="group/showcase flex h-full flex-col gap-2 p-2 transition-[background-color] ease-out hover:bg-accent-muted">
      <ProjectPreview
        url={item.url}
        title={item.title}
        screenshot={item.screenshot}
        embeddable={item.embeddable}
        blockedReason={item.blockedReason}
        // The first two are what a visitor sees without scrolling; the rest can wait.
        className={index < 2 ? undefined : "content-visibility-auto"}
      />

      <div className="flex flex-col gap-1 p-2">
        <h3 className="text-lg leading-snug font-medium text-balance">
          <a className="link-underline" href={item.url} target="_blank" rel="noopener">
            {item.title}
            <ArrowUpRightIcon
              className="ml-0.5 inline size-4 align-baseline"
              aria-hidden
            />
          </a>
        </h3>

        {item.description && (
          <p className="text-sm text-pretty text-muted-foreground">{item.description}</p>
        )}

        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-xs tracking-wide text-muted-foreground/80 uppercase">
            {item.category}
          </span>
          {item.sourceUrl && (
            <a
              className="font-mono text-xs text-muted-foreground link-underline"
              href={item.sourceUrl}
              target="_blank"
              rel="noopener"
            >
              Source
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
