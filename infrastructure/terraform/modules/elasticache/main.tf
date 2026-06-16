variable "cluster_id" { type = string }
variable "node_type" { type = string }
variable "num_cache_nodes" { type = number }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "environment" { type = string }

resource "aws_elasticache_subnet_group" "main" {
  name       = var.cluster_id
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = var.cluster_id
  description                = "FarmConnect Redis Cluster"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_nodes
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = true
  engine_version             = "7.0"

  tags = { Name = var.cluster_id, Environment = var.environment }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.cluster_id}-redis-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
}

output "primary_endpoint" { value = aws_elasticache_replication_group.main.primary_endpoint_address }
