# Quick Start: Africa's Talking Setup

**Get your messaging channels up and running in 30 minutes (sandbox) or 3-5 weeks (production).**

---

## 🚀 30-Minute Sandbox Setup

Perfect for testing and development.

### Step 1: Create Account (5 minutes)

1. Visit [https://account.africastalking.com/auth/register](https://account.africastalking.com/auth/register)
2. Fill in registration form
3. Verify email (check inbox)
4. Verify phone (SMS code)

### Step 2: Get API Credentials (2 minutes)

1. Log in to dashboard
2. Navigate to **Apps** → **Create New App**
3. Name: `Farmer Data Collection`
4. Select services: SMS, USSD
5. Click **"Create App"**
6. Copy API credentials:
   ```
   Username: sandbox
   API Key: atsk_xxxxx...
   ```

### Step 3: Configure Environment (3 minutes)

1. Copy environment template:
   ```bash
   cp .env.africastalking.template .env
   ```

2. Edit `.env`:
   ```bash
   AFRICASTALKING_USERNAME=sandbox
   AFRICASTALKING_API_KEY=atsk_xxxxx...
   AFRICASTALKING_ENV=sandbox
   APP_URL=https://your-ngrok-url.ngrok.io
   ```

3. Start development server:
   ```bash
   pnpm dev
   ```

### Step 4: Expose Webhooks (5 minutes)

1. Install ngrok:
   ```bash
   npm install -g ngrok
   ```

2. Expose local server:
   ```bash
   ngrok http 3000
   ```

3. Copy HTTPS URL (e.g., `https://abc123.ngrok.io`)

4. Update `APP_URL` in `.env`

### Step 5: Configure Webhooks (5 minutes)

1. In Africa's Talking dashboard, go to **Sandbox**

2. **USSD** → Set callback URL:
   ```
   https://abc123.ngrok.io/api/trpc/messaging.ussdCallback
   ```

3. **SMS** → Set callback URL:
   ```
   https://abc123.ngrok.io/api/trpc/messaging.smsCallback
   ```

4. **WhatsApp** → Set webhook URL:
   ```
   https://abc123.ngrok.io/api/trpc/messaging.whatsappCallback
   ```

### Step 6: Test (10 minutes)

1. **Test USSD:**
   - Go to **Sandbox** → **USSD** → **Simulator**
   - Dial: `*384*1234#`
   - Follow prompts

2. **Test SMS:**
   - Go to **Sandbox** → **SMS** → **Send SMS**
   - Send: `HELP` to your phone
   - Check response

3. **Test WhatsApp:**
   - Go to **Sandbox** → **WhatsApp**
   - Add sandbox number to WhatsApp
   - Send: `join [code]`
   - Send: `Hi`

**✅ Done! You're now testing in sandbox mode.**

---

## 🏭 Production Setup (3-5 Weeks)

For live deployment with real users.

### Week 1: Account Setup

**Day 1:**
- [ ] Create Africa's Talking account
- [ ] Verify email and phone
- [ ] Complete KYC verification (upload documents)

**Day 2-3:**
- [ ] Wait for KYC approval
- [ ] Fund account ($50 minimum)
- [ ] Create production application

**Day 4-5:**
- [ ] Configure SMS (instant)
- [ ] Apply for WhatsApp Business API (1-2 weeks)
- [ ] Apply for USSD short code (2-4 weeks)

### Week 2-3: WhatsApp Approval

- [ ] Submit business verification to Facebook
- [ ] Wait for approval (1-2 weeks)
- [ ] Configure WhatsApp webhook
- [ ] Create message templates

### Week 3-5: USSD Approval

- [ ] Submit short code application
- [ ] Provide use case documentation
- [ ] Wait for approval (2-4 weeks)
- [ ] Configure USSD callback

### Week 5: Production Deployment

**Day 1:**
- [ ] Deploy application to production server
- [ ] Update environment variables:
  ```bash
  AFRICASTALKING_ENV=production
  AFRICASTALKING_USERNAME=your_production_username
  AFRICASTALKING_API_KEY=atsk_production_key
  APP_URL=https://your-domain.com
  ```

**Day 2:**
- [ ] Configure production webhooks
- [ ] Run validation script:
  ```bash
  npx tsx scripts/validate-africastalking-setup.ts
  ```

**Day 3:**
- [ ] Test all channels end-to-end
- [ ] Monitor logs for errors
- [ ] Set up alerts

**Day 4-5:**
- [ ] Soft launch with 10-20 users
- [ ] Collect feedback
- [ ] Fix issues

**Day 6-7:**
- [ ] Full launch
- [ ] Monitor usage and costs
- [ ] Optimize based on data

---

## 📋 Quick Reference

### Environment Variables

```bash
# Required
AFRICASTALKING_USERNAME=your_username
AFRICASTALKING_API_KEY=atsk_xxxxx...
AFRICASTALKING_ENV=sandbox  # or 'production'
APP_URL=https://your-domain.com

# Optional
AFRICASTALKING_SENDER_ID=FARMDATA
```

### Webhook URLs

```
USSD:     https://your-domain.com/api/trpc/messaging.ussdCallback
SMS:      https://your-domain.com/api/trpc/messaging.smsCallback
WhatsApp: https://your-domain.com/api/trpc/messaging.whatsappCallback
```

### Test Commands

```bash
# Validate setup
npx tsx scripts/validate-africastalking-setup.ts

# Test webhooks
npx tsx scripts/test-webhooks.ts

# Generate deployment configs
npx tsx scripts/deploy-config-generator.ts all
```

### SMS Commands

```
HELP                      - Show commands
REGISTER [name]           - Register account
VERIFY [code]             - Verify phone
HARVEST [crop] [qty]      - Record harvest
EXPENSE [type] [amount]   - Record expense
LIST [crop] [qty] [price] - Create listing
MARKET                    - View marketplace
ORDERS                    - View orders
BALANCE                   - Financial summary
```

### USSD Flow

```
Dial: *384*1234#
  → Welcome Menu
    → 1. Register
    → 2. Login
  → Main Menu
    → 1. Record Harvest
    → 2. Record Expense
    → 3. Marketplace
    → 4. My Orders
    → 5. Financial Report
```

---

## 🆘 Troubleshooting

### Webhook Not Working

```bash
# Check if endpoint is accessible
curl -I https://your-domain.com/api/trpc/messaging.ussdCallback

# Check SSL certificate
openssl s_client -connect your-domain.com:443

# View webhook logs in Africa's Talking dashboard
Dashboard → Sandbox → Logs
```

### Database Not Updating

```bash
# Verify database connection
npx tsx scripts/validate-africastalking-setup.ts

# Check tables exist
psql $DATABASE_URL -c "\dt"

# View error logs
pnpm dev  # Check console for errors
```

### Verification Code Not Working

```sql
-- Check code in database
SELECT verification_code, verification_expires_at 
FROM phone_user_mapping 
WHERE phone_number = '+254712345678';

-- Resend code via USSD or SMS
```

---

## 📚 Documentation

- **Full Setup Guide:** `docs/AFRICAS_TALKING_ACCOUNT_SETUP.md`
- **Deployment Guide:** `docs/MESSAGING_DEPLOYMENT_GUIDE.md`
- **Sandbox Testing:** `docs/SANDBOX_TESTING_GUIDE.md`
- **Multi-Channel Docs:** `docs/MULTI_CHANNEL_ACCESS.md`

---

## 💰 Cost Estimate

### Sandbox (Free)
- Testing: $0
- No limits on test messages
- Full feature access

### Production (Monthly)

**For 1,000 users, 10 interactions/month:**

| Item | Cost |
|------|------|
| USSD messages (5,000) | $50 |
| SMS messages (3,000) | $150 |
| WhatsApp messages (2,000) | $10 |
| USSD short code | $200-500 |
| SMS number | $10-20 |
| **Total** | **$420-730/month** |

**Per user:** $0.42-0.73/month

---

## ✅ Checklist

### Sandbox Setup
- [ ] Account created and verified
- [ ] API credentials saved
- [ ] Environment variables configured
- [ ] Development server running
- [ ] Ngrok exposing webhooks
- [ ] Webhooks configured in dashboard
- [ ] USSD tested in simulator
- [ ] SMS tested with test phone
- [ ] WhatsApp tested in sandbox

### Production Setup
- [ ] KYC verification completed
- [ ] Account funded ($50+)
- [ ] WhatsApp Business API approved
- [ ] USSD short code approved
- [ ] Production server deployed
- [ ] Environment variables updated
- [ ] Webhooks configured
- [ ] End-to-end testing completed
- [ ] Monitoring and alerts set up
- [ ] Soft launch completed

---

## 🚀 Next Steps

**After Sandbox Testing:**
1. Apply for production services (WhatsApp, USSD)
2. Deploy to production server
3. Configure production webhooks
4. Run final tests
5. Launch!

**After Production Launch:**
1. Monitor usage and costs
2. Collect user feedback
3. Optimize flows
4. Scale infrastructure

---

**Need Help?**
- Email: support@africastalking.com
- Slack: https://slackin-africastalking.now.sh/
- Docs: https://developers.africastalking.com/

---

**Last Updated:** November 25, 2025  
**Version:** 1.0  
**Status:** Ready for Use ✅
