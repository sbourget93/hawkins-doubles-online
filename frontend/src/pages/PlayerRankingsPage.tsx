import { useEffect, useState } from 'react'
import PlayerBadges from '../players/PlayerBadges'
import { playerName } from '../players/format'
import PlayerProfile from '../players/PlayerProfile'
import { usePlayerHistories } from '../players/usePlayerHistories'
import {
  fetchPlayerRankings,
  type PlayerRanking,
  type RankingsWindow,
} from '../api/playerRankings'

/**
 * Analytics: player rankings. Ranks players by the mean of their inclusive
 * per-event score-percentile (best score & all ties for first = 100%), computed
 * server-side by GET /player-rankings against the SQLite projections. Players
 * with fewer than 3 scored events are excluded. Read-only for everyone.
 *
 * Mobile-first single-line rows: a narrow rank, then one "Average Percentile"
 * cell whose background bar visualizes the score with the name and value laid
 * over it, then the round count. Tapping a row expands the same player profile
 * (placement history) shown on the roster page.
 */
/** Time windows the board can be filtered to. `window` is passed straight to the
 * rankings API; an empty object means all-time. `emptyFor` completes the
 * "No players…" message when the window has no qualifying players. */
const CURRENT_SEASON = new Date().getFullYear()
const TIMEFRAMES: { key: string; label: string; window: RankingsWindow; emptyFor: string }[] = [
  { key: 'season', label: 'Current Season', window: { season: CURRENT_SEASON }, emptyFor: 'this season' },
  { key: '1y', label: '1 Year', window: { years: 1 }, emptyFor: 'the last year' },
  { key: '3y', label: '3 Years', window: { years: 3 }, emptyFor: 'the last 3 years' },
  { key: 'all', label: 'All Time', window: {}, emptyFor: 'yet' },
]

export default function PlayerRankingsPage() {
  const [rankings, setRankings] = useState<PlayerRanking[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  // Selected time window; defaults to the current season.
  const [tfKey, setTfKey] = useState(TIMEFRAMES[0].key)
  const timeframe = TIMEFRAMES.find((tf) => tf.key === tfKey) ?? TIMEFRAMES[0]
  const historyByPlayer = usePlayerHistories()
  // player_ids whose profile is expanded.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = (playerId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })

  useEffect(() => {
    let active = true
    setStatus('loading')
    fetchPlayerRankings(timeframe.window)
      .then((res) => {
        if (!active) return
        setRankings(res.rankings)
        setStatus('loaded')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [timeframe.window])

  return (
    <section className="rankings-page">
      <div className="timeframe-select" role="radiogroup" aria-label="Time frame">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.key}
            type="button"
            role="radio"
            aria-checked={tf.key === tfKey}
            className={`timeframe-option ${tf.key === tfKey ? 'timeframe-option--selected' : ''}`}
            onClick={() => setTfKey(tf.key)}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {status === 'loading' ? (
        <p className="muted">Loading…</p>
      ) : status === 'error' ? (
        <p className="muted">Couldn't load rankings.</p>
      ) : rankings.length === 0 ? (
        <p className="muted registered-empty">
          No players have at least 3 scored leagues {timeframe.emptyFor === 'yet' ? 'yet' : `in ${timeframe.emptyFor}`}.
        </p>
      ) : (
        <>
          <div className="registered-panel">
            <ul className="player-list">
              {rankings.map((r) => (
                <li key={r.player_id} className="player-entry">
                  <button
                    type="button"
                    className={`rankings-row ${r.rank <= 3 ? `rank-${r.rank}` : ''}`}
                    aria-expanded={expanded.has(r.player_id)}
                    onClick={() => toggle(r.player_id)}
                  >
                    <span className="rank-cell">{r.rank}</span>
                    <span className="pct-cell">
                      <span
                        className="pct-bar"
                        style={{ width: `${r.percentile}%` }}
                      />
                      <span className="pct-name">
                        <span className="pct-player">
                          {playerName(r)}
                        </span>
                        <PlayerBadges pool={r.default_pool} isWoman={r.is_woman} />
                      </span>
                      <span className="pct-val">
                        {r.percentile.toFixed(2)}{' '}
                        <span className="pct-rounds">({r.leagues})</span>
                      </span>
                    </span>
                  </button>
                  {expanded.has(r.player_id) && (
                    <PlayerProfile history={historyByPlayer.get(r.player_id) ?? []} />
                  )}
                </li>
              ))}
            </ul>
          </div>
          <p className="rankings-foot">
            Player rankings are calculated by taking the mean of each players
            score-based inclusive percentile from each league they attended. Only
            players with at least 3 rounds are considered.
          </p>
        </>
      )}
    </section>
  )
}
