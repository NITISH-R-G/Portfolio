import {
  IconBrandAws,
  IconBrandAzure,
  IconBrandCSharp,
  IconBrandPowershell,
  IconBrandReactNative,
  IconBrandSlack,
  IconDatabase,
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

import type { SimpleIcon } from "simple-icons"
import {
  siAngular,
  siAstro,
  siBootstrap,
  siC,
  siCplusplus,
  siDart,
  siDebian,
  siDjango,
  siDocker,
  siFastapi,
  siFigma,
  siFirebase,
  siFlask,
  siFlutter,
  siGit,
  siGithubactions,
  siGnubash,
  siGo,
  siGooglecloud,
  siGraphql,
  siGsap,
  siHtml5,
  siHuggingface,
  siJest,
  siJupyter,
  siKeras,
  siKotlin,
  siKubernetes,
  siLangchain,
  siLaravel,
  siLinux,
  siMermaid,
  siMongodb,
  siMysql,
  siNextdotjs,
  siNodedotjs,
  siNotion,
  siNumpy,
  siOpencv,
  siOpenjdk,
  siPandas,
  siPhp,
  siPostgresql,
  siPrisma,
  siPython,
  siPytorch,
  siRedis,
  siRedux,
  siRuby,
  siRust,
  siSass,
  siScikitlearn,
  siSqlite,
  siStreamlit,
  siSupabase,
  siSvelte,
  siSwift,
  siTensorflow,
  siThreedotjs,
  siUbuntu,
  siVite,
  siVuedotjs,
} from "simple-icons"

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
/**
 * A Simple Icons brand mark, drawn the way his stack draws its own: one filled path in
 * `currentColor` on a 24-unit box, so it takes the pill's muted colour and sits beside his marks
 * without looking pasted in. Simple Icons is CC0 and is where marks like his inline Python path
 * come from; the brands a vendor asked it to withdraw (C#, AWS, Azure, PowerShell) keep
 * Tabler's, and Java, whose own mark was withdrawn, takes OpenJDK's.
 *
 * Named imports, never the namespace: this module reaches client bundles through the adapter,
 * and a namespace import would ship all three thousand paths.
 */
function brand(icon: SimpleIcon): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={icon.path} fill="currentColor" />
    </svg>
  )
}

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

  // Filled Simple Icons marks for what his own does not cover; Tabler where it has none.
  python: brand(siPython),
  nodejs: brand(siNodedotjs),
  cpp: brand(siCplusplus),
  csharp: <IconBrandCSharp />,
  php: brand(siPhp),
  go: brand(siGo),
  rust: brand(siRust),
  kotlin: brand(siKotlin),
  swift: brand(siSwift),
  vue: brand(siVuedotjs),
  angular: brand(siAngular),
  svelte: brand(siSvelte),
  astro: brand(siAstro),
  vite: brand(siVite),
  redux: brand(siRedux),
  threejs: brand(siThreedotjs),
  sass: brand(siSass),
  bootstrap: brand(siBootstrap),
  reactnative: <IconBrandReactNative />,
  flutter: brand(siFlutter),
  django: brand(siDjango),
  laravel: brand(siLaravel),
  graphql: brand(siGraphql),
  prisma: brand(siPrisma),
  // Tabler ships no Postgres or Redis mark; a database glyph is honest for both and better
  // than a wrong brand.
  postgresql: brand(siPostgresql),
  redis: brand(siRedis),
  sqlite: brand(siSqlite),
  sql: <IconDatabase />,
  mysql: brand(siMysql),
  mongodb: brand(siMongodb),
  firebase: brand(siFirebase),
  supabase: brand(siSupabase),
  docker: brand(siDocker),
  git: brand(siGit),
  aws: <IconBrandAws />,
  azure: <IconBrandAzure />,
  figma: brand(siFigma),
  notion: brand(siNotion),
  slack: <IconBrandSlack />,
  ubuntu: brand(siUbuntu),
  debian: brand(siDebian),

  // Common in data, ML and backend work, and absent from both sets above.
  html: brand(siHtml5),
  dart: brand(siDart),
  jupyter: brand(siJupyter),
  c: brand(siC),
  gsap: brand(siGsap),
  scikitlearn: brand(siScikitlearn),
  langchain: brand(siLangchain),
  tensorflow: brand(siTensorflow),
  keras: brand(siKeras),
  fastapi: brand(siFastapi),
  flask: brand(siFlask),
  githubactions: brand(siGithubactions),
  googlecloud: brand(siGooglecloud),
  pandas: brand(siPandas),
  numpy: brand(siNumpy),
  pytorch: brand(siPytorch),
  opencv: brand(siOpencv),
  nextjs: brand(siNextdotjs),
  kubernetes: brand(siKubernetes),
  linux: brand(siLinux),
  huggingface: brand(siHuggingface),
  streamlit: brand(siStreamlit),
  jest: brand(siJest),
  java: brand(siOpenjdk),
  ruby: brand(siRuby),
  bash: brand(siGnubash),
  mermaid: brand(siMermaid),
  powershell: <IconBrandPowershell />,
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
  html: "HTML",
  scikitlearn: "scikit-learn",
  langchain: "LangChain",
  tensorflow: "TensorFlow",
  fastapi: "FastAPI",
  githubactions: "GitHub Actions",
  googlecloud: "Google Cloud",
  gsap: "GSAP",
  pytorch: "PyTorch",
  numpy: "NumPy",
  opencv: "OpenCV",
  nextjs: "Next.js",
  huggingface: "Hugging Face",
  powershell: "PowerShell",
  bash: "Bash",
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
  next: "nextjs",
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
  gcp: "googlecloud",
  anthropic: "claude",
  openaiapi: "openai",
  html5: "html",
  scikit: "scikitlearn",
  sklearn: "scikitlearn",
  greensock: "gsap",
  chatgpt: "openai",
  gpt: "openai",
  llm: "openai",
  shadcnui: "shadcn",
  radixui: "shadcn",
  gitlab: "git",
  shell: "bash",
  zsh: "bash",
  shellscript: "bash",
  dockerfile: "docker",
  plpgsql: "postgresql",
  claudecode: "claude",
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
