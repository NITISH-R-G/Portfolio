import { useState, useCallback } from 'react'
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

export default function AdminEditor() {
  const [data, setData] = useState(() => loadDraft() || deepClone(portfolioData))
  const [activeTab, setActiveTab] = useState('projects')
  const [saved, setSaved] = useState(false)

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

  const handleExport = () => {
    const content = `const portfolio = ${JSON.stringify(data, null, 2)}\n\nexport default portfolio\n`
    downloadFile(content, 'portfolio.js')
  }

  const handleReset = () => {
    if (confirm('Reset all changes to defaults?')) {
      localStorage.removeItem(STORAGE_KEY)
      setData(deepClone(portfolioData))
    }
  }

  const tabs = [
    { id: 'projects', label: 'Projects' },
    { id: 'experience', label: 'Experience' },
    { id: 'education', label: 'Education' },
    { id: 'skills', label: 'Skills' },
    { id: 'certifications', label: 'Certs' },
    { id: 'contact', label: 'Contact' },
    { id: 'json', label: 'Raw JSON' },
  ]

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Portfolio Editor</h1>
          <p style={styles.subtitle}>Edit content, then download the updated file.</p>
        </div>
        <div style={styles.actions}>
          <button onClick={handleSave} style={{ ...styles.btn, ...styles.btnPrimary }}>
            {saved ? 'Saved ✓' : 'Save Draft'}
          </button>
          <button onClick={handleExport} style={{ ...styles.btn, ...styles.btnGhost }}>
            Download JS
          </button>
          <button onClick={handleReset} style={{ ...styles.btn, ...styles.btnDanger }}>
            Reset
          </button>
        </div>
      </header>

      <nav style={styles.tabs}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...styles.tab,
              ...(activeTab === t.id ? styles.tabActive : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {activeTab === 'projects' && (
          <ProjectsEditor projects={data.sections.projects.items} update={update} />
        )}
        {activeTab === 'experience' && (
          <ExperienceEditor items={data.sections.experience.items} update={update} />
        )}
        {activeTab === 'education' && (
          <EducationEditor items={data.sections.education.items} update={update} />
        )}
        {activeTab === 'skills' && (
          <SkillsEditor skills={data.sections.skills.items} update={update} />
        )}
        {activeTab === 'certifications' && (
          <CertificationsEditor items={data.sections.certifications.items} update={update} />
        )}
        {activeTab === 'contact' && (
          <ContactEditor contact={data.contact} update={update} />
        )}
        {activeTab === 'json' && (
          <JsonEditor data={data} update={update} />
        )}
      </main>
    </div>
  )
}

function Field({ label, value, onChange, multiline, type = 'text' }) {
  const inputStyle = multiline ? styles.textarea : styles.input
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  )
}

function ItemCard({ children, onRemove }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <button onClick={onRemove} style={styles.removeBtn}>Remove</button>
      </div>
      {children}
    </div>
  )
}

function AddButton({ onClick, label }) {
  return (
    <button onClick={onClick} style={styles.addBtn}>+ {label}</button>
  )
}

function ProjectsEditor({ projects, update }) {
  const addItem = () => {
    const newItem = {
      id: `project-${Date.now()}`,
      title: 'New Project',
      description: '',
      tags: [],
      color: '#6366f1',
      icon: 'Code',
      link: 'https://github.com/NITISH-R-G',
      coverImage: '',
      imageAlt: '',
    }
    update('sections.projects.items', [...projects, newItem])
  }

  const updateItem = (i, field, value) => {
    const next = [...projects]
    next[i] = { ...next[i], [field]: value }
    update('sections.projects.items', next)
  }

  const removeItem = (i) => {
    update('sections.projects.items', projects.filter((_, idx) => idx !== i))
  }

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
        <ItemCard key={p.id} onRemove={() => removeItem(i)}>
          <div style={styles.row}>
            <button onClick={() => moveItem(i, -1)} style={styles.moveBtn} disabled={i === 0}>↑</button>
            <button onClick={() => moveItem(i, 1)} style={styles.moveBtn} disabled={i === projects.length - 1}>↓</button>
          </div>
          <Field label="Title" value={p.title} onChange={v => updateItem(i, 'title', v)} />
          <Field label="Description" value={p.description} onChange={v => updateItem(i, 'description', v)} multiline />
          <Field label="Tags (comma-separated)" value={p.tags?.join(', ')} onChange={v => updateItem(i, 'tags', v.split(',').map(t => t.trim()).filter(Boolean))} />
          <Field label="Cover Image URL" value={p.coverImage} onChange={v => updateItem(i, 'coverImage', v)} />
          <Field label="Image Alt Text" value={p.imageAlt} onChange={v => updateItem(i, 'imageAlt', v)} />
          <Field label="Color" value={p.color} onChange={v => updateItem(i, 'color', v)} />
          <Field label="Icon (Lucide name)" value={p.icon} onChange={v => updateItem(i, 'icon', v)} />
          <Field label="Link" value={p.link} onChange={v => updateItem(i, 'link', v)} />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Project" />
    </div>
  )
}

function ExperienceEditor({ items, update }) {
  const addItem = () => {
    const newItem = {
      role: 'New Role',
      company: 'Company',
      location: 'Location',
      period: 'Start – End',
      description: '',
    }
    update('sections.experience.items', [...items, newItem])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update('sections.experience.items', next)
  }

  const removeItem = (i) => {
    update('sections.experience.items', items.filter((_, idx) => idx !== i))
  }

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
        <ItemCard key={i} onRemove={() => removeItem(i)}>
          <div style={styles.row}>
            <button onClick={() => moveItem(i, -1)} style={styles.moveBtn} disabled={i === 0}>↑</button>
            <button onClick={() => moveItem(i, 1)} style={styles.moveBtn} disabled={i === items.length - 1}>↓</button>
          </div>
          <Field label="Role" value={exp.role} onChange={v => updateItem(i, 'role', v)} />
          <Field label="Company" value={exp.company} onChange={v => updateItem(i, 'company', v)} />
          <Field label="Location" value={exp.location} onChange={v => updateItem(i, 'location', v)} />
          <Field label="Period" value={exp.period} onChange={v => updateItem(i, 'period', v)} />
          <Field label="Description" value={exp.description} onChange={v => updateItem(i, 'description', v)} multiline />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Experience" />
    </div>
  )
}

function EducationEditor({ items, update }) {
  const addItem = () => {
    const newItem = {
      institution: 'Institution',
      degree: 'Degree',
      location: 'Location',
      period: 'Start – End',
      description: '',
    }
    update('sections.education.items', [...items, newItem])
  }

  const updateItem = (i, field, value) => {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    update('sections.education.items', next)
  }

  const removeItem = (i) => {
    update('sections.education.items', items.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {items.map((edu, i) => (
        <ItemCard key={i} onRemove={() => removeItem(i)}>
          <Field label="Institution" value={edu.institution} onChange={v => updateItem(i, 'institution', v)} />
          <Field label="Degree" value={edu.degree} onChange={v => updateItem(i, 'degree', v)} />
          <Field label="Location" value={edu.location} onChange={v => updateItem(i, 'location', v)} />
          <Field label="Period" value={edu.period} onChange={v => updateItem(i, 'period', v)} />
          <Field label="Description" value={edu.description} onChange={v => updateItem(i, 'description', v)} multiline />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Education" />
    </div>
  )
}

function SkillsEditor({ skills, update }) {
  return (
    <div>
      <Field
        label="Skills (one per line)"
        value={skills.join('\n')}
        onChange={v => update('sections.skills.items', v.split('\n').map(s => s.trim()).filter(Boolean))}
        multiline
      />
    </div>
  )
}

function CertificationsEditor({ items, update }) {
  const addItem = () => {
    update('sections.certifications.items', [...items, 'New Certification'])
  }

  const updateItem = (i, value) => {
    const next = [...items]
    next[i] = value
    update('sections.certifications.items', next)
  }

  const removeItem = (i) => {
    update('sections.certifications.items', items.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {items.map((cert, i) => (
        <ItemCard key={i} onRemove={() => removeItem(i)}>
          <Field label={`Certification ${i + 1}`} value={cert} onChange={v => updateItem(i, v)} />
        </ItemCard>
      ))}
      <AddButton onClick={addItem} label="Add Certification" />
    </div>
  )
}

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
        <ItemCard key={i} onRemove={() => removeLink(i)}>
          <Field label="Label" value={link.label} onChange={v => updateLink(i, 'label', v)} />
          <Field label="Value" value={link.value} onChange={v => updateLink(i, 'value', v)} />
          <Field label="Href" value={link.href} onChange={v => updateLink(i, 'href', v)} />
        </ItemCard>
      ))}
      <AddButton onClick={addLink} label="Add Contact Link" />
    </div>
  )
}

function JsonEditor({ data, update }) {
  const [json, setJson] = useState(JSON.stringify(data, null, 2))
  const [error, setError] = useState(null)

  const handleApply = () => {
    try {
      const parsed = JSON.parse(json)
      setData(parsed)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const setData = (parsed) => {
    update('__root', parsed)
  }

  return (
    <div>
      <p style={styles.help}>
        Edit the raw JSON below. Click "Apply" to update the editor state.
      </p>
      <textarea
        value={json}
        onChange={e => setJson(e.target.value)}
        style={styles.jsonArea}
        spellCheck={false}
      />
      {error && <p style={styles.error}>JSON Error: {error}</p>}
      <button onClick={handleApply} style={{ ...styles.btn, ...styles.btnPrimary, marginTop: 8 }}>
        Apply JSON
      </button>
    </div>
  )
}

const styles = {
  container: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: '#0A0A0A',
    color: '#fff',
    minHeight: '100vh',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
  },
  title: { fontSize: '1.5rem', fontWeight: 600, margin: 0 },
  subtitle: { fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' },
  actions: { display: 'flex', gap: 8 },
  btn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnPrimary: { background: '#fff', color: '#0A0A0A', border: 'none' },
  btnGhost: { background: 'transparent' },
  btnDanger: { background: 'transparent', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 24,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    paddingBottom: 8,
    overflowX: 'auto',
  },
  tab: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  tabActive: { background: 'rgba(255,255,255,0.1)', color: '#fff' },
  main: { maxWidth: 720 },
  card: {
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    background: 'rgba(255,255,255,0.03)',
  },
  cardHeader: { display: 'flex', justifyContent: 'flex-end', marginBottom: 8 },
  field: { display: 'block', marginBottom: 12 },
  label: { display: 'block', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical',
    minHeight: 80,
  },
  jsonArea: {
    width: '100%',
    minHeight: 400,
    padding: 12,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: '#e2e8f0',
    fontSize: '0.75rem',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    outline: 'none',
    resize: 'vertical',
    lineHeight: 1.5,
  },
  row: { display: 'flex', gap: 4, marginBottom: 8 },
  moveBtn: {
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  removeBtn: {
    padding: '4px 10px',
    borderRadius: 4,
    border: '1px solid rgba(239,68,68,0.3)',
    background: 'transparent',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '0.6875rem',
  },
  addBtn: {
    padding: '10px 16px',
    borderRadius: 6,
    border: '1px dashed rgba(255,255,255,0.15)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    width: '100%',
    fontFamily: 'inherit',
  },
  help: { fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', marginBottom: 12 },
  error: { fontSize: '0.8125rem', color: '#ef4444', marginTop: 8 },
}
