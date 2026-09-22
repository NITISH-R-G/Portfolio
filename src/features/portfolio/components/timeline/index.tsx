import { cn } from "@/lib/utils"
import { Markdown } from "@/components/markdown"
import {
  TimescaleAge,
  TimescaleContent,
  TimescaleHeader,
  TimescaleItem,
  TimescaleRail,
  TimescaleRoot,
  TimescaleTick,
  TimescaleTrack,
  TimescaleViewport,
  TimescaleYear,
} from "@/registry/components/timescale"
import {
  TIMELINE_BIRTH_YEAR,
  TIMELINE_MILESTONES,
} from "@/features/portfolio/data/timeline"

import { Panel, PanelHeader, PanelTitle } from "../panel"
import { PanelTitleCopy } from "../panel-title-copy"

const ID = "timeline"

/**
 * `birthYear` and `milestones` are props with module-level defaults, matching `TechStack`.
 *
 * The page passes nothing and gets the built portfolio; the admin preview passes the draft, so
 * editing a milestone redraws this component rather than an admin-only imitation of it.
 */
export function Timeline({
  className,
  birthYear = TIMELINE_BIRTH_YEAR,
  milestones = TIMELINE_MILESTONES,
  ...props
}: React.ComponentProps<typeof TimescaleRoot> & {
  birthYear?: number
  milestones?: { year: number; content?: string }[]
}) {
  // A rail with no marks is a heading over an empty strip. The engine's threshold normally
  // prevents this, but the preview renders a section whether or not it is currently visible.
  if (!milestones.length) return null

  return (
    <Panel id={ID}>
      <PanelHeader>
        <PanelTitle>
          <a href={`#${ID}`}>Timeline</a>
          <PanelTitleCopy id={ID} />
        </PanelTitle>
      </PanelHeader>

      <TimescaleRoot className={cn("w-full", className)} {...props}>
        <TimescaleHeader>
          <TimescaleAge>Age</TimescaleAge>
          <TimescaleYear>Years</TimescaleYear>
        </TimescaleHeader>

        <TimescaleViewport>
          <TimescaleTrack>
            <TimescaleRail />

            {milestones.map((milestone) => (
              <TimescaleItem key={milestone.year}>
                <TimescaleTick />
                <TimescaleAge>{milestone.year - birthYear}</TimescaleAge>
                <TimescaleYear>{milestone.year}</TimescaleYear>
                {milestone.content && (
                  <TimescaleContent className="typeset typeset-timescale">
                    <Markdown>{milestone.content}</Markdown>
                  </TimescaleContent>
                )}
              </TimescaleItem>
            ))}
          </TimescaleTrack>
        </TimescaleViewport>
      </TimescaleRoot>
    </Panel>
  )
}
