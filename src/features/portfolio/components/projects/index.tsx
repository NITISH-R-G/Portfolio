import { CollapsibleList } from "@/components/collapsible-list"
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelTitleSup,
} from "@/features/portfolio/components/panel"
import { PanelTitleCopy } from "@/features/portfolio/components/panel-title-copy"
import { PROJECTS } from "@/features/portfolio/data/projects"
import type { Project } from "@/features/portfolio/types/projects"

import { ProjectItem } from "./project-item"

const ID = "projects"

export function Projects({ projects = PROJECTS }: { projects?: Project[] }) {
  return (
    <Panel id={ID}>
      <PanelHeader>
        <PanelTitle>
          <a href={`#${ID}`}>Projects</a>
          <PanelTitleSup>({projects.length})</PanelTitleSup>
          <PanelTitleCopy id={ID} />
        </PanelTitle>
      </PanelHeader>

      <CollapsibleList
        items={projects}
        max={4}
        renderItem={(item) => <ProjectItem project={item} />}
      />
    </Panel>
  )
}
