"use client"

import { useState } from "react"
import { ArrowUpRightIcon, MonitorIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/base/ui/button"

/**
 * A live preview of a hosted project, framed the way a block preview is.
 *
 * This is the Blocks experience pointed at an arbitrary URL instead of a registry item. His
 * `BlockViewer` is not reused directly — it is built around the shadcn registry, and its other
 * half is a file tree of syntax-highlighted source, which a third-party deployment does not
 * have. What is reused is the part that matters: the rounded, inset-ringed frame over his
 * dotted backdrop, and an iframe the visitor can inspect without leaving the page.
 *
 * **Whether a site may be framed is decided before this component runs**, by
 * `scripts/probe-embeddable.mjs` reading the site's own `X-Frame-Options` and
 * `frame-ancestors` headers at build time. That indirection is not incidental: a browser
 * refuses a disallowed frame *silently*. `load` fires on the refused frame exactly as on a real
 * one, and reading the frame's `location` throws `SecurityError` in both cases — both were
 * tried here, and neither distinguishes them. The refusal is deliberately invisible to the
 * embedding page, so the only honest way to know is to read the headers from a server.
 *
 * Nothing here circumvents a refusal. A site that says no is linked rather than framed.
 */
export function ProjectPreview({
  url,
  title,
  screenshot,
  embeddable,
  blockedReason,
  className,
}: {
  url: string
  title: string
  screenshot?: string
  embeddable?: boolean
  blockedReason?: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)

  if (!embeddable) {
    return (
      <PreviewShell className={className} screenshot={screenshot} title={title}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm text-balance text-muted-foreground">
            {hostname(url)} does not allow being embedded.
          </p>
          {blockedReason && (
            <p className="font-mono text-xs text-muted-foreground/70">{blockedReason}</p>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 shadow-[inset_0_0_1px] shadow-foreground/20"
            nativeButton={false}
            render={
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open live project
                <ArrowUpRightIcon />
              </a>
            }
          />
        </div>
      </PreviewShell>
    )
  }

  // Nothing is fetched until the visitor asks. An iframe per project would mean one
  // third-party request per row on first paint — slow, and a disclosure to sites the visitor
  // never chose to visit.
  if (!loaded) {
    return (
      <PreviewShell className={className} screenshot={screenshot} title={title}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 shadow-[inset_0_0_1px] shadow-foreground/20"
            onClick={() => setLoaded(true)}
          >
            <MonitorIcon />
            Load live preview
          </Button>
          <p className="px-4 text-center font-mono text-xs text-muted-foreground">
            Loads {hostname(url)} in a frame
          </p>
        </div>
      </PreviewShell>
    )
  }

  return (
    <PreviewShell className={className}>
      <iframe
        src={url}
        title={`${title} — live preview`}
        loading="lazy"
        // A third-party document: denied same-origin access to this page, and denied top-level
        // navigation so a project cannot redirect the portfolio out from under the visitor.
        // Scripts are allowed, because a preview of a web app that cannot run its own scripts
        // is a screenshot with extra steps.
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="size-full border-0 bg-white"
      />
    </PreviewShell>
  )
}

/**
 * The frame, in the visual language of his block mockups: 16/10, rounded, an inset ring rather
 * than a border, over the dotted backdrop from his block viewer.
 */
function PreviewShell({
  children,
  className,
  screenshot,
  title,
}: {
  children: React.ReactNode
  className?: string
  screenshot?: string
  title?: string
}) {
  return (
    <div
      className={cn(
        "relative aspect-16/10 w-full overflow-hidden rounded-xl",
        "bg-black/0.75 bg-[radial-gradient(var(--pattern-foreground)_1px,transparent_0)] bg-size-[10px_10px] bg-center",
        "[--pattern-foreground:var(--color-zinc-950)]/5 dark:bg-white/0.75 dark:[--pattern-foreground:var(--color-white)]/5",
        className
      )}
    >
      {screenshot && (
        <img
          src={screenshot}
          alt={title ? `${title} screenshot` : ""}
          className="absolute inset-0 size-full object-cover object-top opacity-40"
          loading="lazy"
        />
      )}
      {children}
      <div className="pointer-events-none absolute inset-0 rounded-xl inset-ring-1 inset-ring-foreground/10" />
    </div>
  )
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
