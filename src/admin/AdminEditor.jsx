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

function normalizeSkills(skills) {
  if (!skills || typeof skills !== 'object') return { enabled: true, categories: [] }
  if (Array.isArray(skills.categories)) return skills
  if (Array.isArray(skills.items)) {
    return { enabled: skills.enabled !== false, categories: [{ name: 'General', items: skills.items }] }
  }
  return skills
}

const TABS = [
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'contact', label: 'Contact' },
  { id: 'json', label: 'Raw JSON' },
]

const TAB_IDS = TABS.map(t => `tab-${t.id}`)
const PANEL_IDS = TABS.map(t => `panel-${t.id}`)

export default function AdminEditor() {
  const [data, setData] = useState(() => {
    const loaded = loadDraft() || deepClone(portfolioData)
    loaded.skills = normalizeSkills(loaded.skills)
    return loaded
  })
  const [activeTab, setActiveTab] = useState('projects')
  const [saved, setSaved] = useState(false)
  const tabRefs = useRef([])

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

  const handleExport = () => downloadJSON(data, 'portfolio.js')

  const handleReset = () => {
    if (confirm('Reset all changes to defaults?')) {
      localStorage.removeItem(STORAGE_KEY)
      setData(deepClone(portfolioData))
    }
  }

  const activeIndex = TABS.findIndex(t => t.id === activeTab)

  const handleTabKeyDown = (e) => {
    const isHorizontal = true
    let newIndex = activeIndex

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      newIndex = (activeIndex + 1) % TABS.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      newIndex = (activeIndex - 1 + TABS.length) % TABS.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      newIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      newIndex = TABS.length - 1
    } else {
      return
    }

    setActiveTab(TABS[newIndex].id)
    tabRefs.current[newIndex]?.focus()
  }

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Portfolio Editor</h1>
          <p className="admin-subtitle">Edit content, then download the updated file.</p>
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

      <nav className="admin-tabs" role="tablist" aria-label="Editor sections" aria-orientation="horizontal" onKeyDown={handleTabKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={el => { tabRefs.current[i] = el }}
            id={TAB_IDS[i]}
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={PANEL_IDS[i]}
            tabIndex={activeTab === t.id ? 0 : -1}
            onClick={() => setActiveTab(t.id)}
            className={`admin-tab ${activeTab === t.id ? 'admin-tab-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main
        className="admin-main"
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'projects' && <ProjectsEditor projects={data.sections.projects.items} update={update} />}
        {activeTab === 'experience' && <ExperienceEditor items={data.sections.experience.items} update={update} />}
        {activeTab === 'education' && <EducationEditor items={data.sections.education.items} update={update} />}
        {activeTab === 'skills' && <SkillsEditor skills={data.skills} update={update} />}
        {activeTab === 'certifications' && <CertificationsEditor items={data.sections.certifications.items} update={update} />}
        {activeTab === 'contact' && <ContactEditor contact={data.contact} update={update} />}
        {activeTab === 'json' && <JsonEditor data={data} setData={setData} />}
      </main>
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

/* ── Projects ──────────────────────────────────────────────── */

function ProjectsEditor({ projects, update }) {
  const addItem = () => {
    update('sections.projects.items', [...projects, {
      id: `project-${Date.now()}`,
      title: 'New Project',
      description: '',
      tags: [],
      color: '#6366f1',
      icon: 'Code',
      link: 'https://github.com/NITISH-R-G',
      coverImage: '',
      imageAlt: '',
    }])
  }

  const updateItem = (i, field, value) => {
    const next = [...projects]
    next[i] = { ...next[i], [field]: value }
    update('sections.projects.items', next)
  }

  const removeItem = (i) => update('sections.projects.items', projects.filter((_, idx) => idx !== i))

  const moveItem = (i, dir) => {
    const next = [...projects]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update('sections.projects.items', next)
  }

  return (
    <div>
      {projects.map((p, i) => (
        <ItemCard key={p.id} title={p.title} index={i} onRemove={() => removeItem(i)}>
          <div className="field-row">
            <MoveButtons onUp={() => moveItem(i, -1)} onDown={() => moveItem(i, 1)} canUp={i === 0} canDown={i === projects.length - 1} />
          </div>
          <div className="field-grid">
            <Field label="Title" value={p.title} onChange={v => updateItem(i, 'title', v)} />
            <Field label="Icon" value={p.icon} onChange={v => updateItem(i, 'icon', v)} placeholder="e.g. Bot, Search, Train" />
          </div>
          <Field label="Description" value={p.description} onChange={v => updateItem(i, 'description', v)} multiline />
          <Field label="Tags (comma-separated)" value={p.tags?.join(', ')} onChange={v => updateItem(i, 'tags', v.split(',').map(t => t.trim()).filter(Boolean))} />
          <Field label="Cover Image URL" value={p.coverImage} onChange={v => updateItem(i, 'coverImage', v)} placeholder="https://images.unsplash.com/..." />
          <Field label="Image Alt Text" value={p.imageAlt} onChange={v => updateItem(i, 'imageAlt', v)} placeholder="Descriptive alt text for the image" />
          <div className="field-grid">
            <Field label="Color" value={p.color} onChange={v => updateItem(i, 'color', v)} type="color" />
            <Field label="Link" value={p.link} onChange={v => updateItem(i, 'link', v)} placeholder="https://github.com/..." />
          </div>
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

function CertificationsEditor({ items, update }) {
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

  const removeItem = (i) => update('sections.certifications.items', items.filter((_, idx) => idx !== i))

  const moveItem = (i, dir) => {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update('sections.certifications.items', next)
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
          <Field label="Image URL" value={cert.image} onChange={v => updateItem(i, 'image', v)} placeholder="https://..." />
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

  return (
    <div>
      <Field label="CTA Text" value={contact.cta} onChange={v => update('contact.cta', v)} multiline />
      {contact.links.map((link, i) => (
        <ItemCard key={i} title={link.label} index={i} onRemove={() => removeLink(i)}>
          <div className="field-grid">
            <Field label="Label" value={link.label} onChange={v => updateLink(i, 'label', v)} />
            <Field label="Value" value={link.value} onChange={v => updateLink(i, 'value', v)} />
          </div>
          <Field label="Href" value={link.href} onChange={v => updateLink(i, 'href', v)} />
        </ItemCard>
      ))}
      <AddButton onClick={addLink} label="Add Contact Link" />
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
