import { LICENSE, SOURCE_CODE_GITHUB_URL } from "@/config/site"
import { cn } from "@/lib/utils"
import { DmcaIcon } from "@/components/icons"
import { SOCIAL_ICONS } from "@/features/portfolio/components/social-link-icons"
import { SOCIAL_LINKS } from "@/features/portfolio/data/social-links"
import type { SocialLink } from "@/features/portfolio/data/social-links"
import { FOOTER } from "@/features/portfolio/data/adapter"
import type { FooterConfig, FooterValue as FooterValueType } from "@/features/portfolio/data/adapter"

/**
 * His footer, rendered from configuration.
 *
 * The markup, the screen lines, the stripe divider, the definition-list layout and the
 * separator-delimited icon row are all his and unchanged. What changed is where the *content*
 * comes from: upstream every row is a hard-coded fact about his own deployment, and the icon row
 * is three hard-coded links to his own accounts. Both are now driven by data, so a portfolio
 * owner edits them in the admin instead of editing this file.
 *
 * The props exist for the same reason the section components have them — the admin renders this
 * exact component against a draft, so the preview is the footer rather than a picture of one.
 */
export function SiteFooter({
  footer = FOOTER,
  social = SOCIAL_LINKS,
}: {
  footer?: FooterConfig
  social?: SocialLink[]
}) {
  if (!footer.enabled) return null

  return (
    <footer className="max-w-screen overflow-x-clip px-2">
      <div className="mx-auto border-x border-line group-has-data-[slot=layout-wide]/layout:container md:max-w-3xl">
        <div className="screen-line-top screen-line-bottom">
          <div className="stripe-divider h-12" />
        </div>

        <dl className="flex flex-col gap-4 py-8 font-mono [&_dd]:text-sm [&_dt]:text-right [&_dt]:text-sm [&_dt]:text-muted-foreground [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
          {/* Upstream this list is hard-coded: what his site is deployed on, which analytics
              it uses, what inspired it — facts about his deployment, one of which tagged an
              outbound referral with his own domain. The markup is his and unchanged; the rows
              are `footer.items` from config, so a portfolio owner edits them without touching
              this file. */}
          {footer.items.map((item, index) => (
            <Item key={`${item.label}-${index}`}>
              <dt>{item.label}</dt>
              <dd>
                {item.values.length === 1 ? (
                  <FooterValue value={item.values[0]} />
                ) : (
                  <ul>
                    {item.values.map((value, valueIndex) => (
                      <li key={`${value.text}-${valueIndex}`}>
                        <FooterValue value={value} />
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </Item>
          ))}

          {footer.showSourceCode && (
            <Item>
              <dt>Source code</dt>
              <dd>
                <a
                  className="link-underline"
                  href={SOURCE_CODE_GITHUB_URL}
                  target="_blank"
                  rel="noopener"
                >
                  GitHub
                </a>
              </dd>
            </Item>
          )}

          {/* The upstream licence this application is used under: a fact about the code, not a
              preference, so it is not configurable and correctly still names his repository. */}
          <Item>
            <dt>Built on</dt>
            <dd>
              <a
                className="link-underline"
                href={LICENSE.url}
                target="_blank"
                rel="noopener"
              >
                chanhdai.com ({LICENSE.name})
              </a>
            </dd>
          </Item>
        </dl>

        {footer.showSocialLinks && social.length > 0 && (
          <div className="screen-line-top screen-line-bottom flex w-full before:z-1 after:z-1">
            {/* His row: centred, bordered, separator between each mark. Upstream it names three
                of his own accounts directly, so a fork with no X account rendered a link to
                nowhere. It iterates the imported profiles instead — same chrome, real links. */}
            <div className="mx-auto flex items-center justify-center gap-3 border-x border-line bg-background px-4">
              {social.map((item, index) => (
                <FooterSocial key={item.name} link={item} first={index === 0} />
              ))}

              {footer.showDmca && (
                <>
                  <Separator />
                  <a
                    className="flex text-muted-foreground transition-[color] hover:text-foreground"
                    href={
                      process.env.NEXT_PUBLIC_DMCA_URL ||
                      "https://www.dmca.com/ProtectionPro.aspx"
                    }
                    target="_blank"
                    rel="noopener"
                    aria-label="DMCA.com Protection Status"
                  >
                    <DmcaIcon className="h-4.5 w-auto" />
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upstream this is `SiteFooterInteractiveLogotype`, his wordmark spelled out in
          interactive blocks. TRADEMARK.md excludes the wordmark, so the fork ships none. */}

      <div className="h-(--fade-bottom-height)" />
      <div className="pb-[env(safe-area-inset-bottom,0)]" />
    </footer>
  )
}

function FooterSocial({ link, first }: { link: SocialLink; first: boolean }) {
  return (
    <>
      {!first && <Separator />}
      <a
        className="flex items-center text-muted-foreground transition-[color] hover:text-foreground [&_svg]:size-4"
        href={link.href}
        target="_blank"
        rel="noopener"
        aria-label={`${link.title} profile`}
      >
        {SOCIAL_ICONS[link.name]}
      </a>
    </>
  )
}

function Separator({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex h-11 w-px bg-line", className)} {...props} />
}

function FooterValue({ value }: { value: FooterValueType }) {
  if (!value.href) return <>{value.text}</>
  const external = /^https?:/i.test(value.href)
  return (
    <a
      className="link-underline"
      href={value.href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
    >
      {value.text}
    </a>
  )
}

function Item({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-2 gap-4", className)} {...props} />
}
