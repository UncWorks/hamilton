.PHONY: help demo demo-fallback up up-broker down logs build verify lint test clean fetch-tiles basemap-style

# --- Demo knobs (make demo VAR=value) -----------------------------------------
# RENDERER  cesium (default) | maplibre        — make demo-fallback = maplibre
# ADMIN     1 = presenter Admin menu always on  (?admin=1 works without it)
# NARRATOR  empty (default, no narrator) | 1 (deterministic; Claude if
#           ANTHROPIC_API_KEY is set) | ollama (+ ~9 GB image, ~2 GB model)
# NEXT_PUBLIC_BASEMAP  empty (offline basemap, fetched on first run) | none | online
RENDERER ?= $(or $(NEXT_PUBLIC_RENDERER),cesium)
ADMIN ?= $(NEXT_PUBLIC_ADMIN)
NARRATOR ?=
NEXT_PUBLIC_BASEMAP ?=

COMPOSE_FILE := infra/docker/docker-compose.yml
PROFILES := --profile full
ifneq ($(NARRATOR),)
PROFILES += --profile narrator
endif
ifeq ($(NARRATOR),ollama)
PROFILES += --profile ollama
NARRATOR_OLLAMA_URL := http://ollama:11434
endif
COMPOSE = NEXT_PUBLIC_RENDERER=$(RENDERER) NEXT_PUBLIC_ADMIN=$(ADMIN) \
	NEXT_PUBLIC_BASEMAP=$(NEXT_PUBLIC_BASEMAP) NARRATOR_OLLAMA_URL=$(NARRATOR_OLLAMA_URL) \
	docker compose -f $(COMPOSE_FILE)
# --profile ollama/narrator too, so `make down` also stops an opt-in narrator.
ALL_PROFILES := --profile full --profile narrator --profile ollama

# The offline basemap is provisioned on the first run (it is gitignored).
# tiles.json is written last by scripts/fetch-tiles.sh, so it marks a
# complete fetch. Skipped for NEXT_PUBLIC_BASEMAP=none|online.
TILES_SENTINEL := apps/web/public/tiles/raster/tiles.json
ifeq ($(filter none online,$(NEXT_PUBLIC_BASEMAP)),)
BASEMAP_DEP := $(TILES_SENTINEL)
endif

URL_BANNER = printf '\n  Hamilton is up:  http://localhost:3000\n  Presenter menu:  http://localhost:3000/?admin=1\n  Renderer: %s   Stop: make down\n\n' '$(RENDERER)'

help:
	@echo "Hamilton — make targets"
	@echo "  make demo           Build + run the full demo in the foreground (Ctrl-C stops)"
	@echo "                      broker, trust engine, looping comms-sim, web on :3000"
	@echo "  make up             Same, detached; returns once everything is healthy"
	@echo "  make down           Stop and remove the stack"
	@echo "  make logs           Follow the stack's logs"
	@echo "  make demo-fallback  make demo with the MapLibre renderer (Cesium-fail path)"
	@echo "  make up-broker      Start only the broker (mosquitto)"
	@echo "  make fetch-tiles    (Re)provision the offline basemap in apps/web/public/tiles"
	@echo "  make basemap-style  Regenerate the committed basemap style layers"
	@echo "  make build          Build all workspace members"
	@echo "  make verify         Verify assets + dep budget + phosphor lint + no truth on the bus"
	@echo "  make lint           Lint all workspaces"
	@echo "  make test           Run all tests"
	@echo "  make clean          Remove build artifacts"
	@echo "Options: RENDERER=cesium|maplibre  ADMIN=1  NARRATOR=1|ollama  NEXT_PUBLIC_BASEMAP=none"

$(TILES_SENTINEL):
	@bash scripts/ensure-tiles.sh

demo: $(BASEMAP_DEP)
	@echo "[make] building and starting Hamilton (first build: several minutes for the Rust engine)"
	@# Print the URLs once the web answers (polls while compose runs).
	@( sleep 5; while kill -0 $$$$ 2>/dev/null; do \
	     curl -fsS -o /dev/null -m 120 http://localhost:3000/ 2>/dev/null && { $(URL_BANNER); exit 0; }; \
	     sleep 3; done ) & \
	$(COMPOSE) $(PROFILES) up --build --remove-orphans

demo-fallback:
	$(MAKE) demo RENDERER=maplibre

up: $(BASEMAP_DEP)
	$(COMPOSE) $(PROFILES) up -d --build --remove-orphans --wait
	@$(URL_BANNER)

up-broker:
	$(COMPOSE) up -d mosquitto

down:
	$(COMPOSE) $(ALL_PROFILES) down --remove-orphans

logs:
	$(COMPOSE) $(ALL_PROFILES) logs -f

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
