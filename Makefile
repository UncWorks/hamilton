.PHONY: help demo demo-fallback up down build verify lint test clean

RENDERER ?= cesium
NEXT_PUBLIC_RENDERER ?= $(RENDERER)
export NEXT_PUBLIC_RENDERER

help:
	@echo "Hamilton — make targets"
	@echo "  make demo           Bring up full stack with primary renderer ($(RENDERER))"
	@echo "  make demo-fallback  Force MapLibre renderer (Cesium-fail path)"
	@echo "  make up             docker compose up -d"
	@echo "  make down           docker compose down"
	@echo "  make build          Build all workspace members"
	@echo "  make verify         Verify assets + dep budget + phosphor lint"
	@echo "  make lint           Lint all workspaces"
	@echo "  make test           Run all tests"
	@echo "  make clean          Remove build artifacts"

demo:
	NEXT_PUBLIC_RENDERER=$(RENDERER) docker compose -f infra/docker/docker-compose.yml up

demo-fallback:
	$(MAKE) demo RENDERER=maplibre

up:
	docker compose -f infra/docker/docker-compose.yml up -d

down:
	docker compose -f infra/docker/docker-compose.yml down

build:
	pnpm -r build
	cargo build --release --workspace

verify:
	bash scripts/verify-assets.sh
	bash scripts/lint-phosphor.sh
	bash scripts/count-deps.sh

lint:
	pnpm -r lint
	cargo fmt --all -- --check
	cargo clippy --workspace -- -D warnings

test:
	cargo test --workspace
	pnpm -r test
	cd services/comms-sim && python -m pytest

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules services/*/node_modules
	rm -rf apps/*/.next packages/*/dist
	cargo clean
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
