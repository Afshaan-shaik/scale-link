# ── ScaleLink Makefile ────────────────────────────────────────────────────────
.PHONY: help up down restart build logs test lint loadtest smoke seed clean

SHELL := /bin/bash
COMPOSE := docker compose

help: ## Show this help message
	@echo "ScaleLink Development Commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start all services with docker compose
	$(COMPOSE) up -d --build

down: ## Stop all services
	$(COMPOSE) down

restart: down up ## Restart all services

build: ## Rebuild all docker images
	$(COMPOSE) build

logs: ## Tail all container logs
	$(COMPOSE) logs -f

ps: ## List running containers
	$(COMPOSE) ps

seed: ## Seed database with demo user, sample links, and click analytics
	@echo "==> Running ScaleLink Seed script..."
	$(COMPOSE) run --rm api1 /seed

smoke: ## Run automated end-to-end verification tests
	@echo "==> Running automated smoke test suite..."
	@bash scripts/smoke.sh || powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1

verify-phase3: ## Verify Phase 3 async worker with 1,000 events and zero loss
	@echo "==> Running Phase 3 async worker verification..."
	@bash scripts/verify_phase3.sh || powershell -ExecutionPolicy Bypass -File scripts/verify_phase3.ps1

test: ## Run unit and integration tests inside backend
	@echo "==> Running backend unit tests..."
	@if command -v go >/dev/null 2>&1; then \
		cd backend && go test -v -race ./... ; \
	else \
		$(COMPOSE) run --rm api1 go test -v ./... ; \
	fi

lint: ## Run go vet and code format checks
	@echo "==> Running linting..."
	@if command -v go >/dev/null 2>&1; then \
		cd backend && go vet ./... ; \
	else \
		$(COMPOSE) run --rm api1 go test -v ./... ; \
	fi

loadtest: ## Run k6 load test scripts
	@echo "==> Running k6 load test (redirect hot path)..."
	@if command -v k6 >/dev/null 2>&1; then \
		k6 run loadtest/redirect.js ; \
	else \
		$(COMPOSE) --profile tools run --rm k6 run /loadtest/redirect.js || docker run --rm -i --network=host grafana/k6 run - < loadtest/redirect.js ; \
	fi

loadtest-create: ## Run k6 link creation load test
	@echo "==> Running k6 load test (link creation)..."
	@if command -v k6 >/dev/null 2>&1; then \
		k6 run loadtest/create.js ; \
	else \
		$(COMPOSE) --profile tools run --rm k6 run /loadtest/create.js ; \
	fi

loadtest-ratelimit: ## Run k6 rate limit burst load test
	@echo "==> Running k6 load test (token bucket rate limit)..."
	@if command -v k6 >/dev/null 2>&1; then \
		k6 run loadtest/ratelimit.js ; \
	else \
		$(COMPOSE) --profile tools run --rm k6 run /loadtest/ratelimit.js ; \
	fi

clean: ## Remove containers, volumes, and temporary build files
	$(COMPOSE) down -v --remove-orphans
