# Multi-Channel Access: USSD, SMS, WhatsApp

## Overview

The Farmer Data Collection platform provides **three communication channels** for feature phone and messaging app access:

1. **USSD** - Interactive menu-driven interface for feature phones
2. **SMS** - Command-based text messaging for simple data entry
3. **WhatsApp** - Rich conversational interface with media support

This ensures **inclusive access** for all farmers, regardless of device capability.

---

## USSD (Unstructured Supplementary Service Data)

### Shortcode
Dial: `*384*1234#` (example - configure with Africa's Talking)

### Menu Structure

```
Main Menu
├── 1. Record Harvest
│   ├── Enter crop name
│   ├── Enter quantity (kg)
│   └── Confirmation
├── 2. Record Expense
│   ├── Select type (Seeds/Fertilizer/Labor/Equipment/Other)
│   ├── Enter amount
│   └── Confirmation
├── 3. View Marketplace
│   ├── Browse listings
│   ├── Search by crop
│   └── My listings
├── 4. Create Listing
│   ├── Enter crop name
│   ├── Enter quantity
│   ├── Enter price per kg
│   └── Confirmation
├── 5. My Orders
│   └── View order status
├── 6. Financial Report
│   └── View revenue/expenses/profit summary
└── 7. Register/Login
    └── Enter name for registration
```

### Session Management
- **Session Duration**: 30 minutes
- **State Persistence**: PostgreSQL `messaging_sessions` table
- **Context Storage**: JSONB field for multi-step flows

### Example Flow: Record Harvest

```
User: *384*1234#
System: CON Welcome to Farmer Data Collection
        1. Record Harvest
        2. Record Expense
        ...
        
User: 1
System: CON Record Harvest
        1. Enter crop name
        0. Back to main menu
        
User: 1
System: CON Enter crop name (e.g., Maize, Rice, Beans):

User: Maize
System: CON Crop: Maize
        Enter quantity harvested (kg):
        
User: 100
System: END Harvest recorded successfully!
        Crop: Maize
        Quantity: 100 kg
        Thank you!
```

---

## SMS (Short Message Service)

### Command Format

```
COMMAND [parameter1] [parameter2] ...
```

### Available Commands

| Command | Format | Example | Description |
|---------|--------|---------|-------------|
| `HARVEST` | `HARVEST [crop] [quantity]` | `HARVEST Maize 100` | Record harvest data |
| `EXPENSE` | `EXPENSE [type] [amount]` | `EXPENSE Seeds 50` | Record expense |
| `MARKET` | `MARKET` | `MARKET` | View recent marketplace listings |
| `REPORT` | `REPORT` | `REPORT` | Get financial summary |
| `HELP` | `HELP` | `HELP` | List all available commands |

### Example Interactions

**Record Harvest:**
```
Farmer: HARVEST Maize 100
System: Harvest recorded: Maize 100kg. Thank you!
```

**Record Expense:**
```
Farmer: EXPENSE Fertilizer 75
System: Expense recorded: Fertilizer $75. Thank you!
```

**View Marketplace:**
```
Farmer: MARKET
System: Recent listings:
        1. Maize 100kg $50
        2. Rice 50kg $75
        Reply with number for details
```

**Get Help:**
```
Farmer: HELP
System: Commands:
        HARVEST [crop] [qty]
        EXPENSE [type] [amount]
        MARKET
        REPORT
```

### SMS Notifications

Farmers automatically receive SMS notifications for:
- Order confirmations
- Payment received
- New messages from buyers
- Listing expiration reminders

---

## WhatsApp Business API

### Setup

1. **Africa's Talking WhatsApp**: Integrated via `africastalking` SDK
2. **Phone Number**: Configure WhatsApp Business number
3. **Webhook URL**: `https://your-domain.com/api/trpc/messaging.whatsappCallback`

### Conversational Interface

WhatsApp provides a **rich conversational experience** with:
- Natural language processing
- Interactive buttons and quick replies
- Media attachments (photos, location)
- Persistent chat history

### Example Conversations

**Record Harvest:**
```
Farmer: Hi
Bot: 👋 Welcome to Farmer Data Collection!
     What would you like to do?
     
     [Record Harvest] [Record Expense] [Marketplace]
     
Farmer: [Record Harvest]
Bot: Great! What crop did you harvest?

Farmer: Maize
Bot: How much Maize did you harvest? (in kg)

Farmer: 150
Bot: ✅ Harvest recorded successfully!
     Crop: Maize
     Quantity: 150 kg
```

**Create Marketplace Listing:**
```
Farmer: I want to sell my produce
Bot: Perfect! Let's create a listing.
     What are you selling?
     
Farmer: Rice
Bot: How much Rice do you have? (in kg)

Farmer: 200
Bot: What's your price per kg?

Farmer: 2.5
Bot: 📸 Do you have a photo of your Rice?
     [Upload Photo] [Skip]
     
Farmer: [Uploads photo]
Bot: ✅ Listing created successfully!
     Your Rice is now available in the marketplace.
     
     View listing: https://your-domain.com/marketplace/123
```

### WhatsApp Notifications

Rich notifications with:
- Order details with product images
- Payment confirmations with receipts
- Buyer messages with quick reply buttons
- Location sharing for delivery coordination

---

## Technical Implementation

### Database Schema

```sql
-- Session Management
messaging_sessions (
  session_id, phone_number, channel, user_id,
  state, context, last_activity, expires_at
)

-- Message Logs
message_logs (
  session_id, phone_number, channel, direction,
  message_text, message_data, status, created_at
)

-- Phone-User Mapping
phone_user_mapping (
  phone_number, user_id, verified,
  verification_code, verification_expires_at
)

-- Notification Queue
notification_queue (
  user_id, phone_number, channel, notification_type,
  message_text, status, scheduled_at, sent_at
)
```

### API Endpoints

All channels are handled through tRPC procedures:

```typescript
// USSD Webhook
messaging.ussdCallback({ sessionId, serviceCode, phoneNumber, text })

// SMS Webhook
messaging.smsCallback({ from, text, linkId, id })

// WhatsApp Webhook
messaging.whatsappCallback({ from, text, messageId })

// Send Notification
messaging.sendNotification({ phoneNumber, channel, message })
```

### Africa's Talking Configuration

```bash
# Environment Variables
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_USERNAME=your_username

# Webhook URLs (configure in Africa's Talking dashboard)
USSD: https://your-domain.com/api/trpc/messaging.ussdCallback
SMS: https://your-domain.com/api/trpc/messaging.smsCallback
WhatsApp: https://your-domain.com/api/trpc/messaging.whatsappCallback
```

---

## Testing

### Local Testing with Africa's Talking Simulator

1. **USSD Simulator**: https://simulator.africastalking.com:1517/
2. **SMS Simulator**: Send test SMS via dashboard
3. **WhatsApp Sandbox**: Use sandbox number for testing

### Test Scenarios

1. **USSD Flow**: Navigate through all menu options
2. **SMS Commands**: Test all command formats
3. **WhatsApp Conversation**: Test multi-turn dialogues
4. **Session Expiry**: Verify 30-minute timeout
5. **Error Handling**: Test invalid inputs
6. **Notifications**: Verify delivery across all channels

---

## Production Deployment

### 1. Register with Africa's Talking
- Create account at https://africastalking.com
- Purchase shortcode for USSD
- Configure SMS sender ID
- Set up WhatsApp Business number

### 2. Configure Webhooks
- Set USSD callback URL
- Set SMS callback URL
- Set WhatsApp callback URL
- Enable delivery reports

### 3. Set Environment Variables
```bash
AFRICASTALKING_API_KEY=your_production_api_key
AFRICASTALKING_USERNAME=your_production_username
```

### 4. Test in Production
- Test USSD with real shortcode
- Send test SMS to production number
- Test WhatsApp with business number

---

## Cost Estimates (Africa's Talking - Kenya)

| Channel | Cost per Message | Notes |
|---------|------------------|-------|
| **USSD** | KES 0.50 - 2.00 per session | Depends on session length |
| **SMS** | KES 0.80 per SMS | Bulk rates available |
| **WhatsApp** | KES 0.50 per message | Business API pricing |

**Monthly Estimate for 1,000 farmers:**
- 1,000 farmers × 10 USSD sessions/month = KES 10,000
- 1,000 farmers × 5 SMS notifications/month = KES 4,000
- 500 farmers × 10 WhatsApp messages/month = KES 2,500
- **Total: ~KES 16,500/month (~$125 USD)**

---

## User Documentation

### For Farmers (English/Swahili)

**USSD:**
```
Dial *384*1234# to access the platform
Follow the menu prompts
Press 0 to go back
Session expires after 30 minutes
```

**SMS:**
```
Send commands to 1234
HARVEST Maize 100 - Record harvest
EXPENSE Seeds 50 - Record expense
MARKET - View listings
HELP - Get all commands
```

**WhatsApp:**
```
Save +254712345678 as "Farm Data"
Send "Hi" to start
Follow the conversation
Send photos of your produce
```

---

## Analytics

Track channel usage in `message_logs` table:

```sql
-- Channel usage statistics
SELECT 
  channel,
  COUNT(*) as total_messages,
  COUNT(DISTINCT phone_number) as unique_users,
  DATE(created_at) as date
FROM message_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY channel, DATE(created_at)
ORDER BY date DESC;
```

---

## Future Enhancements

1. **Voice IVR**: Add voice call support for illiterate farmers
2. **Multilingual**: Support Swahili, Kikuyu, Luo, etc.
3. **AI Chatbot**: Natural language understanding for WhatsApp
4. **Offline SMS Sync**: Queue SMS when network unavailable
5. **USSD Push**: Proactive notifications via USSD push

---

## Support

For technical issues:
- Email: support@farmdata.com
- WhatsApp: +254712345678
- SMS: Send "HELP" to 1234
