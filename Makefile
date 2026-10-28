# Short names for the project's common commands. `make help` lists them.
# CI calls the same targets, so a green `make check` locally means a green CI.
#
# To add a command: add a target with a `## description` comment after it,
# and it shows up in `make help` automatically.

BACKEND := cd backend &&
FRONTEND := cd frontend &&
UV := uv run

# Read DB_PORT from .env so these URLs match the port docker-compose publishes.
-include .env
DB_PORT ?= 5432
TEST_DATABASE_URL ?= postgresql+psycopg://postgres:postgres@localhost:$(DB_PORT)/booking_test
LOCAL_DATABASE_URL ?= postgresql+psycopg://postgres:postgres@localhost:$(DB_PORT)/booking

# Pass these .env settings on to the API when it runs on this machine
# (`make api`, `make evals`), as Docker Compose does. Only settings that are
# set get passed, so an unset one keeps the API's default instead of "".
API_SETTINGS_FROM_ENV_FILE := ANTHROPIC_API_KEY BOOKING_STUDIO_TIMEZONE BOOKING_TIME_STEP_MINUTES BOOKING_LLM_MODEL BOOKING_LLM_EFFORT BOOKING_LOG_LEVELS
DEFINED_API_SETTINGS := $(foreach name,$(API_SETTINGS_FROM_ENV_FILE),$(if $(filter-out undefined,$(origin $(name))),$(name)))
export $(DEFINED_API_SETTINGS)

# Local logging matches Docker: DEBUG, to the console and to ./logs/api.log.
BOOKING_LOG_LEVEL ?= DEBUG
BOOKING_LOG_SINKS ?= console,file
# Local databases get random demo bookings when they have none, as in Docker.
BOOKING_SEED_DEMO_BOOKINGS ?= true

LOCAL_LOG_SETTINGS = BOOKING_LOG_LEVEL=$(BOOKING_LOG_LEVEL) BOOKING_LOG_SINKS=$(BOOKING_LOG_SINKS) BOOKING_LOG_DIR=../logs

.DEFAULT_GOAL := help
.PHONY: help up down logs tail-logs install migrate seed dev-native api web format lint test test-backend test-frontend e2e evals openapi check

help: ## List every command
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-15s %s\n", $$1, $$2}'

up: ## Start db, API and web in Docker (http://localhost:5173)
	HOST_UID=$$(id -u) HOST_GID=$$(id -g) docker compose up --build

down: ## Stop the Docker stack
	docker compose down

logs: ## Follow logs from the Docker stack
	docker compose logs -f

tail-logs: ## Follow the API's JSON log file (./logs/api.log)
	tail -F logs/api.log

install: ## Install backend and frontend dependencies
	$(BACKEND) uv sync
	$(FRONTEND) npm ci

migrate: ## Apply database migrations to the local database
	$(BACKEND) BOOKING_DATABASE_URL=$(LOCAL_DATABASE_URL) $(UV) alembic upgrade head

seed: ## Add the studio's equipment (and demo bookings, if it has none) to the local database
	$(BACKEND) BOOKING_DATABASE_URL=$(LOCAL_DATABASE_URL) BOOKING_SEED_DEMO_BOOKINGS=$(BOOKING_SEED_DEMO_BOOKINGS) $(LOCAL_LOG_SETTINGS) $(UV) python -m app.seed

dev-native: ## Postgres in Docker; run `make api` and `make web` in two terminals
	docker compose up -d db
	@echo "Now run 'make api' and 'make web' in separate terminals."

api: migrate seed ## Run the API on this machine with reload
	$(BACKEND) BOOKING_DATABASE_URL=$(LOCAL_DATABASE_URL) $(LOCAL_LOG_SETTINGS) $(UV) uvicorn app.main:app --reload --reload-dir app

web: ## Run the web app on this machine
	$(FRONTEND) npm run dev

format: ## Format all code with Black and Prettier
	$(BACKEND) $(UV) black .
	$(BACKEND) $(UV) ruff check --fix --select I .
	$(FRONTEND) npm run format

lint: ## Check formatting, lint and types
	$(BACKEND) $(UV) black --check .
	$(BACKEND) $(UV) ruff check .
	$(BACKEND) $(UV) mypy .
	$(FRONTEND) npm run format:check
	$(FRONTEND) npm run lint
	$(FRONTEND) npm run typecheck

test-backend: ## Run backend tests (needs Postgres; see TEST_DATABASE_URL)
	$(BACKEND) TEST_DATABASE_URL=$(TEST_DATABASE_URL) $(UV) pytest

test-frontend: ## Run frontend unit tests
	$(FRONTEND) npm test

test: test-backend test-frontend ## Run all unit and API tests

e2e: ## Run the Playwright smoke test (API must be running)
	$(FRONTEND) npm run e2e

evals: ## Run the assistant eval set against the real model (costs money; needs ANTHROPIC_API_KEY)
	$(BACKEND) EVAL_DATABASE_URL=$(TEST_DATABASE_URL) $(UV) python -m evals.run_evals

openapi: ## Regenerate the frontend's API types from the backend
	$(BACKEND) PYTHONPATH=. $(UV) python scripts/export_openapi.py ../frontend/openapi.json
	$(FRONTEND) npm run generate:api

check: lint test ## Everything CI runs except e2e
