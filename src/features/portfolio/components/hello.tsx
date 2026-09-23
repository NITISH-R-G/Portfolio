import { Markdown } from "@/components/markdown"
import { USER } from "@/features/portfolio/data/user"
import type { User } from "@/features/portfolio/types/user"

import { HelloGreeting } from "./hello-greeting"
import { Panel, PanelContent, PanelHeader } from "./panel"

const ID = "hello"

/**
 * His About panel: a decorative greeting as its title, and the owner's own words beneath.
 *
 * The `<h2>` is real and reads "About"; the greeting beside it is hidden from assistive
 * technology. The summary is server-rendered Markdown, so it is in the HTML a crawler receives
 * with or without JavaScript — the animation decorates it, and never replaces it.
 *
 * `user` is a prop, defaulting to the built portfolio, so the admin preview renders this same
 * component over its draft. Nothing renders without a summary: a heading over empty space reads
 * as a broken section, not a sparse one.
 *
 * `actions` sits beside the greeting, where his doc pages put "Copy page": the public page passes
 * its page actions, and the admin preview passes none, since they would read the published site
 * rather than the draft being edited.
 */
export function Hello({
  user = USER,
  actions,
}: {
  user?: User
  actions?: React.ReactNode
}) {
  if (!user.about) return null

  return (
    <Panel id={ID} className="screen-line-bottom-none">
      <PanelHeader className="flex items-center justify-between gap-4">
        <h2 className="sr-only">About</h2>
        <HelloGreeting />
        {actions && <div className="shrink-0">{actions}</div>}
      </PanelHeader>

      <PanelContent>
        <div className="typeset typeset-description [&_li]:ps-0.5 [&_ul]:ps-3.5">
          <Markdown>{user.about}</Markdown>
        </div>
      </PanelContent>

      <div className="screen-line-bottom h-px" />
      <div className="h-4" />
      <div className="screen-line-bottom h-px screen-line-bottom-border" />
    </Panel>
  )
}
