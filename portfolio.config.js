// @ts-check
import { defineConfig } from './src/core/config/types.js'

/**
 * This is the one file most users need to edit.
 *
 * Everything it does not set falls back to a working default — see docs/configuration.md
 * for the full reference. Sections you have no data for hide themselves automatically, so
 * there is no list of sections to maintain here.
 */
export default defineConfig({
  identity: {
    name: 'Nitish R.G.',
    headline: 'Software Engineering Student',
    location: 'India',
    avatar: 'assets/profile.svg',
    availability: {
      status: 'open',
      label: 'Open to collaboration and opportunities',
      preferredRoles: [
        'Software Engineer',
        'ML Engineer',
        'Full-Stack Developer',
        'Data Scientist',
      ],
      preferredLocations: ['Remote', 'India'],
      responseTime: 'Usually responds within 24 hours',
      currentAffiliation: 'B.S. Data Science @ IIT Madras',
    },
    contact: {
      email: 'nitishrg.8220psgps2020@gmail.com',
    },
  },
  site: {
    url: 'https://nitish-r-g.github.io/Portfolio',
    base: '/Portfolio/',
    language: 'en',
  },
  theme: {
    preset: 'minimal-dark',
  },
  layout: {
    shell: 'sidebar',
    navigation: 'dock',
    projectLayout: 'carousel',
    experienceLayout: 'cards',
  },
  sections: {},
  dataSources: {
    github: {
      enabled: true,
      username: 'NITISH-R-G',
    },
  },
  socialLinks: {
    github: 'https://github.com/NITISH-R-G',
  },
  seo: {
    keywords: ['software engineer', 'AI', 'machine learning', 'full-stack developer'],
  },
  privacy: {
    obfuscateEmail: true,
  },
  deployment: {
    target: 'github-pages',
  },

  // The publishing Worker. Without this the Save panel shows only the copy-and-paste blocks —
  // which is the correct default for a fork, and was why the deployed admin had no Publish
  // button at all. An origin only; every credential stays on the far side of it.
  admin: {
    api: 'https://portfolio-admin.nitishrg2026.workers.dev',
  },
})
