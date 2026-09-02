/**
 * A fictional portfolio.
 *
 * Deliberately nothing like the one in this repository: different person, different field,
 * different sections populated, different vocabulary. If any assumption about *whose*
 * portfolio this package is reading leaks into the implementation, these tests fail — which
 * is the only reliable way to keep a general-purpose package general.
 */
export const fictional = {
  schemaVersion: '1.0',
  spec: 'https://example.org/spec',
  url: 'https://marina.example.org/',
  meta: { generatedAt: '2026-01-15T00:00:00.000Z', generator: 'portfolio-engine' },
  person: {
    name: 'Marina Delacroix',
    headline: 'Marine Robotics Engineer',
    summary: 'I build autonomous underwater vehicles and the perception stacks that keep them from hitting things.',
    location: 'Brest, France',
    contact: { website: 'https://marina.example.org/' },
  },
  socials: {
    github: 'https://github.com/mdelacroix',
    orcid: 'https://orcid.org/0000-0002-0000-0000',
  },
  capabilities: { schemaVersion: '1.0', provenance: true, evidence: true, search: 'client' },
  experience: [
    {
      id: 'ifremer-perception-lead',
      company: 'Ifremer',
      role: 'Perception Lead',
      location: 'Brest, France',
      dates: { start: { iso: '2022-04-01', precision: 'month' }, current: true },
      description: 'Leads the underwater perception team building real-time obstacle avoidance for AUVs.',
      highlights: ['Cut false-positive sonar contacts by 40%', 'Shipped the first fully autonomous survey run'],
      technologies: ['C++', 'ROS', 'OpenCV'],
      source: { connector: 'linkedin', confidence: 0.9 },
    },
    {
      id: 'subsea-robotics-engineer',
      company: 'Subsea Dynamics',
      role: 'Robotics Engineer',
      dates: {
        start: { iso: '2019-09-01', precision: 'month' },
        end: { iso: '2022-03-01', precision: 'month' },
      },
      description: 'Built control software for remotely operated vehicles.',
      technologies: ['Python', 'C++'],
    },
  ],
  projects: [
    {
      id: 'abyssal-nav',
      name: 'abyssal-nav',
      description: 'Terrain-relative navigation for autonomous underwater vehicles using multibeam sonar.',
      technologies: ['C++', 'ROS', 'PCL'],
      topics: ['robotics', 'navigation', 'slam'],
      repository: 'https://github.com/mdelacroix/abyssal-nav',
      stars: 340,
      source: { connector: 'github', url: 'https://github.com/mdelacroix/abyssal-nav' },
    },
    {
      id: 'reef-vision',
      name: 'reef-vision',
      description: 'Coral reef species detection from ROV footage. Trained on 40k annotated frames.',
      technologies: ['Python', 'PyTorch', 'OpenCV'],
      topics: ['object detection', 'marine biology'],
      repository: 'https://github.com/mdelacroix/reef-vision',
      stars: 88,
      source: { connector: 'github' },
    },
    {
      id: 'tide-tables',
      name: 'tide-tables',
      description: 'A small library for computing tidal predictions from harmonic constituents.',
      technologies: ['Rust'],
      repository: 'https://github.com/mdelacroix/tide-tables',
    },
  ],
  skills: [
    { name: 'C++', evidence: [{ label: '18 repositories', count: 18, connector: 'github' }] },
    { name: 'Python', evidence: [{ label: '9 repositories', count: 9, connector: 'github' }] },
    { name: 'ROS', evidence: [{ label: '4 repositories', count: 4, connector: 'github' }] },
    { name: 'PyTorch' },
  ],
  publications: [
    {
      id: 'terrain-relative-nav',
      title: 'Terrain-relative navigation without a prior map',
      authors: ['Marina Delacroix', 'Yusuf Karaman'],
      venue: 'IEEE Journal of Oceanic Engineering',
      date: { iso: '2024-01-01', precision: 'year' },
      doi: '10.1109/JOE.2024.0000000',
    },
  ],
  education: [
    {
      id: 'ensta-msc',
      institution: 'ENSTA Bretagne',
      degree: 'MSc Autonomous Systems',
      dates: {
        start: { iso: '2017-01-01', precision: 'year' },
        end: { iso: '2019-01-01', precision: 'year' },
      },
    },
  ],
  achievements: [
    { id: 'sauc-e-winner', title: 'SAUC-E autonomous underwater competition — 1st place', date: { iso: '2019-01-01', precision: 'year' } },
  ],
}

/** A manifest carrying private fields a publisher should never have emitted. */
export const leaky = {
  ...fictional,
  person: {
    ...fictional.person,
    contact: { email: 'marina@example.org', phone: '+33 6 00 00 00 00' },
  },
}

/** Minimal but valid — the smallest thing a consumer must still handle. */
export const minimal = {
  schemaVersion: '1.0',
  person: { name: 'Sam Okafor' },
}

/** A manifest from a future major version this package must refuse rather than guess at. */
export const future = {
  schemaVersion: '2.0',
  person: { name: 'Future Person' },
  projects: [],
}

/** A page that declares its manifest, for autodiscovery tests. */
export const pageHtml = `<!doctype html>
<html><head>
  <title>Marina Delacroix</title>
  <link rel="canonical" href="https://marina.example.org/">
  <link rel="alternate" type="application/portfolio+json" href="./portfolio.json" title="Portfolio manifest">
</head><body><div id="root"></div></body></html>`
