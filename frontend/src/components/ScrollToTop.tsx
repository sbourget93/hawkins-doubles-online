import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Resets the window to the top on every route change. Client-side navigation
 * keeps the previous scroll position by default, so without this switching from a
 * scrolled-down page (e.g. the roster) to another page would land mid-page. The
 * app bar is sticky and the window itself scrolls, so scrolling the window is the
 * right target. Renders nothing.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
