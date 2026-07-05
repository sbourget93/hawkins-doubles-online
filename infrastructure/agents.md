./README.md

## Infrastructure
`Infrastructure/` houses all of the terraform files used to deploy this application to AWS, as well as the docker-compose file used to test this application locally.

* **Compute:** A single on-demand t4g.nano EC2 instance runs the entire application including the database. Spot instances are not acceptable due to the risk of interruption during a live league event.
* **Event Durability:** New events are periodically synced to S3. On a fresh instance, the event log is pulled from S3 and replayed to reconstruct all application state. The S3 bucket should never be deleted, as it contains the only backup of all application data.
* **IaC:** All infrastructure is managed with Terraform.

## Terraform
* `data.tf`: Contains resources that terraform does *not* manage, and only loads in as data elements. Things that shouldn't be deleted, or things that have a scope greater than this application (Route53 domain, S3 backup bucket, etc).


The following resources are created and fully managed by terraform.