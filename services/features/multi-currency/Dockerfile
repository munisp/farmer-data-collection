FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod* go.sum* ./
RUN go mod download 2>/dev/null || true

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /app/service .

FROM alpine:3.19

WORKDIR /app
COPY --from=builder /app/service .

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

EXPOSE 8080

CMD ["./service"]
