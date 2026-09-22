"use client"

import dynamic from "next/dynamic"

/**
 * The editor is client-only.
 *
 * It reads `localStorage` for the unsaved draft and re-runs the build pipeline in the browser,
 * so there is nothing meaningful to server-render — and rendering it on the server would
 * produce markup that never matches the draft the browser is about to apply.
 */
const AdminEditor = dynamic(() => import("@/admin/AdminEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="font-mono text-sm text-muted-foreground">Loading the editor…</p>
    </div>
  ),
})

export function AdminApp() {
  return <AdminEditor />
}
