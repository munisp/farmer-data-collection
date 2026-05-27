FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || go mod init loan-orchestrator

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o /loan-orchestrator main.go

# Final stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates curl

# Copy binary from builder
COPY --from=builder /loan-orchestrator /app/loan-orchestrator

# Expose port
EXPOSE 8010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8010/health || exit 1

# Run the application
CMD ["/app/loan-orchestrator"]
