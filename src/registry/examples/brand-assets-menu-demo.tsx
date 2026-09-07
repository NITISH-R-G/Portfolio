"use client"

import Link from "next/link"

import { BrandAssetsMenu } from "@/registry/transformed/components/brand-assets-menu"

/**
 * A demo of `BrandAssetsMenu`, with placeholder branding.
 *
 * The component is his and is untouched. What changed is the fixture it is fed: upstream this
 * demo passes his logomark, his logotype, a link to his brand-guidelines post and a download
 * link for `chanhdai-brand.zip`. His TRADEMARK.md excludes the mark and the wordmark from the
 * MIT grant, so a fork that deploys this page is serving his trademark — and offering visitors
 * a download of his brand kit — from its own domain.
 *
 * The placeholder below is a plain geometric glyph with no identity attached, which is enough to
 * demonstrate what the component does: right-click a logo, get its assets. The two URL props are
 * required by his signature, which is not changed here, so they are inert `#` placeholders — a
 * fork has no brand kit to point at, and pointing at his would be the thing this avoids.
 */
export default function BrandAssetsMenuDemo() {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* All five props are required by his component and its signature is not changed here;
          the URLs are inert placeholders because a fork has no brand kit to point at, and a
          link to someone else's would be worse than a link to nothing. */}
      <BrandAssetsMenu
        logomark={<PlaceholderMark />}
        logomarkSVG={LOGOMARK_SVG}
        logotypeSVG={LOGOMARK_SVG}
        brandGuidelinesURL="#"
        brandAssetsURL="#"
      >
        <Link href="/" aria-label="Home">
          <PlaceholderMark className="h-8 text-foreground" />
        </Link>
      </BrandAssetsMenu>

      <div className="text-sm text-muted-foreground">
        <span className="hidden pointer-fine:inline-block">
          Right-click the logo
        </span>
        <span className="hidden pointer-coarse:inline-block">
          Press &amp; hold the logo
        </span>
      </div>
    </div>
  )
}

const LOGOMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 256 256"><path fill="currentColor" d="M32 32h192v32H64v64h128v96H32v-32h128v-32H32V32Z"/></svg>'

function PlaceholderMark(props: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 256 256"
      aria-hidden
      {...props}
    >
      <path
        fill="currentColor"
        d="M32 32h192v32H64v64h128v96H32v-32h128v-32H32V32Z"
      />
    </svg>
  )
}
