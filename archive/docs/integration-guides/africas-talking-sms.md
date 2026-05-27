# Africa's Talking SMS API Integration

## API Endpoints
- **Live**: https://api.africastalking.com/version1/messaging/bulk
- **Sandbox**: https://api.sandbox.africastalking.com/version1/messaging/bulk

## Authentication
- Use API Key in header: `apiKey: MyAppApiKey`
- Include username in request body

## Request Format (HTTP POST)

### Headers
```
Accept: application/json
Content-Type: application/json
apiKey: YOUR_API_KEY
```

### Body Parameters
- **username** (String, Required): Your Africa's Talking application username
- **phoneNumbers** (String, Required): List of recipients' phone numbers (e.g., ["+254711XXXYYY"])
- **message** (String, Required): The message to be sent
- **senderId** (String, Required): Your registered short code or alphanumeric
- **enqueue** (Integer, Optional): 1 to enable queue, 0 to disable (default: 1)

## Response Format

```json
{
  "SMSMessageData": {
    "Message": "Sent to 1/1 Total Cost: KES 0.8000",
    "Recipients": [{
      "statusCode": 101,
      "number": "+254711XXXYYY",
      "status": "Success",
      "cost": "KES 0.8000",
      "messageId": "ATPid_SampleTxnId123"
    }]
  }
}
```

## Status Codes
- **100**: Processed
- **101**: Sent
- **102**: Queued
- **401**: RiskHold
- **402**: InvalidSenderId
- **403**: InvalidPhoneNumber
- **404**: UnsupportedNumberType
- **405**: InsufficientBalance
- **406**: UserInBlacklist
- **407**: CouldNotRoute
- **409**: DoNotDisturbRejection
- **500**: InternalServerError
- **501**: GatewayError
- **502**: RejectedByGateway

## Implementation Plan
1. Install Africa's Talking Node.js SDK or use direct HTTP requests
2. Store API credentials in environment variables
3. Create SMS service in server/services/sms.ts
4. Add tRPC endpoint for sending payment reminders
5. Schedule automatic reminders for upcoming loan payments
