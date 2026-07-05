resource "aws_instance" "app" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t4g.nano"
  key_name                    = aws_key_pair.app.key_name
  iam_instance_profile        = aws_iam_instance_profile.app.name
  vpc_security_group_ids      = [aws_security_group.app.id]
  user_data_replace_on_change = true

  # Temporary placeholder while infrastructure is being set up
  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y nginx certbot python3-certbot-nginx python3-certbot-dns-route53 docker.io
    systemctl enable --now docker

    echo "<h1>TODO: Website goes here</h1>" > /var/www/html/index.html
    systemctl enable --now nginx

    certbot --authenticator dns-route53 --installer nginx \
      --non-interactive \
      --agree-tos \
      --email ${var.certbot_email} \
      -d hawkinsdubs.stephengb.com \
      --redirect
  EOF

  tags = {
    Name = "hawkins-doubles-online"
  }
}
