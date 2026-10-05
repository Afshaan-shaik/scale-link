# ScaleLink AWS Production Deployment (Terraform)

This directory contains the production-grade Infrastructure as Code (IaC) configuration for deploying **ScaleLink** to Amazon Web Services (AWS) using **ECS Fargate**, **Application Load Balancer**, **RDS PostgreSQL 16**, and **ElastiCache Redis 7**.

---

## 🏛️ AWS Cloud Architecture

```
                          Internet Traffic (HTTP / HTTPS)
                                       │
                                       ▼
                   ┌───────────────────────────────────────┐
                   │  AWS Application Load Balancer (ALB)  │
                   │    (SSL Termination / Port 80 & 443)  │
                   └───────────────────┬───────────────────┘
                                       │
                     VPC Private Subnets (No Public IPs)
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ ECS Fargate   │              │ ECS Fargate   │              │ ECS Fargate   │
│ API Node 1    │              │ API Node 2    │              │ API Node 3    │
└───────┬───────┘              └───────┬───────┘              └───────┬───────┘
        │                              │                              │
        ├──────────────────────────────┼──────────────────────────────┤
        ▼                              ▼                              ▼
┌────────────────────────────────┐            ┌──────────────────────────────┐
│ AWS ElastiCache for Redis 7    │            │ AWS RDS PostgreSQL 16        │
│ (Cache-Aside & Rate Limiting)  │            │ (Persistent Relational DB)   │
└────────────────────────────────┘            └──────────────────────────────┘
```

---

## 🚀 Step-by-Step Deployment Guide

### Prerequisites
1. **AWS CLI** configured with administrator credentials:
   ```bash
   aws configure
   ```
2. **Terraform CLI** (v1.6+):
   ```bash
   terraform version
   ```
3. Built and pushed container image to Amazon ECR:
   ```bash
   # Create ECR repo
   aws ecr create-repository --repository-name scalelink-api --region us-east-1

   # Authenticate Docker
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.us-east-1.amazonaws.com

   # Build & Push
   docker build -t <account_id>.dkr.ecr.us-east-1.amazonaws.com/scalelink-api:latest ./backend
   docker push <account_id>.dkr.ecr.us-east-1.amazonaws.com/scalelink-api:latest
   ```

---

### Deploying with Terraform

```bash
cd infra/terraform

# 1. Initialize Terraform providers
terraform init

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your ECR image URL and a secure DB password

# 3. Plan the infrastructure
terraform plan

# 4. Provision the cluster
terraform apply -auto-approve
```

---

## 🔒 Custom Domain & HTTPS Setup (Route 53 + ACM)

To configure a custom domain like `link.yourdomain.com`:

1. Request an SSL/TLS Certificate in AWS Certificate Manager (ACM):
   ```bash
   aws acm request-certificate --domain-name link.yourdomain.com --validation-method DNS --region us-east-1
   ```
2. Add the CNAME validation record in Route 53 or your DNS provider (Cloudflare, GoDaddy).
3. In `main.tf`, attach an HTTPS listener on port 443 with the certificate ARN:
   ```hcl
   resource "aws_lb_listener" "https" {
     load_balancer_arn = aws_lb.main.arn
     port              = 443
     protocol          = "HTTPS"
     ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
     certificate_arn   = "arn:aws:acm:us-east-1:123456789012:certificate/xxx"

     default_action {
       type             = "forward"
       target_group_arn = aws_lb_target_group.api.arn
     }
   }
   ```
4. Point your domain's DNS `CNAME` or Route 53 `A-Alias` to the ALB DNS name output:
   ```
   link.yourdomain.com ──> CNAME ──> scalelink-alb-123456.us-east-1.elb.amazonaws.com
   ```

---

## 💰 Cost Breakdown (Estimated AWS Monthly Cost)

| Service | Instance / Sizing | Monthly Cost (USD) |
| :--- | :--- | :--- |
| **ECS Fargate Tasks (3 Nodes)** | 0.5 vCPU / 1GB RAM each | ~$28.00 |
| **AWS Application Load Balancer** | 1 ALB (~15 LCU) | ~$18.00 |
| **RDS PostgreSQL 16** | db.t4g.micro (20GB gp3) | ~$14.50 (Free tier eligible) |
| **ElastiCache Redis 7** | cache.t4g.micro | ~$13.00 |
| **NAT Gateway & Data Transfer** | 1 NAT GW (low bandwidth) | ~$32.00 |
| **Total Estimated Cost:** | | **~$105.50 / month** |
