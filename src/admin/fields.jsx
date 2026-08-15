/**
 * Form primitives for the builder.
 *
 * All of them reuse the `field-*` classes already in `styles/global.css`, so the builder
 * inherits the portfolio's visual language rather than growing a second one.
 *
 * @module admin/fields
 */

import { useId } from 'react'
import Icon from '../components/Icon'

/**
 * @param {{
 *   label: string, help?: string, children: React.ReactNode,
 *   overridden?: boolean, onRevert?: () => void,
 * }} props
 */
export function Field({ label, help, children, overridden, onRevert }) {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        {/* An explicit marker for "this value is yours, not the connector's" — without it,
            a user cannot tell which fields will survive the next import unchanged. */}
        {overridden && (
          <button type="button" className="field-override-badge" onClick={onRevert}
            title="You changed this. Click to go back to the imported value.">
            edited
          </button>
        )}
      </label>
      {children}
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

/**
 * @param {{
 *   label: string, value?: string, onChange: (value: string) => void,
 *   placeholder?: string, help?: string, type?: string,
 *   overridden?: boolean, onRevert?: () => void,
 * }} props
 */
export function TextField({ label, value, onChange, placeholder, help, type = 'text', overridden, onRevert }) {
  return (
    <Field label={label} help={help} overridden={overridden} onRevert={onRevert}>
      <input
        className="field-input"
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/**
 * @param {{
 *   label: string, value?: string, onChange: (value: string) => void,
 *   placeholder?: string, help?: string, rows?: number,
 *   overridden?: boolean, onRevert?: () => void,
 * }} props
 */
export function TextArea({ label, value, onChange, placeholder, help, rows = 4, overridden, onRevert }) {
  return (
    <Field label={label} help={help} overridden={overridden} onRevert={onRevert}>
      <textarea
        className="field-textarea"
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

/**
 * @param {{
 *   label: string, value?: string, onChange: (value: string) => void,
 *   options: {value: string, label: string}[], help?: string,
 * }} props
 */
export function SelectField({ label, value, onChange, options, help }) {
  return (
    <Field label={label} help={help}>
      <select className="field-select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Field>
  )
}

/**
 * @param {{label: string, checked: boolean, onChange: (v: boolean) => void, help?: string}} props
 */
export function Toggle({ label, checked, onChange, help }) {
  const id = useId()
  return (
    <div className="field field-toggle">
      <label className="toggle-label" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="toggle-input"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
        <span className="toggle-text">{label}</span>
      </label>
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

/**
 * A three-state control, because section visibility genuinely has three states and
 * collapsing "auto" into a checkbox would remove the feature that makes empty sections
 * disappear on their own.
 *
 * @param {{value: boolean|'auto', onChange: (v: boolean|'auto') => void, disabled?: boolean}} props
 */
export function TriState({ value, onChange, disabled }) {
  const options = [
    { value: 'auto', label: 'Auto' },
    { value: true, label: 'Always' },
    { value: false, label: 'Never' },
  ]
  return (
    <div className="tri-state" role="group">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          className={`tri-state-option${value === option.value ? ' tri-state-active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * @param {{title: string, description?: string, children?: React.ReactNode}} props
 */
export function Panel({ title, description, children }) {
  return (
    <section className="admin-panel">
      <header className="admin-panel-head">
        <h2 className="admin-panel-title">{title}</h2>
        {description && <p className="admin-panel-description">{description}</p>}
      </header>
      {children}
    </section>
  )
}

/**
 * A short explanatory block. Used wherever the builder needs to tell the user something
 * true but non-obvious — that a source cannot fetch, that a section is hidden and why.
 *
 * @param {{tone?: 'info'|'warn'|'error', icon?: string, children: React.ReactNode}} props
 */
export function Note({ tone = 'info', icon, children }) {
  return (
    <p className={`admin-note admin-note-${tone}`}>
      {icon && <Icon name={icon} size={14} aria-hidden="true" />}
      <span>{children}</span>
    </p>
  )
}

/** @param {{children: React.ReactNode}} props */
export function Grid({ children }) {
  return <div className="field-grid">{children}</div>
}
