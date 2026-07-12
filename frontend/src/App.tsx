import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import LeagueEventsPage from './pages/LeagueEventsPage'
import LeagueEventPage from './pages/LeagueEventPage'
import PlayersPage from './pages/PlayersPage'
import PlayerRankingsPage from './pages/PlayerRankingsPage'

function App() {
  // Layout renders the app bar + navigation drawer and hosts each page via an
  // <Outlet />. Add new pages as sibling <Route>s below. ScrollToTop resets the
  // scroll position on every navigation.
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LeagueEventsPage />} />
          <Route path="league-events/:leagueEventId" element={<LeagueEventPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="analytics/player-rankings" element={<PlayerRankingsPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
