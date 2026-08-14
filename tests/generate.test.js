import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { scoreProject, rankProjects, sortByDateDesc, WEIGHTS } from '../src/core/generate/scoring.js'
import { deriveSkills, groupSkills, canonicalizeSkill, categorizeSkill } from '../src/core/generate/skills.js'
import { deriveStats, computeHIndex, formatCount, headlineStats } from '../src/core/generate/stats.js'
import { resolveSections, navigationFor, SECTION_DEFINITIONS } from '../src/core/generate/sections.js'
import { generateSeo, deriveDescription, escapeHtml, generateSitemap, generateRobots } from '../src/core/generate/seo.js'
import { buildPortfolio, visibleSections } from '../src/core/generate/build.js'
import { normalizeProfile } from '../src/core/schema/profile.js'
import { resolveConfig } from '../src/core/config/resolve.js'
import { SECTION_IDS } from '../src/core/config/defaults.js'

/** A fixed clock so recency-sensitive scores are reproducible. */
const NOW = Date.parse('2026-06-01T00:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)

const profileOf = (data) => normalizeProfile(data)

describe('project scoring', () => {
  test('weights sum to 100', () => {
    assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100)
  })

  test('an empty project scores zero, a complete one scores high', () => {
    assert.equal(scoreProject({ name: 'bare' }, { now: NOW }).score, 0)

    const complete = scoreProject({
      name: 'good',
      description: 'A genuinely useful tool that solves a real and clearly stated problem.',
      technologies: ['Rust'], topics: ['cli'], primaryLanguage: 'Rust', image: '/x.png',
      stars: 400, forks: 60,
      updatedAt: { iso: daysAgo(10), precision: 'day' },
      problem: 'p', approach: 'a', impact: 'i', role: 'r', lessons: 'l',
      metrics: [{ label: 'x', value: '1' }],
      liveUrl: 'https://x.dev', repository: 'https://github.com/a/b',
    }, { now: NOW })
    assert.ok(complete.score > 85, `expected > 85, got ${complete.score}`)
  })

  test('is deterministic', () => {
    const p = { name: 'x', stars: 10, updatedAt: { iso: daysAgo(30), precision: 'day' } }
    assert.equal(scoreProject(p, { now: NOW }).score, scoreProject(p, { now: NOW }).score)
  })

  test('star scaling is logarithmic, so early stars matter most', () => {
    const at = (stars) => scoreProject({ name: 'x', stars }, { now: NOW }).breakdown.popularity
    assert.ok(at(10) - at(0) > at(1000) - at(900))
  })

  test('a written case study can outrank raw popularity', () => {
    const popular = scoreProject({ name: 'a', stars: 200, updatedAt: { iso: daysAgo(700), precision: 'day' } }, { now: NOW })
    const explained = scoreProject({
      name: 'b',
      description: 'A carefully documented project with a real write-up behind it.',
      technologies: ['Go'], primaryLanguage: 'Go', topics: ['x'],
      problem: 'p', approach: 'a', impact: 'i', role: 'r', lessons: 'l',
      metrics: [{ label: 'x', value: '1' }],
      liveUrl: 'https://x.dev', repository: 'https://g.com/x',
      updatedAt: { iso: daysAgo(20), precision: 'day' },
    }, { now: NOW })
    assert.ok(explained.score > popular.score)
  })

  test('an undescribed fork with no stars is heavily penalised', () => {
    const base = { name: 'x', updatedAt: { iso: daysAgo(10), precision: 'day' } }
    assert.ok(scoreProject({ ...base, isFork: true }, { now: NOW }).score
      < scoreProject(base, { now: NOW }).score)
  })

  test('breakdown explains the score', () => {
    const { breakdown } = scoreProject({ name: 'x', stars: 50 }, { now: NOW })
    assert.deepEqual(Object.keys(breakdown).sort(), Object.keys(WEIGHTS).sort())
  })
})

describe('project ranking', () => {
  test('sorts best first and writes featureScore', () => {
    const ranked = rankProjects([
      { name: 'weak' },
      { name: 'strong', description: 'A well described project with real substance to it.', stars: 100, primaryLanguage: 'Go', technologies: ['Go'], repository: 'https://g.com/x', updatedAt: { iso: daysAgo(5), precision: 'day' } },
    ], { now: NOW })
    assert.equal(ranked[0].name, 'strong')
    assert.ok(ranked[0].featureScore > ranked[1].featureScore)
  })

  test('an explicit featured flag always wins over the score', () => {
    const ranked = rankProjects([
      { name: 'high', stars: 900, description: 'x'.repeat(100), primaryLanguage: 'Go', updatedAt: { iso: daysAgo(1), precision: 'day' } },
      { name: 'mine', featured: true },
    ], { now: NOW })
    assert.equal(ranked[0].name, 'mine')
  })

  test('auto-features the top projects only when the user picked none', () => {
    const auto = rankProjects([
      { name: 'a', description: 'A well described project with real substance to it.', stars: 40, primaryLanguage: 'Go', technologies: ['Go'], repository: 'https://g.com/a', updatedAt: { iso: daysAgo(5), precision: 'day' } },
      { name: 'b', description: 'Another well described project with real substance.', stars: 20, primaryLanguage: 'Go', technologies: ['Go'], repository: 'https://g.com/b', updatedAt: { iso: daysAgo(9), precision: 'day' } },
    ], { now: NOW })
    assert.ok(auto.every((p) => p.featured === true))

    const chosen = rankProjects([{ name: 'a', featured: true }, { name: 'b', stars: 50 }], { now: NOW })
    assert.equal(chosen.find((p) => p.name === 'b').featured, undefined)
  })

  test('does not auto-feature weak projects just to fill the row', () => {
    const ranked = rankProjects([{ name: 'a' }, { name: 'b' }], { now: NOW })
    assert.ok(ranked.every((p) => p.featured !== true))
  })

  test('handles an empty list', () => {
    assert.deepEqual(rankProjects([]), [])
    assert.deepEqual(rankProjects(undefined), [])
  })

  test('sortByDateDesc puts undated records last', () => {
    const sorted = sortByDateDesc([
      { title: 'undated' },
      { title: 'old', date: { iso: '2020-01-01', precision: 'year' } },
      { title: 'new', date: { iso: '2025-01-01', precision: 'year' } },
    ])
    assert.deepEqual(sorted.map((i) => i.title), ['new', 'old', 'undated'])
  })
})

describe('skill evidence', () => {
  test('canonicalizes spelling variants into one skill', () => {
    assert.equal(canonicalizeSkill('javascript'), 'JavaScript')
    assert.equal(canonicalizeSkill('JS'), 'JavaScript')
    assert.equal(canonicalizeSkill('graph-algorithms'), 'Graph Algorithms')
    assert.equal(canonicalizeSkill('  '), '')
  })

  test('categorizes into meaningful groups', () => {
    assert.equal(categorizeSkill('Python'), 'Languages')
    assert.equal(categorizeSkill('PyTorch'), 'AI & ML')
    assert.equal(categorizeSkill('React'), 'Frontend')
    assert.equal(categorizeSkill('Something Unusual'), 'Other')
  })

  test('attaches counted, sourced evidence rather than an assertion', () => {
    const skills = deriveSkills(profileOf({
      projects: [
        { name: 'a', primaryLanguage: 'Python', source: { connector: 'github' } },
        { name: 'b', primaryLanguage: 'Python', source: { connector: 'github' } },
        { name: 'c', primaryLanguage: 'python', source: { connector: 'github' } },
      ],
    }))
    const python = skills.find((s) => s.name === 'Python')
    assert.ok(python, 'Python should be derived')
    assert.equal(python.evidence[0].count, 3)
    assert.equal(python.evidence[0].label, '3 repositories')
    assert.equal(python.evidence[0].connector, 'github')
  })

  test('never invents a proficiency level from activity', () => {
    const skills = deriveSkills(profileOf({
      projects: Array.from({ length: 20 }, (_, i) => ({ name: `p${i}`, primaryLanguage: 'Rust' })),
    }))
    assert.equal(skills.find((s) => s.name === 'Rust').proficiency, undefined)
  })

  test('preserves a user-declared proficiency', () => {
    const skills = deriveSkills(profileOf({
      skills: [{ name: 'Rust', proficiency: 4 }],
      projects: [{ name: 'p', primaryLanguage: 'Rust' }],
    }))
    assert.equal(skills.find((s) => s.name === 'Rust').proficiency, 4)
  })

  test('keeps declared skills that have no imported evidence', () => {
    const skills = deriveSkills(profileOf({ skills: [{ name: 'Public Speaking' }] }))
    const found = skills.find((s) => s.name === 'Public Speaking')
    assert.ok(found)
    assert.equal(found.weight, 0)
  })

  test('drops repository-purpose topics that are not skills', () => {
    const skills = deriveSkills(profileOf({
      projects: [{ name: 'a', topics: ['hacktoberfest', 'portfolio', 'rust'] }],
    }))
    const names = skills.map((s) => s.name)
    assert.ok(names.includes('Rust'))
    assert.ok(!names.includes('Hacktoberfest'))
    assert.ok(!names.includes('Portfolio'))
  })

  test('sorts by evidence weight', () => {
    const skills = deriveSkills(profileOf({
      projects: [
        { name: 'a', primaryLanguage: 'Go' },
        { name: 'b', primaryLanguage: 'Go' },
        { name: 'c', primaryLanguage: 'Zig' },
      ],
    }))
    assert.equal(skills[0].name, 'Go')
  })

  test('grouping drops empty categories and orders known ones first', () => {
    const groups = groupSkills(deriveSkills(profileOf({
      projects: [{ name: 'a', primaryLanguage: 'Python', technologies: ['React'] }],
    })))
    const categories = groups.map((g) => g.category)
    assert.ok(categories.includes('Languages'))
    assert.ok(groups.every((g) => g.items.length > 0))
    assert.ok(categories.indexOf('Languages') < categories.indexOf('Other') || !categories.includes('Other'))
  })

  test('handles an empty profile', () => {
    assert.deepEqual(deriveSkills(profileOf({})), [])
  })
})

describe('stats', () => {
  test('counts only what exists and omits zeroes', () => {
    const stats = deriveStats(profileOf({
      projects: [
        { name: 'a', stars: 10, forks: 2, primaryLanguage: 'Go', source: { connector: 'github' } },
        { name: 'b', stars: 5, primaryLanguage: 'Rust', source: { connector: 'github' } },
      ],
    }))
    const byId = Object.fromEntries(stats.map((s) => [s.id, s]))
    assert.equal(byId.stars.value, 15)
    assert.equal(byId.repositories.value, 2)
    assert.equal(byId['languages-used'].value, 2)
    assert.equal(byId.publications, undefined, 'zero-valued stats are omitted')
  })

  test('marks platform-reported numbers as fetched and counted ones as derived', () => {
    const stats = deriveStats(profileOf({
      projects: [{ name: 'a', stars: 3 }],
      competitive: [{ platform: 'Codeforces', maxRating: 1700, connector: 'codeforces' }],
    }))
    assert.equal(stats.find((s) => s.id === 'stars').kind, 'derived')
    assert.equal(stats.find((s) => s.id === 'peak-rating').kind, 'fetched')
    assert.equal(stats.find((s) => s.id === 'peak-rating').note, 'Codeforces')
  })

  test('h-index matches the definition', () => {
    assert.equal(computeHIndex([10, 8, 5, 4, 3]), 4)
    assert.equal(computeHIndex([1, 1, 1]), 1)
    assert.equal(computeHIndex([]), 0)
    assert.equal(computeHIndex([0, 0]), 0)
    assert.equal(computeHIndex([100]), 1)
  })

  test('sums problems solved across platforms', () => {
    const stats = deriveStats(profileOf({
      competitive: [
        { platform: 'LeetCode', problemsSolved: 800 },
        { platform: 'Codeforces', problemsSolved: 450 },
      ],
    }))
    const solved = stats.find((s) => s.id === 'problems-solved')
    assert.equal(solved.value, 1250)
    assert.equal(solved.display, '1,250')
    assert.match(solved.note, /2 platforms/)
  })

  test('formats large numbers compactly but keeps four digits exact', () => {
    assert.equal(formatCount(1250), '1,250')
    assert.equal(formatCount(25_000), '25k')
    assert.equal(formatCount(2_400_000), '2.4M')
  })

  test('headline stats pick the most meaningful few', () => {
    const stats = deriveStats(profileOf({
      projects: [{ name: 'a', stars: 100 }],
      publications: [{ title: 'p', citations: 5 }],
      certifications: [{ name: 'c' }],
    }))
    const headline = headlineStats(stats, 2)
    assert.equal(headline.length, 2)
    assert.equal(headline[0].id, 'stars')
  })
})

describe('automatic section detection', () => {
  const sectionsFor = (data, config = {}) => {
    const built = buildPortfolio({ config, manual: data, now: NOW })
    return Object.fromEntries(built.sections.map((s) => [s.id, s]))
  }

  test('every configurable section id has a definition', () => {
    const defined = new Set(SECTION_DEFINITIONS.map((s) => s.id))
    for (const id of SECTION_IDS) assert.ok(defined.has(id), `${id} has no definition`)
  })

  test('an empty portfolio shows no content sections', () => {
    const s = sectionsFor({ identity: { name: 'A' } })
    assert.equal(s.projects.visible, false)
    assert.equal(s.publications.visible, false)
    assert.equal(s.competitive.visible, false)
    assert.equal(s.projects.reason, 'auto-hidden')
  })

  test('an open-source-heavy profile shows projects and open source', () => {
    const s = sectionsFor({
      identity: { name: 'A' },
      projects: [{ name: 'lib', stars: 300, forks: 40 }, { name: 'tool', stars: 12, forks: 3 }],
    })
    assert.equal(s.projects.visible, true)
    assert.equal(s.openSource.visible, true)
    assert.equal(s.publications.visible, false)
  })

  test('a research-heavy profile shows publications, not competitive programming', () => {
    const s = sectionsFor({
      identity: { name: 'A' },
      publications: [
        { title: 'One', citations: 40 },
        { title: 'Two', citations: 12 },
      ],
    })
    assert.equal(s.publications.visible, true)
    assert.equal(s.competitive.visible, false)
    assert.equal(s.hackathons.visible, false)
  })

  test('a competitive-programming profile shows the competitive section', () => {
    const s = sectionsFor({
      identity: { name: 'A' },
      competitive: [{ platform: 'Codeforces', rating: 1800, problemsSolved: 900 }],
    })
    assert.equal(s.competitive.visible, true)
    assert.equal(s.publications.visible, false)
  })

  test('one blog post is not a writing section, two is', () => {
    assert.equal(sectionsFor({ identity: { name: 'A' }, posts: [{ title: 'a' }] }).writing.visible, false)
    assert.equal(sectionsFor({ identity: { name: 'A' }, posts: [{ title: 'a' }, { title: 'b' }] }).writing.visible, true)
  })

  test('explicit config overrides auto-detection in both directions', () => {
    const forcedOn = sectionsFor({ identity: { name: 'A' } }, { sections: { projects: true } })
    assert.equal(forcedOn.projects.visible, true)
    assert.equal(forcedOn.projects.reason, 'forced-on')

    const forcedOff = sectionsFor(
      { identity: { name: 'A' }, projects: [{ name: 'x' }] },
      { sections: { projects: false } },
    )
    assert.equal(forcedOff.projects.visible, false)
    assert.equal(forcedOff.projects.reason, 'forced-off')
  })

  test('reports the count so the admin can explain a hidden section', () => {
    const s = sectionsFor({ identity: { name: 'A' }, posts: [{ title: 'a' }] })
    assert.equal(s.writing.count, 1)
    assert.equal(s.writing.visible, false)
  })

  test('a user-declared custom section renders from profile.custom', () => {
    const built = buildPortfolio({
      config: { sections: { volunteering: 'auto' }, sectionOptions: { volunteering: { label: 'Volunteering' } } },
      manual: { identity: { name: 'A' }, custom: { volunteering: [{ title: 'Mentor' }] } },
      now: NOW,
    })
    const section = built.sections.find((s) => s.id === 'volunteering')
    assert.ok(section)
    assert.equal(section.visible, true)
    assert.equal(section.label, 'Volunteering')
  })

  test('navigation is derived from the same resolution as the page', () => {
    const built = buildPortfolio({
      manual: { identity: { name: 'A' }, projects: [{ name: 'x' }] },
      now: NOW,
    })
    const navIds = navigationFor(built.sections).map((n) => n.id)
    const visibleIds = visibleSections(built).map((s) => s.id).filter((id) => id !== 'hero')
    assert.deepEqual(navIds, visibleIds)
  })

  test('section order from config is honoured', () => {
    const built = buildPortfolio({
      config: { sectionOrder: ['contact', 'hero'] },
      manual: { identity: { name: 'A', contact: { email: 'a@b.co' } } },
      now: NOW,
    })
    assert.equal(built.sections[0].id, 'contact')
    assert.equal(built.sections[1].id, 'hero')
  })
})

describe('seo generation', () => {
  const config = resolveConfig({
    identity: { name: 'Ada Lovelace', headline: 'Systems Engineer' },
    site: { url: 'https://ada.dev', base: '/' },
  }).config

  test('derives a description from real content when none is written', () => {
    const description = deriveDescription(profileOf({
      identity: { name: 'Ada', headline: 'Engineer' },
      projects: [{ name: 'a' }, { name: 'b' }],
      skills: [{ name: 'Rust' }, { name: 'Go' }],
    }))
    assert.match(description, /Ada — Engineer/)
    assert.match(description, /2 projects/)
    assert.ok(description.length <= 161)
  })

  test('prefers the user summary', () => {
    assert.equal(
      deriveDescription(profileOf({ identity: { name: 'Ada', summary: 'I build compilers.' } })),
      'I build compilers.',
    )
  })

  test('generates canonical, og and twitter tags from config', () => {
    const seo = generateSeo(profileOf({ identity: { name: 'Ada Lovelace', headline: 'Systems Engineer' } }), config)
    assert.equal(seo.canonical, 'https://ada.dev/')
    assert.equal(seo.title, 'Ada Lovelace — Systems Engineer')
    assert.ok(seo.meta.some((m) => m.property === 'og:title' && m.content === seo.title))
    assert.ok(seo.meta.some((m) => m.name === 'twitter:card'))
  })

  test('emits Person, ProfilePage and WebSite structured data', () => {
    const seo = generateSeo(profileOf({
      identity: { name: 'Ada', headline: 'Engineer' },
      socials: { github: 'https://github.com/ada' },
    }), config)
    const types = seo.structuredData.map((n) => n['@type'])
    assert.ok(types.includes('Person'))
    assert.ok(types.includes('ProfilePage'))
    assert.ok(types.includes('WebSite'))
    assert.deepEqual(seo.structuredData[0].sameAs, ['https://github.com/ada'])
  })

  test('only claims an affiliation the data supports', () => {
    const without = generateSeo(profileOf({ identity: { name: 'Ada' } }), config)
    assert.equal(without.structuredData[0].affiliation, undefined)

    const with_ = generateSeo(profileOf({
      identity: { name: 'Ada' },
      education: [{ institution: 'Somewhere', dates: { current: true } }],
    }), config)
    assert.equal(with_.structuredData[0].affiliation.name, 'Somewhere')
  })

  test('adds ScholarlyArticle nodes only when there are publications', () => {
    const seo = generateSeo(profileOf({
      identity: { name: 'Ada' },
      publications: [{ title: 'On Engines', authors: ['Ada'], date: '1843', doi: '10.0/x' }],
    }), config)
    assert.ok(seo.structuredData.some((n) => n['@type'] === 'ScholarlyArticle'))
  })

  test('escapes imported content so it cannot inject markup', () => {
    assert.equal(escapeHtml('<script>"x"'), '&lt;script&gt;&quot;x&quot;')
    const seo = generateSeo(profileOf({
      identity: { name: 'Ada', summary: '"><script>alert(1)</script>' },
    }), config)
    assert.ok(!seo.html.includes('<script>alert'))
    assert.ok(seo.html.includes('&lt;script&gt;'))
  })

  test('escapes a closing script tag inside json-ld', () => {
    const seo = generateSeo(profileOf({ identity: { name: 'A</script><script>x' } }), config)
    assert.ok(!/A<\/script>/.test(seo.html))
  })

  test('omits canonical and og:url when no site url is configured', () => {
    const local = resolveConfig({ identity: { name: 'Ada' } }).config
    const seo = generateSeo(profileOf({ identity: { name: 'Ada' } }), local)
    assert.equal(seo.canonical, '')
    assert.ok(!seo.meta.some((m) => m.property === 'og:url'))
    assert.ok(!seo.html.includes('rel="canonical"'))
  })

  test('sitemap and robots use the configured url', () => {
    assert.match(generateSitemap(config, { lastModified: '2026-06-01T00:00:00Z' }), /<loc>https:\/\/ada\.dev\/<\/loc>/)
    assert.match(generateRobots(config), /Sitemap: https:\/\/ada\.dev\/sitemap\.xml/)
    assert.match(generateRobots(config), /Disallow: \/admin\.html/)
    assert.equal(generateSitemap(resolveConfig({}).config), '', 'no url means no sitemap')
  })
})

describe('build pipeline', () => {
  test('an empty build still produces a renderable result', () => {
    const built = buildPortfolio({ now: NOW })
    assert.ok(built.profile)
    assert.ok(Array.isArray(built.sections))
    assert.ok(built.theme.vars['--color-bg'])
    assert.equal(built.validation.valid, false, 'missing name is an error')
    assert.doesNotThrow(() => visibleSections(built))
  })

  test('layers apply in the documented order', () => {
    const built = buildPortfolio({
      config: { identity: { name: 'From Config' } },
      sources: [{ identity: { name: 'From GitHub', headline: 'From GitHub' } }],
      manual: { identity: { headline: 'From Manual' } },
      now: NOW,
    })
    assert.equal(built.profile.identity.name, 'From Config')
    assert.equal(built.profile.identity.headline, 'From Manual')
  })

  test('hiding a project removes its stars from the totals', () => {
    const withAll = buildPortfolio({
      manual: { identity: { name: 'A' }, projects: [{ id: 'a', name: 'a', stars: 10 }, { id: 'b', name: 'b', stars: 5 }] },
      now: NOW,
    })
    const withHidden = buildPortfolio({
      manual: { identity: { name: 'A' }, projects: [{ id: 'a', name: 'a', stars: 10 }, { id: 'b', name: 'b', stars: 5 }] },
      overrides: { hidden: { projects: ['b'] } },
      now: NOW,
    })
    assert.equal(withAll.profile.stats.entries.find((s) => s.id === 'stars').value, 15)
    assert.equal(withHidden.profile.stats.entries.find((s) => s.id === 'stars').value, 10)
  })

  test('an explicit project order survives ranking', () => {
    const built = buildPortfolio({
      manual: {
        identity: { name: 'A' },
        projects: [
          { id: 'weak', name: 'weak' },
          { id: 'strong', name: 'strong', stars: 500, description: 'x'.repeat(100), primaryLanguage: 'Go' },
        ],
      },
      overrides: { order: { projects: ['weak'] } },
      now: NOW,
    })
    assert.equal(built.profile.projects[0].id, 'weak')
  })

  test('is deterministic for a fixed clock', () => {
    const input = {
      manual: { identity: { name: 'A' }, projects: [{ name: 'a', stars: 3 }, { name: 'b', stars: 3 }] },
      now: NOW,
    }
    assert.equal(JSON.stringify(buildPortfolio(input)), JSON.stringify(buildPortfolio(input)))
  })

  test('a broken source layer does not prevent a build', () => {
    const built = buildPortfolio({
      sources: [null, 'garbage', { projects: 'not an array' }, { identity: { name: 'A' } }],
      now: NOW,
    })
    assert.equal(built.profile.identity.name, 'A')
  })

  test('surfaces config issues without failing', () => {
    const built = buildPortfolio({ config: { layout: { shell: 'nope' } }, now: NOW })
    assert.ok(built.configIssues.some((i) => i.path === 'layout.shell'))
    assert.equal(built.config.layout.shell, 'sidebar')
  })

  test('experience sorts current roles first', () => {
    const built = buildPortfolio({
      manual: {
        identity: { name: 'A' },
        experience: [
          { company: 'Old', role: 'x', dates: { start: '2018', end: '2020' } },
          { company: 'Now', role: 'y', dates: { start: '2024', current: true } },
        ],
      },
      now: NOW,
    })
    assert.equal(built.profile.experience[0].company, 'Now')
  })
})
