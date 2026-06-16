/**
 * Email Service
 * Handles sending transactional emails and automated reports
 * Supports both SMTP and SendGrid
 * 
 * Environment variables:
 * - EMAIL_PROVIDER: 'smtp' or 'sendgrid'
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (for SMTP)
 * - SENDGRID_API_KEY (for SendGrid)
 * - EMAIL_FROM: Sender email address
 * - EMAIL_FROM_NAME: Sender name
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from '../logger.js';

// Email configuration
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "smtp";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@farmerdatacollection.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Farmer Data Collection";

// Initialize transporter
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (EMAIL_PROVIDER === "sendgrid") {
    // SendGrid configuration
    transporter = nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      auth: {
        user: "apikey",
        pass: process.env.SENDGRID_API_KEY || "",
      },
    });
  } else {
    // SMTP configuration
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    });
  }

  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Send an email
 * @param options - Email options
 * @returns Success status
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transporter = getTransporter();

    await transporter.sendMail({
      from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || stripHtml(options.html),
      attachments: options.attachments,
    });

    logger.info(`Email sent successfully to ${options.to}`);
    return true;
  } catch (error) {
    logger.error("Email send error:", error);
    return false;
  }
}

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9fafb; }
        .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to Farmer Data Collection!</h1>
        </div>
        <div class="content">
          <h2>Hello ${name},</h2>
          <p>Thank you for joining our platform! We're excited to help you manage your farm data and connect with the agricultural marketplace.</p>
          
          <h3>Get Started:</h3>
          <ul>
            <li>Add your farm details</li>
            <li>Record your crops and livestock</li>
            <li>Explore the marketplace</li>
            <li>Try AI-powered yield predictions</li>
          </ul>
          
          <a href="${process.env.VITE_APP_URL || "https://app.farmerdatacollection.com"}/dashboard" class="button">Go to Dashboard</a>
          
          <p>If you have any questions, feel free to reach out to our support team.</p>
          
          <p>Happy farming!</p>
          <p>The Farmer Data Collection Team</p>
        </div>
        <div class="footer">
          <p>© 2025 Farmer Data Collection. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: "Welcome to Farmer Data Collection!",
    html,
  });
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmation(
  email: string,
  orderDetails: {
    orderId: number;
    items: string;
    total: number;
    deliveryAddress: string;
  }
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9fafb; }
        .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Confirmed!</h1>
        </div>
        <div class="content">
          <p>Thank you for your order. We've received your order and will process it shortly.</p>
          
          <div class="order-details">
            <h3>Order #${orderDetails.orderId}</h3>
            <p><strong>Items:</strong> ${orderDetails.items}</p>
            <p><strong>Total:</strong> ₦${(orderDetails.total / 100).toFixed(2)}</p>
            <p><strong>Delivery Address:</strong> ${orderDetails.deliveryAddress}</p>
          </div>
          
          <a href="${process.env.VITE_APP_URL || "https://app.farmerdatacollection.com"}/orders/${orderDetails.orderId}" class="button">View Order</a>
          
          <p>You'll receive another email when your order ships.</p>
        </div>
        <div class="footer">
          <p>© 2025 Farmer Data Collection. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Order Confirmation #${orderDetails.orderId}`,
    html,
  });
}

/**
 * Send weekly report email
 */
export async function sendWeeklyReport(
  email: string,
  reportData: {
    totalUsers: number;
    newUsers: number;
    totalRevenue: number;
    revenueGrowth: number;
  }
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3b82f6; color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9fafb; }
        .metric { background: white; padding: 20px; border-radius: 8px; margin: 10px 0; text-align: center; }
        .metric h3 { margin: 0; font-size: 32px; color: #10b981; }
        .metric p { margin: 5px 0 0 0; color: #666; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Weekly Platform Report</h1>
          <p>Your platform performance summary</p>
        </div>
        <div class="content">
          <h2>Key Metrics</h2>
          
          <div class="metric">
            <h3>${reportData.totalUsers}</h3>
            <p>Total Users</p>
          </div>
          
          <div class="metric">
            <h3>+${reportData.newUsers}</h3>
            <p>New Users This Week</p>
          </div>
          
          <div class="metric">
            <h3>₦${(reportData.totalRevenue / 100).toFixed(2)}</h3>
            <p>Total Revenue</p>
          </div>
          
          <div class="metric">
            <h3>${reportData.revenueGrowth > 0 ? '+' : ''}${reportData.revenueGrowth.toFixed(1)}%</h3>
            <p>Revenue Growth</p>
          </div>
          
          <p style="margin-top: 30px;">View the full report in your admin dashboard for detailed insights.</p>
        </div>
        <div class="footer">
          <p>© 2025 Farmer Data Collection. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: "Weekly Platform Report",
    html,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(
  email: string,
  resetToken: string
): Promise<boolean> {
  const resetUrl = `${process.env.VITE_APP_URL || "https://app.farmerdatacollection.com"}/reset-password?token=${resetToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f9fafb; }
        .button { display: inline-block; padding: 12px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          
          <a href="${resetUrl}" class="button">Reset Password</a>
          
          <p>This link will expire in 1 hour for security reasons.</p>
          
          <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        </div>
        <div class="footer">
          <p>© 2025 Farmer Data Collection. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: "Password Reset Request",
    html,
  });
}

/**
 * Strip HTML tags from string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  if (EMAIL_PROVIDER === "sendgrid") {
    return !!process.env.SENDGRID_API_KEY;
  }
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Get email service status
 */
export function getEmailStatus() {
  return {
    configured: isEmailConfigured(),
    provider: EMAIL_PROVIDER,
    from: EMAIL_FROM,
  };
}
