## Stack
* **Backend:** Python (FastAPI) with SQLite for event storage and projections, boto3 for S3 sync. Runs in a Docker container.
* **Frontend:** React (TypeScript) with Vite. Compiled to static files and served directly by nginx.
* **Deployment:** Nginx runs at the instance level, serves the frontend static files, and proxies API requests to the backend container.

## Core Design Considerations
* **Offline First:** This application (despite it's name) should work seamlessly when used offline for periods of time. Spotty internet connection at the course means that administrators will likely not have consistent internet conenction throughout the event, and may not even have internet connection when beginning the check in process. Actions and updates should sync to the server as soon as possible so that other users see up to date information when it is available.
* **Mobile Friendly:** This application should be designed first and foremost for mobile usage. Rarely, if ever, will a desktop web browser be used to visit the website.
* **Inexpensive:** The infrastructure should be as inexpensive as reasonably possible without risking permanent data loss. The entire application (including the database) should run on a single on-demand t4g.nano AWS instance. Spot instances are not acceptable.

## Database & Event Sourcing Architecture
* **Primary Event Store:** An append-only `events` table in a local SQLite database is the absolute, single source of truth. Events are never updated or deleted.
* **Durability:** New events are periodically synced to S3. On a fresh instance, the event log is pulled from S3 and replayed to reconstruct all state.
* **Single Admin:** There is only ever one admin performing actions at a time, eliminating concurrent write conflicts.
* **Expected Version:** When submitting offline events, the client includes the sequence number of the last event it synced from the server. If the server's current sequence is higher, the write is rejected and the client must discard its queued events and re-sync from the server. This handles out-of-order writes caused by device failure and phone swapping, and replaces the need for a last-write-wins policy.
* **CQRS:** Command endpoints (admin writes) accept data and return only success or failure. Query endpoints return data and never mutate state. These concerns are strictly separated. Admin command workflows must not depend on query endpoints at any step — all data needed to execute a command must already exist in local state.
* **Client-Generated IDs:** Clients generate UUIDs for all new entities before submitting a command. IDs are part of the event payload, never assigned by the server, enabling offline writes without a server round-trip.
* **Read Path (Projections):** Separate SQLite tables serve as the projection layer (read model). Immediately after an event is written, the server projects it into the relevant projection tables so that subsequent read queries reflect updated state.
