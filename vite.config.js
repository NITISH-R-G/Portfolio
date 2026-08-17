import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { loadResolvedConfig } from './scripts/lib/loadConfig.mjs'
import { portfolioSeo } from './scripts/lib/seoPlugin.mjs'
import { portfolioDevApi } from './scripts/lib/devApi.mjs'

// `base` comes from portfolio.config.js (`site.base`) rather than being hardcoded, so the
// same repository deploys correctly to a root domain (Vercel/Netlify/Cloudflare, base "/")
// or a GitHub Pages project site (base "/repo-name/") purely by editing config — see
// docs/deployment.md. Vite's config function may be async specifically to support this.
export default defineConfig(async () => {
  const { config } = await loadResolvedConfig()

  return {
    base: config.site.base,
    plugins: [react(), portfolioSeo(), portfolioDevApi()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          ...(config.features.admin ? { admin: resolve(__dirname, 'admin.html') } : {}),
        },
      },
    },
  }
})
