import { CollapsibleList } from "@/components/collapsible-list"
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelTitleSup,
} from "@/features/portfolio/components/panel"
import { PanelTitleCopy } from "@/features/portfolio/components/panel-title-copy"
import { CERTIFICATIONS } from "@/features/portfolio/data/certifications"
import type { Certification } from "@/features/portfolio/types/certifications"

import { CertificationItem } from "./certification-item"

const ID = "certs"

export function Certifications({
  certifications = CERTIFICATIONS,
}: {
  certifications?: Certification[]
}) {
  return (
    <Panel id={ID}>
      <PanelHeader>
        <PanelTitle>
          <a href={`#${ID}`}>Certifications</a>
          <PanelTitleSup>({certifications.length})</PanelTitleSup>
          <PanelTitleCopy id={ID} />
        </PanelTitle>
      </PanelHeader>

      <CollapsibleList
        items={certifications}
        max={6}
        renderItem={(item) => <CertificationItem certification={item} />}
      />
    </Panel>
  )
}
