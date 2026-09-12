import MarkdownSync from "react-markdown"
import rehypeExternalLinks from "rehype-external-links"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"

import { UTM_PARAMS } from "@/config/site"
import { rehypeAddQueryParams } from "@/lib/rehype-add-query-params"

/**
 * Upstream this is `MarkdownAsync`, which is an async Server Component.
 *
 * That works on the public page, which is server-rendered, and breaks anywhere inside a client
 * tree: React refuses to render an async component there, the suspension is never resolved, and
 * the surrounding tree is replaced by its loading state. In this fork that tree is the admin —
 * whose previews render these very components — so a single record with a description was
 * enough to leave the whole editor stuck on "Loading the editor…".
 *
 * The latency was luck rather than design: none of the seeded records happened to carry a
 * description, so nothing exercised it until the timeline, whose every entry is markdown.
 *
 * `Markdown` is the synchronous renderer from the same package and produces identical output
 * here, because every plugin below is synchronous — `remark-gfm`, `rehype-raw`,
 * `rehype-external-links` and `rehypeAddQueryParams` are all plain tree transforms. The async
 * variant buys nothing for this plugin set, and costs the admin.
 */
export function Markdown(props: React.ComponentProps<typeof MarkdownSync>) {
  return (
    <MarkdownSync
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeExternalLinks, { target: "_blank", rel: "nofollow noopener" }],
        [rehypeAddQueryParams, UTM_PARAMS],
      ]}
      {...props}
    />
  )
}
