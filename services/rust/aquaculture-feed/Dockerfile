FROM rust:1.77-alpine AS builder

RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml ./
COPY main.rs ./
RUN cargo build --release

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/target/release/aquaculture-feed .

EXPOSE 8114
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:8114/health || exit 1

CMD ["./aquaculture-feed"]
