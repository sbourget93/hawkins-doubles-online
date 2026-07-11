import type { Pool } from './types'

/**
 * Pool (A/B) chip plus an optional woman (♀) chip. Shared by the roster and the
 * registration rows so a player renders identically in both places.
 */
export default function PlayerBadges({ pool, isWoman }: { pool: Pool; isWoman: boolean }) {
  return (
    <>
      <span className={`badge ${pool === 'A' ? 'badge--a' : 'badge--b'}`}>{pool}</span>
      {isWoman && <span className="badge badge--w">♀</span>}
    </>
  )
}
