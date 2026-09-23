import { markdownFiles } from "@/features/portfolio/llms/documents"
import { PORTFOLIO_DOCUMENT_DATA } from "@/features/portfolio/llms/data"

/**
 * The page as Markdown: `index.md` for the whole of it and one file per visible section, beside
 * the HTML the way his `(llms)` routes serve his pages. Which files exist is decided by the same
 * section list the page renders, so a hidden section has no file rather than an empty one.
 */
export const dynamic = "force-static"
export const dynamicParams = false

const FILES = markdownFiles(PORTFOLIO_DOCUMENT_DATA)

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const markdown = FILES[file]
  if (markdown === undefined) return new Response("Not found", { status: 404 })
  return new Response(markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}
