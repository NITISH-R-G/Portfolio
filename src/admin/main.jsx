import React from 'react'
import ReactDOM from 'react-dom/client'
import AdminEditor from './AdminEditor'
import '../styles/global.css'
import '../styles/admin.css'
import { loadPortfolio } from '../core/load.js'
import { applyTheme } from '../core/themes/apply.js'

// Same reasoning as src/main.jsx: paint the theme before React mounts, so the builder
// opens already looking like the portfolio it is editing rather than flashing a default.
applyTheme(loadPortfolio().theme)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminEditor />
  </React.StrictMode>
)
