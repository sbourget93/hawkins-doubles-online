import { useState } from 'react'
import { useSync } from './SyncEngine'

/**
 * Admin sync indicator: an envelope in the app bar that badges the pending count
 * (and flags the dead-letter list in red when the server has rejected a batch).
 * Tapping it opens a panel to pause/resume syncing, force a sync, fire the test
 * failures, and review/re-apply or dismiss dead-lettered actions.
 *
 * Rendered only for admins (gated by the caller). Non-admins never write, so
 * they have nothing to sync.
 */
export default function SyncMenu() {
  const {
    syncStatus,
    pendingCount,
    deadLetter,
    paused,
    setPaused,
    syncNow,
    dismissDeadLetter,
    retryDeadLetter,
    describe,
    testReject,
    testConflict,
  } = useSync()
  const [open, setOpen] = useState(false)

  const hasFailures = deadLetter.length > 0
  const statusLabel = paused
    ? 'Paused'
    : syncStatus === 'syncing'
      ? 'Syncing…'
      : syncStatus === 'offline'
        ? 'Offline — will retry'
        : 'Up to date'

  return (
    <div className="sync-menu">
      <button
        type="button"
        className={`sync-envelope ${paused ? 'sync-envelope--paused' : ''}`}
        aria-label="Sync status"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Envelope glyph */}
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            d="M3 6h18v12H3z M3 7l9 6 9-6"
          />
        </svg>
        {pendingCount > 0 && <span className="sync-badge">{pendingCount}</span>}
        {hasFailures && <span className="sync-badge sync-badge--alert">{deadLetter.length}</span>}
      </button>

      {open && (
        <>
          <div className="sync-panel-backdrop" onClick={() => setOpen(false)} />
          <div className="sync-panel" role="dialog" aria-label="Sync">
            <div className="sync-panel-row sync-panel-status">
              <span className={`sync-dot sync-dot--${paused ? 'paused' : syncStatus}`} />
              <span>{statusLabel}</span>
              <span className="sync-panel-pending">{pendingCount} queued</span>
            </div>

            <div className="sync-panel-actions">
              <button type="button" onClick={() => setPaused(!paused)}>
                {paused ? 'Resume syncing' : 'Pause syncing'}
              </button>
              <button type="button" onClick={syncNow} disabled={paused}>
                Sync now
              </button>
            </div>

            <div className="sync-panel-actions">
              <button type="button" className="sync-test" onClick={testReject}>
                Test 400
              </button>
              <button type="button" className="sync-test" onClick={testConflict}>
                Test 409
              </button>
            </div>

            {hasFailures && (
              <div className="sync-deadletter">
                <div className="sync-deadletter-title">
                  Couldn’t sync — refreshed from server
                </div>
                {deadLetter.map((entry) => (
                  <div key={entry.id} className="sync-deadletter-entry">
                    <div className="sync-deadletter-events">
                      {entry.events.map((ev) => (
                        <div key={ev.event_id} className="sync-deadletter-event">
                          {describe(ev)}
                        </div>
                      ))}
                    </div>
                    <div className="sync-deadletter-meta">
                      {entry.reason === 'conflict' ? 'Version conflict' : 'Rejected'}
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </div>
                    <div className="sync-panel-actions">
                      <button type="button" onClick={() => retryDeadLetter(entry.id)}>
                        Re-apply
                      </button>
                      <button
                        type="button"
                        className="sync-dismiss"
                        onClick={() => dismissDeadLetter(entry.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
