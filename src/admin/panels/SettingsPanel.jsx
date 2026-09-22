'use client'

/**
 * Site settings.
 *
 * Every field here is consumed by something. That is not a boast, it is the reason the panel is
 * shorter than it used to be: the previous version offered theme presets, design tokens, a
 * layout width, an avatar shape, animation intensities and effect parameters, all of which were
 * read by the presentation layer that the migration to his application replaced. Writing them
 * still worked; nothing rendered differently. Controls like that are worse than missing ones,
 * because they answer "did that do anything?" with a convincing yes.
 *
 * What each field below reaches:
 *   site.url         → `SITE.url` — canonical links, Open Graph, `robots.txt`, the sitemap, the
 *                      `utm_source` on outbound links, and `doctor`'s deployment check.
 *   site.base        → the static export's base path.
 *   site.title       → the metadata title and Open Graph site name.
 *   site.description → the meta description.
 *   site.language    → `<html lang>`.
 *   site.ogImage     → the social card image.
 *   seo.keywords     → the metadata keywords.
 *   deployment.target → `doctor` and the deploy guard.
 *
 * @module admin/panels/SettingsPanel
 */

import { getPath } from '../drafts.js'
import { Grid, Note, Panel, SelectField, TextField, Toggle } from '../fields.jsx'
import { Section } from '../preview/editor-layout.jsx'

const TARGETS = [
  { value: 'github-pages', label: 'GitHub Pages' },
  { value: 'vercel', label: 'Vercel' },
  { value: 'netlify', label: 'Netlify' },
  { value: 'cloudflare', label: 'Cloudflare Pages' },
  { value: 'static', label: 'Static files (deploy them yourself)' },
]

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function SettingsPanel({ builder }) {
  const { built, configDraft, setConfig } = builder
  const { config } = built

  const value = (path, fallback) => getPath(configDraft, path, getPath(config, path, fallback))

  return (
    <Panel
      title="Site settings"
      description="Where this is published, and what search engines and social cards are told about it."
    >
      <Section title="Address">
        <Grid>
          <TextField
            label="Site URL"
            value={value('site.url', '')}
            onChange={(next) => setConfig('site.url', next)}
            placeholder="https://you.github.io/portfolio"
            help="Canonical links, social cards, the sitemap, and the utm_source tagged onto outbound links."
          />
          <TextField
            label="Base path"
            value={value('site.base', '/')}
            onChange={(next) => setConfig('site.base', next)}
            placeholder="/"
            help={'"/" for a root domain, "/repo-name/" for a GitHub Pages project site. A wrong value here is the usual cause of a blank deployed page.'}
          />
        </Grid>
      </Section>

      <Section
        title="Metadata"
        description="Each of these falls back to your profile when left blank, which is what an unconfigured portfolio uses."
      >
        <Grid>
          <TextField
            label="Title"
            value={value('site.title', '')}
            onChange={(next) => setConfig('site.title', next)}
            placeholder={built.profile.identity.name || 'Your name'}
          />
          <TextField
            label="Language"
            value={value('site.language', 'en')}
            onChange={(next) => setConfig('site.language', next)}
            placeholder="en"
            help="A BCP-47 tag. Becomes the page's lang attribute."
          />
        </Grid>

        <TextField
          label="Description"
          value={value('site.description', '')}
          onChange={(next) => setConfig('site.description', next)}
          placeholder={truncate(built.profile.identity.summary ?? '')}
          help="The meta description and the Open Graph description."
        />

        <TextField
          label="Social card image"
          value={value('site.ogImage', '')}
          onChange={(next) => setConfig('site.ogImage', next)}
          placeholder="assets/og.png"
          help="A path inside public/, or an absolute URL. Shown when the site is linked on social platforms."
        />

        <TextField
          label="Keywords"
          value={(value('seo.keywords', []) ?? []).join(', ')}
          onChange={(next) =>
            setConfig(
              'seo.keywords',
              next
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
          help="Comma-separated. Blank uses your top twenty skills."
        />
      </Section>

      <Section
        title="Privacy"
        description="What the published site and the exported manifest are allowed to carry."
      >
        <Toggle
          label="Hide my email address entirely"
          checked={value('privacy.hideEmail', false) === true}
          onChange={(next) => setConfig('privacy.hideEmail', next)}
          help="Omits it from the overview, from the exported manifest, and therefore from the search index. Readers can still reach you through your profile links."
        />
        <Toggle
          label="Keep it out of the machine-readable manifest"
          checked={value('privacy.obfuscateEmail', true) === true}
          onChange={(next) => setConfig('privacy.obfuscateEmail', next)}
          help="On by default. The page still shows the address, base64-encoded so a naive scraper cannot lift it from the HTML; this decides whether portfolio.json — the most harvestable form there is — carries it too."
        />
      </Section>

      <Section title="Deployment">
        <SelectField
          label="Target"
          value={value('deployment.target', 'static')}
          onChange={(next) => setConfig('deployment.target', next)}
          options={TARGETS}
          help="Read by npm run doctor and the deploy guard, which check the base path matches."
        />
      </Section>

      <Note>
        Publishing writes these into <code>src/data/config.json</code>. Values you would rather
        keep in version control can go in <code>portfolio.config.js</code> instead — the two are
        merged, with the published file winning.
      </Note>
    </Panel>
  )
}

const truncate = (text, max = 80) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
