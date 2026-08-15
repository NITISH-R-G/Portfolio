/**
 * The portfolio builder.
 *
 * A local, static tool for the parts of the product that are easier to see than to type:
 * reviewing what was imported, correcting it, choosing a theme, and ordering sections.
 * It never talks to a server and never writes to disk — everything is a draft in
 * localStorage that the Save panel turns into two files you commit.
 *
 * It is optional. Every setting it exposes can be typed into `portfolio.config.js`
 * directly, and a user who prefers an editor never has to open this page.
 *
 * @module admin/AdminEditor
 */

import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { useBuilder } from './state.js'
import ConnectPanel from './panels/ConnectPanel.jsx'
import IdentityPanel from './panels/IdentityPanel.jsx'
import SourcesPanel from './panels/SourcesPanel.jsx'
import ConflictsPanel from './panels/ConflictsPanel.jsx'
import ContentPanel from './panels/ContentPanel.jsx'
import StylePanel from './panels/StylePanel.jsx'
import SectionsPanel from './panels/SectionsPanel.jsx'
import SettingsPanel from './panels/SettingsPanel.jsx'
import ExportPanel from './panels/ExportPanel.jsx'

/**
 * Ordered as the product's own flow reads: who you are, what you connected, what came
 * back, how it looks, what shows, the details, and finally getting it out.
 */
const PANELS = [
  { id: 'connect', label: 'Connect', icon: 'Share2', component: ConnectPanel },
  { id: 'identity', label: 'Identity', icon: 'User', component: IdentityPanel },
  { id: 'sources', label: 'Sources', icon: 'Database', component: SourcesPanel },
  { id: 'conflicts', label: 'Conflicts', icon: 'AlertTriangle', component: ConflictsPanel },
  { id: 'content', label: 'Content', icon: 'FolderKanban', component: ContentPanel },
  { id: 'style', label: 'Style', icon: 'Palette', component: StylePanel },
  { id: 'sections', label: 'Sections', icon: 'LayoutGrid', component: SectionsPanel },
  { id: 'settings', label: 'Settings', icon: 'Settings', component: SettingsPanel },
  { id: 'save', label: 'Save', icon: 'Download', component: ExportPanel },
]

export default function AdminEditor() {
  const builder = useBuilder()
  const [active, setActive] = useState(() => window.location.hash.slice(1) || 'connect')
  const [menuOpen, setMenuOpen] = useState(false)

  // The hash keeps a panel linkable and survives a reload, which matters because a reload
  // is how the user checks that a draft actually took effect on the site.
  useEffect(() => {
    const onHashChange = () => setActive(window.location.hash.slice(1) || 'connect')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const go = (id) => {
    window.location.hash = id
    setActive(id)
    setMenuOpen(false)
  }

  const panel = PANELS.find((p) => p.id === active) ?? PANELS[0]
  const Panel = panel.component
  const { built, dirty } = builder

  const visible = built.sections.filter((s) => s.visible).length
  const problems = built.configIssues.filter((i) => i.level === 'error').length

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div className="admin-header-left">
          <button
            type="button"
            className="admin-menu-toggle"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name="ListOrdered" size={18} />
          </button>
          <div>
            <h1 className="admin-title">Portfolio builder</h1>
            <p className="admin-subtitle">
              {built.profile.identity.name || 'Unnamed portfolio'}
              {' · '}
              {visible} section{visible === 1 ? '' : 's'} showing
              {problems > 0 && ` · ${problems} config problem${problems === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div className="admin-actions">
          {dirty && <span className="admin-dirty" title="You have changes that are not in a file yet">unsaved</span>}
          <a className="btn-admin btn-admin-ghost" href="./index.html">
            <Icon name="ExternalLink" size={14} /> View portfolio
          </a>
          <button type="button" className="btn-admin btn-admin-primary" onClick={() => go('save')}>
            <Icon name="Download" size={14} /> Save
          </button>
        </div>
      </header>

      <div className="admin-layout">
        {menuOpen && (
          <div className="admin-sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}

        <nav className={`admin-sidebar${menuOpen ? ' admin-sidebar-open' : ''}`} aria-label="Builder sections">
          <div className="admin-nav-group">
            {PANELS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`admin-nav-item${entry.id === active ? ' admin-nav-active' : ''}`}
                aria-current={entry.id === active ? 'page' : undefined}
                onClick={() => go(entry.id)}
              >
                <Icon name={entry.icon} size={16} />
                {entry.label}
              </button>
            ))}
          </div>

          <div className="admin-nav-group">
            <p className="admin-nav-group-label">Commands</p>
            <p className="admin-hint"><code>npm run import</code><br />refresh your data</p>
            <p className="admin-hint"><code>npm run export</code><br />résumé and profile README</p>
            <p className="admin-hint"><code>npm run doctor</code><br />check before deploying</p>
          </div>
        </nav>

        <main className="admin-main">
          {problems > 0 && (
            <div className="admin-issues">
              {built.configIssues.filter((i) => i.level === 'error').map((issue, i) => (
                <p key={i} className="admin-issue">
                  <Icon name="AlertTriangle" size={14} />
                  <span><strong>{issue.path}</strong> {issue.message} {issue.hint}</span>
                </p>
              ))}
            </div>
          )}
          <Panel builder={builder} />
        </main>
      </div>
    </div>
  )
}
