resource "aws_route53_record" "dubs" {
  zone_id = data.aws_route53_zone.stephengb.zone_id
  name    = "hawkinsdubs.stephengb.com"
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}
