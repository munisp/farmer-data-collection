terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "farmconnect-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "af-south-1"
    encrypt        = true
    dynamodb_table = "farmconnect-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "FarmConnect"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "af-south-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "eks_cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "farmconnect-production"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

# VPC
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr           = var.vpc_cidr
  environment        = var.environment
  availability_zones = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"

  cluster_name       = var.eks_cluster_name
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  environment        = var.environment
  node_instance_type = "m6g.xlarge"
  min_nodes          = 3
  max_nodes          = 20
  desired_nodes      = 5
}

# RDS PostgreSQL with PostGIS
module "database" {
  source = "./modules/rds"

  identifier         = "farmconnect-${var.environment}"
  instance_class     = var.db_instance_class
  engine_version     = "16.3"
  allocated_storage  = 100
  max_storage        = 1000
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  multi_az           = true
  backup_retention   = 30
  environment        = var.environment
}

# ElastiCache Redis Cluster
module "redis" {
  source = "./modules/elasticache"

  cluster_id         = "farmconnect-${var.environment}"
  node_type          = "cache.r6g.large"
  num_cache_nodes    = 3
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  environment        = var.environment
}

# MSK (Managed Kafka)
module "kafka" {
  source = "./modules/msk"

  cluster_name       = "farmconnect-${var.environment}"
  kafka_version      = "3.6.0"
  broker_count       = 3
  broker_instance    = "kafka.m5.large"
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  environment        = var.environment
}

# S3 Buckets
module "storage" {
  source = "./modules/s3"

  environment = var.environment
  buckets = {
    data_lake    = "farmconnect-${var.environment}-datalake"
    backups      = "farmconnect-${var.environment}-backups"
    assets       = "farmconnect-${var.environment}-assets"
    ml_models    = "farmconnect-${var.environment}-ml-models"
    satellite    = "farmconnect-${var.environment}-satellite-imagery"
  }
}

# CloudFront CDN
module "cdn" {
  source = "./modules/cloudfront"

  domain_name     = "farmconnect.africa"
  assets_bucket   = module.storage.bucket_arns["assets"]
  environment     = var.environment
  ssl_certificate = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
}

# Outputs
output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "database_endpoint" {
  value     = module.database.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = module.redis.primary_endpoint
}

output "kafka_bootstrap_brokers" {
  value = module.kafka.bootstrap_brokers
}
