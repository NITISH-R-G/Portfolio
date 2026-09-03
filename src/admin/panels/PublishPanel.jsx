/**
 * Publish: the copy-and-paste step, done for you.
 *
 * Everything below this component in the Save panel still works and is still the fallback —
 * this only appears when `config.admin.api` points at a deployed Worker. That ordering is the
 * honest one: a fork with no Cloudflare account gets the builder it always had, and the
 * publishing button is an upgrade rather than a prerequisite.
 *
 * ## What it shows, and why
 *
 * A publish is a commit to a real repository followed by a real deploy, and both take time
 * this page cannot observe. So the states are named for what is actually true — signing in,
 * nothing to publish, publishing, committed — and the last one links to the commit rather
 * than claiming the site is live, because the build is still running when this returns.
 *
 * @module admin/panels/PublishPanel
 */

import { useCallback, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import { Note } from '../fields.jsx'
import { getSession, signIn, signOut, publish, filesToPublish, isConfigured } from '../publish.js'

/** Sign-in failures the Worker redirects back with, in language that says what to do next. */
const ERRORS = {
  invalid_state: 'That sign-in link did not match this browser. Try again from this page.',
  expired_state: 'The sign-in took too long and expired. Try again.',
  not_allowed: 'That GitHub account is not on the allowed list for this site.',
  not_installed: 'The GitHub App is not installed on this repository yet. Install it, then sign in again.',
}

/**
 * @param {{builder: import('../state.js').Builder}} props
 */
export default function PublishPanel({ builder }) {
  const config = builder.built.config
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('loading')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(() => {
    // `Object.hasOwn`, not a plain lookup: `?error=constructor` would otherwise find
    // `Object.prototype.constructor` and render a function where a sentence belongs.
    const code = new URLSearchParams(window.location.search).get('error')
    return code && Object.hasOwn(ERRORS, code) ? ERRORS[code] : null
  })

  const refresh = useCallback(async () => {
    const next = await getSession(config)
    setSession(next)
    setStatus(next.offline ? 'offline' : 'ready')
  }, [config])

  useEffect(() => {
    if (!isConfigured(config)) { setStatus('unconfigured'); return }
    refresh()
  }, [config, refresh])

  // Not configured is not a failure and gets no UI. The panel below explains the manual
  // route, which is complete on its own.
  if (status === 'unconfigured') return null

  const pending = session?.authenticated ? filesToPublish(builder, session.files ?? {}) : []

  const onPublish = async () => {
    setStatus('publishing')
    setError(null)
    try {
      const committed = await publish(config, { files: pending, head: session.head })
      setResult(committed)
      setStatus('published')
      // These drafts are now in the repository, so they are no longer unsaved work. Recorded
      // rather than cleared: the preview still needs them until the site rebuilds.
      builder.markPublished()
      // Re-read so the next comparison is against what is now on the branch; without this a
      // second publish would offer to commit the same change again.
      refresh()
    } catch (err) {
      // 409 is the concurrency guard doing its job, and it needs a different instruction than
      // a generic failure: reloading is the fix, retrying is not.
      setError(err.status === 409
        ? `${err.message}`
        : `Could not publish: ${err.message}`)
      setStatus('ready')
    }
  }

  return (
    <section className="export-block">
      <header className="export-head">
        <h3 className="admin-subheading">Publish to GitHub</h3>
        {session?.authenticated && (
          <div className="admin-actions">
            <button type="button" className="btn-admin btn-admin-ghost"
              onClick={() => signOut(config).then(refresh, (err) => {
                // Refreshing anyway would re-read a session that is still valid and leave the
                // panel looking signed out when it is not — worse than saying nothing worked.
                setError(`Could not sign out: ${err.message}`)
              })}>
              <Icon name="LogOut" size={14} /> Sign out
            </button>
          </div>
        )}
      </header>

      {error && <Note tone="error" icon="AlertTriangle">{error}</Note>}

      {status === 'loading' && <p className="field-help">Checking your sign-in…</p>}

      {status === 'offline' && (
        <Note tone="warn" icon="CloudOff">
          Could not reach the publishing service. Your changes are safe in this browser — use the
          blocks below to save them by hand, or try again later.
        </Note>
      )}

      {status !== 'loading' && status !== 'offline' && !session?.authenticated && (
        <>
          <p className="field-help">
            Sign in with GitHub to commit your changes directly. Nothing is sent anywhere until
            you press Publish, and this page never sees a GitHub token.
          </p>
          <button type="button" className="btn-admin btn-admin-primary" onClick={() => signIn(config)}>
            <Icon name="Github" size={14} /> Sign in with GitHub
          </button>
        </>
      )}

      {session?.authenticated && (
        <>
          <p className="field-help">
            Signed in as <strong>{session.user}</strong>, publishing to{' '}
            <code>{session.repository}</code> on <code>{session.branch}</code>.
          </p>

          {!session.head ? (
            // Without the commit the editor was looking at, a save cannot carry the
            // precondition that makes concurrent edits safe — and the Worker rejects one that
            // does not. Offering the button anyway would be offering a failure.
            <Note tone="warn" icon="AlertTriangle">
              {session.degraded ?? 'Could not read the current state of your repository.'}
              {' '}Publishing is unavailable until it is reachable — your changes are safe in
              this browser, and the blocks below still save them by hand.
            </Note>
          ) : pending.length === 0 ? (
            <Note icon="Check">
              Nothing to publish — the repository already matches what you see here.
            </Note>
          ) : (
            <>
              {/* Not a <ul>: the default marker rendered as a bullet floating outside the
                  panel's padding at mobile width, and a list of one or two file paths reads
                  fine without one. */}
              <p className="field-help publish-files">
                {pending.map((file) => <code key={file.path}>{file.path}</code>)}
              </p>
              <button
                type="button"
                className="btn-admin btn-admin-primary"
                disabled={status === 'publishing'}
                onClick={onPublish}
              >
                <Icon name={status === 'publishing' ? 'Loader2' : 'UploadCloud'} size={14} />
                {status === 'publishing' ? 'Publishing…' : `Publish ${pending.length} file${pending.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}

          {result && (
            <Note icon="Check">
              {result.unchanged
                ? 'Nothing changed, so no commit was made.'
                : <>Committed. Your site rebuilds automatically — this usually takes a couple of
                    minutes. <a href={result.url} target="_blank" rel="noreferrer">View the commit</a>.</>}
            </Note>
          )}
        </>
      )}
    </section>
  )
}
