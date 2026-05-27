# Communication Channels API Documentation

This document describes the USSD, SMS, and WhatsApp integration APIs for the Farmer Data Collection application.

## Table of Contents

1. [USSD API](#ussd-api)
2. [SMS API](#sms-api)
3. [WhatsApp API](#whatsapp-api)
4. [Configuration](#configuration)
5. [Webhooks](#webhooks)

---

## USSD API

USSD (Unstructured Supplementary Service Data) allows farmers with feature phones to interact with the system using short codes like `*384*96#`.

### Endpoints

#### POST /api/ussd

Main USSD webhook endpoint for Africa's Talking.

**Request Body:**
```json
{
  "sessionId": "ATUid_abc123",
  "serviceCode": "*384*96#",
  "phoneNumber": "+254712345678",
  "text": "1*John Doe"
}
```

**Response:**
```
CON Enter your location (Village/District):
```

Response format: `CON` for continue session, `END` for end session.

#### POST /api/ussd/test

Test endpoint for USSD simulation (development only).

**Request Body:**
```json
{
  "phoneNumber": "+254712345678",
  "text": "1"
}
```

**Response:**
```json
{
  "sessionId": "test_1234567890_xyz",
  "continueSession": true,
  "text": "Farmer Registration\n\nEnter your full name:"
}
```

### USSD Flow

1. **Main Menu** - User dials `*384*96#`
   - 1: Register as Farmer
   - 2: View My Profile
   - 3: Update Profile
   - 4: Help

2. **Registration Flow**
   - Step 1: Enter full name
   - Step 2: Enter location (village/district)
   - Step 3: Enter farm size in acres
   - Step 4: Enter crops (comma separated)
   - Step 5: Confirm registration

3. **View Profile**
   - Displays farmer name, phone, location, and verification status

---

## SMS API

SMS integration supports both Africa's Talking and Twilio providers for sending notifications and alerts to farmers.

### Endpoints

#### POST /api/sms/send

Send a single SMS message.

**Request Body:**
```json
{
  "to": "+254712345678",
  "message": "Your harvest is ready for collection.",
  "from": "+254700000000",
  "provider": "africas_talking"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "ATXid_abc123",
  "provider": "africas_talking"
}
```

#### POST /api/sms/send-template

Send SMS using a predefined template.

**Request Body:**
```json
{
  "to": "+254712345678",
  "templateId": "WELCOME",
  "variables": {
    "name": "John Doe",
    "farmerId": "12345"
  },
  "provider": "twilio"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "SM9abc123",
  "provider": "twilio"
}
```

#### POST /api/sms/send-bulk

Send SMS to multiple recipients.

**Request Body:**
```json
{
  "messages": [
    {
      "to": "+254712345678",
      "message": "Weather alert: Heavy rains expected."
    },
    {
      "to": "+254712345679",
      "message": "Weather alert: Heavy rains expected."
    }
  ],
  "provider": "africas_talking"
}
```

**Response:**
```json
{
  "total": 2,
  "success": 2,
  "failed": 0,
  "results": [
    {
      "success": true,
      "messageId": "ATXid_abc123",
      "provider": "africas_talking"
    },
    {
      "success": true,
      "messageId": "ATXid_abc124",
      "provider": "africas_talking"
    }
  ]
}
```

#### GET /api/sms/status

Check SMS service availability.

**Response:**
```json
{
  "available": true,
  "providers": ["africas_talking", "twilio"],
  "configured": true
}
```

### SMS Templates

Available templates:

- **WELCOME** - Welcome message for new farmers
- **VERIFICATION_APPROVED** - Profile verification approved
- **VERIFICATION_REJECTED** - Profile verification rejected
- **HARVEST_REMINDER** - Harvest due date reminder
- **PAYMENT_RECEIVED** - Payment confirmation
- **WEATHER_ALERT** - Weather alerts and warnings

---

## WhatsApp API

WhatsApp Business API integration for rich messaging with images, documents, and location sharing.

### Endpoints

#### POST /api/whatsapp/send

Send a WhatsApp message (generic endpoint).

**Request Body:**
```json
{
  "to": "254712345678",
  "type": "text",
  "text": {
    "body": "Hello from FarmApp!"
  },
  "provider": "meta"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "wamid.abc123",
  "provider": "meta"
}
```

#### POST /api/whatsapp/send-text

Send a text message.

**Request Body:**
```json
{
  "to": "254712345678",
  "text": "Your payment of KES 5,000 has been received.",
  "provider": "twilio"
}
```

#### POST /api/whatsapp/send-template

Send a template message (for Meta Business API).

**Request Body:**
```json
{
  "to": "254712345678",
  "templateName": "HARVEST_REMINDER",
  "parameters": ["John Doe", "Maize", "2024-12-15"],
  "provider": "meta"
}
```

#### POST /api/whatsapp/send-image

Send an image with optional caption.

**Request Body:**
```json
{
  "to": "254712345678",
  "imageUrl": "https://example.com/farm-photo.jpg",
  "caption": "Your farm boundary map",
  "provider": "meta"
}
```

#### POST /api/whatsapp/send-document

Send a document (PDF, Excel, etc.).

**Request Body:**
```json
{
  "to": "254712345678",
  "documentUrl": "https://example.com/harvest-report.pdf",
  "filename": "harvest_report_2024.pdf",
  "caption": "Your monthly harvest report",
  "provider": "meta"
}
```

#### POST /api/whatsapp/send-location

Send a location pin.

**Request Body:**
```json
{
  "to": "254712345678",
  "latitude": -1.286389,
  "longitude": 36.817223,
  "name": "Farm Collection Point",
  "address": "Nairobi, Kenya",
  "provider": "meta"
}
```

#### GET /api/whatsapp/status

Check WhatsApp service availability.

**Response:**
```json
{
  "available": true,
  "providers": ["twilio", "meta"],
  "configured": true
}
```

### WhatsApp Templates

Available templates:

- **WELCOME** - Welcome message for new farmers
- **HARVEST_REMINDER** - Harvest due date reminder
- **PAYMENT_NOTIFICATION** - Payment received notification
- **WEATHER_ALERT** - Weather alerts with header
- **VERIFICATION_STATUS** - Profile verification status update

---

## Configuration

### Environment Variables

#### Africa's Talking (USSD & SMS)

```bash
AFRICAS_TALKING_USERNAME=your_username
AFRICAS_TALKING_API_KEY=your_api_key
```

#### Twilio (SMS & WhatsApp)

```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=+1234567890
```

#### Meta WhatsApp Business API

```bash
META_WHATSAPP_ACCESS_TOKEN=your_access_token
META_WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
META_WHATSAPP_VERIFY_TOKEN=your_verify_token
```

### Provider Selection

By default, the system uses:
- **USSD**: Africa's Talking only
- **SMS**: Africa's Talking (fallback to Twilio)
- **WhatsApp**: Meta Business API (fallback to Twilio)

You can specify a provider in each API request using the `provider` parameter.

---

## Webhooks

### SMS Delivery Reports (Africa's Talking)

**POST /api/sms/delivery-report**

Receives delivery status updates from Africa's Talking.

**Payload:**
```json
{
  "id": "ATXid_abc123",
  "status": "Success",
  "phoneNumber": "+254712345678",
  "networkCode": "63902",
  "retryCount": 0
}
```

### SMS Incoming Messages (Africa's Talking)

**POST /api/sms/incoming**

Receives incoming SMS messages from farmers.

**Payload:**
```json
{
  "from": "+254712345678",
  "to": "+254700000000",
  "text": "HELP",
  "date": "2024-12-03 10:30:00",
  "id": "ATXid_abc123",
  "linkId": "SampleLinkId123"
}
```

### WhatsApp Webhook (Meta)

**POST /api/whatsapp/webhook**

Receives incoming WhatsApp messages and status updates.

**GET /api/whatsapp/webhook**

Webhook verification endpoint (responds with challenge).

### WhatsApp Status Callback (Twilio)

**POST /api/whatsapp/twilio-status**

Receives message status updates from Twilio.

**Payload:**
```json
{
  "MessageSid": "SM9abc123",
  "MessageStatus": "delivered",
  "To": "whatsapp:+254712345678",
  "From": "whatsapp:+1234567890",
  "ErrorCode": null,
  "ErrorMessage": null
}
```

---

## Error Handling

All APIs return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description",
  "provider": "africas_talking"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (missing parameters)
- `403` - Forbidden (webhook verification failed)
- `500` - Server error

---

## Testing

### Test USSD Flow

```bash
curl -X POST http://localhost:3001/api/ussd/test \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254712345678",
    "text": ""
  }'
```

### Test SMS

```bash
curl -X POST http://localhost:3001/api/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+254712345678",
    "message": "Test message"
  }'
```

### Test WhatsApp

```bash
curl -X POST http://localhost:3001/api/whatsapp/send-text \
  -H "Content-Type: application/json" \
  -d '{
    "to": "254712345678",
    "text": "Test WhatsApp message"
  }'
```

---

## Mobile Production Readiness

### Features

✅ **Feature Phone Support** - USSD works on all phones, no smartphone required
✅ **Offline-First** - Services handle network interruptions gracefully
✅ **Multi-Provider** - Automatic fallback between providers
✅ **Session Management** - USSD sessions persist across requests
✅ **Template System** - Pre-defined message templates for consistency
✅ **Rich Media** - WhatsApp supports images, documents, and locations
✅ **Webhooks** - Real-time delivery status and incoming message handling
✅ **Error Handling** - Comprehensive error handling and logging
✅ **Testing** - Full test suite with 18 passing tests

### Scalability

- Concurrent USSD sessions supported
- Bulk SMS sending with rate limiting
- Async message processing
- Database-backed session storage

### Security

- Environment variable configuration
- Webhook verification tokens
- Input validation and sanitization
- Rate limiting on endpoints

---

## Support

For issues or questions:
- Email: support@farmapp.com
- Phone: +1234567890
- Documentation: https://farmapp.com/docs
