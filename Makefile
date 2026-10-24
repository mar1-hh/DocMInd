
.PHONY: help build up down start stop restart logs ps clean rebuild fclean test-e2e e2e-up e2e-down e2e-list

COMPOSE = docker compose
E2E_COMPOSE = docker compose -f docker-compose.e2e.yaml

help:
	@echo "DocMind Docker Commands"
	@echo "  make build    - Build Docker images"
	@echo "  make up       - Build and start containers"
	@echo "  make down     - Stop and remove containers"
	@echo "  make start    - Start existing containers"
	@echo "  make stop     - Stop running containers"
	@echo "  make restart  - Restart containers"
	@echo "  make logs     - Follow container logs"
	@echo "  make ps       - Show container status"
	@echo "  make clean    - Remove containers and local images"
	@echo "  make rebuild  - Rebuild images without cache"
	@echo "  make test-e2e - Start isolated stack, run browser tests, and clean up"
	@echo "  make e2e-up   - Build and start a fresh isolated test stack"
	@echo "  make e2e-down - Stop and remove only the test stack"
	@echo "  make e2e-list - List browser tests without starting Docker"

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

start:
	$(COMPOSE) start

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

clean:
	$(COMPOSE) down --rmi local --remove-orphans

rebuild:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

fclean:
	$(COMPOSE) down --rmi local --volumes --remove-orphans

# Always clean up the isolated stack, including after startup or test failures.
test-e2e:
	@set -eu; \
	trap '$(E2E_COMPOSE) down' EXIT; \
	$(MAKE) e2e-up; \
	npm --prefix frontend run test:e2e

e2e-up:
	$(E2E_COMPOSE) down
	$(E2E_COMPOSE) up --build --force-recreate --wait --wait-timeout 180

e2e-down:
	$(E2E_COMPOSE) down

e2e-list:
	npm --prefix frontend run test:e2e:list
