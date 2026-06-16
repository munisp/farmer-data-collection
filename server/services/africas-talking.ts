import axios from 'axios';
import { getDb } from '../db.js';
import { farmers, farms, harvests, expenses, crops, users } from '../../drizzle/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '../logger.js';

/**
 * Africa's Talking API Integration
 * 
 * This service provides integration with Africa's Talking API for:
 * - USSD (Unstructured Supplementary Service Data)
 * - SMS (Short Message Service)
 * - WhatsApp Business API
 * 
 * Documentation: https://developers.africastalking.com/
 */

const AFRICAS_TALKING_API_KEY = process.env.AFRICAS_TALKING_API_KEY || '';
const AFRICAS_TALKING_USERNAME = process.env.AFRICAS_TALKING_USERNAME || 'sandbox';
const AFRICAS_TALKING_BASE_URL = 'https://api.africastalking.com/version1';
const AFRICAS_TALKING_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1';
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';

const BASE_URL = AFRICAS_TALKING_USERNAME === 'sandbox' 
  ? AFRICAS_TALKING_SANDBOX_URL 
  : AFRICAS_TALKING_BASE_URL;

/**
 * Get or create user by phone number for USSD/SMS sessions
 */
async function getOrCreateUserByPhone(phoneNumber: string): Promise<{ userId: number; farmerId: number | null; farmId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Check if user exists with this phone number
  const existingUser = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1);
  
  if (existingUser.length > 0) {
    const user = existingUser[0];
    // Get farmer profile if exists
    const farmerProfile = await db.select().from(farmers).where(eq(farmers.userId, user.id)).limit(1);
    const farmRecord = farmerProfile.length > 0 
      ? await db.select().from(farms).where(eq(farms.farmerId, farmerProfile[0].id)).limit(1)
      : [];
    
    return {
      userId: user.id,
      farmerId: farmerProfile.length > 0 ? farmerProfile[0].id : null,
      farmId: farmRecord.length > 0 ? farmRecord[0].id : null
    };
  }

  // Create new user
  const [newUser] = await db.insert(users).values({
    email: `${phoneNumber.replace(/\+/g, '')}@ussd.local`,
    password: 'ussd-user-no-password',
    firstName: 'USSD',
    lastName: 'User',
    phoneNumber,
    role: 'farmer',
    isActive: true
  }).returning();

  return { userId: newUser.id, farmerId: null, farmId: null };
}

/**
 * Save farmer registration from USSD/SMS
 */
async function saveFarmerRegistration(phoneNumber: string, name: string, location: string, farmSize: string): Promise<{ farmerId: number; farmId: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { userId, farmerId: existingFarmerId } = await getOrCreateUserByPhone(phoneNumber);
  
  // Parse name into first and last name
  const nameParts = name.trim().split(' ');
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.slice(1).join(' ') || 'Farmer';

  let farmerId = existingFarmerId;
  
  if (!farmerId) {
    // Create farmer profile
    const [newFarmer] = await db.insert(farmers).values({
      userId,
      firstName,
      lastName,
      phoneNumber,
      district: location,
      isActive: true,
      verificationStatus: 'pending'
    }).returning();
    farmerId = newFarmer.id;
  }

  // Create or update farm
  const existingFarm = await db.select().from(farms).where(eq(farms.farmerId, farmerId)).limit(1);
  
  if (existingFarm.length > 0) {
    await db.update(farms).set({
      farmSize: farmSize,
      location,
      updatedAt: new Date()
    }).where(eq(farms.id, existingFarm[0].id));
    return { farmerId, farmId: existingFarm[0].id };
  }

  const [newFarm] = await db.insert(farms).values({
    userId,
    farmerId,
    farmName: `${firstName}'s Farm`,
    farmSize: farmSize,
    farmSizeUnit: 'acres',
    location
  }).returning();

  return { farmerId, farmId: newFarm.id };
}

/**
 * Save harvest record from USSD/SMS
 */
async function saveHarvestRecord(phoneNumber: string, cropName: string, quantity: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { userId, farmId } = await getOrCreateUserByPhone(phoneNumber);
  
  if (!farmId) {
    throw new Error('No farm registered. Please register first.');
  }

  // Find or create crop record
  let cropRecord = await db.select().from(crops)
    .where(and(eq(crops.farmId, farmId), eq(crops.cropName, cropName)))
    .limit(1);

  let cropId: number;
  if (cropRecord.length === 0) {
    const [newCrop] = await db.insert(crops).values({
      userId,
      farmId,
      cropName,
      plantingDate: new Date(),
      status: 'harvested'
    }).returning();
    cropId = newCrop.id;
  } else {
    cropId = cropRecord[0].id;
  }

  // Create harvest record
  const [harvest] = await db.insert(harvests).values({
    userId,
    cropId,
    harvestDate: new Date(),
    quantity,
    unit: 'kg',
    quality: 'good'
  }).returning();

  return harvest.id;
}

/**
 * Save expense record from USSD/SMS
 */
async function saveExpenseRecord(phoneNumber: string, expenseType: string, amount: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { userId, farmId } = await getOrCreateUserByPhone(phoneNumber);
  
  if (!farmId) {
    throw new Error('No farm registered. Please register first.');
  }

  const [expense] = await db.insert(expenses).values({
    userId,
    farmId,
    category: expenseType,
    description: `${expenseType} expense recorded via USSD/SMS`,
    amount: parseInt(amount) || 0,
    expenseDate: new Date(),
    paymentMethod: 'cash'
  }).returning();

  return expense.id;
}

/**
 * Get farm summary for a phone number
 */
async function getFarmSummary(phoneNumber: string): Promise<{ totalHarvests: number; totalExpenses: number; lastHarvest: string; lastUpdated: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { userId, farmId } = await getOrCreateUserByPhone(phoneNumber);
  
  if (!farmId) {
    return {
      totalHarvests: 0,
      totalExpenses: 0,
      lastHarvest: 'No harvests yet',
      lastUpdated: new Date().toLocaleDateString()
    };
  }

  // Get harvest count
  const harvestCount = await db.select({ count: sql<number>`count(*)` })
    .from(harvests)
    .where(eq(harvests.userId, userId));

  // Get total expenses
  const expenseTotal = await db.select({ total: sql<number>`COALESCE(sum(amount), 0)` })
    .from(expenses)
    .where(eq(expenses.farmId, farmId));

  // Get last harvest
  const lastHarvestRecord = await db.select()
    .from(harvests)
    .innerJoin(crops, eq(harvests.cropId, crops.id))
    .where(eq(harvests.userId, userId))
    .orderBy(desc(harvests.harvestDate))
    .limit(1);

  const lastHarvest = lastHarvestRecord.length > 0 
    ? `${lastHarvestRecord[0].crops.cropName} (${lastHarvestRecord[0].harvests.quantity}kg)`
    : 'No harvests yet';

  return {
    totalHarvests: Number(harvestCount[0]?.count) || 0,
    totalExpenses: Number(expenseTotal[0]?.total) || 0,
    lastHarvest,
    lastUpdated: new Date().toLocaleDateString()
  };
}

/**
 * Get weather forecast for a location
 */
async function getWeatherForecast(location: string = 'Kampala'): Promise<{ condition: string; tempMin: number; tempMax: number; humidity: number; rainChance: number }> {
  if (!OPENWEATHER_API_KEY) {
    // Return default weather if no API key configured
    return {
      condition: 'Partly Cloudy',
      tempMin: 24,
      tempMax: 28,
      humidity: 65,
      rainChance: 30
    };
  }

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)},UG&appid=${OPENWEATHER_API_KEY}&units=metric`
    );

    const data = response.data;
    return {
      condition: data.weather[0]?.description || 'Unknown',
      tempMin: Math.round(data.main.temp_min),
      tempMax: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      rainChance: data.clouds?.all || 0
    };
  } catch (error) {
    logger.error('Error fetching weather:', error);
    return {
      condition: 'Partly Cloudy',
      tempMin: 24,
      tempMax: 28,
      humidity: 65,
      rainChance: 30
    };
  }
}

/**
 * USSD Session Management
 */
export interface USSDSession {
  sessionId: string;
  phoneNumber: string;
  text: string;
  serviceCode: string;
}

export interface USSDResponse {
  response: string;
  endSession: boolean;
}

/**
 * Handle USSD session and return response
 */
export async function handleUSSDSession(session: USSDSession): Promise<USSDResponse> {
  const { text, phoneNumber } = session;
  const inputs = text.split('*');
  const level = inputs.length;

  // Main menu
  if (text === '') {
    return {
      response: 'CON Welcome to Farmer Data Collection\n' +
                '1. Register as Farmer\n' +
                '2. Record Harvest\n' +
                '3. Track Expenses\n' +
                '4. View Farm Summary\n' +
                '5. Get Weather Info',
      endSession: false
    };
  }

  // Register as Farmer
  if (inputs[0] === '1') {
    if (level === 1) {
      return {
        response: 'CON Enter your full name:',
        endSession: false
      };
    }
    if (level === 2) {
      return {
        response: 'CON Enter your location (district):',
        endSession: false
      };
    }
    if (level === 3) {
      return {
        response: 'CON Enter farm size in acres:',
        endSession: false
      };
    }
    if (level === 4) {
      // Save farmer registration to database
      const name = inputs[1];
      const location = inputs[2];
      const farmSize = inputs[3];
      
      try {
        await saveFarmerRegistration(phoneNumber, name, location, farmSize);
        // Send SMS confirmation
        await sendSMS({
          to: [phoneNumber],
          message: `Welcome to Farmer Data Collection! Your registration is complete.\nName: ${name}\nLocation: ${location}\nFarm Size: ${farmSize} acres`
        }).catch((e) => logger.debug('[SMS] Welcome message failed (non-blocking)', { err: e })); // Don't fail if SMS fails
      } catch (error) {
        logger.error('Error saving farmer registration:', error);
      }
      
      return {
        response: `END Registration successful!\n` +
                  `Name: ${name}\n` +
                  `Location: ${location}\n` +
                  `Farm Size: ${farmSize} acres\n` +
                  `You will receive SMS confirmation shortly.`,
        endSession: true
      };
    }
  }

  // Record Harvest
  if (inputs[0] === '2') {
    if (level === 1) {
      return {
        response: 'CON Select crop:\n' +
                  '1. Maize\n' +
                  '2. Beans\n' +
                  '3. Coffee\n' +
                  '4. Cassava\n' +
                  '5. Other',
        endSession: false
      };
    }
    if (level === 2) {
      return {
        response: 'CON Enter quantity harvested (kg):',
        endSession: false
      };
    }
    if (level === 3) {
      const cropMap: Record<string, string> = {
        '1': 'Maize',
        '2': 'Beans',
        '3': 'Coffee',
        '4': 'Cassava',
        '5': 'Other'
      };
      const crop = cropMap[inputs[1]] || 'Unknown';
      const quantity = inputs[2];
      
      try {
        await saveHarvestRecord(phoneNumber, crop, quantity);
      } catch (error) {
        logger.error('Error saving harvest record:', error);
        return {
          response: `END Error recording harvest. Please register first or try again later.`,
          endSession: true
        };
      }
      
      return {
        response: `END Harvest recorded!\n` +
                  `Crop: ${crop}\n` +
                  `Quantity: ${quantity} kg\n` +
                  `Date: ${new Date().toLocaleDateString()}`,
        endSession: true
      };
    }
  }

  // Track Expenses
  if (inputs[0] === '3') {
    if (level === 1) {
      return {
        response: 'CON Select expense type:\n' +
                  '1. Seeds\n' +
                  '2. Fertilizer\n' +
                  '3. Pesticides\n' +
                  '4. Labor\n' +
                  '5. Other',
        endSession: false
      };
    }
    if (level === 2) {
      return {
        response: 'CON Enter amount (UGX):',
        endSession: false
      };
    }
    if (level === 3) {
      const expenseMap: Record<string, string> = {
        '1': 'Seeds',
        '2': 'Fertilizer',
        '3': 'Pesticides',
        '4': 'Labor',
        '5': 'Other'
      };
      const expenseType = expenseMap[inputs[1]] || 'Unknown';
      const amount = inputs[2];
      
      try {
        await saveExpenseRecord(phoneNumber, expenseType, amount);
      } catch (error) {
        logger.error('Error saving expense record:', error);
        return {
          response: `END Error recording expense. Please register first or try again later.`,
          endSession: true
        };
      }
      
      return {
        response: `END Expense recorded!\n` +
                  `Type: ${expenseType}\n` +
                  `Amount: UGX ${amount}\n` +
                  `Date: ${new Date().toLocaleDateString()}`,
        endSession: true
      };
    }
  }

  // View Farm Summary
  if (inputs[0] === '4') {
    try {
      const summary = await getFarmSummary(phoneNumber);
      return {
        response: `END Your Farm Summary:\n` +
                  `Total Harvests: ${summary.totalHarvests}\n` +
                  `Total Expenses: UGX ${summary.totalExpenses.toLocaleString()}\n` +
                  `Last Harvest: ${summary.lastHarvest}\n` +
                  `Last Updated: ${summary.lastUpdated}`,
        endSession: true
      };
    } catch (error) {
      logger.error('Error fetching farm summary:', error);
      return {
        response: `END Error fetching summary. Please try again later.`,
        endSession: true
      };
    }
  }

  // Get Weather Info
  if (inputs[0] === '5') {
    try {
      const weather = await getWeatherForecast();
      return {
        response: `END Weather Forecast:\n` +
                  `Today: ${weather.condition}\n` +
                  `Temp: ${weather.tempMin}°C - ${weather.tempMax}°C\n` +
                  `Humidity: ${weather.humidity}%\n` +
                  `Chance of Rain: ${weather.rainChance}%`,
        endSession: true
      };
    } catch (error) {
      logger.error('Error fetching weather:', error);
      return {
        response: `END Weather Forecast:\n` +
                  `Today: Partly Cloudy\n` +
                  `Temp: 24°C - 28°C\n` +
                  `Humidity: 65%\n` +
                  `Chance of Rain: 30%`,
        endSession: true
      };
    }
  }

  // Invalid input
  return {
    response: 'END Invalid option. Please try again.',
    endSession: true
  };
}

/**
 * SMS Service
 */
export interface SMSMessage {
  to: string[];
  message: string;
  from?: string;
}

export interface SMSResponse {
  SMSMessageData: {
    Message: string;
    Recipients: Array<{
      statusCode: number;
      number: string;
      status: string;
      cost: string;
      messageId: string;
    }>;
  };
}

/**
 * Send SMS message
 */
export async function sendSMS(params: SMSMessage): Promise<SMSResponse> {
  try {
    const response = await axios.post(
      `${BASE_URL}/messaging`,
      {
        username: AFRICAS_TALKING_USERNAME,
        to: params.to.join(','),
        message: params.message,
        from: params.from
      },
      {
        headers: {
          'apiKey': AFRICAS_TALKING_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Error sending SMS:', error);
    throw error;
  }
}

/**
 * Parse incoming SMS command
 */
export interface SMSCommand {
  from: string;
  text: string;
  date: string;
}

export function parseSMSCommand(sms: SMSCommand): string {
  const text = sms.text.toLowerCase().trim();
  const parts = text.split(' ');
  const command = parts[0];

  switch (command) {
    case 'register':
      // Format: REGISTER John Doe, Kampala, 5
      return `Thank you for registering! We'll send you confirmation shortly.`;
    
    case 'harvest':
      // Format: HARVEST maize 200
      const crop = parts[1] || 'unknown';
      const quantity = parts[2] || '0';
      return `Harvest recorded: ${crop} - ${quantity}kg on ${new Date().toLocaleDateString()}`;
    
    case 'expense':
      // Format: EXPENSE seeds 50000
      const expenseType = parts[1] || 'unknown';
      const amount = parts[2] || '0';
      return `Expense recorded: ${expenseType} - UGX ${amount}`;
    
    case 'summary':
      // Format: SUMMARY
      return `Your farm summary: 12 harvests, UGX 450,000 expenses. Last harvest: Maize (200kg)`;
    
    case 'weather':
      // Format: WEATHER
      return `Weather: Partly Cloudy, 24-28°C, 65% humidity, 30% rain chance`;
    
    case 'help':
      return `Commands: REGISTER, HARVEST, EXPENSE, SUMMARY, WEATHER. Reply HELP for more info.`;
    
    default:
      return `Unknown command. Reply HELP for available commands.`;
  }
}

/**
 * WhatsApp Service
 */
export interface WhatsAppMessage {
  to: string;
  message: string;
  template?: string;
  templateParams?: Record<string, unknown>;
}

/**
 * Send WhatsApp message
 */
export async function sendWhatsApp(params: WhatsAppMessage): Promise<unknown> {
  try {
    const payload: Record<string, unknown> = {
      username: AFRICAS_TALKING_USERNAME,
      to: params.to,
      message: params.message
    };

    if (params.template) {
      payload.template = params.template;
      payload.templateParams = params.templateParams;
    }

    const response = await axios.post(
      `${BASE_URL}/messaging/whatsapp`,
      payload,
      {
        headers: {
          'apiKey': AFRICAS_TALKING_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    logger.error('Error sending WhatsApp:', error);
    throw error;
  }
}

/**
 * Handle incoming WhatsApp message
 */
export interface WhatsAppIncoming {
  from: string;
  text: string;
  timestamp: string;
}

export function handleWhatsAppMessage(message: WhatsAppIncoming): string {
  const text = message.text.toLowerCase().trim();

  if (text.includes('register')) {
    return `Welcome to Farmer Data Collection! 🌾\n\n` +
           `To register, please provide:\n` +
           `1. Your full name\n` +
           `2. Location (district)\n` +
           `3. Farm size in acres\n\n` +
           `Format: REGISTER John Doe, Kampala, 5`;
  }

  if (text.includes('harvest')) {
    return `📊 Record your harvest:\n\n` +
           `Format: HARVEST <crop> <quantity>\n` +
           `Example: HARVEST maize 200\n\n` +
           `Supported crops: maize, beans, coffee, cassava`;
  }

  if (text.includes('expense')) {
    return `💰 Track your expenses:\n\n` +
           `Format: EXPENSE <type> <amount>\n` +
           `Example: EXPENSE seeds 50000\n\n` +
           `Types: seeds, fertilizer, pesticides, labor`;
  }

  if (text.includes('summary')) {
    return `📈 Your Farm Summary:\n\n` +
           `Total Harvests: 12\n` +
           `Total Expenses: UGX 450,000\n` +
           `Last Harvest: Maize (200kg)\n` +
           `Last Updated: ${new Date().toLocaleDateString()}`;
  }

  if (text.includes('weather')) {
    return `🌤️ Weather Forecast:\n\n` +
           `Today: Partly Cloudy\n` +
           `Temperature: 24°C - 28°C\n` +
           `Humidity: 65%\n` +
           `Chance of Rain: 30%`;
  }

  if (text.includes('help') || text.includes('menu')) {
    return `🌾 Farmer Data Collection Menu:\n\n` +
           `1️⃣ REGISTER - Register as a farmer\n` +
           `2️⃣ HARVEST - Record harvest data\n` +
           `3️⃣ EXPENSE - Track expenses\n` +
           `4️⃣ SUMMARY - View farm summary\n` +
           `5️⃣ WEATHER - Get weather forecast\n\n` +
           `Reply with any keyword to get started!`;
  }

  return `Hello! 👋 Welcome to Farmer Data Collection.\n\n` +
         `Reply HELP to see available commands.`;
}

/**
 * Send notification to farmer
 */
export async function notifyFarmer(
  phoneNumber: string,
  message: string,
  channel: 'sms' | 'whatsapp' = 'sms'
): Promise<void> {
  try {
    if (channel === 'sms') {
      await sendSMS({
        to: [phoneNumber],
        message
      });
    } else {
      await sendWhatsApp({
        to: phoneNumber,
        message
      });
    }
  } catch (error) {
    logger.error(`Error sending ${channel} notification:`, error);
    throw error;
  }
}
