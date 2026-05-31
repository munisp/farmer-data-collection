FROM rust:1.77-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml main.rs ./
RUN cargo build --release

FROM alpine:3.19
COPY --from=builder /app/target/release/urban-delivery /urban-delivery
EXPOSE 8111
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://localhost:8111/health || exit 1
CMD ["/urban-delivery"]
