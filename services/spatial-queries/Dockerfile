FROM rust:1.77-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY . .
RUN [ -f Cargo.toml ] && cargo build --release || echo "No Cargo.toml, skip build"

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/spatial-queries /app/ 2>/dev/null || true
EXPOSE 8099
CMD ["./spatial-queries"]
