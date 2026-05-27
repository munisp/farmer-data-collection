# Sandbox Testing Guide

Complete guide for testing USSD, SMS, and WhatsApp features in Africa's Talking sandbox environment before going live.

---

## Table of Contents

1. [Overview](#overview)
2. [Sandbox Setup](#sandbox-setup)
3. [USSD Testing](#ussd-testing)
4. [SMS Testing](#sms-testing)
5. [WhatsApp Testing](#whatsapp-testing)
6. [Test Scenarios](#test-scenarios)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Sandbox?

Africa's Talking sandbox is a **free testing environment** that simulates real messaging channels without incurring costs. It's perfect for:

- Testing webhook integration
- Validating user flows
- Training your team
- Demonstrating features to stakeholders

### Sandbox vs Production

| Feature | Sandbox | Production |
|---------|---------|------------|
| **Cost** | Free | Pay per message |
| **Phone Numbers** | Test numbers only | Real phone numbers |
| **Short Codes** | Simulated | Requires approval |
| **Features** | All features available | All features available |
| **Data** | Isolated test database | Production database |
| **Reliability** | Best effort | 99.9%+ SLA |

### Prerequisites

- [ ] Africa's Talking account created
- [ ] Email and phone verified
- [ ] Application created in dashboard
- [ ] API credentials saved
- [ ] Development server running locally or deployed

---

## Sandbox Setup

### Step 1: Configure Sandbox Environment

1. Update `.env` file:
   ```bash
   AFRICASTALKING_ENV=sandbox
   AFRICASTALKING_USERNAME=sandbox
   AFRICASTALKING_API_KEY=your_api_key
   APP_URL=https://your-dev-server.com
   ```

2. Restart your application:
   ```bash
   pnpm dev
   ```

3. Verify environment:
   ```bash
   npx tsx scripts/validate-africastalking-setup.ts
   ```

### Step 2: Configure Webhooks in Dashboard

1. Log in to [Africa's Talking Dashboard](https://account.africastalking.com/)

2. Navigate to **Sandbox** → **USSD**
   - Set callback URL: `https://your-dev-server.com/api/trpc/messaging.ussdCallback`
   - Click **"Save"**

3. Navigate to **Sandbox** → **SMS**
   - Set callback URL: `https://your-dev-server.com/api/trpc/messaging.smsCallback`
   - Click **"Save"**

4. Navigate to **Sandbox** → **WhatsApp**
   - Set webhook URL: `https://your-dev-server.com/api/trpc/messaging.whatsappCallback`
   - Click **"Save"**

**Note:** Webhooks must be publicly accessible HTTPS URLs. Use ngrok for local testing:

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use generated URL for webhooks
https://abc123.ngrok.io/api/trpc/messaging.ussdCallback
```

### Step 3: Verify Webhook Connectivity

Run automated tests:

```bash
# TypeScript version
npx tsx scripts/test-webhooks.ts

# Bash version
./scripts/test-webhooks.sh
```

Expected output:
```
✅ USSD endpoint accessible
✅ SMS endpoint accessible
✅ WhatsApp endpoint accessible
```

---

## USSD Testing

### Accessing USSD Simulator

1. Navigate to **Sandbox** → **USSD** → **Simulator**

2. Enter test phone number: `+254712345678`

3. Click **"Start Session"**

### Test Scenario 1: New User Registration

**Objective:** Register a new user via USSD

**Steps:**

1. Dial: `*384*1234#`
   ```
   Expected Response:
   CON Welcome to Farmer Data Collection
   1. Register
   2. Login
   0. Help
   ```

2. Enter: `1` (Register)
   ```
   Expected Response:
   CON Enter your full name:
   ```

3. Enter: `John Farmer`
   ```
   Expected Response:
   CON Verification code sent to +254712345678
   Enter code:
   ```

4. Check database for verification code:
   ```sql
   SELECT verification_code 
   FROM phone_user_mapping 
   WHERE phone_number = '+254712345678'
   ORDER BY created_at DESC LIMIT 1;
   ```

5. Enter verification code (e.g., `123456`)
   ```
   Expected Response:
   END ✓ Registration successful!
   Welcome, John Farmer
   ```

6. Verify user created:
   ```sql
   SELECT * FROM users WHERE phone_number = '+254712345678';
   SELECT * FROM farmers WHERE phone_number = '+254712345678';
   ```

**Success Criteria:**
- ✅ User record created in `users` table
- ✅ Farmer profile created in `farmers` table
- ✅ Phone mapping created in `phone_user_mapping` table
- ✅ Verification code matches database

### Test Scenario 2: Record Harvest

**Objective:** Record harvest data via USSD

**Prerequisites:** User must be registered and logged in

**Steps:**

1. Dial: `*384*1234#`
   ```
   Expected Response:
   CON Welcome back, John Farmer
   1. Record Harvest
   2. Record Expense
   3. Marketplace
   4. My Orders
   5. Financial Report
   0. Logout
   ```

2. Enter: `1` (Record Harvest)
   ```
   Expected Response:
   CON Enter crop name:
   (e.g., Maize, Rice, Wheat)
   ```

3. Enter: `Maize`
   ```
   Expected Response:
   CON Crop: Maize
   Enter quantity (kg):
   ```

4. Enter: `100`
   ```
   Expected Response:
   END ✓ Harvest recorded!
   Crop: Maize
   Quantity: 100kg
   Date: Nov 25, 2025
   ```

5. Verify harvest created:
   ```sql
   SELECT * FROM harvests 
   WHERE user_id = (SELECT id FROM users WHERE phone_number = '+254712345678')
   ORDER BY created_at DESC LIMIT 1;
   ```

**Success Criteria:**
- ✅ Harvest record created with correct crop and quantity
- ✅ User ID matches registered user
- ✅ Timestamp is current
- ✅ Farm ID is set (default farm if not specified)

### Test Scenario 3: Multi-Language Support

**Objective:** Test USSD in different languages

**Steps:**

1. Dial: `*384*1234#`
   ```
   Expected Response:
   CON Welcome to Farmer Data Collection
   Select language:
   1. English
   2. Hausa
   3. Yoruba
   4. Igbo
   ```

2. Enter: `2` (Hausa)
   ```
   Expected Response (in Hausa):
   CON Barka da zuwa Farmer Data Collection
   1. Yi rajista
   2. Shiga
   0. Taimako
   ```

3. Navigate through menus in Hausa

4. Switch back to English:
   - Main Menu → Settings → Language → English

**Success Criteria:**
- ✅ All menus translated correctly
- ✅ Data entry prompts in selected language
- ✅ Error messages in selected language
- ✅ Language preference persists across sessions

---

## SMS Testing

### Sending Test SMS

1. Navigate to **Sandbox** → **SMS** → **Send SMS**

2. Enter details:
   ```
   To: +254712345678 (your test number)
   Message: HELP
   ```

3. Click **"Send"**

4. Check **SMS** → **Inbox** for response

### Test Scenario 1: Command Help

**Objective:** Get list of available commands

**Steps:**

1. Send SMS: `HELP`

2. Expected response:
   ```
   📱 Farmer Data Collection Commands:
   
   REGISTER [name] - Register account
   VERIFY [code] - Verify phone
   HARVEST [crop] [qty] - Record harvest
   EXPENSE [type] [amount] - Record expense
   LIST [crop] [qty] [price] - Create listing
   MARKET - View marketplace
   ORDERS - View your orders
   BALANCE - Financial summary
   HELP - Show this help
   ```

**Success Criteria:**
- ✅ Response received within 5 seconds
- ✅ All commands listed
- ✅ Format is clear and readable

### Test Scenario 2: Register via SMS

**Objective:** Register new user via SMS

**Steps:**

1. Send SMS: `REGISTER Jane Doe`

2. Expected response:
   ```
   ✓ Registration initiated!
   Verification code: 123456
   Reply VERIFY 123456 to complete.
   ```

3. Send SMS: `VERIFY 123456`

4. Expected response:
   ```
   ✅ Phone number verified!
   You can now use all features.
   Reply HELP for commands.
   ```

5. Verify in database:
   ```sql
   SELECT * FROM users WHERE phone_number = '+254712345678';
   SELECT is_verified FROM phone_user_mapping WHERE phone_number = '+254712345678';
   ```

**Success Criteria:**
- ✅ User created with correct name
- ✅ Verification code sent
- ✅ Phone number verified after VERIFY command
- ✅ `is_verified` = true in database

### Test Scenario 3: Record Harvest via SMS

**Objective:** Record harvest using SMS command

**Prerequisites:** User must be registered and verified

**Steps:**

1. Send SMS: `HARVEST Maize 100`

2. Expected response:
   ```
   ✓ Harvest recorded!
   Crop: Maize
   Quantity: 100kg
   Date: Nov 25, 2025
   ```

3. Verify in database:
   ```sql
   SELECT * FROM harvests 
   WHERE user_id = (SELECT id FROM users WHERE phone_number = '+254712345678')
   ORDER BY created_at DESC LIMIT 1;
   ```

**Success Criteria:**
- ✅ Harvest created with correct crop and quantity
- ✅ Response confirms details
- ✅ Database record matches SMS input

### Test Scenario 4: Financial Report

**Objective:** Get financial summary via SMS

**Steps:**

1. Send SMS: `BALANCE`

2. Expected response:
   ```
   📊 Financial Summary (This Month)
   💵 Revenue: ₦0
   💸 Expenses: ₦0
   💰 Profit: ₦0
   
   Reply HELP for more commands.
   ```

**Success Criteria:**
- ✅ Response shows current month
- ✅ Revenue, expenses, profit calculated correctly
- ✅ Currency symbol correct for region

---

## WhatsApp Testing

### Joining Sandbox

1. Navigate to **Sandbox** → **WhatsApp**

2. Note the sandbox number: `+1 555 000 0000` (example)

3. Add number to WhatsApp

4. Send join message: `join [code]`
   ```
   Example: join abc123
   ```

5. Receive confirmation:
   ```
   You are now connected to the sandbox!
   ```

### Test Scenario 1: Conversational Registration

**Objective:** Register using natural language

**Steps:**

1. Send: `Hi`

2. Expected response:
   ```
   👋 Welcome to Farmer Data Collection!
   
   To get started, please register:
   Reply with: REGISTER [Your Full Name]
   
   Example: REGISTER John Doe
   ```

3. Send: `REGISTER Alice Farmer`

4. Expected response:
   ```
   ✓ Registration initiated!
   
   Verification code: 123456
   
   Reply with: VERIFY 123456
   ```

5. Send: `VERIFY 123456`

6. Expected response:
   ```
   ✅ Phone number verified!
   
   You can now use all features. Reply 'menu' to see options.
   ```

**Success Criteria:**
- ✅ Natural greeting recognized
- ✅ Registration flow clear
- ✅ Verification successful
- ✅ Rich formatting (emojis, bold) used

### Test Scenario 2: Natural Language Harvest

**Objective:** Record harvest using conversational language

**Steps:**

1. Send: `I harvested 100kg of maize today`

2. Expected response:
   ```
   ✅ Harvest recorded successfully!
   
   🌾 Crop: Maize
   📊 Quantity: 100kg
   📅 Date: Nov 25, 2025
   
   What else would you like to do?
   • Record expense
   • View marketplace
   • Create listing
   • Financial report
   ```

3. Verify in database:
   ```sql
   SELECT * FROM harvests 
   WHERE user_id = (SELECT id FROM users WHERE phone_number = '+254712345678')
   ORDER BY created_at DESC LIMIT 1;
   ```

**Success Criteria:**
- ✅ Natural language parsed correctly
- ✅ Crop name extracted (Maize)
- ✅ Quantity extracted (100)
- ✅ Database record created
- ✅ Response uses rich formatting

### Test Scenario 3: Marketplace Browsing

**Objective:** Browse marketplace via WhatsApp

**Steps:**

1. Send: `Show me what's available in the marketplace`

2. Expected response:
   ```
   🛒 Marketplace Listings
   
   1. 🌾 Maize - 50kg @ ₦5,000/kg
      Seller: John Farmer
      Location: Lagos
   
   2. 🌾 Rice - 100kg @ ₦8,000/kg
      Seller: Jane Doe
      Location: Abuja
   
   Reply with listing number to order, or 'sell' to create your own listing.
   ```

3. Send: `1`

4. Expected response:
   ```
   📦 Order Details
   
   Product: Maize
   Quantity: 50kg
   Price: ₦5,000/kg
   Total: ₦250,000
   
   Confirm order? Reply 'yes' to proceed.
   ```

5. Send: `yes`

6. Expected response:
   ```
   ✅ Order placed successfully!
   
   Order ID: #12345
   Status: Pending
   
   The seller has been notified. You'll receive updates via WhatsApp.
   ```

**Success Criteria:**
- ✅ Listings displayed with details
- ✅ Order confirmation flow works
- ✅ Order created in database
- ✅ Seller notified (check message_logs)

---

## Test Scenarios

### Comprehensive Test Matrix

| Scenario | USSD | SMS | WhatsApp | Priority |
|----------|------|-----|----------|----------|
| User registration | ✅ | ✅ | ✅ | High |
| Phone verification | ✅ | ✅ | ✅ | High |
| Record harvest | ✅ | ✅ | ✅ | High |
| Record expense | ✅ | ✅ | ✅ | High |
| Create listing | ✅ | ✅ | ✅ | Medium |
| Browse marketplace | ✅ | ✅ | ✅ | Medium |
| Place order | ✅ | ❌ | ✅ | Medium |
| View orders | ✅ | ✅ | ✅ | Medium |
| Financial report | ✅ | ✅ | ✅ | High |
| Multi-language | ✅ | ❌ | ❌ | Low |
| Error handling | ✅ | ✅ | ✅ | High |
| Session timeout | ✅ | N/A | ✅ | Medium |
| Rate limiting | ✅ | ✅ | ✅ | Low |

### Test Data

**Test Users:**
```
User 1:
  Name: John Farmer
  Phone: +254712345678
  Crops: Maize, Rice
  Location: Lagos, Nigeria

User 2:
  Name: Jane Doe
  Phone: +254723456789
  Crops: Wheat, Cassava
  Location: Abuja, Nigeria

User 3:
  Name: Alice Smith
  Phone: +254734567890
  Crops: Tomatoes, Peppers
  Location: Nairobi, Kenya
```

**Test Harvests:**
```
Harvest 1: Maize, 100kg, Nov 25, 2025
Harvest 2: Rice, 50kg, Nov 24, 2025
Harvest 3: Wheat, 75kg, Nov 23, 2025
```

**Test Expenses:**
```
Expense 1: Seeds, ₦5,000, Nov 25, 2025
Expense 2: Fertilizer, ₦10,000, Nov 24, 2025
Expense 3: Labor, ₦15,000, Nov 23, 2025
```

**Test Listings:**
```
Listing 1: Maize, 50kg, ₦5,000/kg, John Farmer
Listing 2: Rice, 100kg, ₦8,000/kg, Jane Doe
Listing 3: Wheat, 75kg, ₦6,000/kg, Alice Smith
```

---

## Troubleshooting

### Common Issues

#### 1. Webhook Not Receiving Requests

**Symptoms:**
- USSD shows "Service unavailable"
- SMS commands not responded to
- WhatsApp messages not received

**Solutions:**

1. Verify webhook URL is publicly accessible:
   ```bash
   curl -I https://your-domain.com/api/trpc/messaging.ussdCallback
   ```

2. Check SSL certificate:
   ```bash
   openssl s_client -connect your-domain.com:443
   ```

3. Review webhook logs in Africa's Talking dashboard:
   - Navigate to **Sandbox** → **Logs**
   - Look for failed webhook calls

4. Test locally with ngrok:
   ```bash
   ngrok http 3000
   # Update webhook URL in dashboard
   ```

#### 2. Verification Code Not Working

**Symptoms:**
- User enters code but verification fails

**Solutions:**

1. Check code in database:
   ```sql
   SELECT verification_code, verification_expires_at 
   FROM phone_user_mapping 
   WHERE phone_number = '+254712345678';
   ```

2. Verify code hasn't expired (10 minutes):
   ```sql
   SELECT verification_expires_at > NOW() as is_valid
   FROM phone_user_mapping 
   WHERE phone_number = '+254712345678';
   ```

3. Resend code via USSD/SMS

#### 3. Data Not Saving to Database

**Symptoms:**
- Operations complete but no database records

**Solutions:**

1. Check database connection:
   ```bash
   npx tsx scripts/validate-africastalking-setup.ts
   ```

2. Review application logs:
   ```bash
   pnpm dev
   # Look for database errors
   ```

3. Verify tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

4. Check for transaction errors:
   ```sql
   SELECT * FROM message_logs 
   WHERE status = 'error' 
   ORDER BY created_at DESC LIMIT 10;
   ```

#### 4. USSD Session Timeout

**Symptoms:**
- User gets disconnected mid-flow

**Cause:** Session expired (30 minutes default)

**Solutions:**

1. Extend timeout in `messaging-router.ts`:
   ```typescript
   expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 minutes
   ```

2. Reduce menu depth to speed up interactions

3. Add session resume functionality

#### 5. Rate Limit Exceeded

**Symptoms:**
- "Too many requests" error

**Cause:** More than 10 requests in 1 minute

**Solutions:**

1. Wait 1 minute and try again

2. Adjust rate limit in `messaging-router.ts`:
   ```typescript
   const RATE_LIMIT = 20; // Increase from 10 to 20
   ```

3. Implement exponential backoff for retries

---

## Testing Checklist

### Before Testing
- [ ] Sandbox environment configured
- [ ] Webhooks set up in dashboard
- [ ] Development server running
- [ ] Database migrations applied
- [ ] Test data prepared

### USSD Testing
- [ ] Initial dial works
- [ ] Registration flow complete
- [ ] Login flow complete
- [ ] Harvest recording works
- [ ] Expense recording works
- [ ] Marketplace browsing works
- [ ] Order placement works
- [ ] Financial report works
- [ ] Multi-language works
- [ ] Error handling works
- [ ] Session timeout works

### SMS Testing
- [ ] HELP command works
- [ ] REGISTER command works
- [ ] VERIFY command works
- [ ] HARVEST command works
- [ ] EXPENSE command works
- [ ] LIST command works
- [ ] MARKET command works
- [ ] ORDERS command works
- [ ] BALANCE command works
- [ ] Invalid command handling works

### WhatsApp Testing
- [ ] Initial greeting works
- [ ] Registration flow works
- [ ] Natural language parsing works
- [ ] Harvest recording works
- [ ] Expense recording works
- [ ] Marketplace browsing works
- [ ] Order placement works
- [ ] Financial report works
- [ ] Error handling works

### Database Verification
- [ ] Users created correctly
- [ ] Farmers created correctly
- [ ] Harvests created correctly
- [ ] Expenses created correctly
- [ ] Orders created correctly
- [ ] Phone mappings created correctly
- [ ] Sessions managed correctly
- [ ] Message logs recorded correctly

### Cross-Channel Testing
- [ ] Data syncs across channels
- [ ] User can switch between channels
- [ ] Session state isolated per channel
- [ ] Authentication works across channels

---

## Next Steps

After successful sandbox testing:

1. **Switch to Production:**
   - Update `AFRICASTALKING_ENV=production`
   - Update webhook URLs to production domain
   - Fund account with $50+

2. **Monitor Initial Usage:**
   - Check message logs
   - Review error rates
   - Monitor response times

3. **Optimize Based on Feedback:**
   - Adjust menu flows
   - Improve error messages
   - Add missing features

4. **Scale Up:**
   - Increase rate limits
   - Add load balancing
   - Set up monitoring alerts

---

**Last Updated:** November 25, 2025  
**Version:** 1.0  
**Status:** Ready for Use ✅
