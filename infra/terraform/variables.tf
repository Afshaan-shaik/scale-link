variable "aws_region" {
  type        = string
  description = "AWS deployment region"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment (production / staging)"
  default     = "production"
}

variable "project_name" {
  type        = string
  description = "Project identifier"
  default     = "scalelink"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC"
  default     = "10.0.0.0/16"
}

variable "api_replica_count" {
  type        = number
  description = "Number of API Fargate tasks to run in parallel (default 3)"
  default     = 3
}

variable "container_cpu" {
  type        = string
  description = "Fargate CPU units (256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU)"
  default     = "512"
}

variable "container_memory" {
  type        = string
  description = "Fargate memory allocation (MB)"
  default     = "1024"
}

variable "db_instance_class" {
  type        = string
  description = "RDS PostgreSQL instance class"
  default     = "db.t4g.micro"
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database name"
  default     = "scalelink"
}

variable "db_username" {
  type        = string
  description = "PostgreSQL master username"
  default     = "scalelink_admin"
}

variable "db_password" {
  type        = string
  description = "PostgreSQL master password"
  sensitive   = true
  default     = "ChangeMeSecurePassword123!"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.t4g.micro"
}

variable "ecr_image_api" {
  type        = string
  description = "ECR or Docker Hub container image URL"
  default     = "scalelink/api"
}

variable "domain_name" {
  type        = string
  description = "Optional custom domain name for Route 53 and ACM HTTPS certificate"
  default     = ""
}
