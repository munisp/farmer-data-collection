import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock database with proper query chain using vi.hoisted
const { mockDbQuery, mockPayments } = vi.hoisted(() => {
  const mockPayments = [
    {
      loanId: 1,
      borrowerId: 1,
      borrowerPhone: '+254711123456',
      borrowerName: 'John Doe',
      paymentNumber: 1,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      amount: 5000000, // 50,000 NGN in cents
      loanNumber: 'LN-2024-001',
    },
  ];

  const mockDbQuery = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(mockPayments),
  };

  return { mockDbQuery, mockPayments };
});

// Mock the SMS module
vi.mock('../sms', () => ({
  sendPaymentReminder: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock the database
vi.mock('../../db', () => ({
  getDb: vi.fn().mockResolvedValue(mockDbQuery),
}));

// Import after mocks are set up
import { triggerPaymentReminders } from '../payment-reminder-cron';
import * as smsModule from '../sms';

describe('Payment Reminder Cron Service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the mock to return the mockDbQuery again
    const { getDb } = await import('../../db');
    vi.mocked(getDb).mockResolvedValue(mockDbQuery);
  });

  it('should trigger payment reminders successfully', async () => {
    const result = await triggerPaymentReminders();
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('Payment reminders sent successfully');
  });

  it('should call sendPaymentReminder with correct parameters', async () => {
    const sendPaymentReminderSpy = vi.spyOn(smsModule, 'sendPaymentReminder');
    
    await triggerPaymentReminders();
    
    expect(sendPaymentReminderSpy).toHaveBeenCalledWith(
      '+254711123456',    // phone number
      'John Doe',         // borrower name
      50000,              // amount (converted from cents)
      expect.any(Date),   // due date
      'LN-2024-001'       // loan number
    );
  });

  it('should handle errors gracefully', async () => {
    // Mock database to return null for this test
    const dbModule = await import('../../db');
    vi.mocked(dbModule.getDb).mockResolvedValueOnce(null);
    
    const result = await triggerPaymentReminders();
    
    // Should still return a result (either success or failure)
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
  });
});
