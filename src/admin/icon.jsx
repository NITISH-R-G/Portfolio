import * as Lucide from 'lucide-react'

/**
 * Icon-by-name, for the admin panels.
 *
 * The panels choose icons at runtime — `iconFor(kind)`, `capability.icon`, ternaries on busy
 * state — so they need a name→component lookup rather than direct imports. The engine used to
 * provide one; the migration to his application removed it along with the rest of the old
 * presentation layer.
 *
 * Rather than restate a hand-written map that then drifts, this resolves against `lucide-react`
 * itself, which is the icon set his application already depends on. A name is converted from
 * the PascalCase the panels use to lucide's own export name, so `ChevronDown` and `AlertTriangle`
 * resolve without a table.
 *
 * An unknown name renders nothing *and says so in development*. That combination is deliberate:
 * silently rendering nothing is how a correctly-sized, correctly-bordered, entirely empty box
 * ends up looking like a deliberate design choice rather than a typo — which has happened once
 * already in this codebase.
 *
 * @module admin/icon
 */

/** Names the panels use that lucide spells differently. */
const ALIASES = {
  AlertTriangle: 'TriangleAlert',
  Github: 'Github',
  Trash2: 'Trash2',
  Undo2: 'Undo2',
  Loader2: 'LoaderCircle',
  ListOrdered: 'ListOrdered',
  Share2: 'Share2',
  BarChart3: 'ChartColumn',
  FolderKanban: 'FolderKanban',
  LayoutGrid: 'LayoutGrid',
  CircleSlash: 'CircleSlash',
  UploadCloud: 'CloudUpload',
  CloudOff: 'CloudOff',
  FlaskConical: 'FlaskConical',
}

export default function Icon({ name, size = 18, className, ...props }) {
  const exportName = ALIASES[name] ?? name
  const Glyph = /** @type {Record<string, any>} */ (Lucide)[exportName]

  if (typeof Glyph !== 'function' && typeof Glyph !== 'object') {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`admin Icon: lucide-react has no export named "${exportName}" (asked for "${name}")`)
    }
    return null
  }

  return <Glyph size={size} strokeWidth={1.75} className={className} aria-hidden="true" {...props} />
}
