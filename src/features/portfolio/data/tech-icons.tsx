import {
  IconBrandAngular,
  IconBrandAstro,
  IconBrandAws,
  IconBrandAzure,
  IconBrandBootstrap,
  IconBrandCpp,
  IconBrandCSharp,
  IconBrandDebian,
  IconBrandDjango,
  IconBrandDocker,
  IconBrandFigma,
  IconBrandFirebase,
  IconBrandFlutter,
  IconBrandGit,
  IconBrandGolang,
  IconBrandGraphql,
  IconBrandKotlin,
  IconBrandLaravel,
  IconBrandMongodb,
  IconBrandMysql,
  IconBrandNodejs,
  IconBrandNotion,
  IconBrandPhp,
  IconBrandPrisma,
  IconBrandPython,
  IconBrandReactNative,
  IconBrandRedux,
  IconBrandRust,
  IconBrandSass,
  IconBrandSlack,
  IconBrandSupabase,
  IconBrandSwift,
  IconBrandThreejs,
  IconBrandUbuntu,
  IconBrandVite,
  IconBrandVue,
  IconDatabase,
  IconBrandSvelte,
} from "@tabler/icons-react"

import {
  AppleIcon,
  BunIcon,
  ClaudeIcon,
  CssIcon,
  CursorIcon,
  DiscordIcon,
  GitHubIcon,
  GoogleIcon,
  GrokIcon,
  JsIcon,
  JsonIcon,
  MarkdownIcon,
  MetaIcon,
  MicrosoftIcon,
  NpmIcon,
  OpenAIIcon,
  PnpmIcon,
  ReactIcon,
  ResendIcon,
  ShadcnIcon,
  TailwindCssIcon,
  TsIcon,
  V0Icon,
  VercelIcon,
  YarnIcon,
  YouTubeIcon,
} from "@/components/icons"

/**
 * Logos for the technology pills.
 *
 * His `TechStack` has always rendered an icon beside each label — the type requires
 * `icon: React.ReactElement` — but our adapter had no way to produce one, so every pill was
 * text. This is the mapping that fills it.
 *
 * Two sources, in that order of preference. His own marks in `components/icons.tsx` come first,
 * because they are the ones drawn for this design system and the ones his own pages use. Where
 * he has none — Python, Docker, Postgres and most of the long tail — the icon comes from
 * `@tabler/icons-react`, which the application already depends on and which `next.config.ts`
 * already rewrites to deep imports, so adding these costs a per-icon module rather than a
 * barrel.
 *
 * The map is deliberately wider than any one person's stack. It is a registry for the engine,
 * not a transcription of a particular portfolio, and the entries here are the technologies a
 * developer portfolio is likely to name rather than the ones this repository happens to hold.
 *
 * Every import is static. A dynamic `icons['IconBrand' + name]` lookup would read the barrel and
 * defeat the deep-import rewrite, pulling all four hundred brand icons into the page that shows
 * a dozen.
 */
const ICONS: Record<string, React.ReactElement> = {
  // His marks.
  typescript: <TsIcon />,
  javascript: <JsIcon />,
  react: <ReactIcon />,
  css: <CssIcon />,
  json: <JsonIcon />,
  markdown: <MarkdownIcon />,
  tailwindcss: <TailwindCssIcon />,
  shadcn: <ShadcnIcon />,
  github: <GitHubIcon />,
  vercel: <VercelIcon />,
  npm: <NpmIcon />,
  pnpm: <PnpmIcon />,
  yarn: <YarnIcon />,
  bun: <BunIcon />,
  claude: <ClaudeIcon />,
  openai: <OpenAIIcon />,
  grok: <GrokIcon />,
  cursor: <CursorIcon />,
  v0: <V0Icon />,
  resend: <ResendIcon />,
  apple: <AppleIcon />,
  google: <GoogleIcon />,
  microsoft: <MicrosoftIcon />,
  meta: <MetaIcon />,
  discord: <DiscordIcon />,
  youtube: <YouTubeIcon />,

  // Tabler's brand set, for what his own does not cover.
  python: <IconBrandPython />,
  nodejs: <IconBrandNodejs />,
  cpp: <IconBrandCpp />,
  csharp: <IconBrandCSharp />,
  php: <IconBrandPhp />,
  go: <IconBrandGolang />,
  rust: <IconBrandRust />,
  kotlin: <IconBrandKotlin />,
  swift: <IconBrandSwift />,
  vue: <IconBrandVue />,
  angular: <IconBrandAngular />,
  svelte: <IconBrandSvelte />,
  astro: <IconBrandAstro />,
  vite: <IconBrandVite />,
  redux: <IconBrandRedux />,
  threejs: <IconBrandThreejs />,
  sass: <IconBrandSass />,
  bootstrap: <IconBrandBootstrap />,
  reactnative: <IconBrandReactNative />,
  flutter: <IconBrandFlutter />,
  django: <IconBrandDjango />,
  laravel: <IconBrandLaravel />,
  graphql: <IconBrandGraphql />,
  prisma: <IconBrandPrisma />,
  // Tabler ships no Postgres or Redis mark; a database glyph is honest for both and better
  // than a wrong brand.
  postgresql: <IconDatabase />,
  redis: <IconDatabase />,
  sqlite: <IconDatabase />,
  sql: <IconDatabase />,
  mysql: <IconBrandMysql />,
  mongodb: <IconBrandMongodb />,
  firebase: <IconBrandFirebase />,
  supabase: <IconBrandSupabase />,
  docker: <IconBrandDocker />,
  git: <IconBrandGit />,
  aws: <IconBrandAws />,
  azure: <IconBrandAzure />,
  figma: <IconBrandFigma />,
  notion: <IconBrandNotion />,
  slack: <IconBrandSlack />,
  ubuntu: <IconBrandUbuntu />,
  debian: <IconBrandDebian />,
}

/**
 * Human labels for the picker, so the admin can offer "Tailwind CSS" rather than `tailwindcss`.
 * A slug with no entry falls back to its own name, which is right for the ones that already read
 * correctly — `python`, `docker`, `figma`.
 */
const LABELS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  nodejs: "Node.js",
  cpp: "C++",
  csharp: "C#",
  php: "PHP",
  go: "Go",
  css: "CSS",
  json: "JSON",
  tailwindcss: "Tailwind CSS",
  shadcn: "shadcn/ui",
  github: "GitHub",
  npm: "npm",
  openai: "OpenAI",
  v0: "v0",
  reactnative: "React Native",
  threejs: "Three.js",
  graphql: "GraphQL",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  sqlite: "SQLite",
  sql: "SQL",
  aws: "AWS",
  youtube: "YouTube",
  vue: "Vue",
  v8: "V8",
}

/** Every slug the picker can offer, with the label it shows. */
export const TECH_ICON_OPTIONS: { slug: string; label: string }[] = Object.keys(ICONS)
  .map((slug) => ({
    slug,
    label: LABELS[slug] ?? slug.replace(/^./, (c) => c.toUpperCase()),
  }))
  .sort((a, b) => a.label.localeCompare(b.label))

/**
 * A technology name reduced to a slug.
 *
 * `Next.js` and `next-js` and `NextJS` are the same technology written three ways, and connector
 * data contains all three shapes. Stripping everything but letters and digits collapses them,
 * with the two symbols that actually distinguish language names spelled out first — otherwise
 * `C++` and `C#` both become `c`, which is the same collision the stack keys already had to fix.
 */
export function techSlug(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\+\+/g, "pp")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]/g, "")
}

/** Names that slug to something the map does not hold, but mean one that it does. */
const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  node: "nodejs",
  nextjs: "react",
  next: "react",
  tailwind: "tailwindcss",
  tailwindcss3: "tailwindcss",
  postgres: "postgresql",
  psql: "postgresql",
  golang: "go",
  cplusplus: "cpp",
  csharpnet: "csharp",
  dotnet: "csharp",
  reactjs: "react",
  vuejs: "vue",
  nuxt: "vue",
  htmlcss: "css",
  scss: "sass",
  gcp: "google",
  googlecloud: "google",
  anthropic: "claude",
  chatgpt: "openai",
  gpt: "openai",
  llm: "openai",
  shadcnui: "shadcn",
  radixui: "shadcn",
  githubactions: "github",
  gitlab: "git",
}

/**
 * The icon for a technology.
 *
 * `slug` is the explicit choice made in the admin and always wins; `name` is the fallback, so a
 * stack imported from connector evidence gets recognisable marks without anyone configuring
 * anything. An unresolved technology returns `null`, and his component renders the pill without
 * a glyph — which is the graceful case, not a broken image.
 */
export function techIcon(name?: string, slug?: string): React.ReactElement | null {
  const explicit = slug ? techSlug(slug) : ""
  if (explicit) {
    return ICONS[explicit] ?? ICONS[ALIASES[explicit] ?? ""] ?? null
  }

  const derived = techSlug(name ?? "")
  if (!derived) return null
  return ICONS[derived] ?? ICONS[ALIASES[derived] ?? ""] ?? null
}
