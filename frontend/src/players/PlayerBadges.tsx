import type { Pool } from './types'

/**
 * Pool (A/B) chip plus an optional woman (♀) chip. Shared by the roster and the
 * registration rows so a player renders identically in both places. When
 * `onPoolClick` is supplied the pool chip becomes a button (used on the check-in
 * list to open the per-event pool override), otherwise it renders as plain text.
 */
export default function PlayerBadges({
  pool,
  isWoman,
  onPoolClick,
  poolTitle,
}: {
  pool: Pool
  isWoman: boolean
  onPoolClick?: () => void
  poolTitle?: string
}) {
  const poolClass = `badge ${pool === 'A' ? 'badge--a' : 'badge--b'}`
  return (
    <>
      {onPoolClick ? (
        <button
          type="button"
          className={`${poolClass} badge--button`}
          onClick={onPoolClick}
          title={poolTitle}
        >
          {pool}
        </button>
      ) : (
        <span className={poolClass}>{pool}</span>
      )}
      {isWoman && <span className="badge badge--w">♀</span>}
    </>
  )
}
