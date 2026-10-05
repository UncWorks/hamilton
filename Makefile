.PHONY: help demo demo-fallback up up-broker down build verify lint test clean fetch-tiles basemap-style

RENDERER ?= cesium
NEXT_PUBLIC_RENDERER ?= $(RENDERER)
export NEXT_PUBLIC_RENDERER

help:
	@echo "Hamilton — make targets"
	@echo "  make demo           Bring up full stack with primary renderer ($(RENDERER))"
	@echo "  make demo-fallback  Force MapLibre renderer (Cesium-fail path)"
	@echo "  make fetch-tiles    Provision the offline basemap in apps/web/public/tiles (online, once)"
	@echo "  make basemap-style  Regenerate the committed basemap style layers"
	@echo "  make up             docker compose up -d (full profile: broker, engine, sim, web)"
	@echo "  make up-broker      Start only the broker (mosquitto) and ollama"
	@echo "  make down           docker compose down"
	@echo "  make build          Build all workspace members"
	@echo "  make verify         Verify assets + dep budget + phosphor lint + no truth on the bus"
	@echo "  make lint           Lint all workspaces"
	@echo "  make test           Run all tests"
	@echo "  make clean          Remove build artifacts"

demo:
	NEXT_PUBLIC_RENDERER=$(RENDERER) docker compose -f infra/docker/docker-compose.yml --profile full up

demo-fallback:
	$(MAKE) demo RENDERER=maplibre

up:
	docker compose -f infra/docker/docker-compose.yml --profile full up -d

up-broker:
	docker compose -f infra/docker/docker-compose.yml up -d mosquitto ollama

down:
	docker compose -f infra/docker/docker-compose.yml --profile full down

build:
	pnpm -r build
	cargo build --release --workspace

# Offline basemap (System Design §6c): Protomaps vector extract + glyphs +
# Cesium raster pyramid. Gitignored assets; this is their reproducible source.
fetch-tiles:
	bash scripts/fetch-tiles.sh

# Re-render the raster pyramid too, so 2D and 3D stay in step with the style.
basemap-style:
	node scripts/basemap/build-style.mjs "$$(bash scripts/fetch-tiles.sh --tools-only | tail -1)"
	node scripts/basemap/render-raster.mjs "$$(bash scripts/fetch-tiles.sh --tools-only | tail -1)"

verify:
	bash scripts/verify-assets.sh
	bash scripts/lint-phosphor.sh
	bash scripts/count-deps.sh
	bash scripts/check-no-truth.sh

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
