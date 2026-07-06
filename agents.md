## Core Design Considerations
* **Offline First:** This application (despite it's name) should work seamlessly when used offline for periods of time. Spotty internet connection at the course means that administrators will likely not have consistent internet conenction throughout the event, and may not even have internet connection when beginning the check in process. Actions and updates should sync to the server as soon as possible so that other users see up to date information when it is available.
* **Mobile Friendly:** This application should be designed first and foremost for mobile usage. Rarely, if ever, will a desktop web browser be used to visit the website.
* **Inexpensive:** The infrastructure should be as inexpensive as reasonably possible without risking permanent data loss. The entire application (including the database) should run on a single on-demand t4g.nano AWS instance. Spot instances are not acceptable.

## Stack
* **Containerization**: Docker is used to containerize individual parts of the application (frontend, backend+database). Docker-compose is used to run these containers locally.
* **Backend**: Python (FastAPI) is used to handle API requests, process commands, and query the SQLite database. Boto3 is used to sync event logs to S3. This code runs in a Docker container parallel to the frontend+nginx container.
* **Database**: SQLite is used as the application database, serving as both the event store and the projection layer. If the database is lost, the event log can be restored from S3 and replayed to reconstruct all projections.
* **Frontend**: React (TypeScript) is used to build the user interface. Vite is used to compile the React code into static files for deployment.
* **Reverse Proxy**: Nginx runs in a Docker container parallel to the backend. It is used to handle SSL and to proxy /api/ requests to the backend container. The frontend static files are served from this container.
* **SSL:** Certbot runs at the instance level to obtain and renew Let's Encrypt SSL certificates via the DNS-01 challenge. Certificates are mounted into the nginx container as a volume.
* **Durability**: S3 serves as the permanent backup of the event log that will persist even if the EC2 instance running the application fails. While the projections are not backed up here, the events themselves are frequently synced so that application state may be rebuilt if the EC2 instance is lost or restarted.
* **Cloud Compute**: A single `t4g.nano` EC2 instance will run the entire application.
* **DNS**: Route 53 routes `hawkinsdubs.stephengb.com` to the EC2 instance and is used by certbot for DNS-01 SSL certificate verification. The parent domain `stephengb.com` is registered and managed in Route 53 but exists outside the scope of this application.
* **IaC:** All infrastructure is managed with Terraform.
* **Source Control:** GitHub hosts the application source code in a public repository. The EC2 instance clones it directly at startup to build and run the application.

## Database & Event Sourcing Architecture
* **Primary Event Store:** An append-only `events` table in a local SQLite database is the absolute, single source of truth. Events are never updated or deleted.
* **Durability:** New events are frequently synced to S3. On a fresh instance, the event log is pulled from S3 and replayed to reconstruct all state.
* **Single Admin:** There is only ever one admin performing actions at a time, eliminating concurrent write conflicts.
* **Expected Version:** When submitting offline events, the client includes the sequence number of the last event it synced from the server. If the server's current sequence is higher, the write is rejected and the client must discard its queued events and re-sync from the server. This handles out-of-order writes caused by device failure and phone swapping, and replaces the need for a last-write-wins policy.
* **CQRS:** Command endpoints (admin writes) accept data and return only success or failure. Query endpoints return data and never mutate state. These concerns are strictly separated. Admin command workflows must not depend on query endpoints at any step — all data needed to execute a command must already exist in local state.
* **Client-Generated IDs:** Clients generate UUIDs for all new entities before submitting a command. IDs are part of the event payload, never assigned by the server, enabling offline writes without a server round-trip.
* **Read Path (Projections):** Separate SQLite tables serve as the projection layer (read model). Immediately after an event is written, the server projects it into the relevant projection tables so that subsequent read queries reflect updated state.

## Agent Routing
* deployment and debugging instructions can be found at `./infrastructure/agents.md`

## TODO
* `user_data.sh` currently uses the Let's Encrypt **staging** endpoint (`--staging` flag in the certbot command). This issues untrusted certificates and must be switched to production before the app goes live. Remove `--staging` from the certbot command in `infrastructure/terraform/user_data.sh` and cycle the instance.