import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A team's member names on the standings rows. When the "A + B + C" form fits on
 * one line it's shown as-is; when it would wrap, each name is shown on its own
 * line with no "+" separators.
 *
 * Whether it fits is layout-dependent, so a hidden nowrap measurer holds the
 * single-line form and its intrinsic width is compared to the width the row
 * actually gives us. A ResizeObserver re-checks on resize / orientation change so
 * the choice stays correct. The measurer lives in a clipped 0×0 wrapper so its
 * overflow never adds a stray horizontal scrollbar.
 */
export default function TeamPlayers({
  names,
  isRado,
}: {
  names: string[]
  isRado?: boolean
}) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [multiline, setMultiline] = useState(false)
  const joined = names.join(' + ')

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return
    const check = () =>
      setMultiline(measure.offsetWidth > container.clientWidth + 0.5)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(container)
    return () => ro.disconnect()
  }, [joined])

  return (
    <span className="summary-team-players" ref={containerRef}>
      <span className="team-players-measure-wrap" aria-hidden>
        <span className="team-players-measure" ref={measureRef}>
          {joined}
        </span>
      </span>
      {multiline
        ? names.map((name, i) => (
            <span key={i} className="team-player-line">
              {name}
            </span>
          ))
        : joined}
      {isRado && <span className="summary-rado"> (rado)</span>}
    </span>
  )
}
