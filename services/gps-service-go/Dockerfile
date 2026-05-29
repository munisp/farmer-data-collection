FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /service .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates curl
WORKDIR /app
COPY --from=builder /service .
EXPOSE 8080
CMD ["./service"]
