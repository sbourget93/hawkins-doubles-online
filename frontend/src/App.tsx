import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import LeagueEventsPage from './pages/LeagueEventsPage'
import LeagueEventPage from './pages/LeagueEventPage'
import PlayersPage from './pages/PlayersPage'

function App() {
  // Layout renders the app bar + navigation drawer and hosts each page via an
  // <Outlet />. Add new pages as sibling <Route>s below.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LeagueEventsPage />} />
        <Route path="league-events/:leagueEventId" element={<LeagueEventPage />} />
        <Route path="players" element={<PlayersPage />} />
      </Route>
    </Routes>
  )
}

export default App
