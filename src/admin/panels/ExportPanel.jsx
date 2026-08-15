/**
 * Getting the changes out of the browser and into the repository.
 *
 * The builder is a static page with no server, so it cannot write to disk — and it says so
 * plainly rather than implying a save that never happens. Two files come out of it:
 *
 *   src/data/overrides.json   content edits, hides and pins
 *   portfolio.config.js       a patch to merge into the config
 *
 * Both are shown, copyable and downloadable, because "download" behaves differently across
 * browsers and a copy button always works.
 *
 * @module admin/panels/ExportPanel
 */

import { useState } from 'react'
import Icon from '../../components/Icon'
import { Panel, Note } from '../fields.jsx'
import { hasContent } from '../state.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ExportPanel({ builder }) {
  const { overrides, configDraft, built, dirty, reset } = builder
  const [copied, setCopied] = useState('')

  const overridesJson = `${JSON.stringify(overrides, null, 2)}\n`
  const configSnippet = renderConfigPatch(configDraft)

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setCopied('failed')
    }
  }

  const download = (filename, text, type) => {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    // Revoking immediately would race the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Panel
      title="Save your changes"
      description="This page runs entirely in your browser and cannot write files. Copy each block into the file named above it."
    >
      {!dirty && (
        <Note icon="Check">
          Nothing to save — you have not changed anything yet.
        </Note>
      )}

      {hasContent(overrides) && (
        <section className="export-block">
          <header className="export-head">
            <h3 className="admin-subheading">src/data/overrides.json</h3>
            <div className="admin-actions">
              <button type="button" className="btn-admin btn-admin-ghost"
                onClick={() => copy('overrides', overridesJson)}>
                <Icon name={copied === 'overrides' ? 'Check' : 'Copy'} size={14} />
                {copied === 'overrides' ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="btn-admin btn-admin-primary"
                onClick={() => download('overrides.json', overridesJson, 'application/json')}>
                <Icon name="Download" size={14} /> Download
              </button>
            </div>
          </header>
          <p className="field-help">
            Your content edits, hides and pins. They are applied on top of imported data, so
            re-importing never overwrites them.
          </p>
          <pre className="export-code"><code>{overridesJson}</code></pre>
        </section>
      )}

      {hasContent(configDraft) && (
        <section className="export-block">
          <header className="export-head">
            <h3 className="admin-subheading">portfolio.config.js</h3>
            <div className="admin-actions">
              <button type="button" className="btn-admin btn-admin-ghost"
                onClick={() => copy('config', configSnippet)}>
                <Icon name={copied === 'config' ? 'Check' : 'Copy'} size={14} />
                {copied === 'config' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </header>
          <p className="field-help">
            Merge these keys into the object you pass to <code>defineConfig</code>. Only what you
            changed is listed.
          </p>
          <pre className="export-code"><code>{configSnippet}</code></pre>
        </section>
      )}

      <h3 className="admin-subheading">Other exports</h3>
      <p className="field-help">
        Your résumé, GitHub profile README and machine-readable profile all come from this same
        data. Run <code>npm run export</code> to regenerate them into <code>exports/</code>.
      </p>

      <div className="admin-actions">
        <button type="button" className="btn-admin btn-admin-ghost"
          onClick={() => download('portfolio.json', `${JSON.stringify(built.profile, null, 2)}\n`, 'application/json')}>
          <Icon name="Download" size={14} /> portfolio.json
        </button>
      </div>

      {dirty && (
        <>
          <h3 className="admin-subheading">Start over</h3>
          <p className="field-help">
            Discards every unsaved change in this browser. Anything already committed to{' '}
            <code>overrides.json</code> or <code>portfolio.config.js</code> is untouched.
          </p>
          <button
            type="button"
            className="btn-admin btn-admin-danger"
            onClick={() => {
              if (confirm('Discard all unsaved changes in this browser?')) reset()
            }}
          >
            <Icon name="Trash2" size={14} /> Discard unsaved changes
          </button>
        </>
      )}
    </Panel>
  )
}

/**
 * Render the config draft as pasteable JavaScript.
 *
 * JSON would technically work — it is valid JS — but the file it goes into uses unquoted
 * keys and single quotes throughout, and a pasted block that does not match the surrounding
 * style is a block the user has to reformat by hand.
 *
 * @param {Record<string, unknown>} draft
 * @returns {string}
 */
function renderConfigPatch(draft) {
  const body = Object.entries(draft)
    .map(([key, value]) => `  ${key}: ${js(value, 1)},`)
    .join('\n')
  return `${body}\n`
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {string}
 */
function js(value, depth) {
  const pad = '  '.repeat(depth + 1)
  const closePad = '  '.repeat(depth)

  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every((v) => typeof v === 'string')) {
      const inline = `[${value.map((v) => js(v, depth)).join(', ')}]`
      // A long section order is unreadable on one line and is exactly the value most
      // likely to be long.
      if (inline.length <= 72) return inline
      return `[\n${value.map((v) => `${pad}${js(v, depth + 1)},`).join('\n')}\n${closePad}]`
    }
    return `[\n${value.map((v) => `${pad}${js(v, depth + 1)},`).join('\n')}\n${closePad}]`
  }

  const entries = Object.entries(value)
  if (!entries.length) return '{}'
  return `{\n${entries
    .map(([key, v]) => `${pad}${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${key}'`}: ${js(v, depth + 1)},`)
    .join('\n')}\n${closePad}}`
}
