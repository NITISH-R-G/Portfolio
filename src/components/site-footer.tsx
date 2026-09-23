import { SOURCE_CODE_GITHUB_URL } from "@/config/site"
import { cn } from "@/lib/utils"
import { DmcaIcon } from "@/components/icons"
import { FluidGradientText } from "@/registry/components/fluid-gradient-text"
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

          {/* The upstream MIT attribution this row used to carry lives in the repository
              LICENSE file and the admin Footer's "Attribution" note instead: the licence
              names his repository, and the trademark policy asks forks to ship as their
              own rather than present his brand on their public pages. */}
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

      {/* Upstream this slot is `SiteFooterInteractiveLogotype`: his trademarked wordmark as an
          interactive object. The slot keeps its purpose — the page's signature — with the
          owner's word, drawn by his `FluidGradientText`. */}
      {footer.wordmark && <FooterWordmark text={footer.wordmark} />}

      <div className="h-(--fade-bottom-height)" />
      <div className="pb-[env(safe-area-inset-bottom,0)]" />
    </footer>
  )
}

/**
 * The owner's word across the foot of the page, lit by a gradient that follows the pointer.
 *
 * The component draws at a fixed type size in a fixed viewBox, so the box is widened for
 * longer words rather than letting them clip; the container keeps the same ratio so the word
 * spans the column at any width. It repeats the name the page already states, so it is hidden
 * from assistive technology. Under reduced motion it takes no pointer input, and the gradient
 * stays at rest.
 */
function FooterWordmark({ text }: { text: string }) {
  const height = 300
  const width = Math.max(1200, Math.round(text.length * 230))

  return (
    <div className="mx-auto border-x border-line text-foreground group-has-data-[slot=layout-wide]/layout:container md:max-w-3xl">
      <div
        className="w-full motion-reduce:pointer-events-none"
        style={{ aspectRatio: `${width} / ${height}` }}
        aria-hidden
      >
        <FluidGradientText
          text={text}
          svgViewBoxWidth={width}
          svgViewBoxHeight={height}
        />
      </div>
    </div>
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
