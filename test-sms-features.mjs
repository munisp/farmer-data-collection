import { getTRPCClient } from "./client/src/lib/trpc.js";

/**
 * Integration test for SMS Templates, Scheduling, and Analytics features
 * 
 * This script tests the three new SMS features:
 * 1. SMS Templates Management
 * 2. SMS Scheduling
 * 3. SMS Analytics
 */

async function testSMSFeatures() {
  console.log("=== Testing SMS Features ===\n");

  // Get test user credentials from environment
  const testEmail = process.env.TEST_USER_EMAIL || "admin@test.com";
  const testPassword = process.env.TEST_USER_PASSWORD || "admin123";

  try {
    // 1. Login
    console.log("1. Logging in...");
    const loginResult = await fetch("http://localhost:3000/trpc/auth.login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: { email: testEmail, password: testPassword }
      })
    });

    if (!loginResult.ok) {
      throw new Error(`Login failed: ${loginResult.statusText}`);
    }

    const loginData = await loginResult.json();
    const token = loginData.result.data.json.token;
    console.log("✓ Login successful\n");

    // Helper function to make authenticated requests
    const trpcCall = async (procedure, input = {}) => {
      const response = await fetch(`http://localhost:3000/trpc/${procedure}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ json: input })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${procedure} failed: ${error}`);
      }

      const data = await response.json();
      return data.result.data.json;
    };

    // 2. Test SMS Templates
    console.log("2. Testing SMS Templates...");
    
    // Create a template
    console.log("   - Creating template...");
    const createResult = await trpcCall("smsTemplates.create", {
      name: "Test Integration Template",
      type: "custom",
      subject: "Test Message",
      body: "Hello {{name}}, this is a test message for {{purpose}}.",
      variables: ["name", "purpose"],
      description: "Integration test template",
      isActive: true,
      isDefault: false
    });
    console.log(`   ✓ Template created with ID: ${createResult.template.id}`);

    const templateId = createResult.template.id;

    // List templates
    console.log("   - Listing templates...");
    const templates = await trpcCall("smsTemplates.list");
    console.log(`   ✓ Found ${templates.length} templates`);

    // Get template by ID
    console.log("   - Getting template by ID...");
    const template = await trpcCall("smsTemplates.getById", { id: templateId });
    console.log(`   ✓ Retrieved template: ${template.name}`);

    // Preview template
    console.log("   - Previewing template...");
    const preview = await trpcCall("smsTemplates.preview", {
      templateId,
      variables: {
        name: "John Doe",
        purpose: "testing"
      }
    });
    console.log(`   ✓ Preview: "${preview.message}"`);
    console.log(`   ✓ Length: ${preview.length} chars, Segments: ${preview.segments}\n`);

    // 3. Test SMS Scheduling
    console.log("3. Testing SMS Scheduling...");
    
    // Schedule a message
    console.log("   - Scheduling message...");
    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + 1);

    const scheduleResult = await trpcCall("smsTemplates.scheduleMessage", {
      templateId,
      recipientPhone: "+2348012345678",
      recipientName: "Test User",
      message: "This is a test scheduled message",
      scheduledFor: scheduledFor.toISOString(),
      metadata: { source: "integration_test" }
    });
    console.log(`   ✓ Message scheduled with ID: ${scheduleResult.scheduledMessage.id}`);

    const scheduledId = scheduleResult.scheduledMessage.id;

    // List scheduled messages
    console.log("   - Listing scheduled messages...");
    const scheduled = await trpcCall("smsTemplates.listScheduled");
    console.log(`   ✓ Found ${scheduled.length} scheduled messages`);

    // Cancel scheduled message
    console.log("   - Cancelling scheduled message...");
    await trpcCall("smsTemplates.cancelScheduled", { id: scheduledId });
    console.log(`   ✓ Message cancelled\n`);

    // 4. Test SMS Analytics
    console.log("4. Testing SMS Analytics...");
    
    // Get overall stats
    console.log("   - Getting overall stats...");
    const stats = await trpcCall("smsAnalytics.getOverallStats", {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString()
    });
    console.log(`   ✓ Total messages: ${stats.totalMessages}`);
    console.log(`   ✓ Delivery rate: ${stats.deliveryRate.toFixed(1)}%`);
    console.log(`   ✓ Total cost: ₦${(stats.totalCost / 100).toFixed(2)}`);

    // Get template usage stats
    console.log("   - Getting template usage stats...");
    const templateStats = await trpcCall("smsAnalytics.getTemplateUsageStats");
    console.log(`   ✓ Found ${templateStats.length} templates with usage data`);

    // Get scheduled stats
    console.log("   - Getting scheduled stats...");
    const scheduledStats = await trpcCall("smsAnalytics.getScheduledStats");
    console.log(`   ✓ Pending: ${scheduledStats.pending}, Sent: ${scheduledStats.sent}`);
    console.log(`   ✓ Failed: ${scheduledStats.failed}, Cancelled: ${scheduledStats.cancelled}\n`);

    // 5. Cleanup
    console.log("5. Cleaning up...");
    await trpcCall("smsTemplates.delete", { id: templateId });
    console.log("   ✓ Test template deleted\n");

    console.log("=== All Tests Passed ✓ ===");
    return true;

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

// Run tests
testSMSFeatures()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
