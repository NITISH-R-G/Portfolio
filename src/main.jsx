import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { loadPortfolio } from './core/load.js'
import { applyTheme } from './core/themes/apply.js'

// Run the build pipeline and paint the theme before React mounts, so there is no flash of
// the wrong (or default) theme on first load — the CSS variables are on `:root` before the
// first component ever renders.
const built = loadPortfolio()
applyTheme(built.theme)

// The real SEO tags are baked into index.html at build time by `scripts/lib/seoPlugin.mjs`,
// because the crawlers and social-card scrapers that read them do not run JavaScript.
//
// This only patches the title, and only when it does not already match: the baked tags come
// from the committed config, while this build includes any unsaved admin draft, so the two
// legitimately differ while someone is previewing a change in the builder. Everything else
// in the head is left alone — rewriting it here would do no good for the readers that
// matter, since they have already parsed the document by now.
if (typeof document !== 'undefined' && built.seo?.title && document.title !== built.seo.title) {
  document.title = built.seo.title
}

// Which modifier the search shortcut hint should show. Set as a class before first paint
// rather than rendered from JS in the component, so the label never appears as "Ctrl" and
// then corrects itself to "⌘" a frame later on a Mac.
if (typeof navigator !== 'undefined' && typeof document !== 'undefined') {
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? ''
  if (/mac|iphone|ipad|ipod/i.test(platform)) document.body.classList.add('is-apple')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
