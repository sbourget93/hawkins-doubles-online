resource "aws_iam_role_policy" "certbot_route53" {
  name = "certbot-route53"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["route53:ListHostedZones", "route53:GetChange"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "route53:ChangeResourceRecordSets"
        Resource = "arn:aws:route53:::hostedzone/${data.aws_route53_zone.stephengb.zone_id}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::hawkins-doubles-online/letsencrypt/*"
      },
      {
        Effect    = "Allow"
        Action    = "s3:ListBucket"
        Resource  = "arn:aws:s3:::hawkins-doubles-online"
        Condition = {
          StringLike = {
            "s3:prefix" = ["letsencrypt/*"]
          }
        }
      }
    ]
  })
}
