resource "tls_private_key" "app" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "app" {
  key_name   = "hawkins-doubles-online"
  public_key = tls_private_key.app.public_key_openssh
}

resource "local_sensitive_file" "private_key" {
  content         = tls_private_key.app.private_key_openssh
  filename        = "${path.module}/hawkins-doubles-online.pem"
  file_permission = "0600"
}
