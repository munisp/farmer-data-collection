# Build stage
FROM rust:1.75-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml ./

# Create dummy main.rs to build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (this layer will be cached)
RUN cargo build --release && rm -rf src

# Copy actual source code
COPY src ./src

# Build the application
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /app/target/release/image-processor /app/image-processor

# Set environment variables
ENV PORT=8015
ENV S3_ENDPOINT=http://rustfs:9000
ENV S3_ACCESS_KEY=rustfsadmin
ENV S3_SECRET_KEY=rustfsadmin
ENV S3_BUCKET=farmer-uploads
ENV RUST_LOG=info

# Expose port
EXPOSE 8015

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8015/health || exit 1

# Run the binary
CMD ["/app/image-processor"]
