resource "aws_iam_instance_profile" "app" {
  name = "hawkins-doubles-online"
  role = aws_iam_role.app.name
}
