FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN [ -f go.mod ] && go mod download && CGO_ENABLED=0 GOOS=linux go build -o /service . || echo "No go.mod"

FROM alpine:3.19
RUN apk --no-cache add ca-certificates curl
WORKDIR /app
COPY --from=builder /service . 2>/dev/null || true
EXPOSE 8098
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

CMD ["./service"]
