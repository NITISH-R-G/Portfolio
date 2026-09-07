'use client'

/**
 * Footer.
 *
 * His footer is a definition list: each row is one label with one or more values, and a value
 * carrying an `href` becomes a link. Upstream every row is a hard-coded fact about his own
 * deployment — what it runs on, which analytics it uses, what inspired it — and one of them
 * tagged an outbound referral with his own domain. The *markup* is reusable and stays exactly
 * as he wrote it; the *content* is not, so it is `footer.items` in config and edited here.
 *
 * Everything on this panel is a control over something the component actually branches on:
 * `enabled` returns null, `showSocialLinks` and `showSourceCode` drop their rows, `showDmca`
 * adds the badge back. The licence row has no control, because it is a statement about which
 * code this is rather than a preference — it correctly still names his repository, and turning
 * it off would be misattribution rather than configuration.
 *
 * @module admin/panels/FooterPanel
 */

import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { getPath } from '../drafts.js'
import { Note, Panel, Toggle } from '../fields.jsx'
import { EditorLayout, Section } from '../preview/editor-layout.jsx'
import { PortfolioPreview } from '../preview/portfolio-preview'
import { PreviewFrame } from '../preview/preview-frame'
import { useSourceTheme } from '../preview/use-source-theme'

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function FooterPanel({ builder }) {
  const { built, setConfig } = builder
  const { name: themeName, item: theme, setTheme } = useSourceTheme(builder)

  const footer = built.config.footer ?? {}
  /**
   * The rows as *drafted*, not as resolved.
   *
   * `built.config` has been through `resolveFooter`, which drops a row with no usable value —
   * correct for the render, wrong for the editor, because adding a row starts it empty and it
   * would vanish between the click and the first keystroke. So the draft is authoritative for
   * the controls while the resolved config still drives the preview, which is what makes the
   * validation visible: an incomplete row is present in the form and absent from the footer
   * beside it.
   */
  const drafted = getPath(builder.configDraft, 'footer.items')
  const items = Array.isArray(drafted) ? drafted : (footer.items ?? [])

  const writeItems = (next) => setConfig('footer.items', next)

  const patchItem = (index, patch) =>
    writeItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const patchValue = (index, valueIndex, patch) =>
    patchItem(index, {
      values: items[index].values.map((value, i) =>
        i === valueIndex ? { ...value, ...patch } : value,
      ),
    })

  return (
    <Panel
      workbench
      title="Footer"
      description="The definition list at the foot of every page, and the icon row beneath it."
    >
      <EditorLayout
        controls={
          <>
            <Section title="Visibility">
              <Toggle
                label="Show the footer"
                checked={footer.enabled !== false}
                onChange={(checked) => setConfig('footer.enabled', checked)}
              />
              <Toggle
                label="Show the social icon row"
                checked={footer.showSocialLinks !== false}
                onChange={(checked) => setConfig('footer.showSocialLinks', checked)}
                help="Drawn from your imported profile links, so it lists what you actually connected."
              />
              <Toggle
                label='Show the "Source code" row'
                checked={footer.showSourceCode !== false}
                onChange={(checked) => setConfig('footer.showSourceCode', checked)}
                help="Turn off for a portfolio whose repository is private."
              />
              <Toggle
                label="Show the DMCA badge"
                checked={footer.showDmca === true}
                onChange={(checked) => setConfig('footer.showDmca', checked)}
                help="Off by default: the badge asserts a registration for a specific site, which a fork does not inherit. Set NEXT_PUBLIC_DMCA_URL to your own record before turning it on."
              />
            </Section>

            <Section
              title="Rows"
              description="One label with one or more values. A value with a URL becomes a link."
            >
              {items.map((item, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1"
                      value={item.label ?? ''}
                      placeholder="Label"
                      aria-label={`Row ${index + 1} label`}
                      onChange={(event) => patchItem(index, { label: event.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${item.label || 'row'}`}
                      onClick={() => writeItems(items.filter((_, i) => i !== index))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>

                  {(item.values ?? []).map((value, valueIndex) => (
                    <div key={valueIndex} className="flex items-center gap-2 pl-3">
                      <Input
                        className="h-8 min-w-0 flex-1"
                        value={value.text ?? ''}
                        placeholder="Text"
                        aria-label="Value text"
                        onChange={(event) =>
                          patchValue(index, valueIndex, { text: event.target.value })
                        }
                      />
                      <Input
                        className="h-8 min-w-0 flex-1"
                        value={value.href ?? ''}
                        placeholder="https:// (optional)"
                        aria-label="Value link"
                        onChange={(event) =>
                          patchValue(index, valueIndex, { href: event.target.value })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove value"
                        disabled={(item.values ?? []).length < 2}
                        onClick={() =>
                          patchItem(index, {
                            values: item.values.filter((_, i) => i !== valueIndex),
                          })
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1 self-start"
                    onClick={() =>
                      patchItem(index, { values: [...(item.values ?? []), { text: '' }] })
                    }
                  >
                    <PlusIcon />
                    Add value
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="gap-2 self-start"
                onClick={() =>
                  writeItems([...items, { label: 'New row', values: [{ text: '' }] }])
                }
              >
                <PlusIcon />
                Add row
              </Button>

              {/* Stated because the resolver enforces it and silence would look like a bug: a
                  row with no usable value is dropped from the built config with a warning. */}
              <Note>
                A row needs a label and at least one non-empty value. Rows that do not have both
                are dropped when the configuration is resolved.
              </Note>
            </Section>

            <Section title="Not configurable">
              <p className="text-xs text-pretty text-muted-foreground">
                The <Label className="inline font-mono text-xs">Built on</Label> row names the
                upstream project this application is used under, and the licence it is used
                under. That is a fact about the code rather than a preference, so it has no
                switch.
              </p>
            </Section>
          </>
        }
        preview={
          <PreviewFrame
            title="SiteFooter"
            theme={theme}
            themeName={themeName}
            onThemeChange={setTheme}
          >
            <PortfolioPreview built={built} theme={theme} section="footer" />
          </PreviewFrame>
        }
      />
    </Panel>
  )
}
