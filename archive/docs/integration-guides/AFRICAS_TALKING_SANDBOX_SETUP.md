# Africa's Talking Sandbox Setup Guide

Complete guide for setting up Africa's Talking SMS service in sandbox mode for testing.

## Table of Contents
1. [Account Creation](#account-creation)
2. [Sandbox Configuration](#sandbox-configuration)
3. [Environment Variables](#environment-variables)
4. [Testing SMS Features](#testing-sms-features)
5. [Production Migration](#production-migration)
6. [Troubleshooting](#troubleshooting)

---

## Account Creation

### Step 1: Sign Up for Africa's Talking

1. Visit [https://account.africastalking.com/auth/register](https://account.africastalking.com/auth/register)
2. Fill in your details:
   - **Email**: Your work email
   - **Password**: Strong password (min 8 characters)
   - **Country**: Select your country
   - **Phone Number**: Your mobile number for verification
3. Click **Create Account**
4. Verify your email address (check your inbox)
5. Verify your phone number (SMS code will be sent)

### Step 2: Access Sandbox

1. Log in to your Africa's Talking account
2. You'll automatically be in **Sandbox mode** (free testing environment)
3. Navigate to **Dashboard** to see your sandbox credentials

---

## Sandbox Configuration

### Get Your API Credentials

1. Go to **Settings** → **API Key**
2. Copy your **Sandbox API Key** (starts with `sandbox_`)
3. Your **Username** is `sandbox` (default for all sandbox accounts)

### Sandbox Phone Numbers

Africa's Talking provides test phone numbers for sandbox testing:

- **Test Recipient Numbers** (these numbers will receive SMS in sandbox):
  - `+254711082XXX` (Kenya)
  - `+254733199XXX` (Kenya)
  - `+234803XXX XXXX` (Nigeria)
  - `+256772123XXX` (Uganda)

**Note**: In sandbox mode, SMS will only be sent to these test numbers. Real phone numbers won't receive messages.

### Sandbox Sender ID

- **Default Sender ID**: `AFRICASTKNG` (automatically assigned in sandbox)
- Custom sender IDs require production account

---

## Environment Variables

### Create `.env.local` File

Create a `.env.local` file in your project root:

```bash
# Africa's Talking Configuration
AFRICAS_TALKING_USERNAME=sandbox
AFRICAS_TALKING_API_KEY=your_sandbox_api_key_here
AFRICAS_TALKING_SENDER_ID=AFRICASTKNG
AFRICAS_TALKING_SANDBOX=true

# Optional: Override default phone number for testing
TEST_PHONE_NUMBER=+254711082XXX
```

### Environment Variable Template

Copy the template file:

```bash
cp .env.africastalking.template .env.local
```

Then edit `.env.local` with your actual sandbox API key.

---

## Testing SMS Features

### 1. Test Payment Reminders

**Via API (Postman/curl)**:

```bash
curl -X POST http://localhost:3000/api/trpc/sms.testPaymentReminder \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254711082XXX",
    "borrowerName": "John Doe",
    "amount": 5000000,
    "dueDate": "2024-12-01",
    "loanNumber": "LN-2024-001"
  }'
```

**Via Admin Dashboard** (after Phase 3):
1. Go to `/admin/sms-management`
2. Click **Send Test Reminder**
3. Enter test phone number
4. Click **Send**

### 2. Test Loan Approval Notifications

```bash
curl -X POST http://localhost:3000/api/trpc/sms.testLoanApproval \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+254711082XXX",
    "borrowerName": "Jane Smith",
    "amount": 10000000,
    "loanNumber": "LN-2024-002"
  }'
```

### 3. Test Automated Reminders

The cron job runs daily at 9:00 AM. To test immediately:

1. Temporarily modify `server/init-cron.ts`:
```typescript
// Change from:
cron.schedule('0 9 * * *', async () => {

// To (runs every minute):
cron.schedule('* * * * *', async () => {
```

2. Restart the server
3. Check console logs for reminder execution
4. Revert the change after testing

### 4. Check Sandbox Logs

1. Log in to Africa's Talking dashboard
2. Go to **SMS** → **Logs**
3. View all sent messages with delivery status
4. Filter by date, status, or recipient

---

## Production Migration

### Step 1: Upgrade to Production Account

1. Go to **Settings** → **Account**
2. Click **Upgrade to Production**
3. Complete KYC verification:
   - Upload business registration documents
   - Provide ID verification
   - Add payment method
4. Wait for approval (1-3 business days)

### Step 2: Purchase Credits

1. Go to **Billing** → **Top Up**
2. Select amount (minimum $10 USD)
3. Choose payment method:
   - Credit/Debit Card
   - Mobile Money (M-Pesa, Airtel Money, etc.)
   - Bank Transfer
4. Complete payment

**SMS Pricing** (Nigeria):
- Local SMS: ₦2.50 - ₦4.00 per message
- International SMS: $0.05 - $0.15 per message

### Step 3: Register Sender ID

1. Go to **SMS** → **Sender IDs**
2. Click **Request New Sender ID**
3. Enter your desired sender ID (e.g., `FarmerApp`)
4. Provide business justification
5. Wait for approval (1-2 business days)

### Step 4: Update Environment Variables

```bash
# Production Configuration
AFRICAS_TALKING_USERNAME=your_production_username
AFRICAS_TALKING_API_KEY=your_production_api_key
AFRICAS_TALKING_SENDER_ID=FarmerApp
AFRICAS_TALKING_SANDBOX=false  # IMPORTANT: Set to false
```

### Step 5: Test in Production

1. Send test SMS to your own phone number
2. Verify delivery and sender ID
3. Check billing for credit deduction
4. Monitor delivery reports

---

## Troubleshooting

### Common Issues

#### 1. "Invalid API Key" Error

**Cause**: Wrong API key or username

**Solution**:
- Verify API key in dashboard
- Ensure `AFRICAS_TALKING_USERNAME=sandbox` for sandbox mode
- Check for extra spaces or quotes in `.env.local`

#### 2. "Recipient not allowed in sandbox" Error

**Cause**: Trying to send to real phone number in sandbox mode

**Solution**:
- Use test numbers: `+254711082XXX`, `+254733199XXX`
- Or upgrade to production account

#### 3. SMS Not Delivered

**Sandbox Mode**:
- Check if recipient is a valid test number
- View logs in Africa's Talking dashboard

**Production Mode**:
- Verify sufficient credits
- Check sender ID is approved
- Ensure recipient number is in correct format (+234...)
- Check for DND (Do Not Disturb) restrictions

#### 4. "Insufficient Balance" Error

**Cause**: No credits in account

**Solution**:
- Top up your account
- Minimum $10 USD required

#### 5. Mock Mode Active (No SMS Sent)

**Cause**: Missing API credentials

**Solution**:
- Ensure `.env.local` file exists
- Verify `AFRICAS_TALKING_API_KEY` is set
- Restart the server after adding credentials

### Debug Mode

Enable detailed logging:

```typescript
// In server/services/sms.ts
const DEBUG = true; // Set to true

// You'll see detailed logs:
// [SMS] Sending to +254711082XXX
// [SMS] Message: Your payment of ₦50,000 is due on 2024-12-01
// [SMS] Response: { status: 'success', messageId: 'ATXid_...' }
```

### Test Connectivity

```bash
# Test API connection
curl -X POST https://api.sandbox.africastalking.com/version1/messaging \
  -H "apiKey: your_sandbox_api_key" \
  -H "Accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=sandbox&to=+254711082XXX&message=Test&from=AFRICASTKNG"
```

---

## Best Practices

### 1. Rate Limiting

- Sandbox: 100 SMS per hour
- Production: Depends on your account tier
- Implement exponential backoff for retries

### 2. Message Templates

- Keep messages under 160 characters (1 SMS unit)
- Use clear, concise language
- Include loan number for reference
- Add opt-out instructions for marketing

### 3. Error Handling

```typescript
try {
  const result = await sendPaymentReminder(...);
  if (!result.success) {
    // Log error and retry later
    console.error('SMS failed:', result.error);
  }
} catch (error) {
  // Handle network errors
  console.error('Network error:', error);
}
```

### 4. Cost Optimization

- Batch messages when possible
- Use SMS only for critical notifications
- Implement user preferences (opt-in/opt-out)
- Monitor delivery reports to avoid wasted credits

### 5. Compliance

- Obtain user consent before sending SMS
- Provide opt-out mechanism
- Respect quiet hours (no SMS between 10 PM - 8 AM)
- Follow local telecommunications regulations

---

## Support Resources

- **Documentation**: [https://developers.africastalking.com/docs/sms/overview](https://developers.africastalking.com/docs/sms/overview)
- **API Reference**: [https://developers.africastalking.com/docs/sms/sending](https://developers.africastalking.com/docs/sms/sending)
- **Support Email**: support@africastalking.com
- **Community Slack**: [https://slackin-africastalking.now.sh/](https://slackin-africastalking.now.sh/)
- **Status Page**: [https://status.africastalking.com/](https://status.africastalking.com/)

---

## Next Steps

After completing sandbox setup:

1. ✅ Test all SMS features in sandbox mode
2. ✅ Verify notification preferences work correctly
3. ✅ Test automated payment reminders
4. ⏳ Build admin SMS management dashboard (Phase 3)
5. ⏳ Implement SMS delivery logs (Phase 4)
6. ⏳ Upgrade to production when ready

---

## Quick Reference

| Feature | Sandbox | Production |
|---------|---------|------------|
| **Cost** | Free | ₦2.50-₦4.00/SMS |
| **Recipients** | Test numbers only | Any valid number |
| **Sender ID** | AFRICASTKNG | Custom (after approval) |
| **Rate Limit** | 100/hour | Tier-dependent |
| **Credits Required** | No | Yes |
| **KYC Required** | No | Yes |

---

**Last Updated**: November 2024  
**Version**: 1.0
