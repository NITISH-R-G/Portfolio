import { compareDesc } from "date-fns"

import { CollapsibleList } from "@/components/collapsible-list"
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelTitleSup,
} from "@/features/portfolio/components/panel"
import { PanelTitleCopy } from "@/features/portfolio/components/panel-title-copy"
import { AWARDS } from "@/features/portfolio/data/awards"
import type { Award } from "@/features/portfolio/types/awards"

import { AwardItem } from "./award-item"

const ID = "awards"

export function Awards({ awards = AWARDS }: { awards?: Award[] }) {
  const sorted = [...awards].sort((a, b) =>
    compareDesc(new Date(a.date), new Date(b.date))
  )

  return (
    <Panel id={ID}>
      <PanelHeader>
        <PanelTitle>
          <a href={`#${ID}`}>Awards</a>
          <PanelTitleSup>({awards.length})</PanelTitleSup>
          <PanelTitleCopy id={ID} />
        </PanelTitle>
      </PanelHeader>

      <CollapsibleList
        items={sorted}
        max={6}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <AwardItem award={item} />}
      />
    </Panel>
  )
}
