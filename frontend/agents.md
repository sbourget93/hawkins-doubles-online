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

## Data layer (local-first)
* `src/api/commands.ts`: shared command plumbing — the generic `CommandEvent` shape,
  `newEvent()`, `postCommands()` (`POST /api/commands`; throws `ConflictError` on a 409,
  `RejectedError` on other 4xx, a plain `Error` on 5xx/network), and `SyncStatus`. Every
  aggregate submits this same event shape; the backend routes by `type`.
* `src/offline/`: the local-first sync engine. `SyncEngine.tsx` (`SyncProvider` + `useSync`)
  owns the global command queue + last-synced version, per-aggregate snapshots, and background
  sync, all persisted to IndexedDB (`db.ts`). Mutations `enqueue` synchronously (local-speed,
  online or not) and flush as one atomic batch; a rejected batch resets local state to the server
  and moves the events to a dead-letter list for review. Each aggregate registers an
  `AggregateDescriptor` (snapshot `fetch` + a `reduce` reducer mirroring the backend projection +
  a `describe` label) in `main.tsx`'s `SyncProvider`; reducers live in `src/offline/reducers/`.
  `SyncMenu.tsx` is the admin-only envelope (pending badge, pause / sync-now, test 400/409,
  dead-letter review).
* Per-aggregate stores are thin hooks over the engine (public shapes unchanged, incl.
  `syncStatus`/`pendingCount`): the rendered rows are the server snapshot with the pending queue
  folded on top (`useAggregateRows`). E.g. `src/players/store.tsx` → `usePlayers()`;
  `src/leagueEvents/store.tsx` → `useLeagueEvents()` holds the league-event list, shared by the
  list page and each event's detail page (`/league-events/:id`, which finds its event in the list
  — no separate fetch). Date/status formatting helpers are in `leagueEvents/format.ts`.
* **Keep projections in sync:** when you add or change a backend event type/projection handler,
  mirror it by adding the matching case to that aggregate's reducer in
  `src/offline/reducers/<aggregate>.ts` (both `reduce` and `describe`) and listing the event type
  in that aggregate's descriptor `eventTypes` — for a brand-new aggregate, add a new reducer +
  descriptor and register it in `main.tsx`'s `SyncProvider`.
* `src/lib/uuid.ts`: client-generated UUIDs (the command API expects client-generated ids).

## Auth
* Google login via Google Identity Services. `AuthProvider` tracks the signed-in identity through a backend session cookie and derives `{ role, isAdmin }` from it: a visitor is an admin iff their session user is on the backend `ADMIN_EMAILS` allowlist (`user.is_admin`). `useAuth.tsx` is the single place consumers read the role from.
* Offline: the last-known identity is cached in localStorage (`auth.user`) so the PWA keeps admin UX in Airplane mode. A reachable `/auth/me` is authoritative (a signed-out response clears the cache); only a network failure falls back to the cache. UX only — the backend still re-gates `POST /commands`, so stale-admin commands just dead-letter on sync.
* Every mutation control (create/edit/delete buttons, drag handles, score/payout chips, state transitions) hides behind `isAdmin`, so non-admins get a read-only view. The backend independently gates `POST /commands` on admin, so hiding a control is UX, not the security boundary.
* Dev bypass: when login is not configured (`/auth/config` returns no client id, i.e. local dev with no Google set up) there is no way to sign in, so `isAdmin` is `true` for everyone. This mirrors the backend's `require_admin` bypass.
