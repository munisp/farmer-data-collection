# =============================================================================
# FarmerConnect Platform — Custom Caddy Build
# Includes: rate limiting, WAF, security headers, metrics
# =============================================================================

FROM caddy:2.8-builder AS builder

# Build Caddy with required plugins
RUN xcaddy build \
    # Rate limiting (token bucket algorithm)
    --with github.com/mholt/caddy-ratelimit \
    # Security headers (CSP, HSTS, etc.)
    --with github.com/caddyserver/caddy/v2 \
    # Prometheus metrics
    --with github.com/caddyserver/caddy/v2/modules/metrics \
    # Dynamic DNS (for wildcard certs)
    --with github.com/caddy-dns/cloudflare \
    # Transforms/request manipulation
    --with github.com/caddyserver/transform-encoder

# =============================================================================
# Final image
# =============================================================================
FROM caddy:2.8-alpine

# Copy custom build
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Create directories
RUN mkdir -p /data/caddy /config/caddy /logs /srv/static /etc/caddy/waf-rules

# Copy configuration
COPY Caddyfile /etc/caddy/Caddyfile
COPY config/ /etc/caddy/config/
COPY waf-rules/ /etc/caddy/waf-rules/

# Non-root user for security
RUN addgroup -S caddy && adduser -S caddy -G caddy
RUN chown -R caddy:caddy /data/caddy /config/caddy /logs /srv/static

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:2019/config/ || exit 1

EXPOSE 80 443 2019

USER caddy

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
