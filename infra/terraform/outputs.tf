output "alb_dns_name" {
  description = "Public URL of the Application Load Balancer"
  value       = "http://${aws_lb.main.dns_name}"
}

output "rds_endpoint" {
  description = "PostgreSQL database connection address"
  value       = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint address"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "ecs_cluster_name" {
  description = "Name of the ECS Fargate cluster"
  value       = aws_ecs_cluster.main.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for API containers"
  value       = aws_cloudwatch_log_group.api.name
}
