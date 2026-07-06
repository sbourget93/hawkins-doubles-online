#!/bin/bash
apt-get update -y
apt-get install -y certbot python3-certbot-dns-route53 docker.io git

systemctl enable --now docker

certbot certonly \
  --authenticator dns-route53 \
  --non-interactive \
  --agree-tos \
  --email ${certbot_email} \
  -d hawkinsdubs.stephengb.com \
  --deploy-hook "docker exec nginx nginx -s reload 2>/dev/null || true"

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
  hawkins-backend
