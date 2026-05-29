FROM rust:1.78-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY main.rs ./
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/iot-gateway /usr/local/bin/
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD test -f /proc/1/status || exit 1
CMD ["iot-gateway"]
