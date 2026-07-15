# Infrastructure

`infrastructure/` houses the Terraform that deploys the app to AWS and the
docker-compose setup that runs it locally.

## Stack

| Layer | Details |
| --- | --- |
| **IaC** | All AWS infrastructure is managed with Terraform (`terraform/`). |
| **Source Control** | GitHub hosts the source in a public repo. The EC2 instance clones it directly at startup to build and run the app. |
| **Cloud Compute** | A single on-demand `t4g.nano` EC2 instance runs the entire application (see the root "Inexpensive" constraint — no spot instances). |
| **DNS** | Route 53 routes `hawkinsdubs.stephengb.com` to the instance and backs certbot's DNS-01 SSL verification. The parent `stephengb.com` is managed in Route 53 but is out of scope for this app. |
| **Containers** | Docker containerizes the app parts (frontend, backend+database). docker-compose runs them together locally. |

## Terraform structure (`terraform/`)

| File | Purpose |
| --- | --- |
| `data.tf` | Resources Terraform does *not* manage, loaded as data only — things that must not be deleted or that outscope this app (Route 53 zone, S3 backup bucket). |
| `ec2.tf` / `eip.tf` / `key_pair.tf` | The instance, its static IP, and SSH key. |
| `user_data.sh` | Startup script — clones the repo and builds/runs the containers. |
| `route53_record.tf` | The `hawkinsdubs` DNS record. |
| `security_group.tf` | Inbound/outbound firewall rules. |
| `iam_role.tf` / `iam_role_policy.tf` / `iam_instance_profile.tf` | The instance's IAM role (e.g. S3 backup access). |
| `providers.tf` / `variables.tf` | Provider config and input variables. |
| `hawkins-doubles-online.pem` | The SSH private key, output by Terraform and saved in this dir. It is a secret and must never be committed to git. |

## Local Development

| Principle | Details |
| --- | --- |
| **Docker Compose Only** | All local development runs via `docker compose -f infrastructure/local/docker-compose.yml up`. Services are never run directly on the host (no local `npm run dev`, no local `uvicorn`). |
| **Mirrors Prod** | The browser only talks to nginx, which proxies `/api/` to the backend. The only difference from prod is that locally nginx proxies `/` to a live Vite dev server (the `frontend` service) for hot module reload, whereas prod nginx serves the pre-built static files baked into the nginx image. |
| **No Vite Proxy** | Because nginx owns `/api/` routing in both environments, `vite.config.ts` has no proxy config. Its entire `server` block is dev-only. |

## Debugging
* **Production SSH:** Connect to the production instance with `ssh -i infrastructure/terraform/hawkins-doubles-online.pem ubuntu@hawkinsdubs.stephengb.com`.
