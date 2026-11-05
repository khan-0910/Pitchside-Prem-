.PHONY: install bootstrap api web build test lint up

install:
	pip install -r backend/requirements-dev.txt
	npm --prefix frontend install

bootstrap:
	cd backend && python -m scripts.bootstrap

api:
	cd backend && uvicorn app.main:app --reload --port 8000

web:
	npm --prefix frontend run dev

build:
	npm --prefix frontend run build

test:
	cd backend && python -m pytest
	npm --prefix frontend test

lint:
	cd backend && ruff check app scripts && mypy app scripts
	npm --prefix frontend run typecheck

up:
	docker compose up --build
