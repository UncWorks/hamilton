# syntax=docker/dockerfile:1.6

FROM rust:1.82-slim AS builder
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

RUN cargo build --release --bin trust-engine

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/trust-engine /usr/local/bin/trust-engine
COPY assets/fingerprints /assets/fingerprints

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/trust-engine"]
