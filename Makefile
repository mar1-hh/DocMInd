
.PHONY: help build up down start stop restart logs ps clean rebuild fclean

COMPOSE = docker compose

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
