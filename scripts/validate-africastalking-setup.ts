/**
 * Africa's Talking Setup Validation Script
 * 
 * Validates that all required environment variables are set correctly
 * and tests connectivity to Africa's Talking API.
 * 
 * Usage:
 *   npx tsx scripts/validate-africastalking-setup.ts
 */

import * as dotenv from 'dotenv';
// @ts-ignore
import AfricasTalking from 'africastalking';

// Load environment variables
dotenv.config();

interface ValidationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
}

const results: ValidationResult[] = [];

function addResult(check: string, status: 'PASS' | 'FAIL' | 'WARN', message: string) {
  results.push({ check, status, message });
}

function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('AFRICA\'S TALKING SETUP VALIDATION');
  console.log('='.repeat(80) + '\n');

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  results.forEach(({ check, status, message }) => {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${check}`);
    console.log(`   ${message}\n`);

    if (status === 'PASS') passCount++;
    else if (status === 'FAIL') failCount++;
    else warnCount++;
  });

  console.log('='.repeat(80));
  console.log(`Results: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    console.log('❌ Setup validation FAILED. Please fix the errors above.\n');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log('⚠️  Setup validation passed with warnings. Review warnings above.\n');
    process.exit(0);
  } else {
    console.log('✅ Setup validation PASSED. You\'re ready to deploy!\n');
    process.exit(0);
  }
}

async function validateEnvironmentVariables() {
  console.log('Validating environment variables...\n');

  // Check AFRICASTALKING_USERNAME
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!username || username.trim() === '') {
    addResult(
      'AFRICASTALKING_USERNAME',
      'FAIL',
      'Not set. Get this from Africa\'s Talking dashboard → Apps → Settings'
    );
  } else {
    addResult(
      'AFRICASTALKING_USERNAME',
      'PASS',
      `Set to: ${username}`
    );
  }

  // Check AFRICASTALKING_API_KEY
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    addResult(
      'AFRICASTALKING_API_KEY',
      'FAIL',
      'Not set. Generate from Africa\'s Talking dashboard → Apps → Settings → API Key'
    );
  } else if (!apiKey.startsWith('atsk_')) {
    addResult(
      'AFRICASTALKING_API_KEY',
      'WARN',
      'API key should start with "atsk_". Please verify this is correct.'
    );
  } else {
    addResult(
      'AFRICASTALKING_API_KEY',
      'PASS',
      `Set (${apiKey.substring(0, 10)}...)`
    );
  }

  // Check AFRICASTALKING_ENV
  const env = process.env.AFRICASTALKING_ENV;
  if (!env || env.trim() === '') {
    addResult(
      'AFRICASTALKING_ENV',
      'WARN',
      'Not set. Defaulting to "sandbox". Set to "production" for live deployment.'
    );
  } else if (env !== 'sandbox' && env !== 'production') {
    addResult(
      'AFRICASTALKING_ENV',
      'FAIL',
      `Invalid value: "${env}". Must be "sandbox" or "production".`
    );
  } else {
    addResult(
      'AFRICASTALKING_ENV',
      'PASS',
      `Set to: ${env}${env === 'sandbox' ? ' (testing mode)' : ' (live mode)'}`
    );
  }

  // Check APP_URL
  const appUrl = process.env.APP_URL;
  if (!appUrl || appUrl.trim() === '') {
    addResult(
      'APP_URL',
      'WARN',
      'Not set. This is needed for webhook configuration.'
    );
  } else if (!appUrl.startsWith('https://')) {
    addResult(
      'APP_URL',
      'FAIL',
      'Must start with "https://". Africa\'s Talking requires HTTPS webhooks.'
    );
  } else {
    addResult(
      'APP_URL',
      'PASS',
      `Set to: ${appUrl}`
    );
  }

  // Check AFRICASTALKING_SENDER_ID (optional)
  const senderId = process.env.AFRICASTALKING_SENDER_ID;
  if (!senderId || senderId.trim() === '') {
    addResult(
      'AFRICASTALKING_SENDER_ID',
      'PASS',
      'Not set (optional). Using default sender ID.'
    );
  } else if (senderId.length > 11) {
    addResult(
      'AFRICASTALKING_SENDER_ID',
      'FAIL',
      `Too long (${senderId.length} chars). Max 11 alphanumeric characters.`
    );
  } else if (!/^[a-zA-Z0-9]+$/.test(senderId)) {
    addResult(
      'AFRICASTALKING_SENDER_ID',
      'FAIL',
      'Invalid format. Must be alphanumeric only (no spaces or special characters).'
    );
  } else {
    addResult(
      'AFRICASTALKING_SENDER_ID',
      'PASS',
      `Set to: ${senderId} (requires approval from Africa\'s Talking)`
    );
  }
}

async function testAPIConnectivity() {
  console.log('\nTesting API connectivity...\n');

  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;

  if (!username || !apiKey) {
    addResult(
      'API Connectivity',
      'FAIL',
      'Cannot test - credentials not set'
    );
    return;
  }

  try {
    const africastalking = AfricasTalking({
      apiKey,
      username,
    });

    // Test by fetching application data
    const app = africastalking.APPLICATION;
    
    try {
      const data = await app.fetchApplicationData();
      addResult(
        'API Connectivity',
        'PASS',
        `Successfully connected to Africa\'s Talking API. Balance: ${data.UserData?.balance || 'N/A'}`
      );
    } catch (error: any) {
      if (error.message?.includes('Invalid credentials')) {
        addResult(
          'API Connectivity',
          'FAIL',
          'Invalid credentials. Please verify your username and API key.'
        );
      } else if (error.message?.includes('Network')) {
        addResult(
          'API Connectivity',
          'FAIL',
          'Network error. Check your internet connection.'
        );
      } else {
        addResult(
          'API Connectivity',
          'WARN',
          `API test inconclusive: ${error.message || 'Unknown error'}`
        );
      }
    }
  } catch (error: any) {
    addResult(
      'API Connectivity',
      'FAIL',
      `Failed to initialize Africa\'s Talking client: ${error.message || 'Unknown error'}`
    );
  }
}

async function validateWebhookURLs() {
  console.log('\nValidating webhook URLs...\n');

  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    addResult(
      'Webhook URLs',
      'WARN',
      'APP_URL not set. Webhook URLs cannot be validated.'
    );
    return;
  }

  const webhooks = {
    'USSD Webhook': `${appUrl}/api/trpc/messaging.ussdCallback`,
    'SMS Webhook': `${appUrl}/api/trpc/messaging.smsCallback`,
    'WhatsApp Webhook': `${appUrl}/api/trpc/messaging.whatsappCallback`,
  };

  for (const [name, url] of Object.entries(webhooks)) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      if (response.ok || response.status === 400) {
        // 400 is acceptable (invalid payload but endpoint exists)
        addResult(
          name,
          'PASS',
          `Endpoint accessible at ${url}`
        );
      } else {
        addResult(
          name,
          'WARN',
          `Endpoint returned status ${response.status}. Expected 200 or 400.`
        );
      }
    } catch (error: any) {
      if (error.message?.includes('fetch failed')) {
        addResult(
          name,
          'FAIL',
          `Endpoint not accessible. Ensure server is running and URL is correct.`
        );
      } else {
        addResult(
          name,
          'WARN',
          `Could not test endpoint: ${error.message || 'Unknown error'}`
        );
      }
    }
  }
}

async function validateDatabaseConnection() {
  console.log('\nValidating database connection...\n');

  try {
    const { getDb } = await import('../server/db.js');
    const db = await getDb();

    if (!db) {
      addResult(
        'Database Connection',
        'FAIL',
        'Database connection failed. Check DATABASE_URL.'
      );
      return;
    }

    // Test query
    const result = await db.execute('SELECT 1 as test');
    
    addResult(
      'Database Connection',
      'PASS',
      'Database connection successful'
    );

    // Check for required tables
    const tables = ['phone_user_mapping', 'messaging_sessions', 'message_logs'];
    for (const table of tables) {
      try {
        await db.execute(`SELECT 1 FROM ${table} LIMIT 1`);
        addResult(
          `Table: ${table}`,
          'PASS',
          'Table exists'
        );
      } catch (error) {
        addResult(
          `Table: ${table}`,
          'FAIL',
          'Table not found. Run database migrations.'
        );
      }
    }
  } catch (error: any) {
    addResult(
      'Database Connection',
      'FAIL',
      `Database error: ${error.message || 'Unknown error'}`
    );
  }
}

async function main() {
  console.clear();
  
  await validateEnvironmentVariables();
  await testAPIConnectivity();
  await validateWebhookURLs();
  await validateDatabaseConnection();
  
  printResults();
}

main().catch((error) => {
  console.error('Validation script error:', error);
  process.exit(1);
});
