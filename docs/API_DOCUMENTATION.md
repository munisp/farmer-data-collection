# FarmConnect API Documentation

## Overview

FarmConnect exposes a **tRPC-based API** with 58 routers and 805 procedures across 9 domains.

**Base URL:** `https://api.farmconnect.africa/trpc`  
**Protocol:** tRPC over HTTP (POST for mutations, GET for queries)  
**Authentication:** JWT Bearer token (Keycloak OIDC)

## Authentication

All protected endpoints require a valid JWT in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Token Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | Login with phone/password |
| `/auth/register` | POST | Register new user |
| `/auth/refresh` | POST | Refresh expired token |
| `/auth/verify-otp` | POST | Verify OTP code |

### Token Claims
```json
{
  "sub": "user-uuid",
  "role": "farmer|agent|admin|viewer",
  "permissions": ["read:farmers", "write:loans"],
  "exp": 1700000000,
  "iss": "farmconnect-auth"
}
```

## API Domains

### 1. Core Features (46 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `core.getFarmers` | query | protected | List farmers with pagination |
| `core.getFarmer` | query | protected | Get farmer by ID |
| `core.createFarmer` | mutation | protected | Register new farmer |
| `core.updateFarmer` | mutation | protected | Update farmer profile |
| `core.deleteFarmer` | mutation | protected | Soft-delete farmer |
| `core.getDashboardStats` | query | protected | Dashboard metrics |

### 2. Microfinance (29 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `microfinance.createLoan` | mutation | protected | Create loan application |
| `microfinance.approveLoan` | mutation | protected | Approve pending loan |
| `microfinance.disburseLoan` | mutation | protected | Disburse approved loan |
| `microfinance.recordRepayment` | mutation | protected | Record loan repayment |
| `microfinance.getAmortization` | query | protected | Get repayment schedule |
| `microfinance.getLatePayments` | query | protected | List overdue payments |

### 3. KYC & Identity (29 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `kyc.submitDocument` | mutation | protected | Upload KYC document |
| `kyc.verifyBVN` | mutation | protected | Verify BVN via NIBSS |
| `kyc.verifyNIN` | mutation | protected | Verify NIN via NIMC |
| `kyc.getVerificationStatus` | query | protected | Check verification status |
| `kyc.approveKYC` | mutation | protected | Approve KYC (admin) |

### 4. Marketplace & Exchange (17 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `exchange.createOrder` | mutation | protected | Place buy/sell order |
| `exchange.cancelOrder` | mutation | protected | Cancel pending order |
| `exchange.getOrderBook` | query | public | Get current order book |
| `exchange.getMyOrders` | query | protected | Get user's orders |
| `exchange.getTradeHistory` | query | protected | Get trade history |

### 5. Payments & Mobile Money (13 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `mobileMoney.initiate` | mutation | protected | Initiate payment |
| `mobileMoney.webhook` | mutation | public | Payment callback |
| `mobileMoney.checkStatus` | query | protected | Check payment status |
| `mobileMoney.getBalance` | query | protected | Get wallet balance |

### 6. Spatial & GPS (22 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `spatial.createBoundary` | mutation | protected | Create farm boundary |
| `spatial.getNearby` | query | protected | Find nearby features |
| `spatial.calculateArea` | query | protected | Calculate polygon area |
| `spatial.getOverlaps` | query | protected | Detect boundary overlaps |

### 7. ML & Predictions (21 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `ml.predictYield` | query | protected | Predict crop yield |
| `ml.detectDisease` | mutation | protected | Detect plant disease |
| `ml.getPriceForcast` | query | protected | Price prediction |
| `ml.getModelMetrics` | query | protected | Model performance |

### 8. IoT & Sensors (9 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `iot.registerDevice` | mutation | protected | Register IoT device |
| `iot.ingestTelemetry` | mutation | protected | Ingest sensor data |
| `iot.getAlerts` | query | protected | Get active alerts |
| `iot.getDeviceHealth` | query | protected | Device health status |

### 9. Supply Chain (16 procedures)
| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `traceability.createShipment` | mutation | protected | Create shipment |
| `traceability.updateStatus` | mutation | protected | Update shipment status |
| `traceability.verifyQR` | query | public | Verify QR code |
| `traceability.getColdChain` | query | protected | Get cold chain data |

## Error Responses

All errors follow tRPC error format:

```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "UNAUTHORIZED",
    "data": {
      "code": "UNAUTHORIZED",
      "httpStatus": 401,
      "path": "core.getFarmers"
    }
  }
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

## Rate Limits

| Tier | Requests/min | Burst | Description |
|------|-------------|-------|-------------|
| Default | 100 | 150 | Standard authenticated |
| Write | 30 | 50 | Mutations |
| Auth | 10 | 15 | Login/register |
| Webhook | 500 | 750 | Payment callbacks |

## Webhooks

### M-Pesa Callback
```
POST /api/webhooks/mpesa
Content-Type: application/json
X-Mpesa-Signature: <hmac_sha256>
```

### MTN Mobile Money Callback  
```
POST /api/webhooks/mtn
Content-Type: application/json
X-Callback-Token: <token>
```

## SDKs & Client Libraries

- **TypeScript/React**: Full tRPC client with type inference
- **USSD**: Text-based menu interface (Africa's Talking)
- **WhatsApp**: Business API integration
- **Mobile**: React Native with offline-first sync

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `http://localhost:5000/trpc` | Local development |
| Staging | `https://staging-api.farmconnect.africa/trpc` | Pre-production |
| Production | `https://api.farmconnect.africa/trpc` | Live |
