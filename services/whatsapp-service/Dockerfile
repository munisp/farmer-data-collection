FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /whatsapp-service .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /whatsapp-service /whatsapp-service
EXPOSE 8102
CMD ["/whatsapp-service"]
