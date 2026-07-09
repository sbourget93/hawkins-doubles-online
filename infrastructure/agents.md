Read `./README.md` for usage and debugging instructions.

## Infrastructure
`Infrastructure/` houses all of the terraform files used to deploy this application to AWS, as well as the docker-compose file used to test this application locally.

## Terraform
* `data.tf`: Contains resources that terraform does *not* manage, and only loads in as data elements. Things that shouldn't be deleted, or things that have a scope greater than this application (Route53 domain, S3 backup bucket, etc).

## Docker
* Docker is used to containerize individual parts of the application (frontend, backend+database). Docker-compose is used to run these containers locally.

## Stack
* **IaC:** All infrastructure is managed with Terraform.
* **Source Control:** GitHub hosts the application source code in a public repository. The EC2 instance clones it directly at startup to build and run the application.
* **Cloud Compute**: A single `t4g.nano` EC2 instance will run the entire application.
* **DNS**: Route 53 routes `hawkinsdubs.stephengb.com` to the EC2 instance and is used by certbot for DNS-01 SSL certificate verification. The parent domain `stephengb.com` is registered and managed in Route 53 but exists outside the scope of this application.

## Local Development
* **Docker Compose Only:** All local development runs via `docker compose -f infrastructure/local/docker-compose.yml up`. Services are never run directly on the host (no local `npm run dev`, no local `uvicorn`).
* **Mirrors Prod:** The browser only talks to nginx, which proxies `/api/` to the backend. The only difference from prod is that locally nginx proxies `/` to a live Vite dev server (the `frontend` service) for hot module reload, whereas prod nginx serves the pre-built static files baked into the nginx image.
* **No Vite Proxy:** Because nginx owns `/api/` routing in both environments, `vite.config.ts` has no proxy config. Its entire `server` block is dev-only.
