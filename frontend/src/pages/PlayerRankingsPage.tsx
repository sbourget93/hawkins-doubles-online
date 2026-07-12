import { useEffect, useState } from 'react'
import PlayerBadges from '../players/PlayerBadges'
import PlayerProfile from '../players/PlayerProfile'
import { usePlayerHistories } from '../players/usePlayerHistories'
import { fetchPlayerRankings, type PlayerRanking } from '../api/playerRankings'

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
export default function PlayerRankingsPage() {
  const [rankings, setRankings] = useState<PlayerRanking[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
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
    fetchPlayerRankings()
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
  }, [])

  return (
    <section className="rankings-page">
      {status === 'loading' ? (
        <p className="muted">Loading…</p>
      ) : status === 'error' ? (
        <p className="muted">Couldn't load rankings.</p>
      ) : rankings.length === 0 ? (
        <p className="muted registered-empty">
          No players have at least 3 scored leagues yet.
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
                          {r.first_name} {r.last_name}
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
