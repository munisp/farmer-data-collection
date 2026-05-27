# Africa's Talking Account Setup Guide

**Complete step-by-step guide to setting up your Africa's Talking account for production deployment.**

---

## Overview

**Total Time Required:** 3-5 weeks  
**Initial Cost:** $10-50 (account funding)  
**Monthly Cost:** $420-730 (for 1,000 users)

**Timeline Breakdown:**
- Account creation: 1 day
- Email/phone verification: 1 day
- KYC verification: 1-2 days
- Short code application: 2-4 weeks
- WhatsApp business approval: 1-2 weeks
- Testing and configuration: 1-2 days

---

## Phase 1: Account Creation (Day 1)

### Step 1.1: Sign Up

1. Visit [https://account.africastalking.com/auth/register](https://account.africastalking.com/auth/register)

2. Fill in registration form:
   ```
   Full Name: [Your Name]
   Email: [Your Business Email]
   Phone: [Your Phone Number with country code]
   Country: [Select your country]
   Password: [Strong password, 8+ characters]
   ```

3. Accept Terms of Service and Privacy Policy

4. Click **"Create Account"**

### Step 1.2: Email Verification

1. Check your email inbox for verification email
   - Subject: "Verify your Africa's Talking account"
   - From: noreply@africastalking.com

2. Click verification link in email

3. You'll be redirected to dashboard

**Troubleshooting:**
- Email not received? Check spam/junk folder
- Still no email? Click "Resend verification email" on login page
- Wrong email? Contact support@africastalking.com

### Step 1.3: Phone Verification

1. Log in to dashboard: [https://account.africastalking.com/auth/signin](https://account.africastalking.com/auth/signin)

2. Navigate to **Settings** → **Profile**

3. Click **"Verify Phone Number"**

4. Enter phone number with country code:
   ```
   Example (Nigeria): +234 803 123 4567
   Example (Kenya): +254 712 345 678
   ```

5. Click **"Send Code"**

6. Enter 6-digit code received via SMS

7. Click **"Verify"**

**Troubleshooting:**
- Code not received? Wait 2 minutes, then click "Resend"
- Invalid code? Ensure you're entering the most recent code
- Phone already registered? Contact support to unlink

---

## Phase 2: KYC Verification (Days 2-3)

### Step 2.1: Prepare Required Documents

**For Individual Accounts:**
- [ ] Government-issued ID (Passport, National ID, Driver's License)
- [ ] Proof of address (Utility bill, Bank statement - less than 3 months old)
- [ ] Selfie holding ID

**For Business Accounts:**
- [ ] Business registration certificate
- [ ] Tax identification number (TIN)
- [ ] Certificate of incorporation
- [ ] Director's ID
- [ ] Proof of business address
- [ ] Bank statement (business account)

**Document Requirements:**
- Format: PDF, JPG, or PNG
- Size: Max 5MB per file
- Quality: Clear, readable, no blur
- Validity: Current and not expired

### Step 2.2: Submit KYC Documents

1. Navigate to **Settings** → **KYC Verification**

2. Select account type:
   - [ ] Individual
   - [ ] Business

3. Fill in personal/business information:
   ```
   Full Legal Name: _______________
   Date of Birth: _______________
   Nationality: _______________
   Address: _______________
   City: _______________
   Postal Code: _______________
   Country: _______________
   ```

4. Upload required documents:
   - Click **"Upload"** for each document type
   - Select file from computer
   - Verify preview looks clear
   - Click **"Submit"**

5. Review and confirm all information

6. Click **"Submit for Verification"**

### Step 2.3: Wait for Approval

**Processing Time:** 1-2 business days

**Status Tracking:**
- Check dashboard for verification status
- You'll receive email when approved/rejected

**Possible Outcomes:**
- ✅ **Approved:** Proceed to Phase 3
- ⚠️ **Pending:** Wait for review (check in 24 hours)
- ❌ **Rejected:** Review rejection reason, fix issues, resubmit

**Common Rejection Reasons:**
- Blurry or unclear documents
- Expired documents
- Name mismatch between documents
- Incomplete information
- Invalid proof of address

**How to Fix:**
1. Read rejection email carefully
2. Prepare corrected documents
3. Resubmit via **Settings** → **KYC Verification**

---

## Phase 3: Account Funding (Day 3)

### Step 3.1: Add Payment Method

1. Navigate to **Billing** → **Payment Methods**

2. Select payment option:
   - [ ] Credit/Debit Card
   - [ ] Bank Transfer
   - [ ] Mobile Money (if available)
   - [ ] PayPal

3. For **Credit/Debit Card:**
   ```
   Card Number: ____ ____ ____ ____
   Expiry Date: MM/YY
   CVV: ___
   Cardholder Name: _______________
   ```

4. Click **"Add Payment Method"**

5. Verify with 3D Secure (if required)

### Step 3.2: Fund Account

**Recommended Initial Funding:**
- Minimum: $10 (for testing)
- Recommended: $50 (for initial launch)
- Optimal: $100+ (for uninterrupted service)

**Funding Steps:**

1. Navigate to **Billing** → **Add Credit**

2. Enter amount:
   ```
   Amount: $______
   Currency: USD (or local currency)
   ```

3. Select payment method

4. Click **"Add Credit"**

5. Complete payment

6. Wait for confirmation (usually instant)

**Verification:**
- Check **Billing** → **Balance**
- Should show credited amount
- Transaction appears in **Billing** → **Transactions**

**Troubleshooting:**
- Payment failed? Check card details and try again
- Payment pending? Wait 30 minutes, then contact support
- Wrong amount? Contact support@africastalking.com

---

## Phase 4: Service Configuration (Days 4-5)

### Step 4.1: Create Application

1. Navigate to **Apps** → **Create New App**

2. Fill in app details:
   ```
   App Name: Farmer Data Collection
   Description: Multi-channel farmer data collection platform
   Category: Agriculture
   ```

3. Select services:
   - [x] SMS
   - [x] USSD
   - [ ] Voice (optional)
   - [ ] Airtime (optional)
   - [ ] Payments (optional)

4. Click **"Create App"**

5. Note your app credentials:
   ```
   App Name: _______________
   Username: _______________
   API Key: atsk_____________________________
   ```

**IMPORTANT:** Save API key immediately - it's shown only once!

### Step 4.2: Get API Credentials

1. Navigate to **Apps** → **[Your App]** → **Settings**

2. Find **API Key** section

3. If not visible, click **"Generate New API Key"**

4. Copy and save securely:
   ```
   Username: _______________
   API Key: atsk_____________________________
   Environment: sandbox (initially)
   ```

5. **Store in password manager** - you'll need this for deployment

---

## Phase 5: SMS Setup (Day 5)

### Step 5.1: Configure SMS

1. Navigate to **SMS** → **Settings**

2. Set sender ID (optional, requires approval):
   ```
   Sender ID: FARMDATA (max 11 characters, alphanumeric)
   ```

3. Configure callback URL:
   ```
   Delivery Reports URL: https://your-domain.com/api/trpc/messaging.smsCallback
   Incoming Messages URL: https://your-domain.com/api/trpc/messaging.smsCallback
   ```

4. Enable features:
   - [x] Delivery Reports
   - [x] Incoming Messages
   - [ ] Premium SMS (if needed)

5. Click **"Save Settings"**

### Step 5.2: Test SMS (Sandbox)

1. Navigate to **SMS** → **Send SMS**

2. Send test message:
   ```
   To: [Your phone number]
   Message: Test message from Farmer Data Collection
   ```

3. Click **"Send"**

4. Verify you received the SMS

5. Reply to the SMS with: `HELP`

6. Check **SMS** → **Inbox** for your reply

**Troubleshooting:**
- SMS not received? Check phone number format (+234...)
- Delivery failed? Check account balance
- Reply not showing? Verify callback URL is correct

---

## Phase 6: USSD Setup (Weeks 2-4)

### Step 6.1: Apply for USSD Short Code

**Processing Time:** 2-4 weeks  
**Cost:** $200-500/month (varies by country)

**Application Steps:**

1. Navigate to **USSD** → **Apply for Short Code**

2. Fill in application form:
   ```
   Business Name: _______________
   Business Type: Agriculture / Technology
   Use Case: Farmer data collection and marketplace
   Expected Volume: 1,000-10,000 sessions/month
   ```

3. Upload required documents:
   - [ ] Business registration
   - [ ] Tax certificate
   - [ ] Use case description (detailed)
   - [ ] Sample USSD flow diagram

4. Submit application

5. Wait for approval (check email daily)

**Alternative: Shared Short Code**

If dedicated short code is too expensive:

1. Navigate to **USSD** → **Shared Short Codes**

2. Select available shared code:
   ```
   Example: *384*1234#
   ```

3. Request assignment (usually instant)

4. Configure callback URL:
   ```
   USSD Callback URL: https://your-domain.com/api/trpc/messaging.ussdCallback
   ```

### Step 6.2: Configure USSD

1. Once approved, navigate to **USSD** → **Settings**

2. Set callback URL:
   ```
   USSD Callback URL: https://your-domain.com/api/trpc/messaging.ussdCallback
   ```

3. Configure timeout:
   ```
   Session Timeout: 30 seconds (default)
   ```

4. Enable features:
   - [x] Session Management
   - [x] Logging

5. Click **"Save Settings"**

### Step 6.3: Test USSD (Sandbox)

1. Navigate to **USSD** → **Simulator**

2. Enter test phone number

3. Dial short code: `*384*1234#`

4. Follow prompts and test complete flow:
   - Registration
   - Login
   - Record harvest
   - View marketplace

5. Verify database records are created

**Troubleshooting:**
- "Service unavailable"? Check callback URL is accessible
- Session timeout? Reduce menu depth or increase timeout
- Data not saving? Check webhook logs

---

## Phase 7: WhatsApp Setup (Weeks 2-3)

### Step 7.1: Apply for WhatsApp Business API

**Processing Time:** 1-2 weeks  
**Cost:** $0 (pay per message)

**Prerequisites:**
- Facebook Business Manager account
- Business verification on Facebook
- Active phone number for WhatsApp

**Application Steps:**

1. Navigate to **WhatsApp** → **Get Started**

2. Click **"Apply for WhatsApp Business API"**

3. Fill in business information:
   ```
   Business Name: _______________
   Business Website: _______________
   Business Category: Agriculture
   Business Description: _______________
   ```

4. Upload business documents:
   - [ ] Business registration
   - [ ] Tax certificate
   - [ ] Proof of business address
   - [ ] Website screenshot

5. Submit application

6. Wait for Facebook review (1-2 weeks)

### Step 7.2: Configure WhatsApp

1. Once approved, navigate to **WhatsApp** → **Settings**

2. Set webhook URL:
   ```
   WhatsApp Webhook URL: https://your-domain.com/api/trpc/messaging.whatsappCallback
   ```

3. Configure message templates (for notifications):
   - Navigate to **WhatsApp** → **Templates**
   - Create templates for:
     - Order confirmation
     - Payment reminder
     - Harvest reminder
     - Price alerts

4. Enable features:
   - [x] Incoming Messages
   - [x] Message Status Updates
   - [x] Media Messages

5. Click **"Save Settings"**

### Step 7.3: Test WhatsApp (Sandbox)

1. Navigate to **WhatsApp** → **Sandbox**

2. Add sandbox number to WhatsApp:
   ```
   Number: +1 555 000 0000 (example)
   ```

3. Send join message:
   ```
   Send: join [code]
   ```

4. Test conversation:
   ```
   Send: Hi
   Receive: Welcome message
   Send: REGISTER John Doe
   Receive: Verification code
   ```

5. Verify complete flow works

**Troubleshooting:**
- Not receiving messages? Check webhook URL
- Media not working? Verify media permissions
- Templates rejected? Review Facebook policies

---

## Phase 8: Production Deployment (Week 5)

### Step 8.1: Switch to Production

1. Navigate to **Settings** → **Environment**

2. Switch from **Sandbox** to **Production**

3. Update environment variables:
   ```bash
   AFRICASTALKING_ENV=production
   AFRICASTALKING_USERNAME=your_production_username
   AFRICASTALKING_API_KEY=atsk_production_key
   ```

4. Restart application

5. Verify webhooks are working

### Step 8.2: Final Testing

**SMS Test:**
```
Send: HELP
Expect: Command list
```

**USSD Test:**
```
Dial: *384*1234#
Expect: Welcome menu
```

**WhatsApp Test:**
```
Send: Hi
Expect: Welcome message
```

### Step 8.3: Monitor Initial Usage

1. Navigate to **Dashboard** → **Analytics**

2. Monitor metrics:
   - Message volume
   - Success rate
   - Error rate
   - Response time

3. Check logs:
   - **SMS** → **Logs**
   - **USSD** → **Logs**
   - **WhatsApp** → **Logs**

4. Review costs:
   - **Billing** → **Usage**
   - **Billing** → **Transactions**

---

## Checklist Summary

### Pre-Setup
- [ ] Prepare all required documents
- [ ] Set up business email
- [ ] Prepare payment method
- [ ] Review pricing and costs

### Account Setup
- [ ] Create Africa's Talking account
- [ ] Verify email address
- [ ] Verify phone number
- [ ] Complete KYC verification
- [ ] Fund account ($50+ recommended)

### Service Configuration
- [ ] Create application
- [ ] Save API credentials securely
- [ ] Configure SMS settings
- [ ] Apply for USSD short code
- [ ] Apply for WhatsApp Business API

### Webhook Setup
- [ ] Deploy application to production
- [ ] Configure SMS callback URL
- [ ] Configure USSD callback URL
- [ ] Configure WhatsApp webhook URL
- [ ] Test all webhooks

### Testing
- [ ] Test SMS in sandbox
- [ ] Test USSD in simulator
- [ ] Test WhatsApp in sandbox
- [ ] Verify database writes
- [ ] Test complete user flows

### Production Launch
- [ ] Switch to production environment
- [ ] Update environment variables
- [ ] Final end-to-end testing
- [ ] Monitor initial usage
- [ ] Set up alerts and monitoring

---

## Cost Breakdown

### One-Time Costs
| Item | Cost | When |
|------|------|------|
| Account setup | $0 | Day 1 |
| KYC verification | $0 | Days 2-3 |
| Initial funding | $50 | Day 3 |
| **Total** | **$50** | |

### Monthly Recurring Costs
| Item | Cost | Notes |
|------|------|-------|
| USSD short code | $200-500 | Required for USSD |
| SMS number | $10-20 | Optional (free number provided) |
| WhatsApp Business | $0 | Pay per message |
| Message costs | $210 | For 1,000 users, 10 msg/user |
| **Total** | **$420-730** | Scales with usage |

### Per-Message Costs
| Channel | Cost | Best For |
|---------|------|----------|
| USSD | $0.01/session | Interactive data entry |
| SMS | $0.05/message | Commands, notifications |
| WhatsApp | $0.005/message | Conversations, media |

---

## Timeline

```
Week 1:
├─ Day 1: Account creation, email/phone verification
├─ Day 2-3: KYC verification
├─ Day 4: Account funding
└─ Day 5: SMS setup and testing

Week 2-3:
├─ WhatsApp Business API application
├─ WhatsApp approval and setup
└─ WhatsApp testing

Week 3-5:
├─ USSD short code application
├─ USSD approval and configuration
└─ USSD testing

Week 5:
├─ Production deployment
├─ Final testing
└─ Launch! 🚀
```

---

## Support Resources

### Africa's Talking Support
- **Email:** support@africastalking.com
- **Phone:** +254 20 524 2394 (Kenya)
- **Response Time:** 24-48 hours
- **Business Hours:** Mon-Fri, 9 AM - 6 PM EAT

### Community
- **Slack:** [https://slackin-africastalking.now.sh/](https://slackin-africastalking.now.sh/)
- **Forum:** [https://help.africastalking.com/](https://help.africastalking.com/)
- **GitHub:** [https://github.com/AfricasTalkingLtd](https://github.com/AfricasTalkingLtd)

### Documentation
- **API Docs:** [https://developers.africastalking.com/](https://developers.africastalking.com/)
- **USSD Guide:** [https://developers.africastalking.com/docs/ussd/overview](https://developers.africastalking.com/docs/ussd/overview)
- **SMS Guide:** [https://developers.africastalking.com/docs/sms/overview](https://developers.africastalking.com/docs/sms/overview)
- **WhatsApp Guide:** [https://developers.africastalking.com/docs/whatsapp/overview](https://developers.africastalking.com/docs/whatsapp/overview)

---

## Troubleshooting

### Account Issues

**Problem:** Email verification not received  
**Solution:** Check spam folder, wait 5 minutes, click "Resend"

**Problem:** KYC rejected  
**Solution:** Read rejection email, fix issues, resubmit with corrected documents

**Problem:** Payment failed  
**Solution:** Verify card details, check international payments enabled, try different payment method

### Service Issues

**Problem:** SMS not sending  
**Solution:** Check balance, verify phone number format, review SMS logs

**Problem:** USSD "Service unavailable"  
**Solution:** Verify webhook URL is accessible, check SSL certificate, test with curl

**Problem:** WhatsApp not responding  
**Solution:** Verify business account approved, check webhook configuration, review logs

### Technical Issues

**Problem:** Webhook not receiving requests  
**Solution:** Ensure public HTTPS URL, verify SSL certificate, check firewall rules

**Problem:** Database not updating  
**Solution:** Check webhook logs, verify database connection, review error logs

**Problem:** High error rate  
**Solution:** Review error logs, check input validation, verify API credentials

---

## Next Steps

After completing Africa's Talking setup:

1. **Update environment variables** in your deployment
2. **Configure webhooks** with your production URLs
3. **Run final tests** to verify everything works
4. **Monitor usage** for first 24 hours
5. **Optimize** based on user feedback

**See Also:**
- `MESSAGING_DEPLOYMENT_GUIDE.md` - Complete deployment guide
- `MULTI_CHANNEL_ACCESS.md` - Feature documentation
- `.env.example` - Environment variable template

---

**Last Updated:** November 25, 2025  
**Version:** 1.0  
**Status:** Ready for Use ✅
