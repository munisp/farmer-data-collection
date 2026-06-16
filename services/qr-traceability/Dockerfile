FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /qr-traceability .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /qr-traceability /qr-traceability
EXPOSE 8103
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

CMD ["/qr-traceability"]
