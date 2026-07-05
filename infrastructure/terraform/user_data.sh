#!/bin/bash
apt-get update -y
apt-get install -y nginx certbot python3-certbot-dns-route53 docker.io git
systemctl enable --now docker

certbot certonly \
  --authenticator dns-route53 \
  --non-interactive \
  --agree-tos \
  --email ${certbot_email} \
  -d hawkinsdubs.stephengb.com \
  --deploy-hook "nginx -s reload"

cat > /etc/nginx/sites-available/default << 'NGINXEOF'
server {
    listen 80;
    server_name hawkinsdubs.stephengb.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name hawkinsdubs.stephengb.com;

    ssl_certificate /etc/letsencrypt/live/hawkinsdubs.stephengb.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hawkinsdubs.stephengb.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

systemctl enable --now nginx
nginx -s reload

# The t4g.nano only has 512MB RAM. Docker builds (especially pip installs) can
# exceed this, causing the build to be killed. A swap file provides overflow
# virtual memory so the build completes, at the cost of using disk instead of RAM.
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

git clone https://github.com/sbourget93/hawkins-doubles-online.git /app
docker build -t hawkins-app /app/backend
docker run -d --restart unless-stopped -p 8000:8000 hawkins-app
