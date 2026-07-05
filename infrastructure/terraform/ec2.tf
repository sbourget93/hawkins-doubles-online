resource "aws_instance" "app" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t4g.nano"
  key_name                    = aws_key_pair.app.key_name
  iam_instance_profile        = aws_iam_instance_profile.app.name
  vpc_security_group_ids      = [aws_security_group.app.id]
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/user_data.sh", {
    certbot_email = var.certbot_email
  })

  tags = {
    Name = "hawkins-doubles-online"
  }
}
