/**
 * SEO, privacy, analytics and deployment.
 *
 * Each of these is small on its own, and grouping them keeps the navigation short. The SEO
 * section shows the generated output rather than asking the user to write it, since it is
 * derived from data they have already provided.
 *
 * @module admin/panels/SettingsPanel
 */

import { Panel, TextField, Toggle, SelectField, Note, Grid } from '../fields.jsx'
import { getPath } from '../state.js'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function SettingsPanel({ builder }) {
  const { built, configDraft, setConfig } = builder
  const { config, seo } = built

  const value = (path, fallback) => getPath(configDraft, path, getPath(config, path, fallback))

  return (
    <Panel title="Settings" description="Search, privacy, analytics and where this will be published.">
      <h3 className="admin-subheading">Site</h3>
      <Grid>
        <TextField
          label="Site URL"
          value={value('site.url', '')}
          onChange={(v) => setConfig('site.url', v)}
          placeholder="https://you.github.io/portfolio"
          help="Used for canonical links, social cards and the sitemap. Without it, those are omitted."
        />
        <TextField
          label="Base path"
          value={value('site.base', '/')}
          onChange={(v) => setConfig('site.base', v)}
          placeholder="/"
          help='"/" for a root domain, "/repo-name/" for a GitHub Pages project site. A wrong value here is the usual cause of a blank deployed page.'
        />
      </Grid>
      <Grid>
        <TextField
          label="Title override"
          value={value('site.title', '')}
          onChange={(v) => setConfig('site.title', v)}
          placeholder={seo.title}
          help="Leave blank to use your name and headline."
        />
        <SelectField
          label="Hosting"
          value={value('deployment.target', 'static')}
          onChange={(v) => setConfig('deployment.target', v)}
          options={[
            { value: 'github-pages', label: 'GitHub Pages' },
            { value: 'vercel', label: 'Vercel' },
            { value: 'netlify', label: 'Netlify' },
            { value: 'cloudflare', label: 'Cloudflare Pages' },
            { value: 'static', label: 'Other static host' },
          ]}
        />
      </Grid>

      <h3 className="admin-subheading">Search and social</h3>
      <Note icon="Info">
        These are generated from your data at build time and baked into the HTML, so a link
        shared to Slack or LinkedIn unfurls correctly without running any JavaScript.
      </Note>

      <div className="seo-preview">
        <p className="seo-preview-title">{seo.title}</p>
        <p className="seo-preview-url">{seo.canonical || '(no site URL set)'}</p>
        <p className="seo-preview-description">{seo.description || '(no description — set a summary)'}</p>
      </div>

      <Grid>
        <TextField
          label="Extra keywords"
          value={(value('seo.keywords', []) ?? []).join(', ')}
          onChange={(v) => setConfig('seo.keywords', v.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="machine learning, distributed systems"
          help="Added to the keywords already derived from your skills and projects."
        />
        <TextField
          label="X / Twitter handle"
          value={value('seo.twitterHandle', '')}
          onChange={(v) => setConfig('seo.twitterHandle', v)}
          placeholder="@you"
          help="Attributes shared links to you on X."
        />
      </Grid>
      <Toggle
        label="Emit structured data (JSON-LD)"
        checked={value('seo.structuredData', true)}
        onChange={(v) => setConfig('seo.structuredData', v)}
        help="Person, ProfilePage and WebSite schemas, generated from your real records."
      />
      <Toggle
        label="Generate sitemap.xml and robots.txt"
        checked={value('seo.sitemap', true)}
        onChange={(v) => setConfig('seo.sitemap', v)}
      />

      <h3 className="admin-subheading">Privacy</h3>
      <Toggle
        label="Hide my email entirely"
        checked={value('privacy.hideEmail', false)}
        onChange={(v) => setConfig('privacy.hideEmail', v)}
        help="Removes it from the page, the structured data and the exports."
      />
      <Toggle
        label="Obfuscate my email"
        checked={value('privacy.obfuscateEmail', true)}
        onChange={(v) => setConfig('privacy.obfuscateEmail', v)}
        help="Renders it in a form naive scrapers miss, and keeps it out of the JSON-LD — where a harvester would read it most easily of all."
      />
      <Toggle
        label="Show where data came from"
        checked={value('privacy.showDataProvenance', true)}
        onChange={(v) => setConfig('privacy.showDataProvenance', v)}
        help="Labels each figure as reported by a platform, counted from your records, or stated by you. This is what makes the numbers checkable."
      />
      <Toggle
        label="Show evidence under skills"
        checked={value('features.evidenceMode', true)}
        onChange={(v) => setConfig('features.evidenceMode', v)}
        help='"Python — 24 repositories" rather than a bare tag.'
      />

      <h3 className="admin-subheading">Analytics</h3>
      <Note icon="Shield">
        No analytics provider is bundled and none is enabled by default. Setting an endpoint
        posts anonymous page events to a URL you control — no cookies, no third-party script.
      </Note>
      <TextField
        label="Endpoint"
        value={value('analytics.endpoint', '')}
        onChange={(v) => setConfig('analytics.endpoint', v)}
        placeholder="https://analytics.example.com/collect"
        help="Or set VITE_ANALYTICS_ENDPOINT in .env to keep it out of your committed config."
      />
      <Toggle
        label="Respect Do Not Track"
        checked={value('analytics.respectDoNotTrack', true)}
        onChange={(v) => setConfig('analytics.respectDoNotTrack', v)}
      />
    </Panel>
  )
}
