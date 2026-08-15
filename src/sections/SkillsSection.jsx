import { motion } from 'motion/react'
import { groupSkills } from '../core/generate/skills.js'

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.02 } } }
const item = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
}

/**
 * Skill tags grouped by category.
 *
 * When evidence mode is on (the default), each tag renders the strongest thing backing it —
 * "Python · 17 repositories" — as visible text rather than a tooltip. That distinction is
 * the whole point of the section: a `title` attribute is invisible on touch devices, is not
 * reliably announced by screen readers, and cannot be reached by keyboard, so evidence
 * hidden behind one is evidence most readers never see. The full list stays in `title` for
 * anyone who does hover.
 *
 * @param {{
 *   skills: import('../core/schema/types.js').SkillItem[],
 *   evidenceMode?: boolean,
 *   reducedMotion: boolean,
 * }} props
 */
export default function SkillsSection({ skills, evidenceMode = true, reducedMotion }) {
  if (!skills || skills.length === 0) return null
  const groups = groupSkills(skills)

  return (
    <motion.div
      className="skills-groups"
      initial={reducedMotion ? 'visible' : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={container}
    >
      {groups.map((group) => (
        <div key={group.category} className="skills-group">
          {groups.length > 1 && <span className="skills-group-label">{group.category}</span>}
          <div className="skills-grid">
            {group.items.map((skill) => {
              const evidence = evidenceMode ? strongestEvidence(skill) : undefined
              const sources = sourcesOf(skill)
              // "Python — GitHub, Résumé, you" answers the question this whole project is
              // built around: where did this come from? Corroboration across independent
              // sources is the strongest thing a portfolio can say about a claim, and it
              // costs one line to show.
              const attribution = evidenceMode && sources.length ? sources.join(' · ') : undefined
              const all = [
                ...(skill.evidence ?? []).map((e) => e.label),
                sources.length ? `Sources: ${sources.join(', ')}` : '',
              ].filter(Boolean).join(' · ') || undefined

              return (
                <motion.span
                  key={skill.name}
                  className={`skill-tag${evidence ? ' skill-tag-evidenced' : ''}`}
                  variants={item}
                  title={all}
                  whileHover={!reducedMotion ? { scale: 1.05, borderColor: 'var(--color-border-strong)' } : {}}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <span className="skill-name">{skill.name}</span>
                  {evidence && <span className="skill-evidence">{evidence}</span>}
                  {attribution && <span className="skill-sources">{attribution}</span>}
                </motion.span>
              )
            })}
          </div>
        </div>
      ))}
    </motion.div>
  )
}

/**
 * The single most persuasive piece of evidence for a skill.
 *
 * Showing every label turns a tag cloud into a wall of text, so this picks the one with the
 * largest count — usually the repository or project count, which is also the easiest for a
 * reader to go and verify.
 *
 * @param {import('../core/schema/types.js').SkillItem} skill
 * @returns {string|undefined}
 */
function strongestEvidence(skill) {
  const evidence = skill.evidence ?? []
  if (!evidence.length) return undefined

  const best = [...evidence].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]
  return best?.label
}

/**
 * Which sources back this skill, in readable form.
 *
 * A skill named by GitHub, a résumé *and* the owner is a much stronger claim than one named
 * by any of them alone, and saying so is the difference between a tag cloud and evidence.
 * Only shown when more than one source agrees — a single source is already implied by the
 * evidence line above it, and repeating it would be noise on every tag.
 *
 * @param {import('../core/schema/types.js').SkillItem} skill
 * @returns {string[]}
 */
function sourcesOf(skill) {
  const names = new Set()
  for (const entry of skill.evidence ?? []) {
    if (entry.connector) names.add(LABELS[entry.connector] ?? titleCase(entry.connector))
  }
  if (skill.source?.connector) {
    names.add(LABELS[skill.source.connector] ?? titleCase(skill.source.connector))
  }
  return names.size > 1 ? [...names] : []
}

/** Source ids that do not title-case into their real name. */
const LABELS = {
  github: 'GitHub',
  gitlab: 'GitLab',
  npm: 'npm',
  pypi: 'PyPI',
  dockerhub: 'Docker Hub',
  huggingface: 'Hugging Face',
  stackoverflow: 'Stack Overflow',
  devto: 'DEV',
  semanticScholar: 'Semantic Scholar',
  googleScholar: 'Google Scholar',
  dblp: 'dblp',
  orcid: 'ORCID',
  leetcode: 'LeetCode',
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  hackerrank: 'HackerRank',
  hackerearth: 'HackerEarth',
  resume: 'Résumé',
  cv: 'CV',
  manual: 'you',
  config: 'you',
  you: 'you',
}

const titleCase = (value) =>
  String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
