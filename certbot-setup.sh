#!/bin/bash
set -e

echo "🔒 Setting up Let's Encrypt SSL Certificates"
echo "============================================="

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
fi

# Domain configuration
DOMAIN=${DOMAIN:-"farmer-platform.example.com"}
EMAIL=${SSL_EMAIL:-"admin@example.com"}

echo "Obtaining SSL certificate for $DOMAIN..."
sudo certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "api.$DOMAIN" \
    -d "temporal.$DOMAIN" \
    -d "grafana.$DOMAIN"

# Set up auto-renewal
echo "Setting up automatic renewal..."
sudo tee /etc/cron.d/certbot-renew << EOF
0 0,12 * * * root certbot renew --quiet --post-hook "docker-compose -f /home/ubuntu/farmer-data-collection/docker-compose.production.yml restart apisix"
EOF

echo "✓ SSL certificates configured successfully!"
echo "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
