import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { Button } from "@/components/base/ui/button"

/**
 * The 404 page.
 *
 * Upstream the wide layout is a playable brick-breaker — his game, drawn with his sprites, his
 * sounds and his font, all fetched at runtime from `assets.chanhdai.com`. Shipping it on a fork
 * would mean a page whose behaviour depends on someone else's bucket staying up and willing to
 * serve it, and whose artwork is not ours to serve.
 *
 * So the 404 is the layout he already renders on narrow screens — the mono numeral and a way
 * back — at every width. The game itself is still in the registry as `not-found-01`, which is
 * where a component catalogue is supposed to keep it.
 */
export function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center py-6">
      <section className="flex flex-col items-center gap-6">
        <h1 className="font-mono text-8xl font-medium">404</h1>
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href="/">
              Go to Home
              <ArrowRightIcon />
            </Link>
          }
        />
      </section>
    </div>
  )
}
