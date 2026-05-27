import cron from "node-cron";
import { PaymentReminderService } from "../services/payment-reminder.js";

/**
 * Payment Reminder Cron Job
 * 
 * Runs daily at 8:00 AM to send payment reminders to borrowers
 * Schedule: 0 8 * * * (Every day at 8:00 AM)
 */

const reminderService = new PaymentReminderService({
  daysBeforePayment: [7, 3, 1], // Send reminders 7, 3, and 1 day before payment
  enableSMS: true,
  enableEmail: true,
});

export function startPaymentReminderCron() {
  // Run every day at 8:00 AM
  const cronSchedule = "0 8 * * *";

  const job = cron.schedule(cronSchedule, async () => {
    console.log("\n⏰ [Payment Reminder Cron] Starting daily payment reminder job...");
    console.log(`   Time: ${new Date().toLocaleString("en-NG")}`);

    try {
      const result = await reminderService.processReminders();
      
      console.log("✅ [Payment Reminder Cron] Job completed successfully");
      console.log(`   Reminders sent: ${result.smsSent} SMS, ${result.emailSent} emails`);
      
      if (result.failed > 0) {
        console.warn(`⚠️  [Payment Reminder Cron] ${result.failed} reminders failed`);
      }
    } catch (error) {
      console.error("❌ [Payment Reminder Cron] Job failed:", error);
    }
  });

  console.log("📅 [Payment Reminder Cron] Payment reminder cron job started");
  console.log(`   Schedule: ${cronSchedule} (Every day at 8:00 AM)`);
  console.log(`   Reminder days: 7, 3, 1 days before payment`);

  return job;
}

// For manual testing: Run immediately
export async function runPaymentRemindersNow() {
  console.log("\n🔧 [Payment Reminder] Running manual payment reminder check...");
  
  try {
    const result = await reminderService.processReminders();
    console.log("✅ [Payment Reminder] Manual run completed successfully");
    return result;
  } catch (error) {
    console.error("❌ [Payment Reminder] Manual run failed:", error);
    throw error;
  }
}
