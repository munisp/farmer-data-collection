FROM rust:1.75-slim AS builder
WORKDIR /app
COPY Cargo.toml .
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release 2>/dev/null || true
COPY src/ src/
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/spatial-query-service .
EXPOSE 8099
CMD ["./spatial-query-service"]
