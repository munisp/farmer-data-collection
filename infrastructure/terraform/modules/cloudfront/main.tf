variable "domain_name" { type = string }
variable "assets_bucket" { type = string }
variable "environment" { type = string }
variable "ssl_certificate" { type = string }

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name, "*.${var.domain_name}"]
  price_class         = "PriceClass_All"

  origin {
    domain_name = "${var.assets_bucket}.s3.amazonaws.com"
    origin_id   = "S3-${var.assets_bucket}"
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.assets_bucket}"
    compress         = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.ssl_certificate
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "farmconnect-cdn", Environment = var.environment }
}

output "distribution_domain" { value = aws_cloudfront_distribution.main.domain_name }
