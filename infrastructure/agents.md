./README.md

## Infrastructure
`Infrastructure/` houses all of the terraform files used to deploy this application to AWS, as well as the docker-compose file used to test this application locally.

## Terraform
* `data.tf`: Contains resources that terraform does *not* manage, and only loads in as data elements. Things that shouldn't be deleted, or things that have a scope greater than this application (Route53 domain, S3 backup bucket, etc).
