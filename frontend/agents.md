## Frontend
`frontend/` houses the React (TypeScript) application, built with Vite and served as static files via nginx.

## Stack
* **Frontend**: React (TypeScript) is used to build the user interface. Vite is used to compile the React code into static files for deployment.
* **Reverse Proxy**: Nginx runs in a Docker container parallel to the backend. It is used to handle SSL and to proxy /api/ requests to the backend container. The frontend static files are served from this container.
* **SSL:** Certbot runs at the instance level to obtain and renew Let's Encrypt SSL certificates via the DNS-01 challenge. Certificates are mounted into the nginx container as a volume.

## Structure
* `src/main.tsx`: Entry point. Wraps the app in `BrowserRouter` (client-side routing) and `AuthProvider` (current user role).
* `src/App.tsx`: Route table. All pages render inside `Layout` via an `<Outlet />`.
* `src/components/Layout.tsx`: App shell — top bar with a hamburger button that opens a slide-in navigation drawer. Add a destination by adding a `<Link>` here and a matching `<Route>` in `App.tsx`.
* `src/pages/`: One component per page/route.
* `src/auth/useAuth.tsx`: Placeholder auth (see below).
* `src/index.css`: Global styles + app-shell/drawer layout. Mobile-first.

## Data layer (online-only)
* `src/api/commands.ts`: shared command plumbing — the generic `CommandEvent` shape,
  `newEvent()`, `postCommands()` (`POST /api/commands`; throws `ConflictError` on a 409), and
  `SyncStatus`. Every aggregate submits this same event shape; the backend routes by `type`.
* Per-aggregate stores load their read model from a query endpoint and, on each mutation, POST
  a command then refresh (retrying once on a 409). No local queue/persistence yet — writes
  require connectivity. Store interfaces are kept identical to an offline-capable store
  (`syncStatus`, `pendingCount`) so a generic offline engine can drop in behind them later
  without touching components. The submit/refresh/conflict logic is duplicated per store for
  now; it will be unified when offline lands.
  * `src/players/store.tsx`: `PlayersProvider` + `usePlayers()` (roster from `GET /api/players`).
  * `src/leagueEvents/store.tsx`: `LeagueEventsProvider` + `useLeagueEvents()` (app-wide). Holds the league-event list (`GET /api/league-events`), shared by the list page and each event's detail page (`/league-events/:id`, which finds its event in the list — no separate fetch). Exposes `createLeagueEvent` and `setLeagueEventState`. Date/status formatting helpers are in `leagueEvents/format.ts`.
* `src/lib/uuid.ts`: client-generated UUIDs (the command API expects client-generated ids).

## Auth (placeholder)
* There is no login or backend auth yet. `AuthProvider` hardcodes every visitor as an anonymous `user`. `useAuth()` exposes `{ role, isAdmin }`.
* Components branch on role now (e.g. the Players page shows a read-only list to users and management controls to admins) so that when real auth is added, `useAuth.tsx` is the single place to wire it up and consumers need no changes.
