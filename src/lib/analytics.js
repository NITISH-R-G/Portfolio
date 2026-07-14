/**
 * Privacy-first analytics helper.
 *
 * - No cookies, no fingerprinting, no user profiling
 * - Events logged to an in-memory queue
 * - Optionally sends to any endpoint (webhook, Umami, Plausible API, etc.)
 * - Console logging in development
 * - Fails silently — never breaks navigation or actions
 *
 * To enable remote logging, set ANALYTICS_ENDPOINT in your environment:
 *   VITE_ANALYTICS_ENDPOINT=https://your-endpoint.example.com/event
 */

const isDev = import.meta.env.DEV
const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT || ''

const queue = []
let flushTimer = null

/**
 * Track an event.
 * @param {string} event - Event name (e.g. 'project_click', 'resume_download')
 * @param {object} [data] - Optional metadata (no PII)
 */
export function track(event, data = {}) {
  const entry = {
    event,
    data,
    ts: Date.now(),
    path: typeof window !== 'undefined' ? window.location.pathname : '',
  }

  if (isDev) {
    console.log(`[analytics] ${event}`, data)
  }

  queue.push(entry)

  if (endpoint && !flushTimer) {
    flushTimer = setTimeout(flush, 5000)
  }
}

function flush() {
  if (queue.length === 0) { flushTimer = null; return }

  const events = queue.splice(0, queue.length)
  flushTimer = null

  if (!endpoint) return

  try {
    const body = JSON.stringify({ events })
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body)
    } else {
      fetch(endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
    }
  } catch {
    // fail silently
  }
}

/**
 * Predefined event constants for consistency.
 */
export const AnalyticsEvents = {
  PROJECT_CLICK: 'project_click',
  CASE_STUDY_EXPAND: 'case_study_expand',
  CASE_STUDY_COLLAPSE: 'case_study_collapse',
  RESUME_DOWNLOAD: 'resume_download',
  CONTACT_CLICK: 'contact_click',
  SECTION_VIEW: 'section_view',
  NAV_CLICK: 'nav_click',
  CERT_OPEN: 'cert_open',
}
