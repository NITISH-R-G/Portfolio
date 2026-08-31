/**
 * Type definitions for `@portfolio-engine/agent`.
 *
 * Hand-written rather than generated: the package ships plain ESM with JSDoc, and a `.d.ts`
 * is the contract consumers actually program against. Keeping it by hand means the published
 * types describe the intended API rather than whatever the implementation happens to expose.
 */

export interface Issue {
  level: 'error' | 'warning' | 'info'
  message: string
}

export interface LoadOptions {
  /** Injectable for tests, proxies, or a runtime without a global `fetch`. */
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

/** Why a result matched: which term, in which field, and whether it was typed or expanded. */
export interface SearchMatch {
  term: string
  field: 'title' | 'subtitle' | 'tags' | 'text' | string
  /** `false` when the term came from concept expansion rather than the query itself. */
  direct: boolean
}

export interface SearchProvenance {
  source?: string
  url?: string
  method?: string
  confidence?: number
  evidence?: { label?: string; count?: number; source?: string }[]
}

export interface SearchResult {
  id: string
  type: string
  title: string
  subtitle?: string
  url?: string
  score: number
  matched: SearchMatch[]
  provenance?: SearchProvenance
  record: Record<string, unknown>
}

export interface SearchOptions {
  limit?: number
  /** Restrict to given collections, e.g. `['projects', 'experience']`. */
  types?: string[]
  minScore?: number
}

export interface SkillEvidence {
  skill: Record<string, unknown>
  evidence: Record<string, unknown>[]
  /** Entities that list this skill — usually stronger evidence than the skill entry itself. */
  usedIn: { type: string; title: string }[]
}

export interface AskOptions {
  /** Your model. The package ships none and holds no API key. */
  complete: (prompt: string) => Promise<string>
  sections?: string[]
}

export interface AskResult {
  answer: string
  prompt: string
  /** Deterministic retrieval for the same question, so an answer can be shown with sources. */
  grounding: SearchResult[]
}

export declare class PortfolioError extends Error {
  code: 'no-fetch' | 'not-found' | 'bad-url' | 'invalid' | 'no-provider' | string
  issues: Issue[]
}

export declare class PortfolioAgent {
  constructor(manifest: Record<string, unknown>, context?: { url?: string; issues?: Issue[] })

  readonly manifest: Record<string, unknown>
  readonly url?: string
  readonly issues: Issue[]
  readonly person: Record<string, unknown>
  readonly capabilities: Record<string, unknown>

  static fromUrl(url: string, options?: LoadOptions): Promise<PortfolioAgent>
  static fromManifest(manifest: unknown, options?: { url?: string; strict?: boolean }): PortfolioAgent

  get(type: string): Record<string, unknown>[]
  getProjects(): Record<string, unknown>[]
  getExperience(): Record<string, unknown>[]
  getEducation(): Record<string, unknown>[]
  getSkills(): Record<string, unknown>[]
  getPublications(): Record<string, unknown>[]
  getAchievements(): Record<string, unknown>[]
  getCertifications(): Record<string, unknown>[]

  sections(): Record<string, number>
  entity(id: string): Record<string, unknown> | undefined

  search(query: string, options?: SearchOptions): SearchResult[]
  findSkill(name: string): SkillEvidence | undefined
  getEvidence(id: string): Record<string, unknown> | undefined

  toMarkdown(options?: { entity?: string; sections?: string[] }): string
  toPrompt(options?: { entity?: string; question?: string; sections?: string[] }): string

  ask(question: string, options: AskOptions): Promise<AskResult>
}

export declare function discoverManifest(
  url: string,
  options?: LoadOptions,
): Promise<{ manifest: Record<string, unknown>; url: string; issues: Issue[] }>

export declare function validateManifest(input: unknown): { valid: boolean; issues: Issue[] }

export declare function buildIndex(manifest: Record<string, unknown>): unknown[]
export declare function rank(documents: unknown[], query: string, options?: SearchOptions): SearchResult[]
export declare function tokenize(value: string): string[]
export declare function expandQuery(query: string): { terms: string[]; expansions: Map<string, string[]> }

export declare function manifestToMarkdown(manifest: Record<string, unknown>, options?: { sections?: string[] }): string
export declare function entityToMarkdown(record: Record<string, unknown>, options?: { type?: string; heading?: number }): string
export declare function manifestToPrompt(
  manifest: Record<string, unknown>,
  options?: { question?: string; sections?: string[]; suggestions?: boolean },
): string
export declare function entityToPrompt(
  record: Record<string, unknown>,
  options?: { type?: string; person?: string; source?: string; question?: string },
): string

export default PortfolioAgent
