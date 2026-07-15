import { useState, useCallback, useEffect, useRef } from 'react'
import { portfolioData } from '../data/portfolio'

const STORAGE_KEY = 'portfolio-draft'

function loadDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function saveDraft(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadJSON(data, filename) {
  const content = `const portfolio = ${JSON.stringify(data, null, 2)}\n\nexport default portfolio\n`
  downloadFile(content, filename)
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const IMAGE_PRESETS = {
  project: { maxW: 1200, maxH: 800, quality: 0.82 },
  certificate: { maxW: 1200, maxH: 900, quality: 0.82 },
  profile: { maxW: 400, maxH: 400, quality: 0.85 },
}

function optimizeImage(file, preset = 'project') {
  const cfg = IMAGE_PRESETS[preset] || IMAGE_PRESETS.project
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > cfg.maxW || h > cfg.maxH) {
        const ratio = Math.min(cfg.maxW / w, cfg.maxH / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      const usePng = file.type === 'image/png'
      const mimeType = usePng ? 'image/png' : 'image/jpeg'
      const quality = usePng ? undefined : cfg.quality
      canvas.toBlob(async (blob) => {
        if (!blob) {
          const dataUrl = canvas.toDataURL(mimeType, quality)
          const optimizedSize = Math.round((dataUrl.length - `data:${mimeType};base64,`.length) * 0.75)
          resolve({ dataUrl, originalSize: file.size, optimizedSize, width: w, height: h })
          return
        }
        const dataUrl = await blobToDataUrl(blob)
        resolve({ dataUrl, originalSize: file.size, optimizedSize: blob.size, width: w, height: h })
      }, mimeType, quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      fileToDataUrl(file).then(dataUrl => {
        resolve({ dataUrl, originalSize: file.size, optimizedSize: file.size, width: 0, height: 0 })
      })
    }
    img.src = objectUrl
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function normalizeSkills(skills) {
  if (!skills || typeof skills !== 'object') return { enabled: true, categories: [] }
  if (Array.isArray(skills.categories)) return skills
  if (Array.isArray(skills.items)) {
    return { enabled: skills.enabled !== false, categories: [{ name: 'General', items: skills.items }] }
  }
  return skills
}

const SECTION_GROUPS = [
  {
    id: 'core',
    label: 'Core',
    sections: [
      { id: 'about', label: 'About' },
      { id: 'projects', label: 'Projects' },
      { id: 'experience', label: 'Experience' },
      { id: 'education', label: 'Education' },
      { id: 'skills', label: 'Skills' },
      { id: 'certifications', label: 'Certifications' },
      { id: 'awards', label: 'Awards' },
      { id: 'contact', label: 'Contact' },
      { id: 'resume', label: 'Resume' },
    ]
  },
  {
    id: 'research',
    label: 'Research & Community',
    sections: [
      { id: 'research', label: 'Research' },
      { id: 'publications', label: 'Publications' },
      { id: 'conferences', label: 'Conferences' },
      { id: 'talks', label: 'Talks' },
      { id: 'teaching', label: 'Teaching' },
      { id: 'openSource', label: 'Open Source' },
      { id: 'hackathons', label: 'Hackathons' },
    ]
  },
  {
    id: 'creative',
    label: 'Founder & Creative',
    sections: [
      { id: 'founder', label: 'Founder' },
      { id: 'designWork', label: 'Design' },
      { id: 'media', label: 'Media' },
      { id: 'testimonials', label: 'Testimonials' },
    ]
  },
  {
    id: 'advanced',
    label: 'Advanced',
    sections: [
      { id: 'json', label: 'Raw JSON' },
    ]
  },
]

const ALL_SECTIONS = SECTION_GROUPS.flatMap(g => g.sections)

export default function AdminEditor() {
  const [data, setData] = useState(() => {
    const loaded = loadDraft() || deepClone(portfolioData)
    loaded.skills = normalizeSkills(loaded.skills)
    return loaded
  })
  const [activeTab, setActiveTab] = useState('projects')
  const [saved, setSaved] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navRefs = useRef([])
  const fileStore = useRef({})

  const update = useCallback((path, value) => {
    setData(prev => {
      const next = deepClone(prev)
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
    setSaved(false)
  }, [])

  const handleSave = () => {
    saveDraft(data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleExport = async () => {
    const exportData = deepClone(data)
    const store = fileStore.current
    if (Object.keys(store).length > 0) {
      const projects = exportData?.sections?.projects?.items
      if (projects) {
        for (const p of projects) {
          const entry = store[p.id]
          if (entry?.dataUrl) p.coverImage = entry.dataUrl
        }
      }
      const certs = exportData?.sections?.certifications?.items
      if (certs) {
        for (const c of certs) {
          const entry = store[c.id]
          if (entry?.dataUrl) c.image = entry.dataUrl
        }
      }
    }
    downloadJSON(exportData, 'portfolio.js')
  }

  const handleReset = () => {
    if (confirm('Reset all changes to defaults?')) {
      localStorage.removeItem(STORAGE_KEY)
      setData(deepClone(portfolioData))
    }
  }

  const activeIndex = ALL_SECTIONS.findIndex(t => t.id === activeTab)

  const handleNavKeyDown = (e) => {
    let newIndex = activeIndex
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      newIndex = (activeIndex + 1) % ALL_SECTIONS.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      newIndex = (activeIndex - 1 + ALL_SECTIONS.length) % ALL_SECTIONS.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      newIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      newIndex = ALL_SECTIONS.length - 1
    } else if (e.key === 'Escape' && sidebarOpen) {
      e.preventDefault()
      setSidebarOpen(false)
      return
    } else {
      return
    }
    setActiveTab(ALL_SECTIONS[newIndex].id)
    navRefs.current[newIndex]?.focus()
    setSidebarOpen(false)
  }

  const handleNavClick = (sectionId) => {
    setActiveTab(sectionId)
    setSidebarOpen(false)
  }

  return (
    <div className={`admin-wrap ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
      <header className="admin-header">
        <div className="admin-header-left">
          <button
            className="admin-menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={sidebarOpen}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {sidebarOpen ? (
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              ) : (
                <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              )}
            </svg>
          </button>
          <div>
            <h1 className="admin-title">Portfolio Editor</h1>
            <p className="admin-subtitle">Edit content, then download the updated file.</p>
          </div>
        </div>
        <div className="admin-actions">
          <button onClick={handleSave} className={`btn-admin ${saved ? 'btn-admin-saved' : 'btn-admin-primary'}`}>
            {saved ? 'Saved ✓' : 'Save Draft'}
          </button>
          <button onClick={handleExport} className="btn-admin btn-admin-ghost">
            Download JS
          </button>
          <button onClick={handleReset} className="btn-admin btn-admin-danger">
            Reset
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <nav className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-visible' : ''}`} aria-label="Editor sections">
          {SECTION_GROUPS.map((group) => (
            <div key={group.id} className="admin-nav-group">
              <div className="admin-nav-group-label">{group.label}</div>
              {group.sections.map((section, i) => {
                const flatIndex = ALL_SECTIONS.findIndex(s => s.id === section.id)
                return (
                  <button
                    key={section.id}
                    ref={el => { navRefs.current[flatIndex] = el }}
                    className={`admin-nav-item ${activeTab === section.id ? 'admin-nav-active' : ''}`}
                    onClick={() => handleNavClick(section.id)}
                    aria-current={activeTab === section.id ? 'page' : undefined}
                  >
                    {section.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {sidebarOpen && <div className="admin-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

        <main
          className="admin-main"
          role="tabpanel"
          tabIndex={0}
          onKeyDown={handleNavKeyDown}
        >
          {activeTab === 'projects' && <ProjectsEditor projects={data.sections.projects.items} update={update} fileStore={fileStore.current} />}
          {activeTab === 'experience' && <ExperienceEditor items={data.sections.experience.items} update={update} />}
          {activeTab === 'education' && <EducationEditor items={data.sections.education.items} update={update} />}
          {activeTab === 'skills' && <SkillsEditor skills={data.skills} update={update} />}
          {activeTab === 'certifications' && <CertificationsEditor items={data.sections.certifications.items} update={update} fileStore={fileStore.current} />}
          {activeTab === 'hackathons' && <EnhancedListEditor sectionKey="hackathons" section={data.sections.hackathons} update={update}
            basicFields={[{ key: 'name', label: 'Name', placeholder: 'e.g. MIT Hacks' }, { key: 'date', label: 'Date', placeholder: 'e.g. Mar 2026' }, { key: 'result', label: 'Result', placeholder: 'e.g. 1st Place' }, { key: 'description', label: 'Description', multiline: true }]}
            extraFields={[
              { key: 'event', label: 'Event', placeholder: 'e.g. Smart India Hackathon' },
              { key: 'role', label: 'Role', placeholder: 'e.g. Team Lead' },
              { key: 'team', label: 'Team', placeholder: 'e.g. 4 members' },
            ]}
            hasMetrics hasTools hasLinks
          />}
          {activeTab === 'conferences' && <EnhancedListEditor sectionKey="conferences" section={data.sections.conferences} update={update}
            basicFields={[{ key: 'name', label: 'Name', placeholder: 'e.g. NeurIPS 2026' }, { key: 'date', label: 'Date', placeholder: 'e.g. Dec 2026' }, { key: 'role', label: 'Role', placeholder: 'e.g. Attendee, Presenter' }, { key: 'description', label: 'Description', multiline: true }]}
          />}
          {activeTab === 'research' && <EnhancedListEditor sectionKey="research" section={data.sections.research} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. RAG Pipeline Optimization' }, { key: 'date', label: 'Date', placeholder: 'e.g. 2026' }, { key: 'abstract', label: 'Abstract', multiline: true, placeholder: 'Research abstract or summary' }]}
            extraFields={[
              { key: 'venue', label: 'Venue', placeholder: 'e.g. IIT Madras Research Symposium' },
              { key: 'authors', label: 'Authors', placeholder: 'e.g. Nitish R.G.' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'ongoing', label: 'Ongoing' }, { value: 'submitted', label: 'Submitted' }, { value: 'published', label: 'Published' }, { value: 'under-review', label: 'Under Review' }] },
              { key: 'paperLink', label: 'Paper Link', placeholder: 'https://...' },
              { key: 'demoLink', label: 'Demo Link', placeholder: 'https://...' },
            ]}
            hasMetrics hasTags
          />}
          {activeTab === 'publications' && <EnhancedListEditor sectionKey="publications" section={data.sections.publications} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. Paper Title' }, { key: 'date', label: 'Date', placeholder: 'e.g. 2026' }, { key: 'abstract', label: 'Abstract', multiline: true, placeholder: 'Brief abstract or summary' }]}
            extraFields={[
              { key: 'venue', label: 'Venue', placeholder: 'e.g. arXiv, IEEE' },
              { key: 'authors', label: 'Authors', placeholder: 'e.g. Nitish R.G., Dr. Smith' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'published', label: 'Published' }, { value: 'submitted', label: 'Submitted' }, { value: 'under-review', label: 'Under Review' }, { value: 'preprint', label: 'Preprint' }] },
              { key: 'paperLink', label: 'Paper Link', placeholder: 'https://...' },
            ]}
            hasTags
          />}
          {activeTab === 'awards' && <EnhancedListEditor sectionKey="awards" section={data.sections.awards} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. Best AI Hack' }, { key: 'issuer', label: 'Issuer', placeholder: 'e.g. Google, MIT' }, { key: 'date', label: 'Date', placeholder: 'e.g. 2026' }, { key: 'description', label: 'Description', multiline: true }]}
            extraFields={[
              { key: 'category', label: 'Category', placeholder: 'e.g. AI/ML, Best Design' },
              { key: 'venue', label: 'Venue', placeholder: 'e.g. Global Competition' },
            ]}
            hasMetrics
          />}
          {activeTab === 'openSource' && <EnhancedListEditor sectionKey="openSource" section={data.sections.openSource} update={update}
            basicFields={[{ key: 'name', label: 'Name', placeholder: 'e.g. langchain' }, { key: 'role', label: 'Role', placeholder: 'e.g. Contributor, Maintainer' }, { key: 'description', label: 'Description', multiline: true }]}
            extraFields={[
              { key: 'repoLink', label: 'Repo Link', placeholder: 'https://github.com/...' },
              { key: 'stars', label: 'Stars', type: 'number', placeholder: 'e.g. 12' },
              { key: 'contributors', label: 'Contributors', type: 'number', placeholder: 'e.g. 5' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'maintenance', label: 'Maintenance' }] },
            ]}
            hasTools hasLinks
          />}
          {activeTab === 'founder' && <EnhancedListEditor sectionKey="founder" section={data.sections.founder} update={update}
            basicFields={[{ key: 'company', label: 'Company', placeholder: 'e.g. CODESTREAK' }, { key: 'role', label: 'Role', placeholder: 'e.g. Founder & CEO' }, { key: 'date', label: 'Date', placeholder: 'e.g. Nov 2025 – Present' }]}
            extraFields={[
              { key: 'context', label: 'Context', placeholder: 'e.g. International AI community' },
              { key: 'problem', label: 'Problem', multiline: true, placeholder: 'What problem does this solve?' },
              { key: 'approach', label: 'Approach', multiline: true, placeholder: 'How was it built?' },
              { key: 'impact', label: 'Impact', multiline: true, placeholder: 'What was the outcome?' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'acquired', label: 'Acquired' }, { value: 'paused', label: 'Paused' }, { value: 'closed', label: 'Closed' }] },
            ]}
            hasMetrics hasTools hasLinks
          />}
          {activeTab === 'teaching' && <EnhancedListEditor sectionKey="teaching" section={data.sections.teaching} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. ML Workshop' }, { key: 'audience', label: 'Audience', placeholder: 'e.g. IIT Students' }, { key: 'date', label: 'Date', placeholder: 'e.g. 2026' }, { key: 'description', label: 'Description', multiline: true }]}
          />}
          {activeTab === 'talks' && <EnhancedListEditor sectionKey="talks" section={data.sections.talks} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. AI Agents in Production' }, { key: 'event', label: 'Event', placeholder: 'e.g. TechConf 2026' }, { key: 'date', label: 'Date', placeholder: 'e.g. Mar 2026' }, { key: 'description', label: 'Description', multiline: true }]}
            extraFields={[
              { key: 'audience', label: 'Audience', placeholder: 'e.g. 200+ developers' },
              { key: 'format', label: 'Format', type: 'select', options: [{ value: 'talk', label: 'Talk' }, { value: 'workshop', label: 'Workshop' }, { value: 'panel', label: 'Panel' }, { value: 'keynote', label: 'Keynote' }] },
              { key: 'venue', label: 'Venue', placeholder: 'e.g. Online, Convention Center' },
              { key: 'recordingLink', label: 'Recording Link', placeholder: 'https://...' },
              { key: 'slidesLink', label: 'Slides Link', placeholder: 'https://...' },
            ]}
            hasMetrics hasTools
          />}
          {activeTab === 'designWork' && <EnhancedListEditor sectionKey="designWork" section={data.sections.designWork} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. Portfolio Redesign' }, { key: 'type', label: 'Type', placeholder: 'e.g. UI/UX, Branding' }, { key: 'date', label: 'Date', placeholder: 'e.g. 2026' }]}
            extraFields={[
              { key: 'problem', label: 'Problem', multiline: true, placeholder: 'What problem did this solve?' },
              { key: 'process', label: 'Process', multiline: true, placeholder: 'How was it approached?' },
              { key: 'outcome', label: 'Outcome', multiline: true, placeholder: 'What was the result?' },
            ]}
            hasMetrics hasTools hasLinks hasGallery
          />}
          {activeTab === 'media' && <EnhancedListEditor sectionKey="media" section={data.sections.media} update={update}
            basicFields={[{ key: 'title', label: 'Title', placeholder: 'e.g. Featured in TechCrunch' }, { key: 'outlet', label: 'Outlet', placeholder: 'e.g. TechCrunch, Dev.to' }, { key: 'date', label: 'Date', placeholder: 'e.g. 2026' }, { key: 'link', label: 'Link', placeholder: 'https://...' }]}
          />}
          {activeTab === 'testimonials' && <EnhancedListEditor sectionKey="testimonials" section={data.sections.testimonials} update={update}
            basicFields={[{ key: 'name', label: 'Name', placeholder: 'e.g. Jane Smith' }, { key: 'role', label: 'Role', placeholder: 'e.g. PM at Google' }, { key: 'text', label: 'Testimonial', multiline: true }]}
          />}
          {activeTab === 'resume' && <ResumeEditor resume={data.sections.resume} update={update} />}
          {activeTab === 'contact' && <ContactEditor contact={data.contact} update={update} />}
          {activeTab === 'json' && <JsonEditor data={data} setData={setData} />}
        </main>
      </div>
    </div>
  )
}

/* ── Form Primitives ────────────────────────────────────────── */

function Field({ label, value, onChange, multiline, type = 'text', placeholder, help, id }) {
  const inputId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>{label}</label>
      {multiline ? (
        <textarea
          id={inputId}
          className="field-textarea"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          className="field-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

function Select({ label, value, onChange, options, id }) {
  const selectId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="field">
      <label className="field-label" htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        className="field-select"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function ItemCard({ children, onRemove, title, index }) {
  return (
    <div className="item-card">
      <div className="item-card-header">
        {title && <span className="item-card-title">{title}</span>}
        <div className="item-card-actions">
          {onRemove && (
            <button onClick={onRemove} className="btn-remove">Remove</button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} className="btn-add">
      <span className="btn-add-icon" aria-hidden="true">+</span> {label}
    </button>
  )
}

function MoveButtons({ onUp, onDown, canUp, canDown }) {
  return (
    <div className="move-buttons">
      <button onClick={onUp} disabled={canUp} className="btn-move" aria-label="Move item up" title="Move up">↑</button>
      <button onClick={onDown} disabled={canDown} className="btn-move" aria-label="Move item down" title="Move down">↓</button>
    </div>
  )
}

function Toggle({ label, checked, onChange, help, id }) {
  const toggleId = id || `toggle-${label?.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="field field-toggle">
      <label className="toggle-label" htmlFor={toggleId}>
        <span className="toggle-track" data-checked={checked}>
          <span className="toggle-thumb" />
        </span>
        <span className="toggle-text">{label}</span>
      </label>
      <input
        id={toggleId}
        type="checkbox"
        className="toggle-input"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
      />
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

function UrlField({ label, value, onChange, placeholder, help, id }) {
  return <Field id={id} label={label} type="url" value={value} onChange={onChange} placeholder={placeholder} help={help} />
}

function ImageField({ label, value, onChange, previewUrl, onFileSelect, onRemove, placeholder, id, sizeInfo }) {
  const inputId = id || `field-${label?.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>{label}</label>
      {previewUrl && (
        <div className="image-preview">
          <img src={previewUrl} alt="Preview" className="image-preview-img" decoding="async" />
          <button
            type="button"
            className="image-preview-remove"
            onClick={onRemove}
            aria-label="Remove image"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}
      {sizeInfo && (
        <p className="image-size-info">
          {sizeInfo.originalSize > 0 && (
            <>
              <span className="image-size-original">{formatBytes(sizeInfo.originalSize)}</span>
              {' → '}
              <span className="image-size-optimized">{formatBytes(sizeInfo.optimizedSize)}</span>
              {sizeInfo.originalSize > sizeInfo.optimizedSize && (
                <span className="image-size reduction">
                  {' '}({Math.round((1 - sizeInfo.optimizedSize / sizeInfo.originalSize) * 100)}% smaller)
                </span>
              )}
            </>
          )}
        </p>
      )}
      <div className="image-controls">
        <label className="image-file-label">
          <input
            type="file"
            accept="image/*"
            className="image-file-input"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) onFileSelect(file)
              e.target.value = ''
            }}
          />
          <span className="image-file-btn">Choose Image</span>
        </label>
        <input
          id={inputId}
          type="url"
          className="field-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || 'https://...'}
        />
      </div>
    </div>
  )
}

/* ── Rich Field Components ─────────────────────────────────── */

function FieldGroup({ label, children, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!collapsible) {
    return (
      <div className="field-group">
        {label && <div className="field-group-label">{label}</div>}
        {children}
      </div>
    )
  }
  return (
    <details className="field-group field-group-collapsible" open={open} onToggle={e => setOpen(e.target.open)}>
      <summary className="field-group-summary">
        <span className="field-group-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {label}
      </summary>
      <div className="field-group-body">{children}</div>
    </details>
  )
}

function MetricsEditor({ metrics = [], onChange }) {
  const addMetric = () => {
    onChange([...metrics, { label: '', value: '', note: '' }])
  }
  const updateMetric = (i, field, val) => {
    const next = metrics.map((m, idx) => idx === i ? { ...m, [field]: val } : m)
    onChange(next)
  }
  const removeMetric = (i) => {
    onChange(metrics.filter((_, idx) => idx !== i))
  }

  return (
    <div className="metrics-editor">
      {metrics.length > 0 && (
        <div className="metrics-list">
          {metrics.map((m, i) => (
            <div key={i} className="metrics-item">
              <input
                type="text"
                className="field-input metrics-value"
                value={m.value || ''}
                onChange={e => updateMetric(i, 'value', e.target.value)}
                placeholder="Value"
              />
              <input
                type="text"
                className="field-input metrics-label"
                value={m.label || ''}
                onChange={e => updateMetric(i, 'label', e.target.value)}
                placeholder="Label"
              />
              <input
                type="text"
                className="field-input metrics-note"
                value={m.note || ''}
                onChange={e => updateMetric(i, 'note', e.target.value)}
                placeholder="Note (optional)"
              />
              <button type="button" onClick={() => removeMetric(i)} className="btn-remove-inline" aria-label="Remove metric">×</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={addMetric} className="btn-add-small">+ Add metric</button>
    </div>
  )
}

function TagsEditor({ tags = [], onChange }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const t = input.trim()
    if (t && !tags.includes(t)) {
      onChange([...tags, t])
    }
    setInput('')
  }

  const removeTag = (i) => {
    onChange(tags.filter((_, idx) => idx !== i))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag() }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }

  return (
    <div className="field">
      <div className="tags-editor">
        <div className="tags-list">
          {tags.map((t, i) => (
            <span key={i} className="tag-chip">
              {t}
              <button type="button" onClick={() => removeTag(i)} className="tag-remove" aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
        </div>
        <input
          type="text"
          className="field-input tags-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          placeholder="Type and press Enter to add"
        />
      </div>
    </div>
  )
}

function LinksEditor({ links = [], onChange }) {
  const addLink = () => {
    onChange([...links, { label: '', url: '' }])
  }
  const updateLink = (i, field, val) => {
    const next = links.map((l, idx) => idx === i ? { ...l, [field]: val } : l)
    onChange(next)
  }
  const removeLink = (i) => {
    onChange(links.filter((_, idx) => idx !== i))
  }

  return (
    <div className="links-editor">
      {links.length > 0 && (
        <div className="links-list">
          {links.map((l, i) => (
            <div key={i} className="links-item">
              <input
                type="text"
                className="field-input links-label"
                value={l.label || ''}
                onChange={e => updateLink(i, 'label', e.target.value)}
                placeholder="Label"
              />
              <input
                type="url"
                className="field-input links-url"
                value={l.url || ''}
                onChange={e => updateLink(i, 'url', e.target.value)}
                placeholder="https://..."
              />
              <button type="button" onClick={() => removeLink(i)} className="btn-remove-inline" aria-label="Remove link">×</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={addLink} className="btn-add-small">+ Add link</button>
    </div>
  )
}

/* ── Projects ──────────────────────────────────────────────── */

function ProjectsEditor({ projects, update, fileStore }) {
  const [previews, setPreviews] = useState(() => {
    const map = {}
    projects.forEach(p => { if (p.id) map[p.id] = null })
    return map
  })
  const [sizeInfos, setSizeInfos] = useState({})

  const addItem = () => {
    update('sections.projects.items', [...projects, {
      id: `project-${Date.now()}`,
      title: 'New Project',
      description: '',
      role: '',
      team: '',
      context: '',
      problem: '',
      approach: '',
      impact: '',
      metrics: [],
      tools: [],
      links: [],
      tags: [],
      color: '#6366f1',
      icon: 'Code',
      coverImage: '',
      imageAlt: '',
      featured: false,
      status: 'completed',
      responsibilities: '',
      constraints: '',
      lessons: '',
    }])
  }

  const updateItem = (i, field, value) => {
    const next = [...projects]
    next[i] = { ...next[i], [field]: value }
    update('sections.projects.items', next)
  }

  const removeItem = (i) => {
    const p = projects[i]
    if (p?.id) {
      if (previews[p.id]) URL.revokeObjectURL(previews[p.id])
      delete fileStore[p.id]
      setPreviews(prev => { const n = { ...prev }; delete n[p.id]; return n })
      setSizeInfos(prev => { const n = { ...prev }; delete n[p.id]; return n })
    }
    update('sections.projects.items', projects.filter((_, idx) => idx !== i))
  }

  const moveItem = (i, dir) => {
    const next = [...projects]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update('sections.projects.items', next)
  }

  const handleFileSelect = async (i, file) => {
    if (!file || !file.type.startsWith('image/')) return
    const p = projects[i]
    const prevUrl = previews[p.id]
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    const result = await optimizeImage(file, 'project')
    fileStore[p.id] = { dataUrl: result.dataUrl, originalName: file.name }
    setPreviews(prev => ({ ...prev, [p.id]: URL.createObjectURL(file) }))
    setSizeInfos(prev => ({ ...prev, [p.id]: { originalSize: result.originalSize, optimizedSize: result.optimizedSize } }))
    updateItem(i, 'coverImage', '')
  }

  const handleRemoveImage = (i) => {
    const p = projects[i]
    if (p?.id) {
      if (previews[p.id]) URL.revokeObjectURL(previews[p.id])
      delete fileStore[p.id]
      setPreviews(prev => { const n = { ...prev }; delete n[p.id]; return n })
      setSizeInfos(prev => { const n = { ...prev }; delete n[p.id]; return n })
    }
    updateItem(i, 'coverImage', '')
  }

  const getPreviewUrl = (p) => {
    if (p.id && previews[p.id]) return previews[p.id]
    if (p.coverImage) return p.coverImage
    return null
  }

  return (
    <div>
      <Toggle
        label="Featured section"
        checked={projects.length > 0 && projects.some(p => p.featured)}
        onChange={() => {}}
        help="Mark individual projects as featured below"
      />
      {projects.map((p, i) => (
        <ItemCard key={p.id} title={p.title} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === projects.length - 1} />
            <Toggle label="Featured" checked={!!p.featured} onChange={v => updateItem(i, 'featured', v)} />
          </div>

          <FieldGroup label="Basic Info">
            <div className="field-grid">
              <Field label="Title" value={p.title} onChange={v => updateItem(i, 'title', v)} />
              <Field label="Icon" value={p.icon} onChange={v => updateItem(i, 'icon', v)} placeholder="e.g. Bot, Search, Train" />
            </div>
            <Field label="Description" value={p.description} onChange={v => updateItem(i, 'description', v)} multiline />
            <div className="field-grid">
              <Select label="Status" value={p.status} onChange={v => updateItem(i, 'status', v)} options={[{ value: 'completed', label: 'Completed' }, { value: 'ongoing', label: 'Ongoing' }, { value: 'deployed', label: 'Deployed' }, { value: 'archived', label: 'Archived' }]} />
              <Field label="Role" value={p.role} onChange={v => updateItem(i, 'role', v)} placeholder="e.g. Lead Engineer" />
            </div>
            <div className="field-grid">
              <Field label="Team" value={p.team} onChange={v => updateItem(i, 'team', v)} placeholder="e.g. Solo, Team of 3" />
              <Field label="Context" value={p.context} onChange={v => updateItem(i, 'context', v)} placeholder="e.g. Academic, Personal, Startup" />
            </div>
          </FieldGroup>

          <FieldGroup label="Case Study" collapsible defaultOpen={false}>
            <Field label="Problem" value={p.problem} onChange={v => updateItem(i, 'problem', v)} multiline placeholder="What problem does this solve?" />
            <Field label="Approach" value={p.approach} onChange={v => updateItem(i, 'approach', v)} multiline placeholder="How was it built?" />
            <Field label="Impact / Outcome" value={p.impact} onChange={v => updateItem(i, 'impact', v)} multiline placeholder="What was the result?" />
            <Field label="Responsibilities" value={p.responsibilities} onChange={v => updateItem(i, 'responsibilities', v)} multiline placeholder="What was your specific role?" />
            <Field label="Constraints" value={p.constraints} onChange={v => updateItem(i, 'constraints', v)} multiline placeholder="What challenges did you face?" />
            <Field label="Lessons Learned" value={p.lessons} onChange={v => updateItem(i, 'lessons', v)} multiline placeholder="What did you learn?" />
          </FieldGroup>

          <FieldGroup label="Proof & Metrics" collapsible defaultOpen={false}>
            <MetricsEditor metrics={p.metrics || []} onChange={v => updateItem(i, 'metrics', v)} />
          </FieldGroup>

          <FieldGroup label="Links & Tags" collapsible defaultOpen={false}>
            <TagsEditor tags={p.tools || []} onChange={v => updateItem(i, 'tools', v)} />
            <LinksEditor links={p.links || []} onChange={v => updateItem(i, 'links', v)} />
          </FieldGroup>

          <FieldGroup label="Media" collapsible defaultOpen={false}>
            <TagsEditor tags={p.tags || []} onChange={v => updateItem(i, 'tags', v)} />
            <ImageField
              label="Cover Image"
              value={p.coverImage}
              onChange={v => { updateItem(i, 'coverImage', v); if (previews[p.id]) { URL.revokeObjectURL(previews[p.id]); delete fileStore[p.id]; setPreviews(prev => { const n = { ...prev }; delete n[p.id]; return n }); setSizeInfos(prev => { const n = { ...prev }; delete n[p.id]; return n }) } }}
              previewUrl={getPreviewUrl(p)}
              onFileSelect={(file) => handleFileSelect(i, file)}
              onRemove={() => handleRemoveImage(i)}
              placeholder="https://images.unsplash.com/..."
              sizeInfo={sizeInfos[p.id] || null}
            />
            <Field label="Image Alt Text" value={p.imageAlt} onChange={v => updateItem(i, 'imageAlt', v)} placeholder="Descriptive alt text for the image" />
            <div className="field-grid">
              <Field label="Color" value={p.color} onChange={v => updateItem(i, 'color', v)} type="color" />
            </div>
          </FieldGroup>
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Project" />
    </div>
  )
}

/* ── Experience ──────────────────────────────────────────────── */

function ExperienceEditor({ items, update }) {
  const addItem = () => {
    update('sections.experience.items', [...items, {
      role: 'New Role',
      company: 'Company',
      location: 'Location',
      period: 'Start – End',
      description: '',
      responsibilities: [],
      metrics: [],
      tools: [],
      links: [],
    }])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update('sections.experience.items', next)
  }

  const removeItem = (i) => update('sections.experience.items', items.filter((_, idx) => idx !== i))

  const moveItem = (i, dir) => {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update('sections.experience.items', next)
  }

  return (
    <div>
      {items.map((exp, i) => (
        <ItemCard key={i} title={exp.role} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === items.length - 1} />
          </div>
          <div className="field-grid">
            <Field label="Role" value={exp.role} onChange={v => updateItem(i, 'role', v)} />
            <Field label="Company" value={exp.company} onChange={v => updateItem(i, 'company', v)} />
          </div>
          <div className="field-grid">
            <Field label="Location" value={exp.location} onChange={v => updateItem(i, 'location', v)} />
            <Field label="Period" value={exp.period} onChange={v => updateItem(i, 'period', v)} />
          </div>
          <Field label="Description" value={exp.description} onChange={v => updateItem(i, 'description', v)} multiline />
          <FieldGroup label="Proof & Impact" collapsible defaultOpen={false}>
            <Field label="Responsibilities" value={Array.isArray(exp.responsibilities) ? exp.responsibilities.join('\n') : ''} onChange={v => updateItem(i, 'responsibilities', v.split('\n').filter(Boolean))} multiline placeholder="One per line" help="List key responsibilities, one per line" />
            <MetricsEditor metrics={exp.metrics || []} onChange={v => updateItem(i, 'metrics', v)} />
            <TagsEditor tags={exp.tools || []} onChange={v => updateItem(i, 'tools', v)} />
            <LinksEditor links={exp.links || []} onChange={v => updateItem(i, 'links', v)} />
          </FieldGroup>
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Experience" />
    </div>
  )
}

/* ── Education ──────────────────────────────────────────────── */

function EducationEditor({ items, update }) {
  const addItem = () => {
    update('sections.education.items', [...items, {
      institution: 'Institution',
      degree: 'Degree',
      location: 'Location',
      period: 'Start – End',
      description: '',
    }])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update('sections.education.items', next)
  }

  const removeItem = (i) => update('sections.education.items', items.filter((_, idx) => idx !== i))

  return (
    <div>
      {items.map((edu, i) => (
        <ItemCard key={i} title={edu.institution} index={i} onRemove={() => removeItem(i)}>
          <div className="field-grid">
            <Field label="Institution" value={edu.institution} onChange={v => updateItem(i, 'institution', v)} />
            <Field label="Degree" value={edu.degree} onChange={v => updateItem(i, 'degree', v)} />
          </div>
          <div className="field-grid">
            <Field label="Location" value={edu.location} onChange={v => updateItem(i, 'location', v)} />
            <Field label="Period" value={edu.period} onChange={v => updateItem(i, 'period', v)} />
          </div>
          <Field label="Description" value={edu.description} onChange={v => updateItem(i, 'description', v)} multiline />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Education" />
    </div>
  )
}

/* ── Skills ──────────────────────────────────────────────── */

function flattenCategories(skills) {
  if (!skills || typeof skills !== 'object') return []
  const cats = Array.isArray(skills.categories) ? skills.categories : []
  if (cats.length === 0) {
    if (Array.isArray(skills.items)) return skills.items
    return []
  }
  return cats.flatMap(cat => {
    if (!cat || typeof cat !== 'object') return []
    const name = cat.name || 'Uncategorized'
    const items = Array.isArray(cat.items) ? cat.items : []
    return items.map(item => `${name}: ${item}`)
  })
}

function parseFlatSkills(lines) {
  const categories = {}
  for (const line of lines) {
    if (!line) continue
    const sep = line.indexOf(':')
    if (sep > 0 && sep < line.length - 1) {
      const name = line.slice(0, sep).trim()
      const item = line.slice(sep + 1).trim()
      if (name && item) {
        if (!categories[name]) categories[name] = []
        categories[name].push(item)
      }
    } else {
      if (!categories['General']) categories['General'] = []
      categories['General'].push(line.trim())
    }
  }
  return Object.entries(categories).map(([name, items]) => ({ name, items }))
}

function SkillsEditor({ skills, update }) {
  const flat = flattenCategories(skills)
  const [draft, setDraft] = useState(flat.join('\n'))
  const [warn, setWarn] = useState(false)

  useEffect(() => {
    const next = flattenCategories(skills).join('\n')
    setDraft(next)
  }, [skills])

  function handleChange(v) {
    setDraft(v)
    const lines = v.split('\n').map(s => s.trim()).filter(Boolean)
    const categories = parseFlatSkills(lines)
    update('skills', { enabled: skills?.enabled !== false, categories })
  }

  const lineCount = draft.split('\n').length

  return (
    <div>
      {warn && (
        <p style={{ color: '#f59e0b', fontSize: 12, marginBottom: 8 }}>
          Skills data was malformed — loaded defaults.
        </p>
      )}
      <Field
        label="Skills (one per line, format: Category: Skill)"
        value={draft}
        onChange={handleChange}
        multiline
        placeholder={"Languages: Python\nAI & ML: TensorFlow\nBackend: FastAPI"}
        help={`${lineCount} items across ${parseFlatSkills(draft.split('\n').map(s => s.trim()).filter(Boolean)).length} categories`}
      />
    </div>
  )
}

/* ── Certifications ──────────────────────────────────────────── */

function CertificationsEditor({ items, update, fileStore }) {
  const [previews, setPreviews] = useState(() => {
    const map = {}
    items.forEach(c => { if (c.id) map[c.id] = null })
    return map
  })
  const [sizeInfos, setSizeInfos] = useState({})

  const addItem = () => {
    update('sections.certifications.items', [...items, {
      id: `cert-${Date.now()}`,
      title: 'New Certification',
      issuer: '',
      date: '',
      credential: '',
      image: '',
      imageAlt: '',
      description: '',
    }])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update('sections.certifications.items', next)
  }

  const removeItem = (i) => {
    const cert = items[i]
    if (cert?.id) {
      if (previews[cert.id]) URL.revokeObjectURL(previews[cert.id])
      delete fileStore[cert.id]
      setPreviews(prev => { const n = { ...prev }; delete n[cert.id]; return n })
      setSizeInfos(prev => { const n = { ...prev }; delete n[cert.id]; return n })
    }
    update('sections.certifications.items', items.filter((_, idx) => idx !== i))
  }

  const moveItem = (i, dir) => {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update('sections.certifications.items', next)
  }

  const handleFileSelect = async (i, file) => {
    if (!file || !file.type.startsWith('image/')) return
    const cert = items[i]
    const prevUrl = previews[cert.id]
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    const result = await optimizeImage(file, 'certificate')
    fileStore[cert.id] = { dataUrl: result.dataUrl, originalName: file.name }
    setPreviews(prev => ({ ...prev, [cert.id]: URL.createObjectURL(file) }))
    setSizeInfos(prev => ({ ...prev, [cert.id]: { originalSize: result.originalSize, optimizedSize: result.optimizedSize } }))
    updateItem(i, 'image', '')
  }

  const handleRemoveImage = (i) => {
    const cert = items[i]
    if (cert?.id) {
      if (previews[cert.id]) URL.revokeObjectURL(previews[cert.id])
      delete fileStore[cert.id]
      setPreviews(prev => { const n = { ...prev }; delete n[cert.id]; return n })
      setSizeInfos(prev => { const n = { ...prev }; delete n[cert.id]; return n })
    }
    updateItem(i, 'image', '')
  }

  const getPreviewUrl = (cert) => {
    if (cert.id && previews[cert.id]) return previews[cert.id]
    if (cert.image) return cert.image
    return null
  }

  return (
    <div>
      {items.map((cert, i) => (
        <ItemCard key={cert.id} title={cert.title} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === items.length - 1} />
          </div>
          <div className="field-grid">
            <Field label="Title" value={cert.title} onChange={v => updateItem(i, 'title', v)} />
            <Field label="Issuer" value={cert.issuer} onChange={v => updateItem(i, 'issuer', v)} placeholder="e.g. HackerRank, AWS, Google" />
          </div>
          <div className="field-grid">
            <Field label="Date" value={cert.date} onChange={v => updateItem(i, 'date', v)} placeholder="e.g. 2025, Nov 2025 – Nov 2028" />
            <Field label="Credential" value={cert.credential} onChange={v => updateItem(i, 'credential', v)} placeholder="e.g. #73 Globally, Completion" />
          </div>
          <Field label="Description" value={cert.description} onChange={v => updateItem(i, 'description', v)} multiline />
          <ImageField
            label="Certificate Image"
            value={cert.image}
            onChange={v => { updateItem(i, 'image', v); if (previews[cert.id]) { URL.revokeObjectURL(previews[cert.id]); delete fileStore[cert.id]; setPreviews(prev => { const n = { ...prev }; delete n[cert.id]; return n }); setSizeInfos(prev => { const n = { ...prev }; delete n[cert.id]; return n }) } }}
            previewUrl={getPreviewUrl(cert)}
            onFileSelect={(file) => handleFileSelect(i, file)}
            onRemove={() => handleRemoveImage(i)}
            placeholder="https://..."
            sizeInfo={sizeInfos[cert.id] || null}
          />
          <Field label="Image Alt Text" value={cert.imageAlt} onChange={v => updateItem(i, 'imageAlt', v)} placeholder="Descriptive alt text" />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Certification" />
    </div>
  )
}

/* ── Contact ──────────────────────────────────────────────── */

function ContactEditor({ contact, update }) {
  const updateLink = (i, field, value) => {
    const next = [...contact.links]
    next[i] = { ...next[i], [field]: value }
    update('contact.links', next)
  }

  const addLink = () => {
    update('contact.links', [...contact.links, { label: 'New', value: '', href: '' }])
  }

  const removeLink = (i) => {
    update('contact.links', contact.links.filter((_, idx) => idx !== i))
  }

  const availability = contact.availability || { status: 'closed', label: '', interests: [], preferredRoles: [], preferredLocations: [], responseTime: '', currentAffiliation: '' }

  const updateAvailability = (field, value) => {
    update('contact.availability', { ...availability, [field]: value })
  }

  return (
    <div>
      <FieldGroup label="CTA & Message">
        <Field label="CTA Text" value={contact.cta} onChange={v => update('contact.cta', v)} multiline />
        <Field label="Email" value={contact.email || ''} onChange={v => update('contact.email', v)} type="email" placeholder="you@example.com" />
        <div className="field-grid">
          <UrlField label="GitHub" value={contact.github || ''} onChange={v => update('contact.github', v)} placeholder="https://github.com/..." />
          <UrlField label="LinkedIn" value={contact.linkedin || ''} onChange={v => update('contact.linkedin', v)} placeholder="https://linkedin.com/in/..." />
        </div>
      </FieldGroup>

      <FieldGroup label="Availability & Status" collapsible defaultOpen={false}>
        <div className="field-grid">
          <Select label="Status" value={availability.status} onChange={v => updateAvailability('status', v)} options={[
            { value: 'open', label: 'Open to opportunities' },
            { value: 'selective', label: 'Selective' },
            { value: 'closed', label: 'Not available' },
          ]} />
          <Field label="Status Label" value={availability.label} onChange={v => updateAvailability('label', v)} placeholder="e.g. Open to opportunities" help="Short status message shown on public site" />
        </div>
        <TagsEditor tags={availability.interests || []} onChange={v => updateAvailability('interests', v)} />
        <p className="field-help">Interests: internships, full-time, collaboration, research, speaking, freelance</p>
        <TagsEditor tags={availability.preferredRoles || []} onChange={v => updateAvailability('preferredRoles', v)} />
        <p className="field-help">Preferred roles: Software Engineer, ML Engineer, etc.</p>
        <TagsEditor tags={availability.preferredLocations || []} onChange={v => updateAvailability('preferredLocations', v)} />
        <p className="field-help">Preferred locations: Remote, India, etc.</p>
        <div className="field-grid">
          <Field label="Response Time" value={availability.responseTime || ''} onChange={v => updateAvailability('responseTime', v)} placeholder="e.g. Usually responds within 24 hours" />
          <Field label="Current Affiliation" value={availability.currentAffiliation || ''} onChange={v => updateAvailability('currentAffiliation', v)} placeholder="e.g. B.S. Data Science @ IIT Madras" />
        </div>
      </FieldGroup>

      <FieldGroup label="Contact Links">
        {contact.links.map((link, i) => (
          <ItemCard key={i} title={link.label} index={i} onRemove={() => removeLink(i)}>
            <div className="field-grid">
              <Field label="Label" value={link.label} onChange={v => updateLink(i, 'label', v)} />
              <Field label="Value" value={link.value} onChange={v => updateLink(i, 'value', v)} />
            </div>
            <UrlField label="Href" value={link.href} onChange={v => updateLink(i, 'href', v)} placeholder="https://..." />
          </ItemCard>
        ))}
        <AddButton onClick={addLink} label="Add Contact Link" />
      </FieldGroup>
    </div>
  )
}

/* ── Generic List Editor ──────────────────────────────────────── */

function GenericListEditor({ sectionKey, section, update, fields }) {
  const items = Array.isArray(section?.items) ? section.items : []
  const enabled = section?.enabled !== false

  const addItem = () => {
    const newItem = { id: `${sectionKey}-${Date.now()}` }
    fields.forEach(f => { newItem[f.key] = '' })
    update(`sections.${sectionKey}.items`, [...items, newItem])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update(`sections.${sectionKey}.items`, next)
  }

  const removeItem = (i) => {
    update(`sections.${sectionKey}.items`, items.filter((_, idx) => idx !== i))
  }

  const moveItem = (i, dir) => {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update(`sections.${sectionKey}.items`, next)
  }

  const toggleEnabled = (val) => {
    update(`sections.${sectionKey}.enabled`, val)
  }

  return (
    <div>
      <Toggle label="Section enabled" checked={enabled} onChange={toggleEnabled} help={enabled ? 'Visible on public site when items exist' : 'Hidden from public site'} />
      {items.length === 0 && (
        <p className="field-help" style={{ margin: '12px 0' }}>No items yet. Add one below to get started.</p>
      )}
      {items.map((item, i) => (
        <ItemCard key={item.id || i} title={item[fields[0]?.key] || `Item ${i + 1}`} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === items.length - 1} />
          </div>
          {fields.map(f => (
            <Field
              key={f.key}
              label={f.label}
              value={item[f.key] || ''}
              onChange={v => updateItem(i, f.key, v)}
              multiline={f.multiline}
              placeholder={f.placeholder}
            />
          ))}
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label={`Add ${sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1).replace(/([A-Z])/g, ' $1')}`} />
    </div>
  )
}

/* ── Enhanced List Editor (with field groups + rich fields) ─── */

function EnhancedListEditor({ sectionKey, section, update, basicFields = [], extraFields = [], hasMetrics, hasTags, hasLinks, hasTools, hasGallery }) {
  const items = Array.isArray(section?.items) ? section.items : []
  const enabled = section?.enabled !== false

  const addItem = () => {
    const newItem = { id: `${sectionKey}-${Date.now()}` }
    basicFields.forEach(f => { newItem[f.key] = '' })
    extraFields.forEach(f => { newItem[f.key] = '' })
    if (hasMetrics) newItem.metrics = []
    if (hasTags) newItem.tags = []
    if (hasLinks) newItem.links = []
    if (hasTools) newItem.tools = []
    if (hasGallery) newItem.gallery = []
    update(`sections.${sectionKey}.items`, [...items, newItem])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update(`sections.${sectionKey}.items`, next)
  }

  const removeItem = (i) => {
    update(`sections.${sectionKey}.items`, items.filter((_, idx) => idx !== i))
  }

  const moveItem = (i, dir) => {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update(`sections.${sectionKey}.items`, next)
  }

  const toggleEnabled = (val) => {
    update(`sections.${sectionKey}.enabled`, val)
  }

  const titleKey = basicFields[0]?.key || 'title'

  return (
    <div>
      <Toggle label="Section enabled" checked={enabled} onChange={toggleEnabled} help={enabled ? 'Visible on public site when items exist' : 'Hidden from public site'} />
      {items.length === 0 && (
        <p className="field-help" style={{ margin: '12px 0' }}>No items yet. Add one below to get started.</p>
      )}
      {items.map((item, i) => (
        <ItemCard key={item.id || i} title={item[titleKey] || `Item ${i + 1}`} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === items.length - 1} />
          </div>

          <FieldGroup label="Basic Info">
            {basicFields.map(f => (
              f.type === 'select' ? (
                <Select key={f.key} label={f.label} value={item[f.key] || ''} onChange={v => updateItem(i, f.key, v)} options={f.options} />
              ) : (
                <Field
                  key={f.key}
                  label={f.label}
                  value={item[f.key] || ''}
                  onChange={v => updateItem(i, f.key, v)}
                  multiline={f.multiline}
                  placeholder={f.placeholder}
                  type={f.type}
                />
              )
            ))}
          </FieldGroup>

          {extraFields.length > 0 && (
            <FieldGroup label="Details" collapsible defaultOpen={false}>
              {extraFields.map(f => (
                f.type === 'select' ? (
                  <Select key={f.key} label={f.label} value={item[f.key] || ''} onChange={v => updateItem(i, f.key, v)} options={f.options} />
                ) : (
                  <Field
                    key={f.key}
                    label={f.label}
                    value={item[f.key] || ''}
                    onChange={v => updateItem(i, f.key, v)}
                    multiline={f.multiline}
                    placeholder={f.placeholder}
                    type={f.type}
                  />
                )
              ))}
            </FieldGroup>
          )}

          {hasMetrics && (
            <FieldGroup label="Metrics & Proof" collapsible defaultOpen={false}>
              <MetricsEditor metrics={item.metrics || []} onChange={v => updateItem(i, 'metrics', v)} />
            </FieldGroup>
          )}

          {(hasTags || hasTools) && (
            <FieldGroup label="Tags & Stack" collapsible defaultOpen={false}>
              {hasTools && <TagsEditor tags={item.tools || []} onChange={v => updateItem(i, 'tools', v)} />}
              {hasTags && <TagsEditor tags={item.tags || []} onChange={v => updateItem(i, 'tags', v)} />}
            </FieldGroup>
          )}

          {hasLinks && (
            <FieldGroup label="Links" collapsible defaultOpen={false}>
              <LinksEditor links={item.links || []} onChange={v => updateItem(i, 'links', v)} />
            </FieldGroup>
          )}

          {hasGallery && (
            <FieldGroup label="Gallery" collapsible defaultOpen={false}>
              <TagsEditor tags={item.gallery || []} onChange={v => updateItem(i, 'gallery', v)} />
              <p className="field-help">Add image URLs for the project gallery</p>
            </FieldGroup>
          )}
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label={`Add ${sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1).replace(/([A-Z])/g, ' $1')}`} />
    </div>
  )
}

/* ── Resume ──────────────────────────────────────────────── */

function ResumeEditor({ resume, update }) {
  const items = resume?.items || []

  const addItem = () => {
    update('sections.resume.items', [...items, {
      id: `resume-${Date.now()}`,
      label: 'Resume',
      url: '',
      note: '',
      variant: 'resume',
    }])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update('sections.resume.items', next)
  }

  const removeItem = (i) => {
    update('sections.resume.items', items.filter((_, idx) => idx !== i))
  }

  const moveItem = (i, dir) => {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update('sections.resume.items', next)
  }

  return (
    <div>
      <Toggle label="Section enabled" checked={resume?.enabled !== false} onChange={v => update('sections.resume.enabled', v)} help="Show resume download links on public site" />
      <p className="field-help" style={{ margin: '8px 0 16px' }}>
        Add resume variants (e.g. standard resume, one-page CV, academic CV, research CV). ATS-friendly tip: use clear labels like "Software Engineering Resume" or "Research CV".
      </p>
      {items.map((item, i) => (
        <ItemCard key={item.id || i} title={item.label || `Variant ${i + 1}`} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === items.length - 1} />
          </div>
          <div className="field-grid">
            <Field label="Label" value={item.label} onChange={v => updateItem(i, 'label', v)} placeholder="e.g. Resume, One-Page CV, Research CV" help="Display label on the button" />
            <Select label="Variant" value={item.variant} onChange={v => updateItem(i, 'variant', v)} options={[
              { value: 'resume', label: 'Standard Resume' },
              { value: 'cv', label: 'Full CV' },
              { value: 'onepage', label: 'One-Page Version' },
              { value: 'research', label: 'Research CV' },
            ]} />
          </div>
          <UrlField label="Download URL" value={item.url} onChange={v => updateItem(i, 'url', v)} placeholder="https://drive.google.com/..." help="Link to the resume PDF" />
          <Field label="Note (optional)" value={item.note} onChange={v => updateItem(i, 'note', v)} placeholder="e.g. ATS-friendly, Last updated Jan 2026" help="Short note shown below the button" />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Resume Variant" />
    </div>
  )
}

/* ── Raw JSON ──────────────────────────────────────────────── */

function JsonEditor({ data, setData }) {
  const [json, setJson] = useState(() => JSON.stringify(data, null, 2))
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    setJson(JSON.stringify(data, null, 2))
  }, [data])

  const handleApply = () => {
    try {
      const parsed = JSON.parse(json)
      setData(parsed)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <p className="field-help">
        Edit the raw JSON below. Click "Apply" to update the editor state.
      </p>
      <textarea
        ref={textareaRef}
        className="field-json"
        value={json}
        onChange={e => setJson(e.target.value)}
        spellCheck={false}
      />
      {error && <p className="field-error" role="alert">JSON Error: {error}</p>}
      <div className="field-row" style={{ marginTop: 8 }}>
        <button onClick={handleApply} className="btn-admin btn-admin-primary">
          Apply JSON
        </button>
      </div>
    </div>
  )
}
