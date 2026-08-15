/**
 * Identity and links.
 *
 * Every field shows the value that is currently winning and, when a connector supplied
 * one, what that connector said. Overriding is always additive: the imported value stays
 * in the source file and the override sits on top, so a later import cannot clobber the
 * user's wording and clearing the override restores the imported text.
 *
 * @module admin/panels/IdentityPanel
 */

import Icon from '../../components/Icon'
import { getConnector } from '../../connectors/index.js'
import { Panel, TextField, TextArea, Note, Grid } from '../fields.jsx'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function IdentityPanel({ builder }) {
  const { built, overrides, setIdentity, setSocial, sources } = builder
  const { identity, socials } = built.profile

  const imported = importedIdentity(sources)

  const field = (key, label, extra = {}) => ({
    label,
    value: identity[key] ?? '',
    onChange: (value) => setIdentity(key, value),
    overridden: overrides.identity?.[key] !== undefined,
    onRevert: () => setIdentity(key, ''),
    help: imported[key] && imported[key] !== identity[key]
      ? `Imported: "${truncate(imported[key])}"`
      : extra.help,
    ...extra,
  })

  return (
    <Panel
      title="Identity"
      description="Who the portfolio is about. Anything left blank falls back to what your connectors reported."
    >
      <Note icon="Info">
        Changes here are saved as overrides, not written into your imported data — running{' '}
        <code>npm run import</code> again will not undo them.
      </Note>

      <TextField {...field('name', 'Name')} placeholder="Ada Lovelace" />
      <TextField {...field('headline', 'Headline')} placeholder="Analytical Engine Programmer" />
      <TextArea {...field('summary', 'Summary')} rows={5}
        help={field('summary', '').help ?? 'Shown in the About section and used as the meta description.'} />

      <Grid>
        <TextField {...field('location', 'Location')} placeholder="London, UK" />
        <TextField {...field('pronouns', 'Pronouns')} placeholder="she/her" />
      </Grid>

      <TextField {...field('avatar', 'Avatar')}
        placeholder="assets/profile.svg or a full URL"
        help="A path inside public/, or an absolute URL. GitHub supplies one automatically." />

      <h3 className="admin-subheading">Contact</h3>
      <Grid>
        <TextField
          label="Email"
          type="email"
          value={identity.contact?.email ?? ''}
          onChange={(value) => setIdentity('contact', { ...identity.contact, email: value })}
          placeholder="you@example.com"
        />
        <TextField
          label="Website"
          type="url"
          value={identity.contact?.website ?? ''}
          onChange={(value) => setIdentity('contact', { ...identity.contact, website: value })}
          placeholder="https://example.com"
        />
      </Grid>

      <h3 className="admin-subheading">Profile links</h3>
      <p className="field-help">
        Connectors add these automatically. Editing one here overrides the imported link; clearing
        it restores whatever the connector reported.
      </p>

      <div className="social-list">
        {Object.entries(socials).map(([network, url]) => {
          const connector = getConnector(network)
          return (
            <div key={network} className="social-row">
              <Icon name={connector?.icon ?? 'Link'} size={16} />
              <span className="social-network">{connector?.name ?? network}</span>
              <input
                className="field-input"
                type="url"
                value={url}
                onChange={(e) => setSocial(network, e.target.value)}
              />
              <a className="social-open" href={url} target="_blank" rel="noreferrer noopener"
                aria-label={`Open ${connector?.name ?? network}`}>
                <Icon name="ExternalLink" size={14} />
              </a>
            </div>
          )
        })}
        {!Object.keys(socials).length && (
          <Note tone="warn" icon="Info">
            No profile links yet. They appear automatically once a source is imported, or you can
            add them under <code>socialLinks</code> in your config.
          </Note>
        )}
      </div>
    </Panel>
  )
}

/**
 * What the connectors said about identity, so the panel can show the user what they are
 * overriding rather than only the result.
 */
function importedIdentity(sources) {
  const out = {}
  for (const { profile } of sources) {
    for (const [key, value] of Object.entries(profile?.identity ?? {})) {
      if (typeof value === 'string' && value && !out[key]) out[key] = value
    }
  }
  return out
}

const truncate = (text, max = 90) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
