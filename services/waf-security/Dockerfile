FROM rust:1.77-alpine AS builder
RUN apk add --no-cache musl-dev openssl-dev pkgconfig
WORKDIR /app
COPY Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release 2>/dev/null || true
COPY src/ src/
RUN cargo build --release

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/target/release/waf-security /waf-security
EXPOSE 8105
CMD ["/waf-security"]
