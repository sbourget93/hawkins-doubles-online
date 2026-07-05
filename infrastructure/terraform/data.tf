data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
}

data "aws_route53_zone" "stephengb" {
  name = "stephengb.com"
}

data "aws_s3_bucket" "hawkins-doubles-online" {
  bucket = "hawkins-doubles-online"
}
