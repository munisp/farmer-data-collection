FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || go mod init equipment-fleet-service

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /equipment-fleet-service main.go

FROM alpine:3.19

WORKDIR /app

RUN apk --no-cache add ca-certificates curl

COPY --from=builder /equipment-fleet-service /app/equipment-fleet-service

EXPOSE 8098

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8098/health || exit 1

CMD ["/app/equipment-fleet-service"]
