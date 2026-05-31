FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY main.go .
RUN go mod init blockchain-provenance && \
    go mod tidy && \
    CGO_ENABLED=0 go build -o /blockchain-provenance .

FROM alpine:3.19
COPY --from=builder /blockchain-provenance /blockchain-provenance
EXPOSE 8110
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://localhost:8110/health || exit 1
CMD ["/blockchain-provenance"]
