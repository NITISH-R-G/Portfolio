import { TECH_STACK } from "../data/tech-stack"
import type { TechStack as TechStackType } from "../types/tech-stack"
import { Panel, PanelHeader, PanelTitle } from "./panel"
import { PanelTitleCopy } from "./panel-title-copy"

const ID = "stack"

export function TechStack({ items = TECH_STACK }: { items?: TechStackType[] }) {
  return (
    <Panel id={ID}>
      <PanelHeader>
        <PanelTitle>
          <a href={`#${ID}`}>Stack</a>
          <PanelTitleCopy id={ID} />
        </PanelTitle>
      </PanelHeader>

      <div className="relative [--badge-height:--spacing(6)] [--col-left-width:--spacing(48)]">
        <div
          className="pointer-events-none absolute inset-y-0 left-(--col-left-width) -z-1 w-px border-r border-dashed border-line max-sm:hidden"
          aria-hidden
        />

        {Object.entries(groupByCategory(items)).map(
          ([category, items], index) => {
            const categoryId = `${ID}-${category
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}`

            return (
              <div
                key={category}
                className="grid items-start gap-y-2 border-b border-line py-4 last:border-none sm:grid-cols-[var(--col-left-width)_1fr]"
              >
                <div id={categoryId} className="pl-4 text-sm/(--badge-height)">
                  <span
                    className="mr-1.5 font-mono text-muted-foreground/80 select-none"
                    aria-hidden
                  >
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  {category}
                </div>

                <ul
                  aria-labelledby={categoryId}
                  className="flex flex-wrap gap-1.5 px-4"
                >
                  {items.map((item) => {
                    /**
                     * Upstream every entry has a homepage, so the pill is always an anchor. Ours
                     * are derived from connector evidence and most have no URL — and an anchor
                     * with `href=""` links to the page it is already on, which reads as a broken
                     * link to anyone who clicks it and to a screen reader that announces it. So
                     * a pill without a URL is a span: same classes, same look, no false link.
                     */
                    const className =
                      "flex h-(--badge-height) items-center justify-center gap-1.25 rounded-full bg-zinc-50/80 px-2 font-mono text-xs text-foreground inset-ring-1 inset-ring-border dark:bg-zinc-900/80 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground/80"

                    return (
                      <li key={item.key} className="flex">
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener"
                            className={className}
                          >
                            {item.icon}
                            {item.title}
                          </a>
                        ) : (
                          <span className={className}>
                            {item.icon}
                            {item.title}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          }
        )}
      </div>
    </Panel>
  )
}

function groupByCategory(
  items: TechStackType[]
): Record<string, TechStackType[]> {
  return items.reduce<Record<string, TechStackType[]>>((acc, item) => {
    for (const category of item.categories) {
      ;(acc[category] ??= []).push(item)
    }
    return acc
  }, {})
}
