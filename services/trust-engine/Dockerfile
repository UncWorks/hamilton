# syntax=docker/dockerfile:1.6

# Same toolchain as local dev/CI gates (is_multiple_of needs >= 1.87);
# bookworm to match the runtime glibc.
FROM rust:1.95-slim-bookworm AS builder
WORKDIR /build

# System deps for duckdb-rs (bundled feature still needs cmake + clang)
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    cmake \
    clang \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
COPY packages/contracts-rs ./packages/contracts-rs
COPY services/trust-engine ./services/trust-engine
# trust-library include_str!s assets/fingerprints/library.json relative to
# the crate root — needs to be in the build context.
COPY assets ./assets

# Cache mounts keep the crate registry and target dir (bundled DuckDB is the
# slow part) across rebuilds, so a code change recompiles only our crates.
# The binary is copied out because the cache mount is not part of the layer.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --bin trust-engine \
    && cp target/release/trust-engine /usr/local/bin/trust-engine

FROM debian:bookworm-slim
# curl: compose healthcheck on /healthz.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/trust-engine /usr/local/bin/trust-engine
COPY assets/fingerprints /assets/fingerprints

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/trust-engine"]
