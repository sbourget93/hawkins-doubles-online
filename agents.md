# Repository Agent Guidelines
Immediately read the following files for additional context:
* ./documentation/models/README.md
* ./infrastructure/agents.md
* ./frontend/agents.md
* ./backend/agents.md

The guidance and descriptions in the rest of this document represent the ideal finished state of the application we are designing. Some aspects are in development or are a work in progress, so some exceptions can be made for now in the interest of rapid development. These exceptions are enumerated here and take priority over any other document instructions in the repository:
* **Online-only for now (overrides "Offline First").** The app currently requires
  connectivity: stores load from query endpoints and POST each mutation immediately,
  with no local queue or persistence. Store interfaces still expose `syncStatus` /
  `pendingCount` so a generic offline engine can drop in later without touching
  components — but do not assume offline works today.
* **No auth; single hardcoded admin (overrides the Auth placeholder).** There is no
  login. `useAuth()` returns role `admin` for every visitor. Build the admin interface
  directly — do not add user-vs-admin conditional branches or read-only variants; a
  single admin is assumed until real auth lands.
* **No S3 durability yet (overrides Backend §Durability).** Boto3 event-log sync to S3
  is not implemented. SQLite persists locally via the compose bind-mount; there is no
  off-instance backup or restore-from-S3 path in the running app.
* **State can be discarded.** Don't worry about the effect that changing data models (among other things) will have on the application state. The app has not been launched. If its easier to change the data model and tell me to drop the current database, that is preferred.

## Core Design Considerations
These are the non-negotiable design principles of the application. Every architectural decision, dependency choice, and code path must strictly adhere to these constraints:
* **Offline First:** This application (despite it's name) must work seamlessly when used offline for periods of time. Spotty internet connection at the course means that administrators will likely not have consistent internet conenction throughout the event, and may not even have internet connection when beginning the check in process. Actions and updates should sync to the server as soon as possible so that other users see up to date information when it is available.
* **Mobile Friendly:** This application should be designed first and foremost for mobile usage. Rarely, if ever, will a desktop web browser be used to visit the website.
* **Inexpensive:** The infrastructure should be as inexpensive as reasonably possible without risking permanent data loss. The entire application (including the database) should run on a single on-demand t4g.nano AWS instance. Spot instances are not acceptable.
* **Flexible Application Logic:** Sometimes players ask for certain things such as playing with one of their friends on the same card. Sometimes players come late and need to be checked in after teams have been generated. As the league admin, telling them "Sorry I'd like to do that but the system won't let me" is never an acceptable answer. This needs to be kept in mind when designing workflows.

## Context Routing Rules
Before writing code or executing tasks, evaluate the scope of the request. You must read the corresponding context file(s) listed below if the task touches that domain:
* For infrastructure, docker, deployment, local development(docker-compose), IaC, source control, cloud compute, DNS, or debugging tasks see `./infrastructure/agents.md`
* For frontend (UI, components, React, nginx) tasks see `./frontend/agents.md`
* For backend (API endpoints, database, event sourcing, FastAPI) tasks see `./backend/agents.md`
* For the data model (objects, fields, relationships) see `./documentation/models/`
