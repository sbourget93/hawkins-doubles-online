import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/useAuth'
import { SyncProvider } from './offline/SyncEngine'
import { playersAggregate } from './players/aggregate'
import { LeagueEventsProvider } from './leagueEvents/store'
import { RegistrationsProvider } from './registrations/store'
import { ClosestToPinsProvider } from './closestToPins/store'
import { CardsProvider } from './cards/store'
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
            per-aggregate snapshots, and background sync. Aggregates register a
            descriptor here; the players roster is the first one migrated onto it
            (the other stores are still online-only pending migration). */}
        <SyncProvider aggregates={[playersAggregate]}>
          {/* LeagueEventsProvider owns the league-event list, shared by the list
              and detail pages. */}
          <LeagueEventsProvider>
            {/* RegistrationsProvider owns registrations (player entries into an
                event), read alongside players on a league event's detail page. */}
            <RegistrationsProvider>
              {/* ClosestToPinsProvider owns closest-to-pin prizes, managed on a
                  league event's detail page alongside registrations. */}
              <ClosestToPinsProvider>
                {/* CardsProvider owns the generated cards + teams, shown on a
                    league event's cards page. */}
                <CardsProvider>
                  <App />
                </CardsProvider>
              </ClosestToPinsProvider>
            </RegistrationsProvider>
          </LeagueEventsProvider>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
