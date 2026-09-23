"use client"

import { useMediaQuery } from "@/hooks/use-media-query"
import { TOCMinimap } from "@/components/toc-minimap"

type TocItem = { title: string; url: string; depth: number }

/**
 * His section minimap, in the right margin on wide screens.
 *
 * Upstream this file hard-coded his own page's anchors — Components, Blog, Sponsors, Bookmarks —
 * and nothing rendered it, so the `layout.navigation: 'minimap'` setting it stood for did
 * nothing. The items are now the page's own sections (`toTocItems`), passed in by the page, so
 * the minimap always names what is actually there.
 *
 * Only where the margin can hold it: below 64rem the column fills the width and a fixed rail
 * would sit on the content. It is a navigation aid, never the only way to a section — every
 * entry is also a heading in the page.
 */
export function TOC({ items }: { items: TocItem[] }) {
  const isDesktop = useMediaQuery("(min-width: 64rem)")

  if (!isDesktop || items.length < 2) {
    return null
  }

  return (
    <nav
      aria-label="Sections"
      className="fixed top-[calc(var(--header-height)+--spacing(3)+1px)] right-0 z-50"
    >
      <TOCMinimap
        items={items}
        options={{
          threshold: 0,
          rootMargin: "-20% 0% -60% 0%",
        }}
      />
    </nav>
  )
}

export default TOC
