// Thanks @fumadocs — by way of his doc-page-actions.

"use client"

import { useMemo, useRef, useState } from "react"
import { useTiks } from "@rexa-developer/tiks/react"
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react"
import { ChevronDownIcon } from "lucide-react"

import type { CopyState } from "@/hooks/use-copy-to-clipboard"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ClaudeIcon, MarkdownIcon, OpenAIIcon, V0Icon } from "@/components/icons"
import { CopyStateIcon } from "@/registry/components/copy-button"

/**
 * His "Copy page" button and its menu, on the portfolio instead of a doc page.
 *
 * Unchanged in behaviour: the copy fetches the page's Markdown and writes it through a
 * `ClipboardItem` promise (so Safari keeps the user gesture), caches it, and shows done or error
 * for a moment; the menu opens the same Markdown, or hands its URL to an assistant.
 *
 * What changed is what it points at. His menu linked his repository's `.mdx` sources and a list
 * of assistants chosen for component docs; here the document is `index.md`, generated from the
 * portfolio's own data, and the menu is the three assistants a reader is likely to have open.
 * The URLs carry only the page's own address — never anything about the reader.
 */

const cache = new Map<string, string>()

export function markdownUrlFor(basePath: string | undefined): string {
  return `${(basePath ?? "").replace(/\/+$/, "")}/index.md`
}

export function LLMCopyButton({ markdownUrl }: { markdownUrl: string }) {
  const [state, setState] = useState<CopyState>("idle")
  const [isCopying, setIsCopying] = useState(false)
  const operationRef = useRef(false)

  const { success, error } = useTiks()

  const handleCopy = async () => {
    if (operationRef.current) return

    operationRef.current = true

    const loadingTimer = setTimeout(() => {
      setIsCopying(true)
    }, 150)

    try {
      const cached = cache.get(markdownUrl)
      if (cached) {
        await navigator.clipboard.writeText(cached)
      } else {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": fetch(markdownUrl)
              .then((res) => {
                if (!res.ok) throw new Error(`${res.status}`)
                return res.text()
              })
              .then((content) => {
                cache.set(markdownUrl, content)
                return content
              }),
          }),
        ])
      }
      success()
      setState("done")
    } catch {
      error()
      setState("error")
    } finally {
      clearTimeout(loadingTimer)
      setIsCopying(false)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      operationRef.current = false
      setState("idle")
    }
  }

  return (
    <Button
      className="h-7 gap-1.5 border-none px-2 text-[0.8125rem] active:scale-none"
      variant="secondary"
      size="sm"
      aria-busy={isCopying}
      disabled={isCopying}
      onClick={handleCopy}
    >
      <CopyStateIcon
        state={state}
        idleIcon={<IconCopy />}
        doneIcon={<IconCheck />}
        errorIcon={<IconX />}
      />
      <span className="max-[28rem]:sr-only">Copy page</span>
      <span className="sr-only" aria-live="polite">
        {state === "done" ? "Copied" : state === "error" ? "Copy failed" : ""}
      </span>
    </Button>
  )
}

export function viewOptionItems(fullMarkdownUrl: string) {
  const q = `Read ${fullMarkdownUrl}, I want to ask questions about it.`

  return [
    {
      title: "View as Markdown",
      href: fullMarkdownUrl,
      icon: MarkdownIcon,
    },
    {
      title: "Open in ChatGPT",
      href: `https://chatgpt.com/?${new URLSearchParams({ hints: "search", q })}`,
      icon: OpenAIIcon,
    },
    {
      title: "Open in Claude",
      href: `https://claude.ai/new?${new URLSearchParams({ q })}`,
      icon: ClaudeIcon,
    },
    {
      title: "Open in v0",
      href: `https://v0.app/?${new URLSearchParams({ q })}`,
      icon: V0Icon,
    },
  ]
}

export function ViewOptions({ markdownUrl }: { markdownUrl: string }) {
  const items = useMemo(() => {
    const fullMarkdownUrl =
      typeof window !== "undefined"
        ? new URL(markdownUrl, window.location.origin).toString()
        : markdownUrl
    return viewOptionItems(fullMarkdownUrl)
  }, [markdownUrl])

  return (
    <DropdownMenu>
      {/* This fork's menu is Radix, where his is Base UI: `asChild` in place of `render`. */}
      <DropdownMenuTrigger asChild>
        <Button
          className="size-7 border-none active:scale-none"
          variant="secondary"
          size="icon-sm"
          aria-label="More ways to read this page"
        >
          <ChevronDownIcon className="mt-0.5 size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-fit"
        align="end"
        collisionPadding={16}
      >
        {items.map(({ title, href, icon: Icon }) => (
          <DropdownMenuItem key={title} asChild>
            <a href={href} rel="noopener" target="_blank">
              <Icon />
              {title}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PageActions({
  markdownUrl = markdownUrlFor(process.env.NEXT_PUBLIC_BASE_PATH),
}: {
  markdownUrl?: string
}) {
  return (
    <ButtonGroup aria-label="Page actions">
      <LLMCopyButton markdownUrl={markdownUrl} />
      <ButtonGroupSeparator className="border-y-4 border-secondary dark:bg-white/20 data-vertical:my-0" />
      <ViewOptions markdownUrl={markdownUrl} />
    </ButtonGroup>
  )
}
