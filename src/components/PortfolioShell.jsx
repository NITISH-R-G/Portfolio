import Sidebar from './Sidebar'
import MainContent from './MainContent'
import { RAIL_SECTION_IDS } from '../sections/registry'

/**
 * Splits the visible, ordered sections between the identity rail and the scrolling column,
 * or — for `layout.shell: "stacked"` — puts everything in one column. This is the only
 * place layout shell is decided; `Sidebar` and `MainContent` just render what they're given.
 *
 * @param {{sections: import('../core/generate/sections.js').ResolvedSection[], shell: 'sidebar'|'stacked'}} props
 */
export default function PortfolioShell({ sections, shell }) {
  const visible = sections.filter((s) => s.visible)

  if (shell === 'stacked') {
    return (
      <div className="stacked-shell">
        <MainContent sections={visible} />
      </div>
    )
  }

  const mainSections = visible.filter((s) => !RAIL_SECTION_IDS.has(s.id))
  return (
    <>
      <Sidebar />
      <MainContent sections={mainSections} />
    </>
  )
}
