# Voice Call (IVR) Guide

Complete guide for implementing and deploying interactive voice response (IVR) system using Africa's Talking Voice API.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Setup & Configuration](#setup--configuration)
5. [Call Flows](#call-flows)
6. [Voice Prompts](#voice-prompts)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Voice IVR system allows farmers to interact with the Farmer Data Collection platform using their phone's keypad (DTMF) and voice recordings. This is especially useful for farmers with feature phones who may find USSD menus too complex or prefer voice interaction.

### Why IVR?

**Advantages over USSD:**
- More natural interaction with voice prompts
- Can record spoken responses (crop names, descriptions)
- Better for complex data entry
- No session timeout issues
- Can call back users

**Advantages over SMS:**
- Interactive, real-time feedback
- Guided workflows reduce errors
- No need to remember command syntax
- Better for illiterate or semi-literate users

### Key Features

✅ **Interactive Voice Menus** - Navigate using phone keypad  
✅ **Voice Recording** - Record crop names and descriptions  
✅ **DTMF Input** - Enter numbers (quantity, price, etc.)  
✅ **Multi-Language Support** - English, Hausa, Yoruba, Igbo  
✅ **Session Management** - Resume interrupted calls  
✅ **Database Integration** - All data saved to database  
✅ **Feature Parity** - Same features as USSD/SMS/WhatsApp  

---

## Features

### Supported Operations

| Feature | DTMF Input | Voice Recording | Status |
|---------|------------|-----------------|--------|
| **User Registration** | ✅ Verification code | ✅ Full name | ✅ Complete |
| **Phone Verification** | ✅ 6-digit code | ❌ | ✅ Complete |
| **Record Harvest** | ✅ Quantity | ✅ Crop name | ✅ Complete |
| **Record Expense** | ✅ Type, Amount | ❌ | ✅ Complete |
| **Financial Report** | ✅ Menu selection | ❌ | ✅ Complete |
| **Marketplace Listing** | ✅ Quantity, Price | ✅ Crop name | 🚧 Coming Soon |
| **Browse Marketplace** | ✅ Navigation | ❌ | 🚧 Coming Soon |
| **Place Order** | ✅ Confirmation | ❌ | 🚧 Coming Soon |
| **View Orders** | ✅ Navigation | ❌ | 🚧 Coming Soon |

### Voice Capabilities

**Text-to-Speech (TTS):**
- Dynamic voice prompts in multiple languages
- Female voice (default) or male voice
- Automatic number and currency pronunciation

**Speech-to-Text (STT):**
- Record crop names, descriptions
- Automatic transcription (future enhancement)
- Fallback to manual entry

**DTMF (Dual-Tone Multi-Frequency):**
- Keypad input for numbers
- Menu navigation (1-9, 0, #, *)
- Timeout handling (30 seconds default)

---

## Architecture

### System Flow

```
┌─────────────┐
│   Farmer    │ (Calls dedicated number)
└──────┬──────┘
       │ Voice Call
       ▼
┌──────────────────┐
│ Africa's Talking │ (Voice Gateway)
│   Voice API      │
└──────┬───────────┘
       │ HTTPS Webhook (XML Response)
       ▼
┌──────────────────┐
│  Voice Router    │ (DTMF processing, TTS)
│ voice-router.ts  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Messaging Service│ (Business logic, DB)
│ messaging-service│
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ PostgreSQL DB    │ (Data persistence)
└──────────────────┘
```

### Call Flow States

```
WELCOME
  ├─> REGISTER_NAME (voice recording)
  │   └─> REGISTER_VERIFY (DTMF code)
  │       └─> MAIN_MENU
  │
  ├─> LOGIN (check user)
  │   └─> MAIN_MENU
  │
  └─> HELP

MAIN_MENU
  ├─> HARVEST_CROP (voice recording)
  │   └─> HARVEST_QUANTITY (DTMF)
  │       └─> MAIN_MENU
  │
  ├─> EXPENSE_TYPE (DTMF selection)
  │   └─> EXPENSE_AMOUNT (DTMF)
  │       └─> MAIN_MENU
  │
  ├─> FINANCIAL_REPORT
  │   └─> MAIN_MENU
  │
  └─> LOGOUT
```

### XML Response Format

Africa's Talking Voice API uses XML responses to control call flow:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="30" numDigits="1" finishOnKey="#">
    <Say>Press 1 to register, 2 to login, or 0 for help.</Say>
  </GetDigits>
</Response>
```

**Key XML Elements:**
- `<Say>` - Text-to-speech
- `<GetDigits>` - Collect DTMF input
- `<Record>` - Record voice
- `<Play>` - Play audio file
- `<Dial>` - Forward call
- `<Redirect>` - Redirect to another URL
- `<Reject>` - Reject call

---

## Setup & Configuration

### Prerequisites

- Africa's Talking account with Voice API enabled
- Dedicated phone number or short code
- Production server with HTTPS
- Database configured

### Step 1: Enable Voice API

1. Log in to [Africa's Talking Dashboard](https://account.africastalking.com/)

2. Navigate to **Voice** → **Settings**

3. Click **"Enable Voice API"**

4. Purchase a dedicated number:
   - Navigate to **Voice** → **Phone Numbers**
   - Click **"Buy Number"**
   - Select country and number type
   - Cost: $10-50/month depending on country

### Step 2: Configure Webhook

1. Navigate to **Voice** → **Callback URLs**

2. Set callback URL:
   ```
   https://your-domain.com/api/trpc/voice.voiceCallback
   ```

3. Click **"Save"**

### Step 3: Environment Variables

Add to `.env`:

```bash
# Voice API Configuration
AFRICASTALKING_VOICE_NUMBER=+254712345678  # Your dedicated number
AFRICASTALKING_VOICE_ENABLED=true

# Optional: Custom voice settings
AFRICASTALKING_VOICE_TYPE=woman  # or 'man'
AFRICASTALKING_VOICE_TIMEOUT=30  # seconds
```

### Step 4: Test Configuration

```bash
# Validate setup
npx tsx scripts/validate-africastalking-setup.ts

# Test voice webhook
curl -X POST https://your-domain.com/api/trpc/voice.voiceCallback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=test_001&isActive=1&callerNumber=+254712345678&dtmfDigits="
```

---

## Call Flows

### 1. New User Registration

**Objective:** Register new user via voice call

**Flow:**

1. **Farmer calls dedicated number**
   ```
   Voice: "Welcome to Farmer Data Collection. 
          Press 1 to register, 2 to login, or 0 for help."
   ```

2. **Farmer presses 1**
   ```
   Voice: "Please say your full name after the beep, 
          then press the hash key."
   [BEEP]
   ```

3. **Farmer says name: "John Farmer"**
   ```
   Voice: "A verification code has been sent to your phone. 
          Please enter your 6 digit verification code, 
          followed by the hash key."
   ```

4. **Farmer enters code: 123456#**
   ```
   Voice: "Phone number verified successfully. 
          [Main Menu]"
   ```

**Database Updates:**
- User created in `users` table
- Farmer profile created in `farmers` table
- Phone mapping created in `phone_user_mapping` table
- Verification code validated

### 2. Record Harvest

**Objective:** Record harvest data via voice call

**Prerequisites:** User must be logged in

**Flow:**

1. **From main menu, farmer presses 1**
   ```
   Voice: "Please say the crop name after the beep, 
          then press the hash key."
   [BEEP]
   ```

2. **Farmer says: "Maize"**
   ```
   Voice: "Crop: Maize. 
          Enter quantity in kilograms using your keypad, 
          followed by the hash key."
   ```

3. **Farmer enters: 100#**
   ```
   Voice: "Harvest recorded successfully. 
          [Main Menu]"
   ```

**Database Updates:**
- Harvest record created in `harvests` table
- Crop name: "Maize"
- Quantity: 100 kg
- User ID: linked to caller
- Timestamp: current time

### 3. Record Expense

**Objective:** Record expense via voice call

**Flow:**

1. **From main menu, farmer presses 2**
   ```
   Voice: "Select expense type. 
          Press 1 for seeds, 2 for fertilizer, 3 for labor, 
          4 for equipment, 5 for other."
   ```

2. **Farmer presses 2 (Fertilizer)**
   ```
   Voice: "Please enter the amount using your keypad, 
          followed by the hash key."
   ```

3. **Farmer enters: 5000#**
   ```
   Voice: "Expense recorded successfully. 
          [Main Menu]"
   ```

**Database Updates:**
- Expense record created in `expenses` table
- Type: "Fertilizer"
- Amount: 5000
- Description: "Recorded via voice call"
- User ID: linked to caller

### 4. Financial Report

**Objective:** Get financial summary via voice call

**Flow:**

1. **From main menu, farmer presses 5**
   ```
   Voice: "Monthly financial report. 
          Revenue: 25,000 Naira. 
          Expenses: 10,000 Naira. 
          Profit: 15,000 Naira. 
          [Main Menu]"
   ```

**Data Source:**
- Query `harvests` table for revenue
- Query `expenses` table for expenses
- Calculate profit: revenue - expenses
- Filter by current month and user ID

---

## Voice Prompts

### English Prompts

```javascript
{
  welcome: 'Welcome to Farmer Data Collection. Press 1 to register, 2 to login, or 0 for help.',
  mainMenu: 'Main menu. Press 1 to record harvest, 2 to record expense, 3 for marketplace, 4 for orders, 5 for financial report, or 0 to logout.',
  enterName: 'Please say your full name after the beep, then press the hash key.',
  enterVerificationCode: 'Please enter your 6 digit verification code, followed by the hash key.',
  verificationSuccess: 'Phone number verified successfully.',
  harvestRecorded: 'Harvest recorded successfully.',
  expenseRecorded: 'Expense recorded successfully.',
  goodbye: 'Thank you for using Farmer Data Collection. Goodbye.',
}
```

### Hausa Prompts

```javascript
{
  welcome: 'Barka da zuwa Farmer Data Collection. Danna 1 don yin rajista, 2 don shiga, ko 0 don taimako.',
  mainMenu: 'Babban menu. Danna 1 don rubuta girbi, 2 don rubuta kashe kuɗi, 3 don kasuwa, 4 don oda, 5 don rahoton kuɗi, ko 0 don fita.',
  goodbye: 'Na gode da amfani da Farmer Data Collection. Sai an jima.',
}
```

### Yoruba Prompts

```javascript
{
  welcome: 'Kaabo si Farmer Data Collection. Tẹ 1 lati forukọsilẹ, 2 lati wọle, tabi 0 fun iranlọwọ.',
  mainMenu: 'Akojọ aṣayan akọkọ. Tẹ 1 lati ṣe igbasilẹ ikore, 2 lati ṣe igbasilẹ inawo, 3 fun ọja, 4 fun awọn aṣẹ, 5 fun iroyin owo, tabi 0 lati jade.',
  goodbye: 'O ṣeun fun lilo Farmer Data Collection. O dabọ.',
}
```

### Igbo Prompts

```javascript
{
  welcome: 'Nnọọ na Farmer Data Collection. Pịa 1 iji debanye aha, 2 iji banye, ma ọ bụ 0 maka enyemaka.',
  mainMenu: 'Menu isi. Pịa 1 iji dekọọ owuwe ihe, 2 iji dekọọ mmefu ego, 3 maka ahịa, 4 maka iwu, 5 maka akụkọ ego, ma ọ bụ 0 iji pụọ.',
  goodbye: 'Daalụ maka iji Farmer Data Collection. Ka ọ dị.',
}
```

### Adding Custom Prompts

1. Edit `server/voice-router.ts`

2. Add to `VOICE_PROMPTS` object:
   ```typescript
   const VOICE_PROMPTS = {
     en: {
       // ... existing prompts
       customPrompt: 'Your custom message here.',
     },
     ha: {
       // ... Hausa translation
       customPrompt: 'Saƙon ku na al\'ada a nan.',
     },
   };
   ```

3. Use in call flow:
   ```typescript
   builder.say(getPrompt(session.language, 'customPrompt'));
   ```

---

## Testing

### Sandbox Testing

1. **Navigate to Voice Simulator:**
   - Dashboard → Voice → Simulator

2. **Enter test number:** `+254712345678`

3. **Click "Call"**

4. **Test flow:**
   - Listen to welcome prompt
   - Press keys to navigate
   - Record voice when prompted
   - Verify database updates

### Production Testing

1. **Call dedicated number** from your phone

2. **Test all flows:**
   - Registration
   - Login
   - Record harvest
   - Record expense
   - Financial report

3. **Verify database:**
   ```sql
   -- Check user created
   SELECT * FROM users WHERE phone_number = '+254712345678';
   
   -- Check harvest recorded
   SELECT * FROM harvests WHERE user_id = (
     SELECT id FROM users WHERE phone_number = '+254712345678'
   ) ORDER BY created_at DESC LIMIT 1;
   
   -- Check expense recorded
   SELECT * FROM expenses WHERE user_id = (
     SELECT id FROM users WHERE phone_number = '+254712345678'
   ) ORDER BY created_at DESC LIMIT 1;
   ```

### Automated Testing

```bash
# Test voice webhook
npx tsx scripts/test-voice-webhook.ts

# Expected output:
# ✅ Voice webhook accessible
# ✅ Welcome menu works
# ✅ Registration flow works
# ✅ Harvest recording works
# ✅ Expense recording works
# ✅ Financial report works
```

---

## Deployment

### Production Checklist

- [ ] Africa's Talking Voice API enabled
- [ ] Dedicated phone number purchased
- [ ] Webhook URL configured
- [ ] Environment variables set
- [ ] HTTPS enabled on production server
- [ ] Database migrations applied
- [ ] Voice prompts tested in all languages
- [ ] Call flows tested end-to-end
- [ ] Monitoring and alerts configured

### Cost Estimation

**For 1,000 users, 10 calls/month:**

| Item | Cost |
|------|------|
| Dedicated number | $20/month |
| Voice calls (10,000 @ $0.03/min) | $300/month (avg 1 min/call) |
| Recording storage | $5/month |
| **Total** | **$325/month** |

**Per User:** $0.33/month

**Cost Optimization:**
- Keep calls short (< 2 minutes)
- Use DTMF instead of voice recording where possible
- Cache frequently accessed data
- Implement call-back system for long operations

---

## Monitoring

### Key Metrics

1. **Call Volume**
   ```sql
   SELECT COUNT(*) as total_calls
   FROM message_logs
   WHERE channel = 'voice'
   AND created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Average Call Duration**
   ```sql
   SELECT AVG(CAST(duration_in_seconds AS INTEGER)) as avg_duration
   FROM message_logs
   WHERE channel = 'voice'
   AND duration_in_seconds IS NOT NULL;
   ```

3. **Success Rate**
   ```sql
   SELECT 
     COUNT(CASE WHEN status = 'success' THEN 1 END)::FLOAT / COUNT(*) as success_rate
   FROM message_logs
   WHERE channel = 'voice'
   AND created_at > NOW() - INTERVAL '24 hours';
   ```

4. **Top Features Used**
   ```sql
   SELECT state, COUNT(*) as usage_count
   FROM voice_sessions
   GROUP BY state
   ORDER BY usage_count DESC
   LIMIT 10;
   ```

### Alerts

Set up alerts for:
- Call failure rate > 10%
- Average call duration > 5 minutes
- Webhook response time > 2 seconds
- Daily call volume spike (> 50% increase)

---

## Troubleshooting

### Issue: Webhook Not Receiving Calls

**Symptoms:**
- Calls connect but no voice prompts
- Africa's Talking shows webhook errors

**Solutions:**

1. **Verify webhook URL:**
   ```bash
   curl -I https://your-domain.com/api/trpc/voice.voiceCallback
   ```

2. **Check SSL certificate:**
   ```bash
   openssl s_client -connect your-domain.com:443
   ```

3. **Review webhook logs:**
   - Dashboard → Voice → Logs
   - Look for 4xx/5xx errors

4. **Test locally with ngrok:**
   ```bash
   ngrok http 3000
   # Update webhook URL in dashboard
   ```

### Issue: Voice Prompts Not Playing

**Symptoms:**
- Call connects but silent
- DTMF input not working

**Solutions:**

1. **Check XML response:**
   ```bash
   curl -X POST https://your-domain.com/api/trpc/voice.voiceCallback \
     -d "sessionId=test&isActive=1&callerNumber=+254712345678"
   ```

2. **Verify response format:**
   - Must start with `<?xml version="1.0" encoding="UTF-8"?>`
   - Must contain `<Response>` root element
   - `<Say>` text must be properly escaped

3. **Test with simple prompt:**
   ```typescript
   return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Test</Say></Response>';
   ```

### Issue: DTMF Input Not Recognized

**Symptoms:**
- User presses keys but nothing happens
- "Invalid input" errors

**Solutions:**

1. **Check `<GetDigits>` configuration:**
   ```xml
   <GetDigits timeout="30" numDigits="1" finishOnKey="#">
     <Say>Press a key</Say>
   </GetDigits>
   ```

2. **Verify `dtmfDigits` parameter:**
   ```typescript
   console.log('DTMF input:', input.dtmfDigits);
   ```

3. **Increase timeout:**
   ```typescript
   builder.getDigits(prompt, 1, 60, '#'); // 60 seconds
   ```

### Issue: Voice Recording Not Saved

**Symptoms:**
- Recording completes but file not available
- `recordingUrl` is empty

**Solutions:**

1. **Check `<Record>` configuration:**
   ```xml
   <Record maxLength="60" timeout="5" finishOnKey="#">
     <Say>Record your message</Say>
   </Record>
   ```

2. **Verify webhook receives recording URL:**
   ```typescript
   console.log('Recording URL:', input.recordingUrl);
   ```

3. **Download and save recording:**
   ```typescript
   if (input.recordingUrl) {
     const response = await fetch(input.recordingUrl);
     const buffer = await response.arrayBuffer();
     // Save to S3 or local storage
   }
   ```

### Issue: Session Timeout

**Symptoms:**
- User disconnected mid-call
- "Session timed out" message

**Solutions:**

1. **Increase session timeout:**
   ```typescript
   expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 minutes
   ```

2. **Implement session resume:**
   ```typescript
   if (session.expiresAt < new Date()) {
     // Offer to resume instead of starting over
     builder.say('Your session expired. Press 1 to resume or 2 to start over.');
   }
   ```

3. **Reduce menu depth:**
   - Combine related options
   - Add shortcuts to main menu

---

## Cost Comparison

### Voice vs Other Channels (1,000 users, 10 interactions/month)

| Channel | Monthly Cost | Per User | Notes |
|---------|--------------|----------|-------|
| **Voice (IVR)** | $325 | $0.33 | Dedicated number + calls |
| **USSD** | $250 | $0.25 | Short code + sessions |
| **SMS** | $150 | $0.15 | Commands only |
| **WhatsApp** | $10 | $0.01 | Cheapest, but requires smartphone |

### When to Use Voice

**Best for:**
- Illiterate or semi-literate users
- Complex data entry (voice recording)
- Users who prefer voice over text
- Regions with poor internet connectivity

**Not ideal for:**
- Simple commands (use SMS)
- High-volume operations (use WhatsApp)
- Cost-sensitive deployments (use USSD)

---

## Next Steps

1. **Test in sandbox** - Use Voice Simulator to test all flows

2. **Purchase dedicated number** - Buy production number for live calls

3. **Configure webhook** - Set production webhook URL

4. **Launch soft test** - Invite 10-20 users to test

5. **Monitor and optimize** - Track metrics and improve flows

6. **Scale up** - Roll out to all users

---

**Last Updated:** November 25, 2025  
**Version:** 1.0  
**Status:** ✅ Production Ready
