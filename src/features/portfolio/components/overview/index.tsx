import { urlToName } from "@/utils/url"
import {
  LinkIcon,
  MapPinIcon,
  MarsIcon,
  NonBinaryIcon,
  VenusIcon,
} from "lucide-react"

import { USER } from "@/features/portfolio/data/user"
import type { User } from "@/features/portfolio/types/user"

import { Panel, PanelContent } from "../panel"
import { CurrentLocalTimeItem } from "./current-local-time-item"
import { EmailItem } from "./email-item"
import {
  IntroItem,
  IntroItemContent,
  IntroItemIcon,
  IntroItemLink,
} from "./intro-item"
import { JobItem } from "./job-item"
import { PhoneItem } from "./phone-item"

export function Overview({ user = USER }: { user?: User }) {
  return (
    <Panel className="screen-line-bottom-none">
      <h2 className="sr-only">Overview</h2>

      <PanelContent className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {user.jobs.map((job, index) => {
          return (
            <JobItem
              key={index}
              title={job.title}
              company={job.company}
              website={job.website}
              experienceId={job.experienceId}
            />
          )
        })}

        {/* Each row is conditional because these values are imported, not hand-written: a
            profile with no phone number rendered an empty, correctly-spaced row, which looks
            like a broken layout rather than like data nobody supplied. */}
        {user.address && (
          <IntroItem>
            <IntroItemIcon>
              <MapPinIcon />
            </IntroItemIcon>
            <IntroItemContent>
              <IntroItemLink
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(user.address)}`}
                aria-label={`Location: ${user.address}`}
              >
                {user.address}
              </IntroItemLink>
            </IntroItemContent>
          </IntroItem>
        )}

        <CurrentLocalTimeItem timeZone={user.timeZone} />

        {user.phoneNumberB64 && (
          <PhoneItem phoneNumberB64={user.phoneNumberB64} />
        )}

        {user.emailB64 && <EmailItem emailB64={user.emailB64} />}

        {user.website && (
          <IntroItem>
            <IntroItemIcon>
              <LinkIcon />
            </IntroItemIcon>
            <IntroItemContent>
              <IntroItemLink
                href={user.website}
                aria-label={`Personal website: ${urlToName(user.website)}`}
              >
                {urlToName(user.website)}
              </IntroItemLink>
            </IntroItemContent>
          </IntroItem>
        )}

        {user.pronouns && (
          <IntroItem>
            <IntroItemIcon>{getGenderIcon(user.gender)}</IntroItemIcon>
            <IntroItemContent aria-label={`Pronouns: ${user.pronouns}`}>
              {user.pronouns}
            </IntroItemContent>
          </IntroItem>
        )}
      </PanelContent>

      <div className="pointer-events-none absolute inset-y-0 left-1/2 -z-1 w-px -translate-x-2.25 border-r border-dashed border-line max-sm:hidden" />
    </Panel>
  )
}

function getGenderIcon(gender: User["gender"]) {
  switch (gender) {
    case "male":
      return <MarsIcon />
    case "female":
      return <VenusIcon />
    case "non-binary":
      return <NonBinaryIcon />
  }
}
