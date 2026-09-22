import { USER } from "@/features/portfolio/data/user"
import type { User } from "@/features/portfolio/types/user"

import { FlipSentences } from "./flip-sentences"
import { VerifiedIcon } from "./verified-icon"

export function ProfileHeader({
  user = USER,
  flipInterval,
}: {
  user?: User
  /** Seconds between the rotating lines beneath the name. See `FlipSentences`. */
  flipInterval?: number
}) {
  return (
    <div className="screen-line-bottom grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] overflow-y-clip border-x screen-line-bottom-border after:z-1">
      <figure className="relative col-span-2 p-2 sm:col-span-1 sm:col-start-2 sm:p-4">

      </figure>

      <div className="flex flex-col sm:row-span-2 sm:row-start-1">
        <div className="screen-line-top mt-auto shrink-0 border-r border-line">
          <img
              className="size-28 rounded-full object-cover select-none"
              src={user.avatar}
              alt={user.displayName}
              width={112}
              height={112}
            />
        </div>
      </div>

      <div className="flex flex-col">
        <div className="z-1 mt-auto border-t border-line">
          <div className="flex items-center gap-2 pl-4">
            <h1 className="-translate-y-px text-[2rem]/none font-medium tracking-tight">
              {user.displayName}
            </h1>

            <VerifiedIcon className="size-4.5 select-none" aria-hidden />

          </div>

          <FlipSentences
            interval={flipInterval}
            className="h-12.5 border-t border-line py-1 pl-4 sm:h-9"
          >
            {user.flipSentences}
          </FlipSentences>
        </div>
      </div>
    </div>
  )
}
