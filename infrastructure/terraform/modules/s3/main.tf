variable "environment" { type = string }
variable "buckets" { type = map(string) }

resource "aws_s3_bucket" "buckets" {
  for_each = var.buckets
  bucket   = each.value
  tags     = { Name = each.key, Environment = var.environment }
}

resource "aws_s3_bucket_versioning" "buckets" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.buckets[each.key].id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "buckets" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.buckets[each.key].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
  }
}

resource "aws_s3_bucket_public_access_block" "buckets" {
  for_each                = var.buckets
  bucket                  = aws_s3_bucket.buckets[each.key].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "data_lake" {
  bucket = aws_s3_bucket.buckets["data_lake"].id
  rule {
    id     = "archive-old-data"
    status = "Enabled"
    transition { days = 90; storage_class = "GLACIER" }
    expiration { days = 2555 }
  }
}

output "bucket_arns" { value = { for k, b in aws_s3_bucket.buckets : k => b.arn } }
