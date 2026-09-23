import { USER } from "@/features/portfolio/data/user"
import type { User } from "@/features/portfolio/types/user"

import { FlipSentences } from "./flip-sentences"
import { HandwrittenArrow, HandwrittenNote } from "./handwritten-note"
import { ProfileCoverArt } from "./profile-cover-art"
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
      {/* His figure slot, which held his own mark. It now holds the owner's: the dot grid and
          spotlight monogram, the note he annotates it with, and his "Fig. 1." caption. */}
      <figure className="relative col-span-2 flex min-h-36 items-center p-2 sm:col-span-1 sm:col-start-2 sm:min-h-44 sm:p-4">
        <ProfileCoverArt monogram={user.monogram} />

        {/* w-36 needs ~1088px before the gutter can hold it without clipping, and the mark
            ignores coarse pointers, so there is nothing to annotate there. */}
        <HandwrittenNote
          className="bottom-20 left-full hidden w-36 flex-col items-start pointer-fine:xl:flex"
          aria-hidden
        >
          <HandwrittenArrow className="-scale-y-100 -rotate-6" />
          <span className="ml-3 -rotate-6">
            follows your cursor
            <span className="block" />
            click for a sound
          </span>
        </HandwrittenNote>

        <figcaption className="pointer-events-none absolute right-2 bottom-2 text-sm/none tracking-wide text-[color-mix(in_oklab,var(--muted-foreground)_60%,var(--background))] tabular-nums select-none sm:right-4 sm:bottom-4">
          Fig. 1.
        </figcaption>
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
