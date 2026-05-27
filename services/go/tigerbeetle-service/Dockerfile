# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o tigerbeetle-service ./cmd/service

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates wget

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/tigerbeetle-service .

# Expose port
EXPOSE 8084

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8084/health || exit 1

# Run the application
CMD ["./tigerbeetle-service"]
