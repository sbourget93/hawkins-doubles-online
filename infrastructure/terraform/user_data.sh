#!/bin/bash
apt-get update -y
apt-get install -y certbot python3-certbot-dns-route53 docker.io git unzip curl

# awscli is no longer an apt package on Ubuntu 24.04 (Noble), so install the
# official bundled v2 CLI (arm64 build for the t4g instance).
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install

systemctl enable --now docker
usermod -aG docker ubuntu

# Restore certs from S3 if available
aws s3 sync s3://hawkins-doubles-online/letsencrypt/ /etc/letsencrypt/ --quiet 2>/dev/null || true

# Only run certbot if no valid cert exists (valid for more than 30 days)
if ! openssl x509 -checkend 2592000 -noout \
    -in /etc/letsencrypt/live/hawkinsdubs.stephengb.com/fullchain.pem 2>/dev/null; then
  certbot certonly \
    --authenticator dns-route53 \
    --non-interactive \
    --agree-tos \
    --email ${certbot_email} \
    -d hawkinsdubs.stephengb.com \
    --deploy-hook "aws s3 sync /etc/letsencrypt/ s3://hawkins-doubles-online/letsencrypt/ --quiet && docker exec nginx nginx -s reload 2>/dev/null || true"

  aws s3 sync /etc/letsencrypt/ s3://hawkins-doubles-online/letsencrypt/ --quiet
fi

# The t4g.nano only has 512MB RAM. Docker builds (especially pip installs) can
# exceed this, causing the build to be killed. A swap file provides overflow
# virtual memory so the build completes, at the cost of using disk instead of RAM.
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

git clone https://github.com/sbourget93/hawkins-doubles-online.git /app

docker network create hawkins-net

docker build -t hawkins-nginx -f /app/nginx/Dockerfile /app
docker build -t hawkins-backend /app/backend

docker run -d --restart unless-stopped \
  --network hawkins-net \
  --name nginx \
  -p 80:80 -p 443:443 \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  hawkins-nginx

docker run -d --restart unless-stopped \
  --network hawkins-net \
  --name backend \
  -e S3_BUCKET=hawkins-doubles-online \
  -e AWS_DEFAULT_REGION=us-east-1 \
  hawkins-backend
