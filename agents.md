# Repository Agent Guidelines

## Context Routing Rules
Before writing code or executing tasks, evaluate the scope of the request. You must read the corresponding context file(s) listed below if the task touches that domain:

| Domain | When the task touches | Context file |
| --- | --- | --- |
| Infrastructure | containers (Docker/docker-compose), local dev, deployment, IaC (Terraform), cloud compute (EC2), DNS (Route 53), SSL (certbot), source control (GitHub), environment/deploy debugging | [`infrastructure/agents.md`](./infrastructure/agents.md) |
| Frontend | UI (React/Vite), local-first (IndexedDB), offline sync, PWA, auth/login (Google), reverse proxy (nginx) | [`frontend/agents.md`](./frontend/agents.md) |
| Backend | API endpoints (FastAPI), CQRS, database (SQLite), backup/durability (S3), event sourcing | [`backend/agents.md`](./backend/agents.md) |
| Data Model | database table schemas, projections, frontend aggregate mirrors (offline snapshots, reducers) | [`documentation/agents.md`](./documentation/agents.md) |

## Core Design Considerations
These are the non-negotiable design principles of the application. Every architectural decision, dependency choice, and code path must strictly adhere to these constraints:

| Principle | Constraint |
| --- | --- |
| **Offline First** | This application (despite its name) must work seamlessly when used offline for periods of time, both brief and extended. Spotty internet connection at the course means that administrators will likely not have consistent internet connection throughout the event, and may not even have internet connection when beginning the check in process. Actions and updates should sync to the server as soon as possible so that other users see up to date information when it is available. |
| **Events Are Facts** | Any non-deterministic operation (random team/card generation, shuffles, anything depending on randomness or wall-clock time) must be resolved on the client and written into the event payload as concrete values. The backend only validates and projects. Decide once on the client, record the result as a fact (e.g. the event says "teams are X, Y, Z," never "generate teams"). |
| **Mobile Friendly** | This application should be designed first and foremost for mobile usage. Rarely, if ever, will a desktop web browser be used to visit the website. |
| **Inexpensive** | The infrastructure should be as inexpensive as reasonably possible without risking permanent data loss. The entire application (including the database) should run on a single on-demand t4g.nano AWS instance. Spot instances are not acceptable. |
| **Only Admins Write** | No non-admin should ever be able to perform any action that causes database writes. |
| **Single Admin at a Time** | Only one admin ever performs actions at once, so workflows may assume a single writer. Do not add concurrency-control machinery the model doesn't need. This assumption is what lets the sync model use a simple `expected_version` check. |

## Local Utilities
Run these scripts to perform commonly requested developer actions.

| Script | Purpose |
| --- | --- |
| `scripts/pull-prod-db.sh` | Copies the prod database to the local docker-compose setup |
