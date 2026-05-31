/**
 * IVR Voice Interface Service
 * Provides voice-based registration and loan status for farmers who can't read
 */

import { Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../logger.js';

// Voice menu states
export enum IVRState {
  MAIN_MENU = 'main_menu',
  REGISTRATION = 'registration',
  REG_NAME = 'reg_name',
  REG_REGION = 'reg_region',
  REG_CONFIRM = 'reg_confirm',
  LOAN_STATUS = 'loan_status',
  LOAN_APPLY = 'loan_apply',
  LOAN_AMOUNT = 'loan_amount',
  LOAN_PURPOSE = 'loan_purpose',
  LOAN_CONFIRM = 'loan_confirm',
  MARKET_PRICES = 'market_prices',
  WEATHER = 'weather',
  HELP = 'help',
}

// Voice prompts in multiple languages
const voicePrompts: Record<string, Record<string, string>> = {
  en: {
    welcome: 'Welcome to AgriFinance. Press 1 for registration, 2 for loan status, 3 for market prices, 4 for weather, 0 for help.',
    registration_name: 'Please say your full name after the beep.',
    registration_region: 'Please say your region or district after the beep.',
    registration_confirm: 'You said your name is {name} from {region}. Press 1 to confirm, 2 to start over.',
    registration_success: 'Registration successful. Your farmer ID is {farmerId}. You will receive an SMS with details.',
    loan_status_prompt: 'Please enter your farmer ID followed by the hash key.',
    loan_status_result: 'Your loan status: Amount {amount}, remaining balance {balance}, next payment due {dueDate}.',
    loan_status_none: 'You have no active loans. Press 1 to apply for a loan, 0 to return to main menu.',
    loan_apply_amount: 'Please enter the loan amount you need in thousands. For example, press 50 for 50,000.',
    loan_apply_purpose: 'Press 1 for seeds and inputs, 2 for equipment, 3 for livestock, 4 for other.',
    loan_confirm: 'You are applying for a loan of {amount} for {purpose}. Press 1 to confirm, 2 to cancel.',
    loan_submitted: 'Your loan application has been submitted. Reference number is {reference}. You will receive an SMS update.',
    market_prices: 'Current market prices: Maize {maizePrice} per bag, Beans {beansPrice} per bag, Rice {ricePrice} per bag.',
    weather: 'Weather forecast for {region}: {forecast}. Rainfall expected: {rainfall}.',
    help: 'For assistance, press 1 to speak with an agent, 2 to hear menu options again.',
    invalid_input: 'Invalid input. Please try again.',
    goodbye: 'Thank you for using AgriFinance. Goodbye.',
    error: 'We are experiencing technical difficulties. Please try again later.',
  },
  sw: {
    welcome: 'Karibu AgriFinance. Bonyeza 1 kwa usajili, 2 kwa hali ya mkopo, 3 kwa bei za soko, 4 kwa hali ya hewa, 0 kwa msaada.',
    registration_name: 'Tafadhali sema jina lako kamili baada ya sauti.',
    registration_region: 'Tafadhali sema mkoa au wilaya yako baada ya sauti.',
    registration_confirm: 'Umesema jina lako ni {name} kutoka {region}. Bonyeza 1 kuthibitisha, 2 kuanza upya.',
    registration_success: 'Usajili umefanikiwa. Nambari yako ya mkulima ni {farmerId}. Utapokea SMS na maelezo.',
    loan_status_prompt: 'Tafadhali ingiza nambari yako ya mkulima ikifuatiwa na alama ya hash.',
    loan_status_result: 'Hali ya mkopo wako: Kiasi {amount}, salio lililobaki {balance}, malipo yajayo {dueDate}.',
    loan_status_none: 'Huna mikopo inayofanya kazi. Bonyeza 1 kuomba mkopo, 0 kurudi kwenye menyu kuu.',
    loan_apply_amount: 'Tafadhali ingiza kiasi cha mkopo unachohitaji kwa maelfu. Kwa mfano, bonyeza 50 kwa 50,000.',
    loan_apply_purpose: 'Bonyeza 1 kwa mbegu na pembejeo, 2 kwa vifaa, 3 kwa mifugo, 4 kwa mengine.',
    loan_confirm: 'Unaomba mkopo wa {amount} kwa {purpose}. Bonyeza 1 kuthibitisha, 2 kughairi.',
    loan_submitted: 'Maombi yako ya mkopo yamewasilishwa. Nambari ya kumbukumbu ni {reference}. Utapokea SMS ya sasisho.',
    market_prices: 'Bei za soko za sasa: Mahindi {maizePrice} kwa gunia, Maharage {beansPrice} kwa gunia, Mchele {ricePrice} kwa gunia.',
    weather: 'Utabiri wa hali ya hewa kwa {region}: {forecast}. Mvua inatarajiwa: {rainfall}.',
    help: 'Kwa msaada, bonyeza 1 kuzungumza na wakala, 2 kusikia chaguzi za menyu tena.',
    invalid_input: 'Ingizo batili. Tafadhali jaribu tena.',
    goodbye: 'Asante kwa kutumia AgriFinance. Kwaheri.',
    error: 'Tunakabiliwa na matatizo ya kiufundi. Tafadhali jaribu tena baadaye.',
  },
};

// IVR session data
interface IVRSession {
  sessionId: string;
  phoneNumber: string;
  state: IVRState;
  language: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Redis-backed session store with in-memory fallback
import { PersistentStateStore } from './redis-state-store.js';
const sessionStore = new PersistentStateStore<IVRSession>('ivr:sessions', 1800); // 30 min TTL

export class IVRVoiceService {
  private defaultLanguage: string = 'en';

  // Get or create session
  async getSession(sessionId: string, phoneNumber: string): Promise<IVRSession> {
    let session = await sessionStore.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        phoneNumber,
        state: IVRState.MAIN_MENU,
        language: this.defaultLanguage,
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await sessionStore.set(sessionId, session);
    }

    return session;
  }

  // Update session
  async updateSession(sessionId: string, updates: Partial<IVRSession>): Promise<void> {
    const session = await sessionStore.get(sessionId);
    if (session) {
      Object.assign(session, updates, { updatedAt: new Date() });
      await sessionStore.set(sessionId, session);
    }
  }

  // Delete session
  async deleteSession(sessionId: string): Promise<void> {
    await sessionStore.delete(sessionId);
  }

  // Get prompt in user's language
  getPrompt(key: string, language: string, replacements?: Record<string, string>): string {
    let prompt = voicePrompts[language]?.[key] || voicePrompts['en'][key] || '';
    
    if (replacements) {
      for (const [placeholder, value] of Object.entries(replacements)) {
        prompt = prompt.replace(`{${placeholder}}`, value);
      }
    }

    return prompt;
  }

  // Generate TwiML/Africa's Talking Voice XML response
  generateVoiceResponse(options: {
    say?: string;
    gather?: {
      input: 'dtmf' | 'speech' | 'dtmf speech';
      timeout?: number;
      numDigits?: number;
      finishOnKey?: string;
      action?: string;
    };
    record?: {
      maxLength?: number;
      playBeep?: boolean;
      action?: string;
    };
    redirect?: string;
    hangup?: boolean;
  }): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

    if (options.gather) {
      xml += `  <Gather input="${options.gather.input}"`;
      if (options.gather.timeout) xml += ` timeout="${options.gather.timeout}"`;
      if (options.gather.numDigits) xml += ` numDigits="${options.gather.numDigits}"`;
      if (options.gather.finishOnKey) xml += ` finishOnKey="${options.gather.finishOnKey}"`;
      if (options.gather.action) xml += ` action="${options.gather.action}"`;
      xml += '>\n';
      
      if (options.say) {
        xml += `    <Say>${options.say}</Say>\n`;
      }
      
      xml += '  </Gather>\n';
    } else if (options.say) {
      xml += `  <Say>${options.say}</Say>\n`;
    }

    if (options.record) {
      xml += `  <Record`;
      if (options.record.maxLength) xml += ` maxLength="${options.record.maxLength}"`;
      if (options.record.playBeep) xml += ` playBeep="true"`;
      if (options.record.action) xml += ` action="${options.record.action}"`;
      xml += ' />\n';
    }

    if (options.redirect) {
      xml += `  <Redirect>${options.redirect}</Redirect>\n`;
    }

    if (options.hangup) {
      xml += '  <Hangup />\n';
    }

    xml += '</Response>';
    return xml;
  }

  // Handle incoming IVR request
  async handleIVRRequest(req: Request): Promise<string> {
    const {
      sessionId,
      phoneNumber,
      dtmfDigits,
      speechResult,
      recordingUrl,
    } = this.parseRequest(req);

    const session = await this.getSession(sessionId, phoneNumber);
    const input = dtmfDigits || speechResult || '';

    // Route based on current state
    switch (session.state) {
      case IVRState.MAIN_MENU:
        return this.handleMainMenu(session, input);
      
      case IVRState.REG_NAME:
        return this.handleRegistrationName(session, speechResult || recordingUrl);
      
      case IVRState.REG_REGION:
        return this.handleRegistrationRegion(session, speechResult || recordingUrl);
      
      case IVRState.REG_CONFIRM:
        return this.handleRegistrationConfirm(session, input);
      
      case IVRState.LOAN_STATUS:
        return this.handleLoanStatus(session, input);
      
      case IVRState.LOAN_AMOUNT:
        return this.handleLoanAmount(session, input);
      
      case IVRState.LOAN_PURPOSE:
        return this.handleLoanPurpose(session, input);
      
      case IVRState.LOAN_CONFIRM:
        return this.handleLoanConfirm(session, input);
      
      case IVRState.MARKET_PRICES:
        return this.handleMarketPrices(session);
      
      case IVRState.WEATHER:
        return this.handleWeather(session);
      
      case IVRState.HELP:
        return this.handleHelp(session, input);
      
      default:
        return this.handleMainMenu(session, '');
    }
  }

  // Parse incoming request (supports Twilio and Africa's Talking)
  private parseRequest(req: Request): {
    sessionId: string;
    phoneNumber: string;
    dtmfDigits?: string;
    speechResult?: string;
    recordingUrl?: string;
  } {
    // Africa's Talking format
    if (req.body.sessionId) {
      return {
        sessionId: req.body.sessionId,
        phoneNumber: req.body.phoneNumber || req.body.callerNumber,
        dtmfDigits: req.body.dtmfDigits,
        speechResult: req.body.speechResult,
        recordingUrl: req.body.recordingUrl,
      };
    }

    // Twilio format
    return {
      sessionId: req.body.CallSid,
      phoneNumber: req.body.From,
      dtmfDigits: req.body.Digits,
      speechResult: req.body.SpeechResult,
      recordingUrl: req.body.RecordingUrl,
    };
  }

  // Main menu handler
  private async handleMainMenu(session: IVRSession, input: string): Promise<string> {
    switch (input) {
      case '1':
        this.updateSession(session.sessionId, { state: IVRState.REG_NAME });
        return this.generateVoiceResponse({
          say: this.getPrompt('registration_name', session.language),
          record: { maxLength: 10, playBeep: true },
        });
      
      case '2':
        this.updateSession(session.sessionId, { state: IVRState.LOAN_STATUS });
        return this.generateVoiceResponse({
          say: this.getPrompt('loan_status_prompt', session.language),
          gather: { input: 'dtmf', timeout: 10, finishOnKey: '#' },
        });
      
      case '3':
        this.updateSession(session.sessionId, { state: IVRState.MARKET_PRICES });
        return this.handleMarketPrices(session);
      
      case '4':
        this.updateSession(session.sessionId, { state: IVRState.WEATHER });
        return this.handleWeather(session);
      
      case '0':
        this.updateSession(session.sessionId, { state: IVRState.HELP });
        return this.generateVoiceResponse({
          say: this.getPrompt('help', session.language),
          gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
        });
      
      default:
        return this.generateVoiceResponse({
          say: this.getPrompt('welcome', session.language),
          gather: { input: 'dtmf speech', timeout: 10, numDigits: 1 },
        });
    }
  }

  // Registration name handler
  private handleRegistrationName(session: IVRSession, nameInput?: string): string {
    if (nameInput) {
      session.data.name = nameInput;
      this.updateSession(session.sessionId, { 
        state: IVRState.REG_REGION,
        data: session.data,
      });
      
      return this.generateVoiceResponse({
        say: this.getPrompt('registration_region', session.language),
        record: { maxLength: 10, playBeep: true },
      });
    }

    return this.generateVoiceResponse({
      say: this.getPrompt('registration_name', session.language),
      record: { maxLength: 10, playBeep: true },
    });
  }

  // Registration region handler
  private handleRegistrationRegion(session: IVRSession, regionInput?: string): string {
    if (regionInput) {
      session.data.region = regionInput;
      this.updateSession(session.sessionId, { 
        state: IVRState.REG_CONFIRM,
        data: session.data,
      });
      
      return this.generateVoiceResponse({
        say: this.getPrompt('registration_confirm', session.language, {
          name: session.data.name,
          region: session.data.region,
        }),
        gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
      });
    }

    return this.generateVoiceResponse({
      say: this.getPrompt('registration_region', session.language),
      record: { maxLength: 10, playBeep: true },
    });
  }

  // Registration confirm handler
  private async handleRegistrationConfirm(session: IVRSession, input: string): Promise<string> {
    if (input === '1') {
      // Create farmer record
      const farmerId = `F${Date.now().toString().slice(-8)}`;

      // Save farmer to database
      try {
        const { getDb } = await import('../db.js');
        const { farmers } = await import('../../drizzle/schema.js');
        const { users } = await import('../../drizzle/schema.js');
        const db = await getDb();
        if (db) {
          // Create a system user for IVR-registered farmers
          const nameParts = (session.data.name || 'Unknown').split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.slice(1).join(' ') || 'Farmer';

          const [newUser] = await db.insert(users).values({
            email: `ivr-${farmerId}@farmconnect.local`,
            password: `ivr-temp-${Date.now()}`,
            firstName: firstName,
            lastName: lastName,
            phoneNumber: session.phoneNumber || '',
            role: 'farmer',
          }).returning();

          await db.insert(farmers).values({
            userId: newUser.id,
            firstName,
            lastName,
            phoneNumber: session.phoneNumber || '',
            region: session.data.region || '',
            verificationStatus: 'pending',
          });
          logger.info(`[IVR] Farmer registered: ${farmerId} (${session.data.name}) via phone ${session.phoneNumber}`);
        }
      } catch (err) {
        logger.error('[IVR] Failed to save farmer to database:', err);
      }

      this.deleteSession(session.sessionId);
      
      return this.generateVoiceResponse({
        say: this.getPrompt('registration_success', session.language, { farmerId }),
        hangup: true,
      });
    }

    if (input === '2') {
      this.updateSession(session.sessionId, { 
        state: IVRState.REG_NAME,
        data: {},
      });
      
      return this.generateVoiceResponse({
        say: this.getPrompt('registration_name', session.language),
        record: { maxLength: 10, playBeep: true },
      });
    }

    return this.generateVoiceResponse({
      say: this.getPrompt('invalid_input', session.language),
      gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
    });
  }

  // Loan status handler
  private async handleLoanStatus(session: IVRSession, farmerId: string): Promise<string> {
    if (!farmerId) {
      return this.generateVoiceResponse({
        say: this.getPrompt('loan_status_prompt', session.language),
        gather: { input: 'dtmf', timeout: 10, finishOnKey: '#' },
      });
    }

    // Fetch loan from database
    let loan: { status: string; principalAmount: number; outstandingBalance: number | null; nextPaymentDue: Date | null } | null = null;
    try {
      const { getDb } = await import('../db.js');
      const { loans } = await import('../../drizzle/financial-schema.js');
      const db = await getDb();
      if (db) {
        const results = await db.select()
          .from(loans)
          .where(and(
            eq(loans.status, 'active'),
            eq(loans.loanNumber, farmerId),
          ))
          .limit(1);
        if (results.length > 0) {
          loan = results[0];
        }
      }
    } catch (err) {
      logger.error('[IVR] Failed to fetch loan:', err);
    }

    if (!loan) {
      this.updateSession(session.sessionId, { state: IVRState.LOAN_APPLY });
      return this.generateVoiceResponse({
        say: this.getPrompt('loan_status_none', session.language),
        gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
      });
    }

    const amount = loan ? (loan.principalAmount / 100).toLocaleString() : '0';
    const balance = loan ? ((loan.outstandingBalance || 0) / 100).toLocaleString() : '0';
    const dueDate = loan?.nextPaymentDue ? loan.nextPaymentDue.toLocaleDateString('en-NG', { month: 'long', day: 'numeric' }) : 'N/A';
    return this.generateVoiceResponse({
      say: this.getPrompt('loan_status_result', session.language, {
        amount: `₦${amount}`,
        balance: `₦${balance}`,
        dueDate,
      }),
      hangup: true,
    });
  }

  // Loan amount handler
  private handleLoanAmount(session: IVRSession, input: string): string {
    if (input) {
      const amount = parseInt(input, 10) * 1000;
      session.data.loanAmount = amount;
      this.updateSession(session.sessionId, { 
        state: IVRState.LOAN_PURPOSE,
        data: session.data,
      });
      
      return this.generateVoiceResponse({
        say: this.getPrompt('loan_apply_purpose', session.language),
        gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
      });
    }

    return this.generateVoiceResponse({
      say: this.getPrompt('loan_apply_amount', session.language),
      gather: { input: 'dtmf', timeout: 10, finishOnKey: '#' },
    });
  }

  // Loan purpose handler
  private handleLoanPurpose(session: IVRSession, input: string): string {
    const purposes: Record<string, string> = {
      '1': 'Seeds and Inputs',
      '2': 'Equipment',
      '3': 'Livestock',
      '4': 'Other',
    };

    if (purposes[input]) {
      session.data.loanPurpose = purposes[input];
      this.updateSession(session.sessionId, { 
        state: IVRState.LOAN_CONFIRM,
        data: session.data,
      });
      
      return this.generateVoiceResponse({
        say: this.getPrompt('loan_confirm', session.language, {
          amount: session.data.loanAmount.toLocaleString(),
          purpose: session.data.loanPurpose,
        }),
        gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
      });
    }

    return this.generateVoiceResponse({
      say: this.getPrompt('invalid_input', session.language) + ' ' + 
           this.getPrompt('loan_apply_purpose', session.language),
      gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
    });
  }

  // Loan confirm handler
  private async handleLoanConfirm(session: IVRSession, input: string): Promise<string> {
    if (input === '1') {
      const reference = `LA${Date.now().toString().slice(-8)}`;
      
      // Create loan application in database
      try {
        const { getDb } = await import('../db.js');
        const { loans, lenders } = await import('../../drizzle/financial-schema.js');
        const db = await getDb();
        if (db) {
          // Find a default lender or use the first available
          const availableLenders = await db.select().from(lenders).limit(1);
          const lenderId = availableLenders.length > 0 ? availableLenders[0].id : 1;

          await db.insert(loans).values({
            userId: 1, // System user for IVR applications
            loanNumber: reference,
            lenderId,
            loanType: 'working_capital',
            principalAmount: (session.data.loanAmount || 0) * 100, // Convert to cents
            interestRate: 1500, // 15% default
            term: 12,
            status: 'pending',
            purpose: session.data.loanPurpose || 'IVR application',
            applicationDate: new Date(),
          });
          logger.info(`[IVR] Loan application created: ${reference} for ₦${session.data.loanAmount}`);
        }
      } catch (err) {
        logger.error('[IVR] Failed to create loan application:', err);
      }

      this.deleteSession(session.sessionId);
      
      return this.generateVoiceResponse({
        say: this.getPrompt('loan_submitted', session.language, { reference }),
        hangup: true,
      });
    }

    if (input === '2') {
      this.updateSession(session.sessionId, { state: IVRState.MAIN_MENU });
      return this.handleMainMenu(session, '');
    }

    return this.generateVoiceResponse({
      say: this.getPrompt('invalid_input', session.language),
      gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
    });
  }

  // Market prices handler
  private async handleMarketPrices(session: IVRSession): Promise<string> {
    // Fetch real market prices from database
    let prices = {
      maizePrice: '₦3,500',
      beansPrice: '₦8,000',
      ricePrice: '₦12,000',
    };
    try {
      const { getDb } = await import('../db.js');
      const db = await getDb();
      if (db) {
        // Query recent listings for price data
        const { produceListings } = await import('../../drizzle/schema.js');
        const recentListings = await db.select()
          .from(produceListings)
          .where(eq(produceListings.status, 'active'))
          .orderBy(desc(produceListings.createdAt))
          .limit(50);

        // Aggregate prices by crop
        const cropPrices: Record<string, number[]> = {};
        for (const listing of recentListings) {
          const crop = (listing.category || listing.title || '').toLowerCase();
          const price = typeof listing.pricePerUnit === 'string' ? parseFloat(listing.pricePerUnit) : (listing.pricePerUnit || 0);
          if (price > 0) {
            if (!cropPrices[crop]) cropPrices[crop] = [];
            cropPrices[crop].push(price);
          }
        }

        const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        const maize = cropPrices['maize'] || cropPrices['corn'];
        const beans = cropPrices['beans'] || cropPrices['cowpea'];
        const rice = cropPrices['rice'];

        if (maize) prices.maizePrice = `₦${avg(maize).toLocaleString()}`;
        if (beans) prices.beansPrice = `₦${avg(beans).toLocaleString()}`;
        if (rice) prices.ricePrice = `₦${avg(rice).toLocaleString()}`;
      }
    } catch (err) {
      logger.error('[IVR] Failed to fetch market prices:', err);
    }

    this.updateSession(session.sessionId, { state: IVRState.MAIN_MENU });
    
    return this.generateVoiceResponse({
      say: this.getPrompt('market_prices', session.language, prices) + ' ' +
           this.getPrompt('welcome', session.language),
      gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
    });
  }

  // Weather handler
  private async handleWeather(session: IVRSession): Promise<string> {
    // Fetch real weather data from database or weather service
    let weather = {
      region: session.data.region || 'your area',
      forecast: 'Partly cloudy with temperatures around 25 degrees',
      rainfall: '60 percent chance',
    };
    try {
      const { getDb } = await import('../db.js');
      const db = await getDb();
      if (db) {
        const { weatherAlerts } = await import('../../drizzle/notification-schema.js');
        // Get recent weather alerts for the region
        const alerts = await db.select()
          .from(weatherAlerts)
          .where(eq(weatherAlerts.isActive, true))
          .orderBy(desc(weatherAlerts.createdAt))
          .limit(3);

        if (alerts.length > 0) {
          const latest = alerts[0];
          weather = {
            region: session.data.region || latest.region || 'your area',
            forecast: (latest.description as string) || weather.forecast,
            rainfall: latest.severity === 'critical' ? '90 percent chance of heavy rain' :
                     latest.severity === 'warning' ? '70 percent chance' : '40 percent chance',
          };
        }
      }
    } catch (err) {
      logger.error('[IVR] Failed to fetch weather data:', err);
    }

    this.updateSession(session.sessionId, { state: IVRState.MAIN_MENU });
    
    return this.generateVoiceResponse({
      say: this.getPrompt('weather', session.language, weather) + ' ' +
           this.getPrompt('welcome', session.language),
      gather: { input: 'dtmf', timeout: 10, numDigits: 1 },
    });
  }

  // Help handler
  private async handleHelp(session: IVRSession, input: string): Promise<string> {
    if (input === '1') {
      // Transfer to agent
      return this.generateVoiceResponse({
        say: 'Please hold while we connect you to an agent.',
        // In production, add <Dial> to transfer
      });
    }

    this.updateSession(session.sessionId, { state: IVRState.MAIN_MENU });
    return this.handleMainMenu(session, '');
  }
}

// Factory function
export function createIVRService(): IVRVoiceService {
  return new IVRVoiceService();
}

export default IVRVoiceService;
