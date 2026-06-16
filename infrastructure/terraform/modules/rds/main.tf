variable "identifier" { type = string }
variable "instance_class" { type = string }
variable "engine_version" { type = string }
variable "allocated_storage" { type = number }
variable "max_storage" { type = number }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "multi_az" { type = bool; default = true }
variable "backup_retention" { type = number; default = 30 }
variable "environment" { type = string }

resource "aws_db_subnet_group" "main" {
  name       = var.identifier
  subnet_ids = var.subnet_ids
}

resource "aws_db_instance" "main" {
  identifier              = var.identifier
  engine                  = "postgres"
  engine_version          = var.engine_version
  instance_class          = var.instance_class
  allocated_storage       = var.allocated_storage
  max_allocated_storage   = var.max_storage
  db_name                 = "farmconnect"
  username                = "farmconnect_admin"
  manage_master_user_password = true
  multi_az                = var.multi_az
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  backup_retention_period = var.backup_retention
  storage_encrypted       = true
  deletion_protection     = true
  performance_insights_enabled = true
  monitoring_interval     = 60

  tags = { Name = var.identifier, Environment = var.environment }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.identifier}-rds-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
}

output "endpoint" { value = aws_db_instance.main.endpoint }
output "port" { value = aws_db_instance.main.port }
