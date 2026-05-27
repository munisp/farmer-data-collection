# Africa's Talking SMS Integration Guide

This guide provides comprehensive instructions for integrating Africa's Talking SMS service into the Farmer Data Collection microfinance platform for automated payment reminders and notifications.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Account Setup](#account-setup)
4. [API Configuration](#api-configuration)
5. [Testing with Sandbox](#testing-with-sandbox)
6. [Production Deployment](#production-deployment)
7. [SMS Features](#sms-features)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

Africa's Talking is a leading SMS gateway provider in Africa that enables businesses to send bulk SMS, receive SMS, and integrate voice services. Our platform uses it to:

- Send automated payment reminders 3 days before due dates
- Notify borrowers of loan approvals and disbursements
- Alert users about overdue payments
- Send marketing messages (with user consent)

**Current Implementation:**
- **Service:** `server/services/sms.ts` - Core SMS sending functionality
- **Cron Job:** `server/services/payment-reminder-cron.ts` - Automated daily reminders
- **Mock Mode:** Enabled by default for development/testing without API credentials

---

## Prerequisites

Before you begin, ensure you have:

1. **Business Registration:** A registered business or organization (required for production accounts)
2. **Phone Number:** A valid phone number for account verification
3. **Email Address:** For account notifications and API key delivery
4. **Payment Method:** Credit card or mobile money for purchasing SMS credits

---

## Account Setup

### Step 1: Create an Account

1. Visit [Africa's Talking](https://africastalking.com/)
2. Click **"Sign Up"** in the top right corner
3. Choose your account type:
   - **Sandbox Account** (Free, for testing) - Recommended to start
   - **Live Account** (Production, requires business verification)

4. Fill in the registration form:
   - Full Name
   - Email Address
   - Phone Number (will be verified)
   - Password
   - Country

5. Verify your email address by clicking the link sent to your inbox
6. Verify your phone number by entering the OTP sent via SMS

### Step 2: Access the Dashboard

1. Log in to [Africa's Talking Dashboard](https://account.africastalking.com/)
2. You'll see your dashboard with:
   - Account balance
   - API credentials
   - SMS statistics
   - Sender IDs

---

## API Configuration

### Step 3: Get API Credentials

1. In the dashboard, navigate to **"Settings"** → **"API Key"**
2. Click **"Generate API Key"**
3. Copy your API key (you'll only see it once - save it securely!)
4. Note your **Username**:
   - Sandbox: `sandbox`
   - Production: Your custom username (usually your business name)

### Step 4: Configure Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Africa's Talking API Configuration
AFRICASTALKING_API_KEY=your_api_key_here
AFRICASTALKING_USERNAME=sandbox  # or your production username

# Optional: Custom Sender ID (requires approval)
# AFRICASTALKING_SENDER_ID=YourBrand
```

**Important Notes:**
- Never commit your API key to version control
- Keep your `.env` file in `.gitignore`
- Use different API keys for development and production

### Step 5: Install Dependencies

The Africa's Talking SDK is already installed in this project:

```bash
pnpm add africastalking
```

If you need to reinstall:

```bash
pnpm install
```

---

## Testing with Sandbox

### Sandbox Environment

The sandbox is a free testing environment that simulates SMS sending without actually delivering messages or charging your account.

**Sandbox Limitations:**
- SMS are not actually sent to recipients
- Only test phone numbers work
- No charges incurred
- Perfect for development and testing

### Test Phone Numbers

Africa's Talking provides test phone numbers for sandbox testing:

```
+254711XXXYYY
+254733YYYZZZ
```

Replace `XXX`, `YYY`, `ZZZ` with any digits.

### Testing Payment Reminders

1. **Enable Mock Mode** (default if no API key is set):
   ```typescript
   // In server/services/sms.ts
   const useMockMode = !process.env.AFRICASTALKING_API_KEY;
   ```

2. **Trigger Manual Test:**
   ```bash
   # The cron job runs automatically at 9:00 AM daily
   # For manual testing, you can trigger it via the admin panel
   ```

3. **Check Console Logs:**
   ```
   [SMS] MOCK MODE - SMS would be sent:
   [SMS] To: +254711XXXYYY
   [SMS] From: Default
   [SMS] Message: Dear John Doe, this is a reminder...
   [SMS] ----------------------------------------
   ```

### Testing with Sandbox API

1. Set your sandbox credentials in `.env`:
   ```bash
   AFRICASTALKING_API_KEY=your_sandbox_api_key
   AFRICASTALKING_USERNAME=sandbox
   ```

2. Use test phone numbers in your database
3. Trigger the payment reminder cron job
4. Check the Africa's Talking dashboard for delivery reports

---

## Production Deployment

### Step 6: Upgrade to Live Account

1. Log in to your Africa's Talking account
2. Navigate to **"Settings"** → **"Account Type"**
3. Click **"Upgrade to Live Account"**
4. Complete the verification process:
   - Submit business registration documents
   - Verify business phone number
   - Provide business address
   - Wait for approval (usually 1-3 business days)

### Step 7: Purchase SMS Credits

1. Navigate to **"Billing"** → **"Buy Airtime"**
2. Choose your payment method:
   - Credit/Debit Card
   - Mobile Money (M-Pesa, Airtel Money, etc.)
   - Bank Transfer
3. Enter the amount (minimum varies by country)
4. Complete the payment

**SMS Pricing (approximate):**
- Kenya: ~KES 0.80 per SMS
- Nigeria: ~NGN 2.50 per SMS
- Uganda: ~UGX 35 per SMS
- Tanzania: ~TZS 25 per SMS

### Step 8: Request a Sender ID (Optional)

A sender ID is the name that appears as the sender of your SMS (e.g., "YourBank" instead of a phone number).

1. Navigate to **"SMS"** → **"Sender IDs"**
2. Click **"Request Sender ID"**
3. Fill in the form:
   - Sender ID (max 11 characters, alphanumeric)
   - Purpose (e.g., "Payment reminders for microfinance platform")
   - Sample message
4. Submit for approval (takes 1-5 business days)

**Sender ID Guidelines:**
- Must be alphanumeric (no special characters)
- Maximum 11 characters
- Should represent your brand/business
- Cannot be a phone number
- Must comply with local regulations

### Step 9: Update Production Environment

1. Update your production `.env` file:
   ```bash
   AFRICASTALKING_API_KEY=your_production_api_key
   AFRICASTALKING_USERNAME=your_production_username
   AFRICASTALKING_SENDER_ID=YourBrand  # if approved
   ```

2. Deploy your application with the new credentials

3. Monitor the first few SMS sends to ensure everything works correctly

---

## SMS Features

### 1. Automated Payment Reminders

**Implementation:** `server/services/payment-reminder-cron.ts`

**Schedule:** Daily at 9:00 AM

**Logic:**
- Checks for payments due in the next 3 days
- Sends SMS reminders to borrowers with pending payments
- Respects user SMS preferences (can be disabled per user)

**Message Format:**
```
Dear [Borrower Name], this is a reminder that your loan payment of [Amount] to [Loan Number] is due on [Due Date]. Please ensure timely payment to avoid penalties.
```

**Customization:**
```typescript
// In server/services/payment-reminder-cron.ts
const cronSchedule = '0 0 9 * * *'; // Change time here (HH:MM:SS format)

// In server/services/sms.ts
export async function sendPaymentReminder(...) {
  const message = `Your custom message here`;
  // ...
}
```

### 2. Loan Approval Notifications

Send SMS when a loan application is approved:

```typescript
import { sendSMS } from './services/sms';

await sendSMS({
  to: borrower.phoneNumber,
  message: `Congratulations! Your loan application for ${amount} has been approved. Funds will be disbursed within 24 hours.`,
});
```

### 3. Loan Disbursement Notifications

Notify borrowers when funds are disbursed:

```typescript
await sendSMS({
  to: borrower.phoneNumber,
  message: `Your loan of ${amount} has been disbursed to your account ${accountNumber}. Thank you for choosing us!`,
});
```

### 4. Overdue Payment Alerts

Send alerts for overdue payments:

```typescript
await sendSMS({
  to: borrower.phoneNumber,
  message: `URGENT: Your loan payment of ${amount} was due on ${dueDate}. Please pay immediately to avoid additional penalties.`,
});
```

### 5. User Notification Preferences

Users can manage their SMS preferences via the Borrower Dashboard:

**Database Schema:** `drizzle/user-preferences-schema.ts`

**Preferences:**
- Enable/disable all SMS notifications
- Payment reminders (on/off)
- Loan approval notifications (on/off)
- Loan disbursement notifications (on/off)
- Overdue notifications (on/off)
- Marketing messages (on/off)
- Reminder timing (1-7 days before due date)

**Respecting Preferences:**
```typescript
// Check user preferences before sending SMS
const preferences = await db.query.userNotificationPreferences.findFirst({
  where: eq(userNotificationPreferences.userId, userId),
});

if (preferences?.smsEnabled && preferences?.paymentReminders) {
  await sendPaymentReminder(...);
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Invalid API Key" Error

**Cause:** Incorrect or expired API key

**Solution:**
- Verify your API key in the Africa's Talking dashboard
- Ensure no extra spaces in the `.env` file
- Regenerate the API key if necessary

#### 2. "Insufficient Balance" Error

**Cause:** Not enough SMS credits in your account

**Solution:**
- Check your account balance in the dashboard
- Purchase more SMS credits
- Set up auto-recharge to avoid interruptions

#### 3. SMS Not Delivered

**Possible Causes:**
- Invalid phone number format
- Phone number not in international format
- Recipient's phone is off or out of coverage
- Network issues

**Solution:**
- Ensure phone numbers are in international format: `+[country_code][number]`
  - Example: `+254711XXXYYY` (Kenya)
  - Example: `+234810XXXYYY` (Nigeria)
- Check delivery reports in the Africa's Talking dashboard
- Verify the recipient's phone number is active

#### 4. "Invalid Sender ID" Error

**Cause:** Using an unapproved sender ID

**Solution:**
- Use the default sender ID (omit the `from` parameter)
- Wait for sender ID approval before using custom sender IDs
- Check sender ID status in the dashboard

#### 5. Rate Limiting

**Cause:** Sending too many SMS too quickly

**Solution:**
- Implement rate limiting in your code
- Use batch sending for bulk SMS
- Contact Africa's Talking support to increase limits

### Debugging Tips

1. **Enable Detailed Logging:**
   ```typescript
   // In server/services/sms.ts
   console.log('[SMS] Send result:', JSON.stringify(result, null, 2));
   ```

2. **Check Delivery Reports:**
   - Log in to Africa's Talking dashboard
   - Navigate to **"SMS"** → **"Sent Messages"**
   - Check delivery status and error codes

3. **Test with Sandbox First:**
   - Always test new SMS features in sandbox mode
   - Verify message content and formatting
   - Check for errors before going live

4. **Monitor Cron Job Logs:**
   ```bash
   # Check server logs for cron job execution
   [Payment Reminder] Starting daily payment reminder check...
   [Payment Reminder] Found 5 upcoming payment(s)
   [Payment Reminder] Sent reminder to John Doe for loan LN-2024-001
   [Payment Reminder] Completed: 5 sent, 0 failed
   ```

---

## Best Practices

### 1. Message Content

**Do:**
- Keep messages concise (160 characters for single SMS)
- Include essential information: amount, due date, loan number
- Use professional, friendly language
- Personalize with borrower's name
- Include a call-to-action

**Don't:**
- Use all caps (seems aggressive)
- Include sensitive information (full account numbers, passwords)
- Send too frequently (respect user preferences)
- Use jargon or complex language

### 2. Timing

**Best Times to Send:**
- Payment reminders: Morning (9:00 AM - 11:00 AM)
- Loan approvals: Immediately after approval
- Overdue alerts: Morning (avoid late night)
- Marketing: Afternoon (2:00 PM - 5:00 PM)

**Avoid:**
- Late night (10:00 PM - 7:00 AM)
- Weekends for non-urgent messages
- Public holidays

### 3. Compliance

**GDPR/Data Protection:**
- Obtain explicit consent before sending SMS
- Provide opt-out mechanism
- Store consent records
- Honor opt-out requests immediately

**Local Regulations:**
- Check SMS regulations in your country
- Some countries require sender ID registration
- Respect Do Not Disturb (DND) lists
- Follow anti-spam laws

### 4. Cost Optimization

**Reduce Costs:**
- Combine multiple notifications into one message when appropriate
- Use SMS only for critical notifications
- Implement email as an alternative for non-urgent messages
- Monitor and remove inactive phone numbers
- Use message templates to avoid errors

**Example Cost Calculation:**
```
1,000 borrowers × 1 reminder/month = 1,000 SMS/month
1,000 SMS × NGN 2.50 = NGN 2,500/month (~$6/month)
```

### 5. Error Handling

**Implement Retry Logic:**
```typescript
async function sendSMSWithRetry(options: SendSMSOptions, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendSMS(options);
      if (result.success) return result;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

**Log Failed SMS:**
```typescript
// Store failed SMS for manual review
await db.insert(failedSMS).values({
  phoneNumber: options.to,
  message: options.message,
  error: result.error,
  attemptedAt: new Date(),
});
```

### 6. Monitoring

**Track Key Metrics:**
- Delivery rate (successful / total sent)
- Bounce rate (failed / total sent)
- Opt-out rate
- Cost per SMS
- Response rate (for two-way SMS)

**Set Up Alerts:**
- Low balance warnings
- High failure rate alerts
- Unusual sending patterns

---

## Additional Resources

### Official Documentation
- [Africa's Talking Documentation](https://developers.africastalking.com/)
- [SMS API Reference](https://developers.africastalking.com/docs/sms/overview)
- [Node.js SDK](https://github.com/AfricasTalkingLtd/africastalking-node)

### Support
- **Email:** support@africastalking.com
- **Phone:** Check website for country-specific numbers
- **Community:** [Africa's Talking Community Forum](https://help.africastalking.com/)
- **Status Page:** [status.africastalking.com](https://status.africastalking.com/)

### Pricing
- [Current SMS Pricing](https://africastalking.com/pricing)

---

## Quick Reference

### Environment Variables
```bash
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_USERNAME=sandbox  # or production username
AFRICASTALKING_SENDER_ID=YourBrand  # optional
```

### Phone Number Format
```
+[country_code][number]
Kenya: +254711XXXYYY
Nigeria: +234810XXXYYY
Uganda: +256775XXXYYY
Tanzania: +255754XXXYYY
```

### Cron Schedule Format
```typescript
// Format: second minute hour day month weekday
'0 0 9 * * *'  // Daily at 9:00 AM
'0 0 9 * * 1-5'  // Weekdays at 9:00 AM
'0 0 9,15 * * *'  // Daily at 9:00 AM and 3:00 PM
```

### Manual Testing
```bash
# Trigger payment reminders manually (add to admin panel)
POST /api/admin/trigger-payment-reminders
```

---

## Conclusion

This integration guide provides everything you need to set up and use Africa's Talking SMS service for automated payment reminders and notifications. Start with the sandbox environment to test your implementation, then move to production when ready.

For questions or issues, refer to the troubleshooting section or contact Africa's Talking support.

**Happy messaging! 📱**
