import type { Metadata } from "next"

import { AdminApp } from "./admin-app"

/**
 * The admin, inside the portfolio application.
 *
 * It is one route in the same Next app rather than a second frontend: the editor and the site
 * it edits share the design system, the build, the deployment and the config pipeline. The
 * previous arrangement was a separate Vite bundle, which is what left the admin unreachable
 * when that build was retired.
 */
export const metadata: Metadata = {
  title: "Admin",
  // A private control plane has no business in anyone's index.
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return <AdminApp />
}
