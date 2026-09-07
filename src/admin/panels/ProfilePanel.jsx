'use client'

/**
 * Profile.
 *
 * Every field here is one his `ProfileHeader`, `Overview` or `SocialLinks` actually reads, and
 * the preview beside them is those three components — the same modules the deployed page
 * imports, handed the draft instead of the committed build. So the answer to "does this
 * control do anything" is visible rather than promised.
 *
 * Overriding stays additive, as it always has: the imported value stays in the source file and
 * the override sits on top, so a later `npm run import` cannot clobber the owner's wording and
 * clearing the override restores what the connector said.
 *
 * @module admin/panels/ProfilePanel
 */

import { ExternalLinkIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { getConnector } from '../../connectors/index.js'
import Icon from '../icon.jsx'
import { Grid, Note, Panel, TextArea, TextField } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function ProfilePanel({ builder }) {
  const { built, overrides, setConfig, setIdentity, setSocial, sources } = builder
  const { identity, socials } = built.profile
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const imported = importedIdentity(sources)

  const field = (key, label, extra = {}) => ({
    label,
    value: identity[key] ?? '',
    onChange: (value) => setIdentity(key, value),
    overridden: overrides.identity?.[key] !== undefined,
    onRevert: () => setIdentity(key, ''),
    help:
      imported[key] && imported[key] !== identity[key]
        ? `Imported: "${truncate(imported[key])}"`
        : extra.help,
    ...extra,
  })

  const contact = (key, label, type = 'text', placeholder) => (
    <TextField
      label={label}
      type={type}
      placeholder={placeholder}
      value={identity.contact?.[key] ?? ''}
      onChange={(value) => setIdentity('contact', { ...identity.contact, [key]: value })}
    />
  )

  return (
    <Panel
      workbench
      title="Profile"
      description="Who the portfolio is about. Anything left blank falls back to what your connectors reported."
    >
      <EditorLayout
        controls={
          <>
            <Section
              title="Identity"
              description="The name and the two lines that rotate beneath it."
            >
              <TextField {...field('name', 'Name')} placeholder="Ada Lovelace" />
              <TextField
                {...field('headline', 'Headline')}
                placeholder="Analytical Engine Programmer"
                help="The first line his FlipSentences rotates, and the job title in the page's structured data."
              />
              <TextArea {...field('summary', 'Summary')} rows={5} />
              <Grid>
                <TextField {...field('location', 'Location')} placeholder="London, UK" />
                <TextField {...field('pronouns', 'Pronouns')} placeholder="she/her" />
              </Grid>
              <TextField
                {...field('avatar', 'Avatar')}
                placeholder="assets/profile.svg or a full URL"
                help="A path inside public/, or an absolute URL. GitHub supplies one automatically."
              />
            </Section>

            <Section
              title="Contact"
              description="Rendered in the overview grid. The address and phone number are base64-encoded in the served HTML, as upstream does, so a scraper cannot lift them from the source."
            >
              {contact('email', 'Email', 'email', 'you@example.com')}
              {contact('phone', 'Phone', 'tel', '+44 20 7946 0958')}
              {contact('website', 'Website', 'url', 'https://example.com')}
            </Section>

            <Section
              title="Availability"
              description="The second line his FlipSentences rotates. Leave blank for a single-line header."
            >
              <TextField
                label="Availability line"
                value={identity.availability?.label ?? ''}
                placeholder="Open to collaboration"
                onChange={(value) =>
                  setIdentity('availability', { ...identity.availability, label: value })
                }
              />
            </Section>

            <Section
              title="Presentation"
              description="The only parameter his profile header exposes. TextFlip — the component that rotates the lines under your name — documents interval, and FlipSentences passes it straight through."
            >
              <TextField
                label="Seconds between the rotating lines"
                type="number"
                value={String(built.config.profile?.flipInterval ?? 3)}
                onChange={(value) => setConfig('profile.flipInterval', Number(value) || 3)}
                help="1 to 30. Only matters when you have both a headline and an availability line — with one line there is nothing to rotate."
              />
            </Section>

            <Section
              title="Profile links"
              description="Connectors add these automatically. Editing one overrides the imported link; clearing it restores what the connector reported."
            >
              {Object.entries(socials).map(([network, url]) => {
                const connector = getConnector(network)
                return (
                  <div key={network} className="flex items-center gap-2">
                    <Label className="flex w-28 shrink-0 items-center gap-1.5 text-xs">
                      <Icon name={connector?.icon ?? 'Link'} size={14} />
                      <span className="truncate">{connector?.name ?? network}</span>
                    </Label>
                    <Input
                      type="url"
                      className="min-w-0 flex-1"
                      value={url}
                      onChange={(event) => setSocial(network, event.target.value)}
                    />
                    {url && (
                      <a
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Open ${connector?.name ?? network}`}
                      >
                        <ExternalLinkIcon className="size-4" />
                      </a>
                    )}
                  </div>
                )
              })}

              {!Object.keys(socials).length && (
                <Note tone="warning">
                  No profile links yet. They appear automatically once a source is imported, or
                  you can add them under <code>socialLinks</code> in your config.
                </Note>
              )}
            </Section>

            <Note>
              Changes here are saved as overrides, not written into your imported data — running{' '}
              <code>npm run import</code> again will not undo them.
            </Note>
          </>
        }
        preview={
          <PreviewFrame
            title="Profile header, overview and links"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            {/* Two blocks, because this panel's controls reach both: the name and headline
                render in his ProfileHeader, the contact details and links in Overview. */}
            <PortfolioPreview
              built={built}
              theme={theme}
              section={['profile', 'overview']}
            />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}

/**
 * What the connectors said about identity, so the panel can show the owner what they are
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
