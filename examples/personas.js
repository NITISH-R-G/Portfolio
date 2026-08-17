/**
 * Sample profiles.
 *
 * Eleven realistic portfolios, each shaped like a different kind of technical person, so
 * the engine can be seen working before anyone connects an account. They exist for three
 * reasons, in order of importance:
 *
 *  1. **Evaluation.** `npm run example -- researcher` shows what the tool does with a
 *     research-heavy profile in about five seconds, with no API keys and no waiting.
 *  2. **Proof that section auto-detection works.** Each persona deliberately populates a
 *     different subset of the schema — the competitive programmer has no publications, the
 *     researcher has no packages — so the sections that appear differ per persona. If
 *     auto-detection regressed, these would all start looking the same.
 *  3. **Test fixtures.** `tests/examples.test.js` runs every persona through the real
 *     pipeline and asserts on which sections appear, which is a far better regression test
 *     than any hand-written fixture.
 *
 * The numbers are invented but plausible. They never claim to be fetched: nothing here
 * carries a `fetchedAt`, so any stat derived from them is labelled `stated` rather than
 * `reported` — the same honesty rule that applies to a real manual connector.
 *
 * @module examples/personas
 */

/**
 * @typedef {object} Persona
 * @property {string} id
 * @property {string} name          Shown by `npm run example -- list`.
 * @property {string} description   What this profile is meant to demonstrate.
 * @property {object} config        Merged into portfolio.config.js.
 * @property {object} profile       Written to src/data/manual.json.
 */

/** Attribution used by every persona, so the provenance line reads honestly. */
const source = { connector: 'example' }

/** @type {Persona[]} */
export const PERSONAS = [
  {
    id: 'software-engineer',
    name: 'Software engineer',
    description: 'Product work at a company. Experience-led, with supporting projects and skills.',
    config: {
      identity: {
        name: 'Priya Raman',
        headline: 'Senior Software Engineer',
        location: 'Bengaluru, India',
        summary:
          'Backend and platform engineer. I work on the systems other teams build on — APIs, '
          + 'data pipelines, and the deployment path between them.',
      },
      theme: { preset: 'minimal-dark' },
      layout: { shell: 'sidebar', experienceLayout: 'timeline' },
    },
    profile: {
      experience: [
        {
          company: 'Fathom Systems', role: 'Senior Software Engineer', location: 'Bengaluru',
          startDate: '2023-02', description: 'Platform team — internal APIs and developer tooling.',
          highlights: [
            'Cut median API latency from 340 ms to 90 ms by replacing an N+1 fan-out with a batched loader.',
            'Migrated 40 services off a shared database onto per-service schemas with zero downtime.',
          ],
          technologies: ['Go', 'PostgreSQL', 'Kubernetes', 'gRPC'], source,
        },
        {
          company: 'Northwind Retail', role: 'Software Engineer', location: 'Pune',
          startDate: '2020-07', endDate: '2023-01',
          description: 'Checkout and payments.',
          highlights: ['Rebuilt the payment retry path, recovering roughly 2% of previously failed orders.'],
          technologies: ['Python', 'Django', 'Redis'], source,
        },
      ],
      education: [{
        institution: 'College of Engineering, Pune', degree: 'B.Tech', field: 'Computer Engineering',
        startDate: '2016', endDate: '2020', source,
      }],
      projects: [
        {
          name: 'pgqueue', description: 'A job queue that is just PostgreSQL. No broker, no extra ops.',
          technologies: ['Go', 'PostgreSQL'], stars: 412, forks: 28,
          repository: 'https://github.com/example/pgqueue', date: '2022-04', source,
        },
        {
          name: 'schema-drift', description: 'Detects divergence between a migration history and a live database.',
          technologies: ['Python', 'PostgreSQL'], stars: 96, forks: 7,
          repository: 'https://github.com/example/schema-drift', date: '2023-09', source,
        },
      ],
      skills: [
        { name: 'Go', category: 'Languages' }, { name: 'Python', category: 'Languages' },
        { name: 'PostgreSQL', category: 'Data' }, { name: 'Kubernetes', category: 'Infrastructure' },
        { name: 'gRPC', category: 'Backend' },
      ],
    },
  },

  {
    id: 'ai-ml-engineer',
    name: 'AI / ML engineer',
    description: 'Published models and datasets alongside applied work. Exercises the models section.',
    config: {
      identity: {
        name: 'Daniel Okafor',
        headline: 'Machine Learning Engineer',
        location: 'Berlin, Germany',
        summary: 'I train and ship models for speech and low-resource languages, and I publish what I can.',
      },
      theme: { preset: 'developer', accent: '#7dd3fc' },
    },
    profile: {
      models: [
        { name: 'yoruba-asr-small', kind: 'model', description: 'Speech recognition for Yorùbá, 94M parameters.', likes: 218, downloads: 41_200, tags: ['automatic-speech-recognition', 'yoruba'], url: 'https://huggingface.co/example/yoruba-asr-small', source },
        { name: 'naija-speech', kind: 'dataset', description: '340 hours of transcribed Nigerian-accented speech.', likes: 96, downloads: 8_400, tags: ['audio'], url: 'https://huggingface.co/datasets/example/naija-speech', source },
        { name: 'asr-playground', kind: 'space', description: 'Try the models on your own audio.', likes: 54, url: 'https://huggingface.co/spaces/example/asr-playground', source },
      ],
      experience: [{
        company: 'Kite Labs', role: 'ML Engineer', startDate: '2022-03',
        description: 'Speech models for languages with little training data.',
        highlights: ['Reduced word error rate on Yorùbá from 31% to 18% using a self-supervised pretraining stage.'],
        technologies: ['PyTorch', 'Transformers', 'CUDA'], source,
      }],
      publications: [{
        title: 'Self-supervised pretraining for low-resource African speech recognition',
        venue: 'Interspeech', date: '2024', citations: 34,
        url: 'https://example.org/papers/lowres-asr', type: 'conference', source,
      }],
      projects: [{
        name: 'whisper-finetune', description: 'A reproducible fine-tuning harness for Whisper on custom corpora.',
        technologies: ['Python', 'PyTorch'], stars: 780, forks: 91,
        repository: 'https://github.com/example/whisper-finetune', source,
      }],
      skills: [
        { name: 'PyTorch', category: 'AI & ML' }, { name: 'Python', category: 'Languages' },
        { name: 'Speech Recognition', category: 'AI & ML' }, { name: 'CUDA', category: 'Infrastructure' },
      ],
    },
  },

  {
    id: 'data-scientist',
    name: 'Data scientist',
    description: 'Notebooks, competitions and analysis. Kaggle-style evidence without a Kaggle key.',
    config: {
      identity: {
        name: 'Mei Lin Chen',
        headline: 'Data Scientist',
        location: 'Singapore',
        summary: 'Forecasting and causal inference for logistics. I like problems where the data is messy and the decision is expensive.',
      },
      theme: { preset: 'academic' },
    },
    profile: {
      models: [
        { name: 'port-congestion-forecast', kind: 'dataset', description: 'Daily berth occupancy across 14 Asian ports, 2019–2025.', downloads: 3_100, likes: 42, source },
        { name: 'demand-baselines', kind: 'space', description: 'Notebook comparing seven forecasting baselines on retail demand.', likes: 128, source },
      ],
      achievements: [
        { title: 'Silver medal — M6 Financial Forecasting', organization: 'Kaggle', date: '2024-06', description: 'Top 3% of 1,800 teams.', source },
        { title: 'Bronze medal — Store Sales Forecasting', organization: 'Kaggle', date: '2023-02', source },
      ],
      experience: [{
        company: 'Meridian Logistics', role: 'Data Scientist', startDate: '2021-09',
        description: 'Demand forecasting and network planning.',
        highlights: ['Forecasting model cut safety stock by 12% without changing service levels.'],
        technologies: ['Python', 'pandas', 'Prophet', 'dbt'], source,
      }],
      education: [{
        institution: 'National University of Singapore', degree: 'MSc', field: 'Statistics',
        startDate: '2019', endDate: '2021', source,
      }],
      skills: [
        { name: 'Python', category: 'Languages' }, { name: 'R', category: 'Languages' },
        { name: 'Causal Inference', category: 'Data' }, { name: 'SQL', category: 'Data' },
        { name: 'dbt', category: 'Data' },
      ],
    },
  },

  {
    id: 'frontend-developer',
    name: 'Frontend developer',
    description: 'Interface work, a published component library, and a talk.',
    config: {
      identity: {
        name: 'Sofia Marchetti',
        headline: 'Frontend Engineer',
        location: 'Milan, Italy',
        summary: 'I build interfaces that stay fast and usable on the devices people actually own.',
      },
      theme: { preset: 'creative' },
      layout: { projectLayout: 'grid' },
    },
    profile: {
      projects: [
        { name: 'Ribbon UI', description: 'An accessible React component library with no runtime CSS-in-JS.', technologies: ['TypeScript', 'React', 'CSS'], stars: 2_140, forks: 143, repository: 'https://github.com/example/ribbon-ui', liveUrl: 'https://ribbon.example.com', source },
        { name: 'perf-budget', description: 'Fails CI when a bundle crosses a size budget you set per route.', technologies: ['TypeScript'], stars: 305, forks: 19, source },
      ],
      packages: [
        { name: '@ribbon/react', registry: 'npm', description: 'Ribbon UI components for React.', downloads: 184_000, downloadsPeriod: 'last-month', version: '3.2.1', source },
        { name: 'perf-budget', registry: 'npm', description: 'Bundle-size budgets for CI.', downloads: 22_400, downloadsPeriod: 'last-month', source },
      ],
      talks: [{ title: 'Rendering less: interfaces that stay fast on cheap phones', event: 'JSConf EU', date: '2024-06', source }],
      experience: [{
        company: 'Atelier Digitale', role: 'Frontend Engineer', startDate: '2021-01',
        description: 'Design systems and storefronts.', technologies: ['TypeScript', 'React', 'Next.js'], source,
      }],
      skills: [
        { name: 'TypeScript', category: 'Languages' }, { name: 'React', category: 'Frontend' },
        { name: 'CSS', category: 'Frontend' }, { name: 'Accessibility', category: 'Frontend' },
      ],
    },
  },

  {
    id: 'backend-developer',
    name: 'Backend developer',
    description: 'Services and data. Experience-heavy with published libraries.',
    config: {
      identity: {
        name: 'Tomás Herrera',
        headline: 'Backend Engineer',
        location: 'Madrid, Spain',
        summary: 'Distributed systems, mostly in Rust and Go. I care about what happens when things fail.',
      },
      theme: { preset: 'terminal' },
    },
    profile: {
      experience: [
        { company: 'Cadence Payments', role: 'Staff Engineer', startDate: '2022-05', description: 'Ledger and settlement.', highlights: ['Designed an idempotent settlement pipeline handling €40M/day with exactly-once semantics.'], technologies: ['Rust', 'Kafka', 'PostgreSQL'], source },
        { company: 'Bitwise', role: 'Backend Engineer', startDate: '2019-03', endDate: '2022-04', technologies: ['Go', 'gRPC'], source },
      ],
      packages: [
        { name: 'idem', registry: 'crates.io', description: 'Idempotency keys with pluggable storage.', downloads: 96_000, downloadsPeriod: 'total', source },
        { name: 'backoff-rs', registry: 'crates.io', description: 'Retry policies with jitter that you can test deterministically.', downloads: 310_000, downloadsPeriod: 'total', source },
      ],
      projects: [{ name: 'ledger-kata', description: 'A double-entry ledger in 600 lines, written to be read.', technologies: ['Rust'], stars: 528, repository: 'https://github.com/example/ledger-kata', source }],
      skills: [
        { name: 'Rust', category: 'Languages' }, { name: 'Go', category: 'Languages' },
        { name: 'Kafka', category: 'Infrastructure' }, { name: 'PostgreSQL', category: 'Data' },
      ],
    },
  },

  {
    id: 'devops-engineer',
    name: 'DevOps / platform engineer',
    description: 'Infrastructure work, which usually leaves the least visible trace. Uses container images as evidence.',
    config: {
      identity: {
        name: 'Aisha Bello',
        headline: 'Platform Engineer',
        location: 'Lagos, Nigeria',
        summary: 'I make deployments boring. Kubernetes, Terraform, and the glue that keeps them honest.',
      },
      theme: { preset: 'monochrome' },
    },
    profile: {
      packages: [
        { name: 'aisha/kube-audit', registry: 'Docker Hub', description: 'Scans a cluster for workloads without resource limits or probes.', downloads: 1_240_000, downloadsPeriod: 'total', source },
        { name: 'aisha/tf-drift', registry: 'Docker Hub', description: 'Reports Terraform state drift on a schedule.', downloads: 88_000, downloadsPeriod: 'total', source },
      ],
      experience: [{
        company: 'Paystack Infrastructure', role: 'Platform Engineer', startDate: '2021-08',
        description: 'Cluster operations and developer platform.',
        highlights: [
          'Took mean deploy time from 22 minutes to 4 by rebuilding the CI cache strategy.',
          'Introduced progressive delivery; rollback rate fell by two thirds.',
        ],
        technologies: ['Kubernetes', 'Terraform', 'ArgoCD', 'Go'], source,
      }],
      certifications: [
        { name: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2022-11', credentialUrl: 'https://example.org/verify/cka', source },
        { name: 'AWS Solutions Architect — Professional', issuer: 'Amazon Web Services', date: '2023-05', source },
      ],
      skills: [
        { name: 'Kubernetes', category: 'Infrastructure' }, { name: 'Terraform', category: 'Infrastructure' },
        { name: 'Go', category: 'Languages' }, { name: 'Docker', category: 'Infrastructure' },
      ],
    },
  },

  {
    id: 'competitive-programmer',
    name: 'Competitive programmer',
    description: 'Ratings and problem counts across platforms, with almost nothing else. Exercises the competitive section alone.',
    config: {
      identity: {
        name: 'Ivan Petrov',
        headline: 'Competitive Programmer & CS Student',
        location: 'Novosibirsk, Russia',
        summary: 'Algorithms, mostly. Three years of contests and about two thousand problems.',
      },
      theme: { preset: 'neo-brutalist' },
    },
    profile: {
      competitive: [
        { platform: 'Codeforces', connector: 'codeforces', username: 'ivanp', rating: 2_143, maxRating: 2_287, rank: 'Master', maxRank: 'International Master', problemsSolved: 1_420, contests: 87, url: 'https://codeforces.com/profile/ivanp', source },
        { platform: 'LeetCode', connector: 'leetcode', username: 'ivanp', rating: 2_410, problemsSolved: 640, contests: 44, breakdown: { easy: 180, medium: 340, hard: 120 }, source },
        { platform: 'CodeChef', connector: 'codechef', username: 'ivanp', rating: 2_050, rank: '6★', contests: 31, source },
      ],
      achievements: [
        { title: 'ICPC Regional Finalist', organization: 'ICPC Northern Eurasia', date: '2024-12', rank: '11th', source },
        { title: 'Codeforces Round 918 — 4th place', organization: 'Codeforces', date: '2024-03', source },
      ],
      education: [{ institution: 'Novosibirsk State University', degree: 'BSc', field: 'Computer Science', startDate: '2022', source }],
      skills: [
        { name: 'C++', category: 'Languages' }, { name: 'Algorithms', category: 'Other' },
        { name: 'Data Structures', category: 'Other' },
      ],
    },
  },

  {
    id: 'open-source-maintainer',
    name: 'Open-source maintainer',
    description: 'Stars, forks and downloads as the primary evidence. Exercises the open-source section.',
    config: {
      identity: {
        name: 'Jordan Reyes',
        headline: 'Open Source Maintainer',
        location: 'Portland, USA',
        summary: 'I maintain a few libraries that other people depend on, which is mostly a job about saying no kindly.',
      },
      theme: { preset: 'minimal-light' },
      layout: { projectLayout: 'list' },
    },
    profile: {
      projects: [
        { name: 'tinyparse', description: 'A 3 kB argument parser with no dependencies.', technologies: ['TypeScript'], stars: 8_940, forks: 412, repository: 'https://github.com/example/tinyparse', featured: true, source },
        { name: 'formkit-lite', description: 'Form state without a framework.', technologies: ['TypeScript'], stars: 3_210, forks: 188, repository: 'https://github.com/example/formkit-lite', source },
        { name: 'why-slow', description: 'Explains which import made your bundle big.', technologies: ['JavaScript'], stars: 1_105, forks: 64, source },
      ],
      packages: [
        { name: 'tinyparse', registry: 'npm', downloads: 2_400_000, downloadsPeriod: 'last-month', version: '5.1.0', source },
        { name: 'formkit-lite', registry: 'npm', downloads: 640_000, downloadsPeriod: 'last-month', source },
      ],
      posts: [
        { title: 'Saying no is a maintenance strategy', url: 'https://example.com/blog/saying-no', date: '2025-01-14', excerpt: 'Every accepted feature is a promise to keep it working forever.', source },
        { title: 'Why tinyparse has no plugins', url: 'https://example.com/blog/no-plugins', date: '2024-08-02', source },
      ],
      skills: [
        { name: 'TypeScript', category: 'Languages' }, { name: 'JavaScript', category: 'Languages' },
        { name: 'Open Source', category: 'Other' },
      ],
    },
  },

  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Publications and citations, no packages. Exercises the research section and the h-index derivation.',
    config: {
      identity: {
        name: 'Dr Hannah Wei',
        headline: 'Postdoctoral Researcher, Computer Vision',
        location: 'Zürich, Switzerland',
        summary: 'I work on 3D scene understanding from sparse observations, and on making that work reproducible.',
      },
      theme: { preset: 'academic' },
      layout: { shell: 'stacked', navigation: 'top' },
    },
    profile: {
      publications: [
        { title: 'Sparse-view scene reconstruction without pose supervision', venue: 'CVPR', date: '2025', citations: 142, type: 'conference', url: 'https://example.org/papers/sparse-view', source },
        { title: 'On the reproducibility of neural radiance field benchmarks', venue: 'TPAMI', date: '2024', citations: 88, type: 'journal', source },
        { title: 'Depth priors for indoor reconstruction', venue: 'ECCV', date: '2023', citations: 61, type: 'conference', source },
        { title: 'A dataset of calibrated indoor scans', venue: 'NeurIPS Datasets', date: '2023', citations: 37, type: 'conference', source },
        { title: 'Uncertainty estimates for monocular depth', venue: 'arXiv', date: '2022', citations: 12, type: 'preprint', source },
      ],
      education: [
        { institution: 'ETH Zürich', degree: 'PhD', field: 'Computer Vision', startDate: '2019', endDate: '2023', source },
        { institution: 'Tsinghua University', degree: 'BEng', field: 'Automation', startDate: '2015', endDate: '2019', source },
      ],
      experience: [{ company: 'ETH Zürich', role: 'Postdoctoral Researcher', startDate: '2023-10', source }],
      talks: [{ title: 'What reproducibility costs, and who pays', event: 'CVPR Workshop on Reproducibility', date: '2025-06', source }],
      skills: [
        { name: 'Python', category: 'Languages' }, { name: 'PyTorch', category: 'AI & ML' },
        { name: 'Computer Vision', category: 'AI & ML' }, { name: '3D Reconstruction', category: 'AI & ML' },
      ],
    },
  },

  {
    id: 'student',
    name: 'Student',
    description: 'Education, coursework, certifications and early projects — the profile with the least professional history.',
    config: {
      identity: {
        name: 'Arjun Nair',
        headline: 'Computer Science Student',
        location: 'Kochi, India',
        summary: 'Second-year CS student. Currently learning systems programming and building things that break in interesting ways.',
        availability: { status: 'open', label: 'Looking for a summer internship', preferredRoles: ['Software Engineering Intern'] },
      },
      theme: { preset: 'minimal-dark' },
    },
    profile: {
      education: [{
        institution: 'Cochin University of Science and Technology', degree: 'BTech', field: 'Computer Science',
        startDate: '2024', grade: '8.7 CGPA',
        courses: ['Data Structures', 'Operating Systems', 'Computer Networks', 'Databases'], source,
      }],
      projects: [
        { name: 'shell-from-scratch', description: 'A Unix shell with pipes, redirection and job control, written to understand fork and exec.', technologies: ['C'], stars: 34, repository: 'https://github.com/example/shell-from-scratch', source },
        { name: 'campus-bus', description: 'Live bus tracker for my university, used by about 600 students.', technologies: ['React', 'Node.js', 'PostgreSQL'], stars: 12, liveUrl: 'https://example.com/campus-bus', source },
      ],
      certifications: [
        { name: 'CS50x: Introduction to Computer Science', issuer: 'HarvardX', date: '2024-08', credentialUrl: 'https://example.org/verify/cs50', source },
        { name: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', date: '2025-02', source },
      ],
      competitive: [{ platform: 'LeetCode', connector: 'leetcode', username: 'arjunn', problemsSolved: 210, breakdown: { easy: 110, medium: 85, hard: 15 }, source }],
      skills: [
        { name: 'C', category: 'Languages' }, { name: 'Python', category: 'Languages' },
        { name: 'JavaScript', category: 'Languages' }, { name: 'Linux', category: 'Infrastructure' },
      ],
      languages: [
        { name: 'English', level: 5, label: 'Fluent' },
        { name: 'Malayalam', level: 5, label: 'Native' },
        { name: 'Hindi', level: 3, label: 'Conversational' },
      ],
    },
  },

  {
    id: 'hackathon-builder',
    name: 'Hackathon builder',
    description: 'Wins and shipped weekend projects. Exercises the hackathons section.',
    config: {
      identity: {
        name: 'Lucas Almeida',
        headline: 'Builder & Hackathon Regular',
        location: 'São Paulo, Brazil',
        summary: 'Eleven hackathons, four wins, and a strong opinion about scoping a demo to 36 hours.',
      },
      theme: { preset: 'glass' },
    },
    profile: {
      hackathons: [
        { name: 'MedTriage', event: 'HackMIT 2025', result: '1st place overall', date: '2025-09', description: 'Offline triage assistant for rural clinics, running a quantised model on a phone.', technologies: ['React Native', 'ONNX', 'Python'], source },
        { name: 'GridSense', event: 'Smart Energy Hack', result: '2nd place', date: '2025-04', description: 'Predicts household load spikes from smart-meter data.', technologies: ['Python', 'TimescaleDB'], source },
        { name: 'SignBridge', event: 'ETHGlobal São Paulo', result: 'Best accessibility project', date: '2024-11', technologies: ['TypeScript', 'MediaPipe'], source },
        { name: 'FarmCast', event: 'AgriHack', result: 'Finalist', date: '2024-05', technologies: ['Flutter', 'FastAPI'], source },
      ],
      projects: [{ name: 'MedTriage', description: 'The hackathon project that kept going — now piloted in two clinics.', technologies: ['React Native', 'ONNX'], stars: 187, repository: 'https://github.com/example/medtriage', featured: true, source }],
      achievements: [{ title: '4 hackathon wins across 11 events', organization: 'Various', date: '2025-09', source }],
      skills: [
        { name: 'TypeScript', category: 'Languages' }, { name: 'Python', category: 'Languages' },
        { name: 'React Native', category: 'Frontend' }, { name: 'Rapid Prototyping', category: 'Other' },
      ],
    },
  },
]

/** @param {string} id @returns {Persona|undefined} */
export const getPersona = (id) => PERSONAS.find((p) => p.id === id)

/** @returns {string[]} */
export const personaIds = () => PERSONAS.map((p) => p.id)
