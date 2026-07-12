import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/useAuth'
import { SyncProvider } from './offline/SyncEngine'
import { playersAggregate } from './players/aggregate'
import { leagueEventsAggregate } from './leagueEvents/aggregate'
import { registrationsAggregate } from './registrations/aggregate'
import { closestToPinsAggregate } from './closestToPins/aggregate'
import { cardsAggregate, teamsAggregate } from './cards/aggregate'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* BrowserRouter enables client-side routing. Deep links (e.g. /players)
        work because nginx falls back to index.html in prod and Vite does the
        same in local dev. */}
    <BrowserRouter>
      {/* AuthProvider makes the current user's role available app-wide. Today it
          always reports an anonymous "user"; this is the seam where real login
          will plug in later. */}
      <AuthProvider>
        {/* SyncProvider is the local-first engine: it owns the offline queue,
            per-aggregate snapshots, and background sync. Every aggregate registers
            a descriptor here (snapshot fetch + reducer); the per-aggregate store
            hooks read their slice through it, so the old nested store providers are
            gone. Cards and teams are distinct aggregates sharing the event log. */}
        <SyncProvider
          aggregates={[
            playersAggregate,
            leagueEventsAggregate,
            registrationsAggregate,
            closestToPinsAggregate,
            cardsAggregate,
            teamsAggregate,
          ]}
        >
          <App />
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
