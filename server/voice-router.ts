/**
 * Voice Call (IVR) Router
 * 
 * Handles incoming voice calls from Africa's Talking Voice API
 * Provides interactive voice response with DTMF input and text-to-speech
 * 
 * Features:
 * - Interactive voice menus
 * - DTMF (keypad) input processing
 * - Text-to-speech for dynamic prompts
 * - Multi-language support
 * - Call session management
 * - Full feature parity with USSD
 * 
 * Africa's Talking Voice API Documentation:
 * https://developers.africastalking.com/docs/voice/overview
 */

import { z } from 'zod';
import { router, publicProcedure } from './_core/trpc-base.js';
import { logger } from './logger.js';
import {
  getUserByPhone,
  registerUserByPhone,
  verifyPhoneNumber,
  createHarvest,
  createExpense,
  createListing,
  getMarketplaceListings,
  createOrder,
  getFinancialSummary,
} from './services/messaging-service';

// ============================================================================
// Types & Schemas
// ============================================================================

const VoiceCallbackSchema = z.object({
  sessionId: z.string(),
  isActive: z.string().transform(val => val === '1'),
  callerNumber: z.string(),
  dtmfDigits: z.string().optional(),
  recordingUrl: z.string().optional(),
  durationInSeconds: z.string().optional(),
  currencyCode: z.string().optional(),
  amount: z.string().optional(),
});

interface VoiceSession {
  sessionId: string;
  phoneNumber: string;
  userId?: number;
  state: string;
  context: Record<string, any>;
  language: 'en' | 'ha' | 'yo' | 'ig';
  lastActivity: Date;
  expiresAt: Date;
}

interface VoiceResponse {
  response: string; // XML response for Africa's Talking
}

// ============================================================================
// Session Management
// ============================================================================

const voiceSessions = new Map<string, VoiceSession>();

function getOrCreateSession(sessionId: string, phoneNumber: string): VoiceSession {
  let session = voiceSessions.get(sessionId);

  if (!session) {
    session = {
      sessionId,
      phoneNumber,
      state: 'WELCOME',
      context: {},
      language: 'en',
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    };
    voiceSessions.set(sessionId, session);
  }

  session.lastActivity = new Date();
  return session;
}

function updateSession(session: VoiceSession, state: string, context?: Record<string, any>) {
  session.state = state;
  if (context) {
    session.context = { ...session.context, ...context };
  }
  session.lastActivity = new Date();
}

function clearSession(sessionId: string) {
  voiceSessions.delete(sessionId);
}

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  const entries = Array.from(voiceSessions.entries());
  for (const [sessionId, session] of entries) {
    if (session.expiresAt < now) {
      voiceSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// Voice Response Builder
// ============================================================================

class VoiceResponseBuilder {
  private actions: string[] = [];

  say(text: string, voice: 'man' | 'woman' = 'woman', playBeep = false): this {
    const beepAttr = playBeep ? ' playBeep="true"' : '';
    this.actions.push(`<Say voice="${voice}"${beepAttr}>${this.escapeXml(text)}</Say>`);
    return this;
  }

  getDigits(
    text: string,
    numDigits: number = 1,
    timeout: number = 30,
    finishOnKey: string = '#'
  ): this {
    this.actions.push(
      `<GetDigits timeout="${timeout}" numDigits="${numDigits}" finishOnKey="${finishOnKey}">` +
      `<Say>${this.escapeXml(text)}</Say>` +
      `</GetDigits>`
    );
    return this;
  }

  record(
    text?: string,
    maxLength: number = 60,
    timeout: number = 5,
    finishOnKey: string = '#'
  ): this {
    let recordXml = `<Record maxLength="${maxLength}" timeout="${timeout}" finishOnKey="${finishOnKey}"`;
    
    if (text) {
      recordXml += `><Say>${this.escapeXml(text)}</Say></Record>`;
    } else {
      recordXml += ' />';
    }
    
    this.actions.push(recordXml);
    return this;
  }

  play(url: string): this {
    this.actions.push(`<Play url="${this.escapeXml(url)}" />`);
    return this;
  }

  dial(phoneNumber: string): this {
    this.actions.push(`<Dial phoneNumbers="${this.escapeXml(phoneNumber)}" />`);
    return this;
  }

  reject(): this {
    this.actions.push('<Reject />');
    return this;
  }

  redirect(url: string): this {
    this.actions.push(`<Redirect>${this.escapeXml(url)}</Redirect>`);
    return this;
  }

  build(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${this.actions.join('')}</Response>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// ============================================================================
// Voice Prompts (Multi-Language)
// ============================================================================

const VOICE_PROMPTS = {
  en: {
    welcome: 'Welcome to Farmer Data Collection. Press 1 to register, 2 to login, or 0 for help.',
    mainMenu: 'Main menu. Press 1 to record harvest, 2 to record expense, 3 for marketplace, 4 for orders, 5 for financial report, or 0 to logout.',
    enterName: 'Please say your full name after the beep, then press the hash key.',
    enterVerificationCode: 'Please enter your 6 digit verification code, followed by the hash key.',
    verificationSent: 'A verification code has been sent to your phone.',
    verificationSuccess: 'Phone number verified successfully.',
    verificationFailed: 'Invalid verification code. Please try again.',
    enterCropName: 'Please say the crop name after the beep, then press the hash key.',
    enterQuantity: 'Please enter the quantity in kilograms using your keypad, followed by the hash key.',
    harvestRecorded: 'Harvest recorded successfully.',
    selectExpenseType: 'Select expense type. Press 1 for seeds, 2 for fertilizer, 3 for labor, 4 for equipment, 5 for other.',
    enterAmount: 'Please enter the amount using your keypad, followed by the hash key.',
    expenseRecorded: 'Expense recorded successfully.',
    marketplaceMenu: 'Marketplace. Press 1 to browse listings, 2 to create listing, or 0 to go back.',
    noListings: 'There are currently no marketplace listings available.',
    createListingCrop: 'Please say the crop name for your listing after the beep, then press the hash key.',
    createListingQuantity: 'Please enter the quantity in kilograms using your keypad, followed by the hash key.',
    createListingPrice: 'Please enter the price per kilogram using your keypad, followed by the hash key.',
    listingCreated: 'Marketplace listing created successfully.',
    noOrders: 'You have no orders.',
    financialReportWeekly: 'Weekly financial report.',
    financialReportMonthly: 'Monthly financial report.',
    financialReportYearly: 'Yearly financial report.',
    revenue: 'Revenue:',
    expenses: 'Expenses:',
    profit: 'Profit:',
    invalidInput: 'Invalid input. Please try again.',
    sessionTimeout: 'Session timed out. Please call again.',
    error: 'An error occurred. Please try again later.',
    goodbye: 'Thank you for using Farmer Data Collection. Goodbye.',
    notAuthenticated: 'Please login first.',
  },
  ha: {
    welcome: 'Barka da zuwa Farmer Data Collection. Danna 1 don yin rajista, 2 don shiga, ko 0 don taimako.',
    mainMenu: 'Babban menu. Danna 1 don rubuta girbi, 2 don rubuta kashe kuɗi, 3 don kasuwa, 4 don oda, 5 don rahoton kuɗi, ko 0 don fita.',
    enterName: 'Don Allah faɗa cikakken sunan ka bayan sauti, sannan danna maɓallin hash.',
    enterVerificationCode: 'Don Allah shigar da lambar tabbatarwa mai lamba 6, sannan danna maɓallin hash.',
    verificationSent: 'An aika lambar tabbatarwa zuwa wayar ku.',
    verificationSuccess: 'An tabbatar da lambar waya cikin nasara.',
    verificationFailed: 'Lambar tabbatarwa ba daidai ba. Don Allah sake gwadawa.',
    enterCropName: 'Don Allah faɗa sunan amfanin gona bayan sauti, sannan danna maɓallin hash.',
    enterQuantity: 'Don Allah shigar da adadin a cikin kilogiram ta amfani da maɓallan ku, sannan danna maɓallin hash.',
    harvestRecorded: 'An rubuta girbi cikin nasara.',
    selectExpenseType: 'Zaɓi nau\'in kashe kuɗi. Danna 1 don iri, 2 don taki, 3 don aiki, 4 don kayan aiki, 5 don wasu.',
    enterAmount: 'Don Allah shigar da adadin ta amfani da maɓallan ku, sannan danna maɓallin hash.',
    expenseRecorded: 'An rubuta kashe kuɗi cikin nasara.',
    marketplaceMenu: 'Kasuwa. Danna 1 don kallon kayayyaki, 2 don ƙirƙirar kayayyaki, ko 0 don komawa.',
    noListings: 'Babu kayayyakin kasuwa a halin yanzu.',
    goodbye: 'Na gode da amfani da Farmer Data Collection. Sai an jima.',
    notAuthenticated: 'Don Allah fara shiga.',
  },
  yo: {
    welcome: 'Kaabo si Farmer Data Collection. Tẹ 1 lati forukọsilẹ, 2 lati wọle, tabi 0 fun iranlọwọ.',
    mainMenu: 'Akojọ aṣayan akọkọ. Tẹ 1 lati ṣe igbasilẹ ikore, 2 lati ṣe igbasilẹ inawo, 3 fun ọja, 4 fun awọn aṣẹ, 5 fun iroyin owo, tabi 0 lati jade.',
    enterName: 'Jọwọ sọ orukọ pipe rẹ lẹhin ohun, lẹhinna tẹ bọtini hash.',
    goodbye: 'O ṣeun fun lilo Farmer Data Collection. O dabọ.',
    notAuthenticated: 'Jọwọ wọle ni akọkọ.',
  },
  ig: {
    welcome: 'Nnọọ na Farmer Data Collection. Pịa 1 iji debanye aha, 2 iji banye, ma ọ bụ 0 maka enyemaka.',
    mainMenu: 'Menu isi. Pịa 1 iji dekọọ owuwe ihe, 2 iji dekọọ mmefu ego, 3 maka ahịa, 4 maka iwu, 5 maka akụkọ ego, ma ọ bụ 0 iji pụọ.',
    enterName: 'Biko kwuo aha gị zuru ezu mgbe ị nụrụ ụda, wee pịa igodo hash.',
    goodbye: 'Daalụ maka iji Farmer Data Collection. Ka ọ dị.',
    notAuthenticated: 'Biko banye na mbụ.',
  },
};

function getPrompt(language: 'en' | 'ha' | 'yo' | 'ig', key: string): string {
  const prompts = VOICE_PROMPTS[language] as Record<string, string>;
  return prompts[key] || (VOICE_PROMPTS.en as Record<string, string>)[key] || key;
}

// ============================================================================
// Voice Call Handlers
// ============================================================================

async function handleWelcome(session: VoiceSession): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();
  
  builder.getDigits(getPrompt(session.language, 'welcome'), 1, 30, '#');
  
  return { response: builder.build() };
}

async function handleMainMenu(session: VoiceSession): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();
  
  builder.getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
  
  return { response: builder.build() };
}

async function handleRegistration(session: VoiceSession, dtmfDigits?: string): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (session.state === 'REGISTER_NAME') {
    // Name was recorded, now ask for verification
    updateSession(session, 'REGISTER_VERIFY');
    
    builder
      .say(getPrompt(session.language, 'verificationSent'))
      .getDigits(getPrompt(session.language, 'enterVerificationCode'), 6, 30, '#');
    
    return { response: builder.build() };
  }

  if (session.state === 'REGISTER_VERIFY' && dtmfDigits) {
    // Verify code
    try {
      const result = await verifyPhoneNumber(session.phoneNumber, dtmfDigits);
      
      if (result) {
        const userId = await getUserByPhone(session.phoneNumber);
        if (userId) {
          session.userId = userId;
        }
        updateSession(session, 'MAIN_MENU');
        
        builder
          .say(getPrompt(session.language, 'verificationSuccess'))
          .getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
      } else {
        builder
          .say(getPrompt(session.language, 'verificationFailed'))
          .getDigits(getPrompt(session.language, 'enterVerificationCode'), 6, 30, '#');
      }
    } catch (error) {
      builder.say(getPrompt(session.language, 'error'));
    }
    
    return { response: builder.build() };
  }

  // Start registration - ask for name
  updateSession(session, 'REGISTER_NAME');
  builder.record(getPrompt(session.language, 'enterName'), 30, 3, '#');
  
  return { response: builder.build() };
}

async function handleRecordHarvest(session: VoiceSession, dtmfDigits?: string): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (!session.userId) {
    builder.say(getPrompt(session.language, 'notAuthenticated'));
    updateSession(session, 'WELCOME');
    return { response: builder.build() };
  }

  if (session.state === 'HARVEST_CROP') {
    // Crop name was recorded, now ask for quantity
    updateSession(session, 'HARVEST_QUANTITY');
    builder.getDigits(getPrompt(session.language, 'enterQuantity'), 10, 30, '#');
    return { response: builder.build() };
  }

  if (session.state === 'HARVEST_QUANTITY' && dtmfDigits) {
    // Save harvest
    try {
      const cropName = session.context.cropName || 'Unknown';
      const quantity = parseInt(dtmfDigits, 10);

      await createHarvest(session.userId, {
        cropName,
        quantity,
        unit: 'kg',
      });

      updateSession(session, 'MAIN_MENU');
      builder
        .say(getPrompt(session.language, 'harvestRecorded'))
        .getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
    } catch (error) {
      builder.say(getPrompt(session.language, 'error'));
    }

    return { response: builder.build() };
  }

  // Start harvest recording - ask for crop name
  updateSession(session, 'HARVEST_CROP');
  builder.record(getPrompt(session.language, 'enterCropName'), 30, 3, '#');

  return { response: builder.build() };
}

async function handleRecordExpense(session: VoiceSession, dtmfDigits?: string): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (!session.userId) {
    builder.say(getPrompt(session.language, 'notAuthenticated'));
    updateSession(session, 'WELCOME');
    return { response: builder.build() };
  }

  if (session.state === 'EXPENSE_TYPE' && dtmfDigits) {
    const expenseTypes = ['Seeds', 'Fertilizer', 'Labor', 'Equipment', 'Other'];
    const typeIndex = parseInt(dtmfDigits, 10) - 1;
    
    if (typeIndex >= 0 && typeIndex < expenseTypes.length) {
      updateSession(session, 'EXPENSE_AMOUNT', { expenseType: expenseTypes[typeIndex] });
      builder.getDigits(getPrompt(session.language, 'enterAmount'), 10, 30, '#');
    } else {
      builder
        .say(getPrompt(session.language, 'invalidInput'))
        .getDigits(getPrompt(session.language, 'selectExpenseType'), 1, 30, '#');
    }

    return { response: builder.build() };
  }

  if (session.state === 'EXPENSE_AMOUNT' && dtmfDigits) {
    try {
      const expenseType = session.context.expenseType || 'Other';
      const amount = parseInt(dtmfDigits, 10);

      await createExpense(session.userId, {
        type: expenseType,
        amount,
        description: `Recorded via voice call`,
      });

      updateSession(session, 'MAIN_MENU');
      builder
        .say(getPrompt(session.language, 'expenseRecorded'))
        .getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
    } catch (error) {
      builder.say(getPrompt(session.language, 'error'));
    }

    return { response: builder.build() };
  }

  // Start expense recording - ask for type
  updateSession(session, 'EXPENSE_TYPE');
  builder.getDigits(getPrompt(session.language, 'selectExpenseType'), 1, 30, '#');

  return { response: builder.build() };
}

async function handleMarketplace(session: VoiceSession, dtmfDigits?: string): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (!session.userId) {
    builder.say(getPrompt(session.language, 'notAuthenticated'));
    updateSession(session, 'WELCOME');
    return { response: builder.build() };
  }

  if (session.state === 'MARKETPLACE_MENU') {
    if (!dtmfDigits) {
      builder.getDigits(getPrompt(session.language, 'marketplaceMenu'), 1, 30, '#');
      return { response: builder.build() };
    }

    switch (dtmfDigits) {
      case '1': {
        // Browse listings
        try {
          const listings = await getMarketplaceListings(5);
          if (listings.length === 0) {
            builder.say(getPrompt(session.language, 'noListings'));
          } else {
            for (const listing of listings) {
              builder.say(`${listing.title}, ${listing.quantity} ${listing.unit} at ${listing.pricePerUnit} per unit.`);
            }
            builder.say('Press 1 to place an order on the first listing, or 0 to go back.');
            updateSession(session, 'MARKETPLACE_ORDER', { listings });
          }
          builder.getDigits('', 1, 30, '#');
        } catch (err) {
          builder.say(getPrompt(session.language, 'error'));
        }
        return { response: builder.build() };
      }
      case '2': {
        // Create listing
        updateSession(session, 'MARKETPLACE_CREATE_CROP');
        builder.record(getPrompt(session.language, 'createListingCrop'), 30, 3, '#');
        return { response: builder.build() };
      }
      case '0': {
        updateSession(session, 'MAIN_MENU');
        return handleMainMenu(session);
      }
      default: {
        builder.say(getPrompt(session.language, 'invalidInput'));
        builder.getDigits(getPrompt(session.language, 'marketplaceMenu'), 1, 30, '#');
        return { response: builder.build() };
      }
    }
  }

  if (session.state === 'MARKETPLACE_CREATE_CROP') {
    updateSession(session, 'MARKETPLACE_CREATE_QTY', { listingCrop: 'crop' });
    builder.getDigits(getPrompt(session.language, 'createListingQuantity'), 10, 30, '#');
    return { response: builder.build() };
  }

  if (session.state === 'MARKETPLACE_CREATE_QTY' && dtmfDigits) {
    updateSession(session, 'MARKETPLACE_CREATE_PRICE', { listingQuantity: parseInt(dtmfDigits, 10) });
    builder.getDigits(getPrompt(session.language, 'createListingPrice'), 10, 30, '#');
    return { response: builder.build() };
  }

  if (session.state === 'MARKETPLACE_CREATE_PRICE' && dtmfDigits) {
    try {
      await createListing(session.userId, {
        cropName: session.context.listingCrop || 'crop',
        quantity: session.context.listingQuantity || 0,
        pricePerKg: parseInt(dtmfDigits, 10),
      });
      updateSession(session, 'MAIN_MENU');
      builder
        .say(getPrompt(session.language, 'listingCreated'))
        .getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
    } catch (err) {
      builder.say(getPrompt(session.language, 'error'));
    }
    return { response: builder.build() };
  }

  if (session.state === 'MARKETPLACE_ORDER' && dtmfDigits) {
    if (dtmfDigits === '1') {
      try {
        const listings = session.context.listings || [];
        if (listings.length > 0) {
          await createOrder(session.userId, {
            listingId: listings[0].id,
            quantity: listings[0].quantity,
            deliveryAddress: 'Voice order - address pending',
          });
          builder.say('Order placed successfully.');
        } else {
          builder.say(getPrompt(session.language, 'noListings'));
        }
      } catch (err) {
        builder.say(getPrompt(session.language, 'error'));
      }
    }
    updateSession(session, 'MAIN_MENU');
    builder.getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
    return { response: builder.build() };
  }

  // Default - show marketplace menu
  updateSession(session, 'MARKETPLACE_MENU');
  builder.getDigits(getPrompt(session.language, 'marketplaceMenu'), 1, 30, '#');
  return { response: builder.build() };
}

async function handleOrders(session: VoiceSession): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (!session.userId) {
    builder.say(getPrompt(session.language, 'notAuthenticated'));
    updateSession(session, 'WELCOME');
    return { response: builder.build() };
  }

  try {
    const report = await getFinancialSummary(session.userId, 'month');

    if (!report || (report.totalRevenue === 0 && report.totalExpenses === 0)) {
      builder.say(getPrompt(session.language, 'noOrders'));
    } else {
      builder.say(`You have ${report.totalRevenue} in revenue this month from your orders.`);
    }
  } catch (err) {
    builder.say(getPrompt(session.language, 'noOrders'));
  }

  updateSession(session, 'MAIN_MENU');
  builder.getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');
  return { response: builder.build() };
}

async function handleFinancialReport(session: VoiceSession): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (!session.userId) {
    builder.say(getPrompt(session.language, 'notAuthenticated'));
    updateSession(session, 'WELCOME');
    return { response: builder.build() };
  }

  try {
    const report = await getFinancialSummary(session.userId, 'month');

    builder
      .say(getPrompt(session.language, 'financialReportMonthly'))
      .say(`${getPrompt(session.language, 'revenue')} ${report.totalRevenue}`)
      .say(`${getPrompt(session.language, 'expenses')} ${report.totalExpenses}`)
      .say(`${getPrompt(session.language, 'profit')} ${report.netProfit}`)
      .getDigits(getPrompt(session.language, 'mainMenu'), 1, 30, '#');

    updateSession(session, 'MAIN_MENU');
  } catch (error) {
    builder.say(getPrompt(session.language, 'error'));
  }

  return { response: builder.build() };
}

// ============================================================================
// Main Voice Router
// ============================================================================

async function processVoiceCall(
  sessionId: string,
  phoneNumber: string,
  dtmfDigits?: string,
  isActive: boolean = true
): Promise<VoiceResponse> {
  const builder = new VoiceResponseBuilder();

  if (!isActive) {
    clearSession(sessionId);
    builder.say(getPrompt('en', 'goodbye'));
    return { response: builder.build() };
  }

  const session = getOrCreateSession(sessionId, phoneNumber);

  // Check if session expired
  if (session.expiresAt < new Date()) {
    clearSession(sessionId);
    builder.say(getPrompt(session.language, 'sessionTimeout'));
    return { response: builder.build() };
  }

  // Route based on current state and input
  if (session.state === 'WELCOME') {
    if (!dtmfDigits) {
      return handleWelcome(session);
    }

    switch (dtmfDigits) {
      case '1':
        return handleRegistration(session);
      case '2':
        // Login - check if user exists
        const user = await getUserByPhone(phoneNumber);
        if (user) {
          session.userId = user;
          updateSession(session, 'MAIN_MENU');
          return handleMainMenu(session);
        } else {
          builder.say('User not found. Please register first.');
          return handleWelcome(session);
        }
      case '0':
        builder.say('For help, please visit our website or contact support.');
        return handleWelcome(session);
      default:
        builder.say(getPrompt(session.language, 'invalidInput'));
        return handleWelcome(session);
    }
  }

  if (session.state === 'MAIN_MENU') {
    if (!dtmfDigits) {
      return handleMainMenu(session);
    }

    switch (dtmfDigits) {
      case '1':
        return handleRecordHarvest(session);
      case '2':
        return handleRecordExpense(session);
      case '3':
        return handleMarketplace(session);
      case '4':
        return handleOrders(session);
      case '5':
        return handleFinancialReport(session);
      case '0':
        clearSession(sessionId);
        builder.say(getPrompt(session.language, 'goodbye'));
        return { response: builder.build() };
      default:
        builder.say(getPrompt(session.language, 'invalidInput'));
        return handleMainMenu(session);
    }
  }

  // Handle registration states
  if (session.state.startsWith('REGISTER_')) {
    return handleRegistration(session, dtmfDigits);
  }

  // Handle harvest states
  if (session.state.startsWith('HARVEST_')) {
    return handleRecordHarvest(session, dtmfDigits);
  }

  // Handle marketplace states
  if (session.state.startsWith('MARKETPLACE_')) {
    return handleMarketplace(session, dtmfDigits);
  }

  // Handle expense states
  if (session.state.startsWith('EXPENSE_')) {
    return handleRecordExpense(session, dtmfDigits);
  }

  // Default fallback
  builder.say(getPrompt(session.language, 'error'));
  return handleWelcome(session);
}

// ============================================================================
// TRPC Router
// ============================================================================

export const voiceRouter = router({
  voiceCallback: publicProcedure
    .input(VoiceCallbackSchema)
    .mutation(async ({ input }: { input: z.infer<typeof VoiceCallbackSchema> }) => {
      try {
        const { sessionId, callerNumber, dtmfDigits, isActive } = input;

        const result = await processVoiceCall(
          sessionId,
          callerNumber,
          dtmfDigits,
          isActive
        );

        return result.response;
      } catch (error) {
        logger.error('Voice callback error:', error);
        
        const builder = new VoiceResponseBuilder();
        builder.say('An error occurred. Please try again later.');
        return builder.build();
      }
    }),
});
