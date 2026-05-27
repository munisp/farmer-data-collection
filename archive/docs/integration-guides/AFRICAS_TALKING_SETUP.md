# Africa's Talking Setup Guide

## Overview

This guide walks you through setting up **Africa's Talking** for USSD, SMS, and WhatsApp integration with the Farmer Data Collection platform.

---

## Prerequisites

- Domain name with HTTPS (required for webhooks)
- Deployed application accessible via public URL
- Bank account or mobile money for payments

---

## Step 1: Create Africa's Talking Account

### 1.1 Register

1. Go to https://africastalking.com
2. Click **"Sign Up"**
3. Choose **Nigeria** as your country
4. Fill in:
   - Business name
   - Email address
   - Phone number
   - Password
5. Verify email address

### 1.2 Account Verification

1. Log in to dashboard
2. Navigate to **Settings → Account**
3. Complete KYC (Know Your Customer):
   - Upload business registration documents
   - Upload ID (Driver's License, National ID, or Passport)
   - Provide business address
4. Wait for approval (1-3 business days)

---

## Step 2: Add Credits

### 2.1 Top Up Account

1. Navigate to **Billing → Top Up**
2. Choose payment method:
   - **Bank Transfer** (recommended for large amounts)
   - **Debit/Credit Card**
   - **Mobile Money** (MTN, Airtel, etc.)
3. Minimum top-up: ₦5,000 (~$12 USD)
4. Recommended starting amount: ₦20,000 (~$48 USD)

### 2.2 Pricing (Nigeria)

| Service | Cost | Notes |
|---------|------|-------|
| **USSD** | ₦2-5 per session | Depends on session length |
| **SMS** | ₦2.50 per SMS | Bulk discounts available |
| **WhatsApp** | ₦1.50 per message | Business API pricing |

---

## Step 3: Configure USSD

### 3.1 Request USSD Shortcode

1. Navigate to **USSD → Get Started**
2. Click **"Request Shortcode"**
3. Fill in application form:
   - **Service Name**: Farmer Data Collection
   - **Service Description**: Farm management and marketplace platform
   - **Target Audience**: Farmers across Nigeria
   - **Expected Usage**: 1,000-10,000 sessions/month
4. Submit application
5. Wait for approval (5-10 business days)
6. Cost: ₦50,000-100,000 setup fee + monthly rental

### 3.2 Alternative: Use Shared Shortcode (Testing)

For testing, use Africa's Talking **shared shortcode**:
- Shortcode: `*384*YOUR_CODE#`
- No setup fee
- Immediate activation
- Limited to sandbox/testing

### 3.3 Configure USSD Webhook

1. Navigate to **USSD → Settings**
2. Set **Callback URL**:
   ```
   https://your-domain.com/api/trpc/messaging.ussdCallback
   ```
3. Set **HTTP Method**: POST
4. Enable **Session Management**
5. Click **Save**

### 3.4 Test USSD

1. Dial your shortcode from a mobile phone
2. You should see: "Welcome to Farmer Data Collection"
3. Navigate through menus to test functionality
4. Check **USSD → Logs** for debugging

---

## Step 4: Configure SMS

### 4.1 Request Sender ID

1. Navigate to **SMS → Sender IDs**
2. Click **"Request Sender ID"**
3. Fill in form:
   - **Sender ID**: FARMDATA (max 11 characters, alphanumeric)
   - **Purpose**: Transactional and promotional messages
   - **Sample Message**: "Harvest recorded: Maize 100kg. Thank you!"
4. Submit application
5. Wait for approval (3-5 business days)
6. Cost: ₦10,000 setup fee

### 4.2 Configure SMS Webhook

1. Navigate to **SMS → Settings**
2. Set **Delivery Reports URL**:
   ```
   https://your-domain.com/api/trpc/messaging.smsCallback
   ```
3. Set **Incoming Messages URL**:
   ```
   https://your-domain.com/api/trpc/messaging.smsCallback
   ```
4. Enable **Delivery Reports**
5. Click **Save**

### 4.3 Test SMS

**Send Test SMS (Outbound):**
```bash
curl -X POST https://api.africastalking.com/version1/messaging \
  -H "apiKey: YOUR_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=YOUR_USERNAME&to=+2348012345678&message=Test message from Farmer Data Collection"
```

**Receive Test SMS (Inbound):**
1. Send SMS to your shortcode: `HARVEST Maize 100`
2. Check **SMS → Logs** for incoming message
3. Verify webhook was called
4. Check response SMS received

---

## Step 5: Configure WhatsApp Business

### 5.1 Apply for WhatsApp Business API

1. Navigate to **WhatsApp → Get Started**
2. Click **"Apply for WhatsApp Business API"**
3. Fill in application:
   - **Business Name**: Your registered business name
   - **Business Website**: https://your-domain.com
   - **Business Description**: Farm management platform
   - **Use Case**: Customer support, transactional notifications
   - **Expected Volume**: 1,000-5,000 messages/month
4. Submit application
5. Wait for approval (7-14 business days)
6. Cost: ₦50,000 setup fee + per-message pricing

### 5.2 Phone Number Verification

After approval:
1. Africa's Talking will provide a phone number
2. Or you can port your existing business number
3. Complete Facebook Business Manager verification
4. Link phone number to WhatsApp Business API

### 5.3 Configure WhatsApp Webhook

1. Navigate to **WhatsApp → Settings**
2. Set **Webhook URL**:
   ```
   https://your-domain.com/api/trpc/messaging.whatsappCallback
   ```
3. Set **Webhook Events**:
   - ✅ Messages
   - ✅ Message Status
   - ✅ Message Delivery
4. Click **Save**

### 5.4 Test WhatsApp

1. Save WhatsApp Business number in your phone
2. Send message: "Hi"
3. You should receive automated response
4. Check **WhatsApp → Logs** for message history

---

## Step 6: Get API Credentials

### 6.1 Locate API Key

1. Navigate to **Settings → API Key**
2. Copy your **API Key** (keep secure!)
3. Copy your **Username** (usually your app name)

### 6.2 Add to Environment Variables

Add to your `.env` file:

```bash
# Africa's Talking Configuration
AFRICASTALKING_API_KEY=your_api_key_here
AFRICASTALKING_USERNAME=your_username_here

# Example:
# AFRICASTALKING_API_KEY=atsk_1234567890abcdef1234567890abcdef
# AFRICASTALKING_USERNAME=farmdata
```

### 6.3 Restart Application

```bash
# If using PM2
pm2 restart farmer-app

# If using Docker
docker-compose restart

# If using systemd
sudo systemctl restart farmer-app
```

---

## Step 7: Configure Webhook URLs

### 7.1 Verify Webhook Accessibility

Test that your webhooks are publicly accessible:

```bash
# Test USSD webhook
curl -X POST https://your-domain.com/api/trpc/messaging.ussdCallback \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","serviceCode":"*384*1234#","phoneNumber":"+2348012345678","text":""}'

# Test SMS webhook
curl -X POST https://your-domain.com/api/trpc/messaging.smsCallback \
  -H "Content-Type: application/json" \
  -d '{"from":"+2348012345678","text":"HELP","id":"test123"}'

# Test WhatsApp webhook
curl -X POST https://your-domain.com/api/trpc/messaging.whatsappCallback \
  -H "Content-Type: application/json" \
  -d '{"from":"+2348012345678","text":"Hi","messageId":"test123"}'
```

### 7.2 Webhook Security (Optional but Recommended)

Add webhook authentication:

1. Generate a secret token:
   ```bash
   openssl rand -hex 32
   ```

2. Add to `.env`:
   ```bash
   WEBHOOK_SECRET=your_generated_secret
   ```

3. Configure in Africa's Talking dashboard:
   - Add `?token=your_generated_secret` to webhook URLs
   - Or use HTTP Basic Auth

---

## Step 8: Monitor and Debug

### 8.1 Africa's Talking Dashboard

Monitor usage in real-time:
- **USSD → Logs**: View all USSD sessions
- **SMS → Logs**: View sent/received SMS
- **WhatsApp → Logs**: View WhatsApp messages
- **Billing → Usage**: Track costs per service

### 8.2 Application Logs

Check your application logs:

```bash
# View messaging logs
sudo -u postgres psql farmer_data -c "
  SELECT * FROM message_logs 
  WHERE created_at >= NOW() - INTERVAL '1 day' 
  ORDER BY created_at DESC 
  LIMIT 100;
"

# View active sessions
sudo -u postgres psql farmer_data -c "
  SELECT * FROM messaging_sessions 
  WHERE expires_at > NOW() 
  ORDER BY last_activity DESC;
"
```

### 8.3 Common Issues

**USSD not responding:**
- Check webhook URL is correct and accessible
- Verify API credentials in `.env`
- Check application logs for errors
- Ensure HTTPS is enabled

**SMS not sending:**
- Check account balance (minimum ₦100)
- Verify Sender ID is approved
- Check recipient number format (+234...)
- Review SMS logs in dashboard

**WhatsApp not working:**
- Verify WhatsApp Business API is approved
- Check webhook configuration
- Ensure phone number is verified
- Review WhatsApp logs

---

## Step 9: Production Checklist

Before going live:

- [ ] USSD shortcode approved and configured
- [ ] SMS Sender ID approved and configured
- [ ] WhatsApp Business API approved and configured
- [ ] All webhook URLs configured correctly
- [ ] API credentials added to production `.env`
- [ ] Account topped up with sufficient credits (₦20,000+)
- [ ] Webhooks tested and responding correctly
- [ ] Monitoring and alerting set up
- [ ] User documentation prepared in local languages
- [ ] Support channels established (phone, email, WhatsApp)

---

## Step 10: Launch and Promote

### 10.1 Announce to Farmers

**SMS Blast:**
```
Welcome to Farmer Data Collection! 
Dial *384*1234# for farm management
Send SMS: HARVEST Maize 100
WhatsApp: +2341234567890
```

**WhatsApp Broadcast:**
Send welcome message with instructions to all registered farmers

**Community Outreach:**
- Visit farmer cooperatives
- Demonstrate USSD/SMS/WhatsApp features
- Distribute printed quick reference cards

### 10.2 Monitor Initial Usage

First week:
- Monitor error rates
- Collect user feedback
- Fix critical issues quickly
- Adjust messaging based on confusion points

---

## Cost Estimates

### Setup Costs (One-time)
- USSD Shortcode: ₦50,000-100,000
- SMS Sender ID: ₦10,000
- WhatsApp Business API: ₦50,000
- **Total: ₦110,000-160,000 (~$260-380 USD)**

### Monthly Operating Costs (1,000 farmers)
- USSD: 1,000 farmers × 10 sessions/month × ₦3 = ₦30,000
- SMS: 1,000 farmers × 5 SMS/month × ₦2.50 = ₦12,500
- WhatsApp: 500 farmers × 10 messages/month × ₦1.50 = ₦7,500
- **Total: ~₦50,000/month (~$120 USD)**

### Scaling (10,000 farmers)
- Monthly cost: ~₦500,000/month (~$1,200 USD)
- Bulk discounts available at this scale

---

## Support

### Africa's Talking Support
- Email: support@africastalking.com
- Phone: +254 20 2606 183
- WhatsApp: +254 711 082 300
- Documentation: https://developers.africastalking.com

### Platform Support
- Email: support@farmdata.com
- WhatsApp: +2341234567890
- SMS: Send "HELP" to shortcode

---

## Next Steps

After completing setup:
1. Test all channels thoroughly
2. Train support staff on troubleshooting
3. Create user documentation in Hausa, Yoruba, Igbo
4. Launch pilot with 50-100 farmers
5. Collect feedback and iterate
6. Scale to full user base

---

## Appendix: Webhook Payload Examples

### USSD Callback
```json
{
  "sessionId": "ATUid_abc123",
  "serviceCode": "*384*1234#",
  "phoneNumber": "+2348012345678",
  "text": "1*1*Maize"
}
```

### SMS Callback
```json
{
  "from": "+2348012345678",
  "to": "1234",
  "text": "HARVEST Maize 100",
  "linkId": "SampleLinkId123",
  "id": "ATXid_abc123",
  "date": "2025-11-25 10:30:00"
}
```

### WhatsApp Callback
```json
{
  "from": "+2348012345678",
  "text": "Hi, I want to sell my produce",
  "messageId": "ATWid_abc123",
  "timestamp": "2025-11-25T10:30:00Z"
}
```


---

## Appendix B: SMS Testing Scenarios for Microfinance Features

This section provides detailed testing scenarios for the microfinance SMS notification system using Africa's Talking sandbox.

### Prerequisites for Testing

1. **Africa's Talking Sandbox Account**
   - Create account at https://account.africastalking.com/auth/register
   - No KYC required for sandbox
   - Free testing credits provided
   - Sandbox API Key available immediately

2. **Environment Configuration**
   ```bash
   # Add to .env file
   AFRICASTALKING_API_KEY=atsk_your_sandbox_api_key
   AFRICASTALKING_USERNAME=sandbox
   AFRICASTALKING_SENDER_ID=FARMDATA
   ```

3. **Test Phone Numbers**
   - Use your real phone number for testing
   - Format: +234XXXXXXXXXX (Nigeria)
   - Sandbox allows sending to any number
   - No charges in sandbox mode

---

### Test Scenario 1: User Registration and SMS Preferences

**Objective:** Verify users can register and configure SMS notification preferences.

**Steps:**

1. **Register New User**
   - Navigate to `/register`
   - Fill in registration form:
     - First Name: John
     - Last Name: Farmer
     - Email: john.farmer@test.com
     - Phone: +2348012345678
     - Password: Test123!
   - Click "Register"
   - Verify successful registration

2. **Configure SMS Preferences**
   - Log in with new credentials
   - Navigate to `/settings`
   - Verify default preferences are loaded:
     - SMS Enabled: ✓ (checked)
     - Payment Reminders: ✓ (checked)
     - Loan Approvals: ✓ (checked)
     - Disbursements: ✓ (checked)
     - Overdue Alerts: ✓ (checked)
     - Marketing Messages: ✗ (unchecked)
     - Reminder Timing: 3 days
   - Update phone number to your test number
   - Click "Save Settings"
   - Verify success toast message

3. **Test Preference Toggles**
   - Disable "Payment Reminders"
   - Click "Save Settings"
   - Verify settings persist after page refresh
   - Re-enable "Payment Reminders"
   - Save again

**Expected Results:**
- User successfully registers with phone number
- Settings page loads with default preferences
- Preferences save correctly
- Changes persist across sessions

---

### Test Scenario 2: Manual Payment Reminder (Single Loan)

**Objective:** Test sending a single payment reminder to a borrower.

**Steps:**

1. **Create Test Loan**
   - Navigate to `/microfinance` (admin view)
   - Click "Create Loan"
   - Fill in loan details:
     - Borrower: John Farmer (from Test Scenario 1)
     - Amount: ₦50,000
     - Interest Rate: 5%
     - Term: 6 months
     - Next Payment Date: (3 days from today)
   - Submit loan application
   - Approve loan (if admin approval required)

2. **Send Manual Reminder**
   - Navigate to `/admin/sms-management`
   - Go to "Send SMS" tab
   - Select "Send Payment Reminder" card
   - Select the test loan from dropdown
   - Verify loan details display correctly:
     - Borrower: John Farmer
     - Amount: ₦50,000
     - Phone: +2348012345678
     - Next Payment: (date shown)
   - Click "Send Payment Reminder"
   - Wait for success toast

3. **Verify SMS Delivery**
   - Check your test phone for SMS
   - Expected message format:
     ```
     Dear John Farmer, your payment of ₦50,000 for loan 
     LN-2024-001 is due on Dec 02, 2024. Please ensure 
     timely payment to avoid penalties.
     ```
   - Navigate to "Delivery Logs" tab
   - Verify log entry shows:
     - Status: "Delivered" (green badge)
     - Phone: +2348012345678
     - Type: "payment reminder"
     - Cost: ₦2.50

**Expected Results:**
- SMS received on test phone within 30 seconds
- Message content is personalized with correct details
- Delivery log shows successful delivery
- Statistics card updates (Total Sent +1, Delivered +1)

---

### Test Scenario 3: Bulk Payment Reminders

**Objective:** Test sending payment reminders to multiple borrowers simultaneously.

**Steps:**

1. **Create Multiple Test Loans**
   - Create 5 test loans with different borrowers
   - Use different phone numbers (or same for testing)
   - Set next payment dates within 3 days
   - Ensure all borrowers have SMS enabled

2. **Access Bulk Reminders**
   - Navigate to `/admin/sms-management`
   - Click "Bulk Reminders" tab
   - Verify table shows all active loans

3. **Select Loans for Bulk Send**
   - Click checkbox for 3 loans
   - Verify selection summary updates:
     - "3 Loans Selected"
     - Total amount displayed
   - Click "Select All" checkbox
   - Verify all 5 loans selected
   - Deselect 2 loans (leave 3 selected)

4. **Send Bulk Reminders**
   - Click "Send 3 Reminders" button
   - Observe progress indicator
   - Wait for completion toast
   - Expected: "Sent 3 reminders successfully!"

5. **Verify Delivery**
   - Check test phone(s) for multiple SMS
   - Navigate to "Delivery Logs" tab
   - Verify 3 new log entries
   - Check statistics update correctly

**Expected Results:**
- All 3 SMS delivered successfully
- Each message personalized for respective borrower
- Progress indicator shows during sending
- Success count matches selected loans
- No failures reported

---

### Test Scenario 4: SMS Preferences Enforcement

**Objective:** Verify that SMS preferences are respected when sending reminders.

**Steps:**

1. **Disable SMS for One Borrower**
   - Log in as borrower (John Farmer)
   - Navigate to `/settings`
   - Uncheck "SMS Enabled" (master toggle)
   - Click "Save Settings"
   - Log out

2. **Attempt to Send Reminder**
   - Log in as admin
   - Navigate to `/admin/sms-management`
   - Go to "Bulk Reminders" tab
   - Select John Farmer's loan
   - Click "Send 1 Reminder"
   - Wait for result

3. **Verify Behavior**
   - Expected toast: "1 reminders failed to send"
   - Check delivery logs
   - Should show failure reason: "SMS notifications disabled for borrower"
   - No SMS received on phone

4. **Disable Only Payment Reminders**
   - Log in as borrower
   - Navigate to `/settings`
   - Enable "SMS Enabled"
   - Disable "Payment Reminders" only
   - Save settings
   - Log out

5. **Retry Sending**
   - Log in as admin
   - Attempt to send reminder again
   - Verify same failure behavior

6. **Re-enable and Verify**
   - Re-enable all preferences
   - Send reminder successfully
   - Verify SMS received

**Expected Results:**
- System respects SMS preferences
- Disabled users don't receive SMS
- Failure reasons logged correctly
- Admin sees clear error messages
- Re-enabling preferences works immediately

---

### Test Scenario 5: Automated Daily Reminders (Cron Job)

**Objective:** Test the automated daily reminder system.

**Steps:**

1. **Verify Cron Job Configuration**
   - Check that cron job is scheduled:
     ```bash
     # View cron jobs
     crontab -l
     
     # Should show:
     # 0 9 * * * cd /path/to/app && node server/jobs/payment-reminder-cron.js
     ```

2. **Create Loans Due in 3 Days**
   - Create 3 loans with next payment date exactly 3 days from now
   - Ensure borrowers have SMS enabled
   - Note the loan IDs

3. **Manually Trigger Cron Job (Testing)**
   ```bash
   # Run the cron job manually
   cd /home/ubuntu/farmer-data-collection
   node server/jobs/payment-reminder-cron.js
   ```

4. **Verify Execution**
   - Check console output for:
     ```
     [Payment Reminder Cron] Starting daily check...
     [Payment Reminder Cron] Found 3 loans due in 3 days
     [Payment Reminder Cron] Sent 3 reminders successfully
     [Payment Reminder Cron] Job completed
     ```
   - Check test phone(s) for SMS
   - Navigate to `/admin/sms-management` → "Delivery Logs"
   - Verify 3 new automated reminders logged

5. **Test Edge Cases**
   - Create loan due in 2 days → Should NOT send
   - Create loan due in 4 days → Should NOT send
   - Create loan due in exactly 3 days → Should send
   - Run cron job again
   - Verify only correct loans trigger reminders

**Expected Results:**
- Cron job runs without errors
- Only loans due in exactly 3 days receive reminders
- All eligible borrowers receive SMS
- Logs show automated sends
- No duplicate sends on subsequent runs

---

### Test Scenario 6: SMS Delivery Failure Handling

**Objective:** Test system behavior when SMS delivery fails.

**Steps:**

1. **Send to Invalid Number**
   - Navigate to `/admin/sms-management`
   - Go to "Send SMS" tab
   - Enter invalid phone number: +234999999999
   - Enter custom message
   - Click "Send SMS"
   - Wait for response

2. **Verify Error Handling**
   - Expected toast: "Failed to send SMS: Invalid phone number"
   - Check delivery logs
   - Should show:
     - Status: "Failed" (red badge)
     - Error Message: "Invalid phone number"
     - Cost: ₦0.00 (not charged)

3. **Test Network Failure (Sandbox)**
   - Temporarily set invalid API key:
     ```bash
     # In .env
     AFRICASTALKING_API_KEY=invalid_key_for_testing
     ```
   - Restart application
   - Attempt to send SMS
   - Verify error: "Authentication failed"
   - Restore correct API key

4. **Test Insufficient Credits (Production Only)**
   - Note: Cannot test in sandbox
   - In production, when credits run low:
     - SMS fails with "Insufficient balance"
     - Admin receives email alert
     - Dashboard shows warning banner

**Expected Results:**
- Invalid numbers rejected gracefully
- Error messages are clear and actionable
- Failed sends don't deduct credits
- Logs capture error details
- System remains stable after failures

---

### Test Scenario 7: SMS Statistics and Reporting

**Objective:** Verify SMS statistics are accurate and update in real-time.

**Steps:**

1. **Reset Statistics (Fresh Start)**
   - Navigate to `/admin/sms-management`
   - Note current statistics:
     - Total Sent
     - Delivered
     - Failed
     - Total Cost

2. **Send Multiple SMS**
   - Send 5 successful SMS (manual or bulk)
   - Send 2 failed SMS (invalid numbers)
   - Refresh page

3. **Verify Statistics Update**
   - Total Sent: Should increase by 7
   - Delivered: Should increase by 5
   - Failed: Should increase by 2
   - Total Cost: Should increase by ₦12.50 (5 × ₦2.50)
   - Success Rate: Should show 71.4% (5/7)

4. **Test Date Filtering (Future Enhancement)**
   - Filter logs by date range
   - Verify statistics update accordingly
   - Export logs to CSV

**Expected Results:**
- Statistics update immediately after sends
- Counts are accurate
- Cost calculations correct
- Success rate formula works
- Dashboard reflects real-time data

---

### Test Scenario 8: Multi-User SMS Preferences

**Objective:** Verify that each user's preferences are independent.

**Steps:**

1. **Create Two Users**
   - User A: Enable all SMS notifications
   - User B: Disable payment reminders only

2. **Create Loans for Both**
   - Loan 1: User A as borrower
   - Loan 2: User B as borrower
   - Both due in 3 days

3. **Send Bulk Reminders**
   - Select both loans
   - Click "Send 2 Reminders"
   - Wait for result

4. **Verify Behavior**
   - Expected: "Sent 1 reminder successfully! 1 reminder failed to send"
   - User A receives SMS
   - User B does NOT receive SMS
   - Logs show:
     - User A: Status "Delivered"
     - User B: Status "Failed" with reason

**Expected Results:**
- User preferences are isolated
- One user's settings don't affect others
- Bulk sends handle mixed preferences correctly
- Clear reporting of successes vs failures

---

### Test Scenario 9: Phone Number Validation

**Objective:** Test phone number format validation.

**Steps:**

1. **Test Invalid Formats**
   - Navigate to `/settings`
   - Try saving these phone numbers:
     - `08012345678` (missing country code) → Should fail
     - `+234` (too short) → Should fail
     - `+234abc1234567` (contains letters) → Should fail
     - `+1234567890123456` (too long) → Should fail
   - Verify error messages display

2. **Test Valid Formats**
   - `+2348012345678` (Nigeria) → Should succeed
   - `+254712345678` (Kenya) → Should succeed
   - `+256712345678` (Uganda) → Should succeed
   - Save and verify success

3. **Test International Numbers**
   - Try numbers from different countries
   - Verify Africa's Talking supports them
   - Check pricing for international SMS

**Expected Results:**
- Invalid formats rejected with clear errors
- Valid formats accepted
- Phone numbers stored in E.164 format
- International numbers work (if supported)

---

### Test Scenario 10: Performance Testing (Bulk Sends)

**Objective:** Test system performance with large bulk sends.

**Steps:**

1. **Create 50 Test Loans**
   - Use script or manual creation
   - All due within 3 days
   - Mix of different borrowers

2. **Send Bulk Reminders**
   - Select all 50 loans
   - Click "Send 50 Reminders"
   - Monitor progress indicator
   - Measure time to completion

3. **Verify Results**
   - Check success count
   - Verify all SMS delivered
   - Check delivery logs load quickly
   - Verify statistics update correctly

4. **Test Concurrent Sends**
   - Open two browser tabs
   - Send bulk reminders from both simultaneously
   - Verify no race conditions
   - Check logs for duplicates

**Expected Results:**
- 50 SMS sent within 2-3 minutes
- No timeouts or errors
- Progress indicator updates smoothly
- No duplicate sends
- System remains responsive

---

### Troubleshooting Common Issues

#### Issue 1: SMS Not Received

**Possible Causes:**
- Incorrect phone number format
- SMS preferences disabled
- Invalid API credentials
- Insufficient credits (production)
- Network issues

**Debug Steps:**
1. Check delivery logs for error messages
2. Verify phone number format (+234...)
3. Check user's SMS preferences
4. Test API credentials with curl:
   ```bash
   curl -X POST https://api.sandbox.africastalking.com/version1/messaging \
     -H "apiKey: YOUR_API_KEY" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=sandbox&to=+2348012345678&message=Test"
   ```
5. Check application logs for errors

#### Issue 2: Cron Job Not Running

**Possible Causes:**
- Cron service not started
- Incorrect cron syntax
- Environment variables not loaded
- Database connection issues

**Debug Steps:**
1. Check cron service status:
   ```bash
   sudo systemctl status cron
   ```
2. Verify cron job syntax:
   ```bash
   crontab -l
   ```
3. Run job manually to see errors:
   ```bash
   node server/jobs/payment-reminder-cron.js
   ```
4. Check cron logs:
   ```bash
   grep CRON /var/log/syslog
   ```

#### Issue 3: Bulk Send Failures

**Possible Causes:**
- Database query timeout
- API rate limiting
- Memory issues
- Network timeouts

**Debug Steps:**
1. Check server logs for errors
2. Reduce batch size (test with 10 loans)
3. Add delays between API calls
4. Monitor server resources (CPU, memory)
5. Check Africa's Talking rate limits

---

### Best Practices for Testing

1. **Use Sandbox First**
   - Always test in sandbox before production
   - Sandbox is free and unlimited
   - No risk of accidental charges

2. **Test Edge Cases**
   - Invalid inputs
   - Empty states
   - Maximum values
   - Concurrent operations

3. **Monitor Logs**
   - Check delivery logs after every test
   - Verify error messages are clear
   - Ensure costs are tracked correctly

4. **Test User Experience**
   - Verify SMS messages are clear and actionable
   - Check message length (160 chars max)
   - Test on actual mobile devices

5. **Performance Testing**
   - Test with realistic data volumes
   - Monitor response times
   - Check for memory leaks

6. **Security Testing**
   - Verify API keys are not exposed
   - Test webhook authentication
   - Check for SQL injection vulnerabilities

---

### Sandbox Limitations

**What Works in Sandbox:**
- ✅ Sending SMS to any number
- ✅ Testing API integration
- ✅ Webhook callbacks
- ✅ Delivery reports
- ✅ Error handling

**What Doesn't Work in Sandbox:**
- ❌ Actual SMS delivery to phones (simulated only)
- ❌ Real cost deductions
- ❌ Production shortcodes
- ❌ Approved sender IDs
- ❌ WhatsApp Business API

**Note:** In sandbox, you'll receive delivery confirmations, but actual SMS won't be delivered to phones. For real testing, use production environment with small credit top-up.

---

### Moving from Sandbox to Production

When ready for production:

1. **Switch API Credentials**
   ```bash
   # Change from sandbox to production
   AFRICASTALKING_API_KEY=atsk_production_key
   AFRICASTALKING_USERNAME=your_production_username
   ```

2. **Top Up Credits**
   - Add at least ₦5,000 for testing
   - Recommended: ₦20,000 for initial launch

3. **Configure Sender ID**
   - Apply for approved sender ID
   - Wait for approval (3-5 days)
   - Update in environment variables

4. **Test with Small Batch**
   - Send to 5-10 real numbers first
   - Verify delivery on actual phones
   - Check costs are as expected

5. **Monitor Closely**
   - Watch delivery rates
   - Monitor costs
   - Set up alerts for failures

---

## Conclusion

This comprehensive testing guide ensures your SMS notification system is robust, reliable, and ready for production. Follow each scenario methodically, document any issues, and iterate until all tests pass successfully.

For additional support, refer to:
- Africa's Talking Documentation: https://developers.africastalking.com
- SMS API Reference: https://developers.africastalking.com/docs/sms/overview
- Community Forum: https://community.africastalking.com
