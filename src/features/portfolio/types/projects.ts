export type Project = {
  /** Stable unique identifier (used as list key/anchor). */
  id: string
  title: string
  /**
   * Project period for display and sorting.
   * Use "MM.YYYY" format. Omit `end` for ongoing projects.
   */
  period: {
    /** Start date (e.g., "05.2025"). */
    start: string
    /** End date; leave undefined for "Present". */
    end?: string
  }
  /** Public URL (site, repository, demo, or video). */
  link: string
  /** Tags/technologies for chips or filtering. */
  skills: string[]
  /** Optional rich description; Markdown and line breaks supported. */
  description?: string
  /** Logo image URL (absolute or path under /public). Takes precedence over `icon`. */
  logo?: string
  /** Inline SVG icon, framed in a tile. Used only when `logo` is unset. */
  icon?: React.ReactElement
  /** Whether the project card is expanded by default in the UI. */
  isExpanded?: boolean
  /**
   * Added by the fork. A hosted URL to embed in the expanded card, so a project can be
   * inspected without leaving the portfolio — the Blocks preview idea applied to a deployment
   * rather than a registry item. Absent means the card shows no preview.
   */
  previewUrl?: string
  /** Screenshot shown behind a preview that has not loaded, or that was refused embedding. */
  screenshot?: string
  /**
   * Whether `previewUrl` permits being framed, decided at build time by reading the site's
   * own `X-Frame-Options` / `frame-ancestors` headers. The browser cannot tell us this, so a
   * page that omits the check can only offer a preview and hope.
   */
  previewEmbeddable?: boolean
  /** Why, when it is not — shown to the reader instead of a blank frame. */
  previewBlockedReason?: string
}
