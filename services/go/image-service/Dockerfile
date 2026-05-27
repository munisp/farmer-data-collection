FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || go mod init image-service

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /image-service main.go

FROM alpine:3.19

WORKDIR /app

RUN apk --no-cache add ca-certificates curl

COPY --from=builder /image-service /app/image-service

EXPOSE 8011

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8011/health || exit 1

CMD ["/app/image-service"]
