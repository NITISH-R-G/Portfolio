import { llmsFullTxt } from "@/features/portfolio/llms/documents"
import { PORTFOLIO_DOCUMENT_DATA } from "@/features/portfolio/llms/data"

export const dynamic = "force-static"

export function GET() {
  return new Response(llmsFullTxt(PORTFOLIO_DOCUMENT_DATA), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
