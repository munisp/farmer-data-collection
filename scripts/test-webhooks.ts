/**
 * Webhook Testing Script
 * 
 * Tests all Africa's Talking webhooks (USSD, SMS, WhatsApp) with sample payloads
 * to verify they're working correctly before going live.
 * 
 * Usage:
 *   # Test all webhooks
 *   npx tsx scripts/test-webhooks.ts
 *   
 *   # Test specific webhook
 *   npx tsx scripts/test-webhooks.ts ussd
 *   npx tsx scripts/test-webhooks.ts sms
 *   npx tsx scripts/test-webhooks.ts whatsapp
 */

import * as dotenv from 'dotenv';

dotenv.config();

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const TEST_PHONE = '+254712345678'; // Test phone number

interface TestResult {
  webhook: string;
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  response?: any;
}

const results: TestResult[] = [];

function addResult(webhook: string, test: string, status: 'PASS' | 'FAIL', message: string, response?: any) {
  results.push({ webhook, test, status, message, response });
}

function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('WEBHOOK TESTING RESULTS');
  console.log('='.repeat(80) + '\n');

  let passCount = 0;
  let failCount = 0;

  const webhooks = [...new Set(results.map(r => r.webhook))];

  webhooks.forEach(webhook => {
    console.log(`\n📡 ${webhook}`);
    console.log('─'.repeat(80));

    const webhookResults = results.filter(r => r.webhook === webhook);
    webhookResults.forEach(({ test, status, message, response }) => {
      const icon = status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${test}`);
      console.log(`   ${message}`);
      if (response && status === 'PASS') {
        console.log(`   Response: ${JSON.stringify(response).substring(0, 100)}...`);
      }
      console.log('');

      if (status === 'PASS') passCount++;
      else failCount++;
    });
  });

  console.log('='.repeat(80));
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    console.log('❌ Some tests FAILED. Please review the errors above.\n');
    process.exit(1);
  } else {
    console.log('✅ All tests PASSED! Webhooks are ready for production.\n');
    process.exit(0);
  }
}

async function testUSSDWebhook() {
  console.log('\nTesting USSD webhook...\n');

  const webhookUrl = `${APP_URL}/api/trpc/messaging.ussdCallback`;

  // Test 1: Initial dial (empty text)
  try {
    const payload = {
      sessionId: 'test_session_001',
      serviceCode: '*384*1234#',
      phoneNumber: TEST_PHONE,
      text: '',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    const data = await response.text();

    if (response.ok && data.startsWith('CON')) {
      addResult('USSD Webhook', 'Initial dial (empty text)', 'PASS', 'Returned welcome menu', data);
    } else {
      addResult('USSD Webhook', 'Initial dial (empty text)', 'FAIL', `Expected CON response, got: ${data.substring(0, 100)}`);
    }
  } catch (error: any) {
    addResult('USSD Webhook', 'Initial dial (empty text)', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 2: Menu navigation (select option 1)
  try {
    const payload = {
      sessionId: 'test_session_002',
      serviceCode: '*384*1234#',
      phoneNumber: TEST_PHONE,
      text: '1',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    const data = await response.text();

    if (response.ok && (data.startsWith('CON') || data.startsWith('END'))) {
      addResult('USSD Webhook', 'Menu navigation (select 1)', 'PASS', 'Returned valid response', data);
    } else {
      addResult('USSD Webhook', 'Menu navigation (select 1)', 'FAIL', `Invalid response: ${data.substring(0, 100)}`);
    }
  } catch (error: any) {
    addResult('USSD Webhook', 'Menu navigation (select 1)', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 3: Invalid input
  try {
    const payload = {
      sessionId: 'test_session_003',
      serviceCode: '*384*1234#',
      phoneNumber: TEST_PHONE,
      text: '999',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    const data = await response.text();

    if (response.ok) {
      addResult('USSD Webhook', 'Invalid input handling', 'PASS', 'Handled invalid input gracefully', data);
    } else {
      addResult('USSD Webhook', 'Invalid input handling', 'FAIL', `Failed to handle invalid input: ${data.substring(0, 100)}`);
    }
  } catch (error: any) {
    addResult('USSD Webhook', 'Invalid input handling', 'FAIL', `Request failed: ${error.message}`);
  }
}

async function testSMSWebhook() {
  console.log('\nTesting SMS webhook...\n');

  const webhookUrl = `${APP_URL}/api/trpc/messaging.smsCallback`;

  // Test 1: HELP command
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'HELP',
      date: new Date().toISOString(),
      id: 'test_sms_001',
      linkId: 'test_link_001',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    if (response.ok) {
      addResult('SMS Webhook', 'HELP command', 'PASS', 'Processed HELP command successfully');
    } else {
      addResult('SMS Webhook', 'HELP command', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('SMS Webhook', 'HELP command', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 2: REGISTER command
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'REGISTER John Doe',
      date: new Date().toISOString(),
      id: 'test_sms_002',
      linkId: 'test_link_002',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    if (response.ok) {
      addResult('SMS Webhook', 'REGISTER command', 'PASS', 'Processed REGISTER command successfully');
    } else {
      addResult('SMS Webhook', 'REGISTER command', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('SMS Webhook', 'REGISTER command', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 3: Invalid command
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'INVALID COMMAND',
      date: new Date().toISOString(),
      id: 'test_sms_003',
      linkId: 'test_link_003',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    if (response.ok) {
      addResult('SMS Webhook', 'Invalid command handling', 'PASS', 'Handled invalid command gracefully');
    } else {
      addResult('SMS Webhook', 'Invalid command handling', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('SMS Webhook', 'Invalid command handling', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 4: HARVEST command
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'HARVEST Maize 100',
      date: new Date().toISOString(),
      id: 'test_sms_004',
      linkId: 'test_link_004',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
    });

    if (response.ok) {
      addResult('SMS Webhook', 'HARVEST command', 'PASS', 'Processed HARVEST command successfully');
    } else {
      addResult('SMS Webhook', 'HARVEST command', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('SMS Webhook', 'HARVEST command', 'FAIL', `Request failed: ${error.message}`);
  }
}

async function testWhatsAppWebhook() {
  console.log('\nTesting WhatsApp webhook...\n');

  const webhookUrl = `${APP_URL}/api/trpc/messaging.whatsappCallback`;

  // Test 1: Initial greeting
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'Hi',
      timestamp: Date.now().toString(),
      id: 'test_wa_001',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      addResult('WhatsApp Webhook', 'Initial greeting', 'PASS', 'Processed greeting successfully');
    } else {
      addResult('WhatsApp Webhook', 'Initial greeting', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('WhatsApp Webhook', 'Initial greeting', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 2: REGISTER command
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'REGISTER Mary Farmer',
      timestamp: Date.now().toString(),
      id: 'test_wa_002',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      addResult('WhatsApp Webhook', 'REGISTER command', 'PASS', 'Processed REGISTER command successfully');
    } else {
      addResult('WhatsApp Webhook', 'REGISTER command', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('WhatsApp Webhook', 'REGISTER command', 'FAIL', `Request failed: ${error.message}`);
  }

  // Test 3: Natural language query
  try {
    const payload = {
      from: TEST_PHONE,
      to: '1234',
      text: 'I want to record harvest',
      timestamp: Date.now().toString(),
      id: 'test_wa_003',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      addResult('WhatsApp Webhook', 'Natural language query', 'PASS', 'Processed natural language successfully');
    } else {
      addResult('WhatsApp Webhook', 'Natural language query', 'FAIL', `Failed with status ${response.status}`);
    }
  } catch (error: any) {
    addResult('WhatsApp Webhook', 'Natural language query', 'FAIL', `Request failed: ${error.message}`);
  }
}

async function testWebhookAccessibility() {
  console.log('\nTesting webhook accessibility...\n');

  const webhooks = [
    { name: 'USSD', url: `${APP_URL}/api/trpc/messaging.ussdCallback` },
    { name: 'SMS', url: `${APP_URL}/api/trpc/messaging.smsCallback` },
    { name: 'WhatsApp', url: `${APP_URL}/api/trpc/messaging.whatsappCallback` },
  ];

  for (const { name, url } of webhooks) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Any response (even 400) means endpoint is accessible
      if (response.status < 500) {
        addResult('Accessibility', `${name} endpoint`, 'PASS', `Endpoint accessible at ${url}`);
      } else {
        addResult('Accessibility', `${name} endpoint`, 'FAIL', `Server error (${response.status}) at ${url}`);
      }
    } catch (error: any) {
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
        addResult('Accessibility', `${name} endpoint`, 'FAIL', `Endpoint not accessible. Is server running?`);
      } else {
        addResult('Accessibility', `${name} endpoint`, 'FAIL', `Error: ${error.message}`);
      }
    }
  }
}

async function main() {
  const target = process.argv[2]?.toLowerCase() || 'all';

  console.clear();
  console.log('🧪 Webhook Testing Script');
  console.log(`📍 Testing against: ${APP_URL}`);
  console.log(`📱 Test phone: ${TEST_PHONE}\n`);

  // Always test accessibility first
  await testWebhookAccessibility();

  switch (target) {
    case 'ussd':
      await testUSSDWebhook();
      break;
    case 'sms':
      await testSMSWebhook();
      break;
    case 'whatsapp':
      await testWhatsAppWebhook();
      break;
    case 'all':
      await testUSSDWebhook();
      await testSMSWebhook();
      await testWhatsAppWebhook();
      break;
    default:
      console.error(`Unknown target: ${target}`);
      console.log('Available targets: ussd, sms, whatsapp, all');
      process.exit(1);
  }

  printResults();
}

main().catch((error) => {
  console.error('Test script error:', error);
  process.exit(1);
});
