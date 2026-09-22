"use client"

import { useEffect } from "react"

import { THEMES } from "@/app/(preview)/lib/shadcn"
import { buildThemeCSSVarsForRoot } from "@/lib/source-theme"

/**
 * Applies the admin's unsaved draft to the rendered portfolio.
 *
 * The page is server-rendered from the *committed* configuration, which is correct — a visitor
 * must see what was published. But the owner editing in the admin needs to see a change before
 * committing it, and the draft only exists in their browser's `localStorage`.
 *
 * So the committed theme is rendered with the document (no flash of the wrong palette), and
 * this re-applies the draft on top when one exists. For a visitor there is no draft, the effect
 * finds nothing, and the published theme stands untouched.
 *
 * `storage` events are listened for so the admin open in another tab updates this one live,
 * which is how the two-window edit-and-watch workflow works.
 *
 * There is no React state here on purpose. The draft is not React's to own — it lives in
 * `localStorage`, written by another tab — and holding a mirror of it in state meant reading it
 * during the effect and calling `setState` straight away, which is a render cascade on every
 * page load for a value that is usually absent. The effect now writes the stylesheet directly,
 * which is what it was going to do with the state anyway.
 */
const CONFIG_DRAFT_KEY = "portfolio-admin-config"
const STYLE_ID = "source-theme-vars"

function readDraftTheme(): string | undefined {
  try {
    const raw = localStorage.getItem(CONFIG_DRAFT_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { sourceTheme?: unknown }
    return typeof parsed?.sourceTheme === "string" ? parsed.sourceTheme : undefined
  } catch {
    // A corrupted draft must not blank the page it was meant to preview.
    return undefined
  }
}

export function DraftThemePreview({ published }: { published?: string }) {
  useEffect(() => {
    const apply = () => {
      const draft = readDraftTheme()
      // `undefined` means there is no draft at all — the overwhelmingly common case, and the
      // one where the server-rendered stylesheet must be left exactly as it is.
      if (draft === undefined || draft === published) return

      let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
      if (!el) {
        el = document.createElement("style")
        el.id = STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = buildThemeCSSVarsForRoot(THEMES, draft)
    }

    apply()

    const onStorage = (event: StorageEvent) => {
      if (event.key === CONFIG_DRAFT_KEY || event.key === null) apply()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [published])

  return null
}
