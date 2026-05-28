/**
 * Voice-Based Advisory Service
 * IVR system for low-literacy farmers with local language support
 * Integrates with weather, pest alerts, and market information
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { weatherService } from "./weather-service.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export type SupportedLanguage = 
  | 'english'
  | 'yoruba'
  | 'hausa'
  | 'igbo'
  | 'pidgin'
  | 'fulfulde'
  | 'kanuri'
  | 'tiv';

export type AdvisoryCategory = 
  | 'weather'
  | 'pest_alert'
  | 'market_prices'
  | 'planting_tips'
  | 'harvesting_tips'
  | 'storage_tips'
  | 'livestock'
  | 'finance'
  | 'general';

export interface VoiceAdvisory {
  id: string;
  category: AdvisoryCategory;
  title: string;
  content: string;
  audioUrls: Record<SupportedLanguage, string>;
  duration: number; // seconds
  priority: 'low' | 'medium' | 'high' | 'urgent';
  validFrom: Date;
  validUntil: Date;
  targetCrops?: string[];
  targetRegions?: string[];
  createdAt: Date;
}

export interface IVRMenu {
  id: string;
  name: string;
  language: SupportedLanguage;
  options: IVROption[];
  welcomeAudio: string;
  exitAudio: string;
}

export interface IVROption {
  digit: string;
  label: string;
  audioPrompt: string;
  action: 'submenu' | 'advisory' | 'callback' | 'transfer' | 'record';
  targetId?: string;
  description: string;
}

export interface VoiceCall {
  id: string;
  farmerId: number;
  farmerPhone: string;
  language: SupportedLanguage;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  menuPath: string[];
  advisoriesPlayed: string[];
  callbackRequested: boolean;
  voiceMessageRecorded: boolean;
  voiceMessageUrl?: string;
  status: 'in_progress' | 'completed' | 'dropped' | 'callback_pending';
}

export interface CallbackRequest {
  id: string;
  farmerId: number;
  farmerPhone: string;
  farmerName: string;
  language: SupportedLanguage;
  topic: string;
  urgency: 'low' | 'medium' | 'high';
  voiceMessageUrl?: string;
  requestedAt: Date;
  scheduledFor?: Date;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  agentId?: string;
  notes?: string;
}

export interface SMSAlert {
  id: string;
  farmerId: number;
  phone: string;
  message: string;
  language: SupportedLanguage;
  category: AdvisoryCategory;
  sentAt: Date;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed';
}

export interface FarmerPreferences {
  farmerId: number;
  preferredLanguage: SupportedLanguage;
  preferredCallTime: string; // HH:MM format
  subscribedCategories: AdvisoryCategory[];
  crops: string[];
  region: string;
  smsEnabled: boolean;
  voiceEnabled: boolean;
  weeklyDigestEnabled: boolean;
}

// Language translations for common phrases
const TRANSLATIONS: Record<string, Record<SupportedLanguage, string>> = {
  welcome: {
    english: 'Welcome to Farmer Advisory Service. Press 1 for weather, 2 for market prices, 3 for farming tips.',
    yoruba: 'E kaabo si Eto Imoran Agbe. Te 1 fun oju ojo, 2 fun owo oja, 3 fun imoran oko.',
    hausa: 'Barka da zuwa Sabis na Shawarar Manoma. Danna 1 don yanayi, 2 don farashin kasuwa, 3 don shawarwarin noma.',
    igbo: 'Nnọọ na Ọrụ Ndụmọdụ Ọrụ Ugbo. Pịa 1 maka ihu igwe, 2 maka ahịa, 3 maka ndụmọdụ ọrụ ugbo.',
    pidgin: 'Welcome to Farmer Advisory Service. Press 1 for weather, 2 for market price, 3 for farming tips.',
    fulfulde: 'Bisimilla e Sabis Wasiyaaji Remooɓe. Ñoƴƴu 1 ngam weeyo, 2 ngam coggu luumo, 3 ngam wasiyaaji ndema.',
    kanuri: 'Salam alaikum Farmer Advisory Service. Danna 1 weather, 2 market prices, 3 farming tips.',
    tiv: 'Msen wase sha Farmer Advisory Service. Seer 1 sha iyange, 2 sha inja, 3 sha msen u tar.',
  },
  weather_update: {
    english: 'Today\'s weather forecast for your area:',
    yoruba: 'Asotele oju ojo oni fun agbegbe re:',
    hausa: 'Hasashen yanayin yau don yankinku:',
    igbo: 'Amụma ihu igwe taa maka mpaghara gị:',
    pidgin: 'Today weather forecast for your area:',
    fulfulde: 'Hasashen yanayin yau don yankinku:',
    kanuri: 'Today weather forecast for your area:',
    tiv: 'Iyange i yange sha tar wase:',
  },
  market_prices: {
    english: 'Current market prices in your area:',
    yoruba: 'Owo oja lowo yi ni agbegbe re:',
    hausa: 'Farashin kasuwa na yanzu a yankinku:',
    igbo: 'Ọnụ ahịa ugbu a na mpaghara gị:',
    pidgin: 'Current market prices for your area:',
    fulfulde: 'Coggu luumo jooni e nokku maa:',
    kanuri: 'Current market prices for your area:',
    tiv: 'Inja i yange sha tar wase:',
  },
  pest_alert: {
    english: 'Important pest alert for your crops:',
    yoruba: 'Ikilọ pataki nipa kokoro fun irugbin re:',
    hausa: 'Muhimmin faɗakarwa game da kwari don amfanin gonarku:',
    igbo: 'Ọkwa dị mkpa banyere ahụhụ maka ihe ọkụkụ gị:',
    pidgin: 'Important pest alert for your crops:',
    fulfulde: 'Tintinol teddungal dow nyamaaji ngam gese maa:',
    kanuri: 'Important pest alert for your crops:',
    tiv: 'Msen u tar sha kwagh u tar:',
  },
  goodbye: {
    english: 'Thank you for calling. Goodbye!',
    yoruba: 'E se fun pipe. O dabọ!',
    hausa: 'Na gode da kiran ku. Sai an jima!',
    igbo: 'Daalụ maka ịkpọ oku. Ka ọ dị!',
    pidgin: 'Thank you for calling. Bye bye!',
    fulfulde: 'A jaaraama e noddude. Haa yeeso!',
    kanuri: 'Thank you for calling. Goodbye!',
    tiv: 'Msen wase sha kwagh u tar. Sai an jima!',
  },
};

// IVR menu structure
const IVR_MENUS: Record<SupportedLanguage, IVRMenu> = {
  english: {
    id: 'main_en',
    name: 'Main Menu',
    language: 'english',
    welcomeAudio: '/audio/en/welcome.mp3',
    exitAudio: '/audio/en/goodbye.mp3',
    options: [
      { digit: '1', label: 'Weather', audioPrompt: '/audio/en/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Get weather forecast' },
      { digit: '2', label: 'Market Prices', audioPrompt: '/audio/en/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Get current market prices' },
      { digit: '3', label: 'Farming Tips', audioPrompt: '/audio/en/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips', description: 'Farming advice' },
      { digit: '4', label: 'Pest Alerts', audioPrompt: '/audio/en/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Pest and disease alerts' },
      { digit: '5', label: 'Speak to Agent', audioPrompt: '/audio/en/agent_prompt.mp3', action: 'callback', description: 'Request callback from agent' },
      { digit: '6', label: 'Leave Message', audioPrompt: '/audio/en/message_prompt.mp3', action: 'record', description: 'Record a voice message' },
      { digit: '0', label: 'Repeat', audioPrompt: '/audio/en/repeat_prompt.mp3', action: 'submenu', targetId: 'main_en', description: 'Repeat menu' },
    ],
  },
  yoruba: {
    id: 'main_yo',
    name: 'Akojọ Akọkọ',
    language: 'yoruba',
    welcomeAudio: '/audio/yo/welcome.mp3',
    exitAudio: '/audio/yo/goodbye.mp3',
    options: [
      { digit: '1', label: 'Oju Ojo', audioPrompt: '/audio/yo/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Gba asotele oju ojo' },
      { digit: '2', label: 'Owo Oja', audioPrompt: '/audio/yo/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Gba owo oja lowo yi' },
      { digit: '3', label: 'Imoran Oko', audioPrompt: '/audio/yo/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_yo', description: 'Imoran agbe' },
      { digit: '4', label: 'Ikilọ Kokoro', audioPrompt: '/audio/yo/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Ikilọ nipa kokoro' },
      { digit: '5', label: 'Ba Oluranlọwọ Sọrọ', audioPrompt: '/audio/yo/agent_prompt.mp3', action: 'callback', description: 'Beere fun ipe pada' },
      { digit: '0', label: 'Tun Sọ', audioPrompt: '/audio/yo/repeat_prompt.mp3', action: 'submenu', targetId: 'main_yo', description: 'Tun akojọ sọ' },
    ],
  },
  hausa: {
    id: 'main_ha',
    name: 'Babban Menu',
    language: 'hausa',
    welcomeAudio: '/audio/ha/welcome.mp3',
    exitAudio: '/audio/ha/goodbye.mp3',
    options: [
      { digit: '1', label: 'Yanayi', audioPrompt: '/audio/ha/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Sami hasashen yanayi' },
      { digit: '2', label: 'Farashin Kasuwa', audioPrompt: '/audio/ha/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Sami farashin kasuwa' },
      { digit: '3', label: 'Shawarwarin Noma', audioPrompt: '/audio/ha/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_ha', description: 'Shawarwarin noma' },
      { digit: '4', label: 'Faɗakarwar Kwari', audioPrompt: '/audio/ha/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Faɗakarwa game da kwari' },
      { digit: '5', label: 'Yi Magana da Wakili', audioPrompt: '/audio/ha/agent_prompt.mp3', action: 'callback', description: 'Nemi kira baya' },
      { digit: '0', label: 'Maimaita', audioPrompt: '/audio/ha/repeat_prompt.mp3', action: 'submenu', targetId: 'main_ha', description: 'Maimaita menu' },
    ],
  },
  igbo: {
    id: 'main_ig',
    name: 'Menu Isi',
    language: 'igbo',
    welcomeAudio: '/audio/ig/welcome.mp3',
    exitAudio: '/audio/ig/goodbye.mp3',
    options: [
      { digit: '1', label: 'Ihu Igwe', audioPrompt: '/audio/ig/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Nweta amụma ihu igwe' },
      { digit: '2', label: 'Ọnụ Ahịa', audioPrompt: '/audio/ig/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Nweta ọnụ ahịa ugbu a' },
      { digit: '3', label: 'Ndụmọdụ Ọrụ Ugbo', audioPrompt: '/audio/ig/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_ig', description: 'Ndụmọdụ ọrụ ugbo' },
      { digit: '4', label: 'Ọkwa Ahụhụ', audioPrompt: '/audio/ig/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Ọkwa banyere ahụhụ' },
      { digit: '5', label: 'Kpọọ Onye Ọrụ', audioPrompt: '/audio/ig/agent_prompt.mp3', action: 'callback', description: 'Rịọ ka akpọghachi gị oku' },
      { digit: '0', label: 'Kwuo Ọzọ', audioPrompt: '/audio/ig/repeat_prompt.mp3', action: 'submenu', targetId: 'main_ig', description: 'Kwuo menu ọzọ' },
    ],
  },
  pidgin: {
    id: 'main_pcm',
    name: 'Main Menu',
    language: 'pidgin',
    welcomeAudio: '/audio/pcm/welcome.mp3',
    exitAudio: '/audio/pcm/goodbye.mp3',
    options: [
      { digit: '1', label: 'Weather', audioPrompt: '/audio/pcm/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Get weather forecast' },
      { digit: '2', label: 'Market Price', audioPrompt: '/audio/pcm/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Get current market prices' },
      { digit: '3', label: 'Farming Tips', audioPrompt: '/audio/pcm/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_pcm', description: 'Farming advice' },
      { digit: '4', label: 'Pest Wahala', audioPrompt: '/audio/pcm/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Pest and disease alerts' },
      { digit: '5', label: 'Talk to Person', audioPrompt: '/audio/pcm/agent_prompt.mp3', action: 'callback', description: 'Request callback' },
      { digit: '0', label: 'Repeat', audioPrompt: '/audio/pcm/repeat_prompt.mp3', action: 'submenu', targetId: 'main_pcm', description: 'Repeat menu' },
    ],
  },
  fulfulde: {
    id: 'main_ff',
    name: 'Menu Mawɗo',
    language: 'fulfulde',
    welcomeAudio: '/audio/ff/welcome.mp3',
    exitAudio: '/audio/ff/goodbye.mp3',
    options: [
      { digit: '1', label: 'Weeyo', audioPrompt: '/audio/ff/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Heɓu hasashen weeyo' },
      { digit: '2', label: 'Coggu Luumo', audioPrompt: '/audio/ff/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Heɓu coggu luumo' },
      { digit: '3', label: 'Wasiyaaji Ndema', audioPrompt: '/audio/ff/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_ff', description: 'Wasiyaaji ndema' },
      { digit: '4', label: 'Tintinol Nyamaaji', audioPrompt: '/audio/ff/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Tintinol dow nyamaaji' },
      { digit: '5', label: 'Haala e Gollooɗo', audioPrompt: '/audio/ff/agent_prompt.mp3', action: 'callback', description: 'Ñaago noddude gaɗa' },
      { digit: '0', label: 'Firtu', audioPrompt: '/audio/ff/repeat_prompt.mp3', action: 'submenu', targetId: 'main_ff', description: 'Firtu menu' },
    ],
  },
  kanuri: {
    id: 'main_kr',
    name: 'Main Menu',
    language: 'kanuri',
    welcomeAudio: '/audio/kr/welcome.mp3',
    exitAudio: '/audio/kr/goodbye.mp3',
    options: [
      { digit: '1', label: 'Weather', audioPrompt: '/audio/kr/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Get weather forecast' },
      { digit: '2', label: 'Market Prices', audioPrompt: '/audio/kr/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Get current market prices' },
      { digit: '3', label: 'Farming Tips', audioPrompt: '/audio/kr/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_kr', description: 'Farming advice' },
      { digit: '4', label: 'Pest Alerts', audioPrompt: '/audio/kr/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Pest and disease alerts' },
      { digit: '5', label: 'Speak to Agent', audioPrompt: '/audio/kr/agent_prompt.mp3', action: 'callback', description: 'Request callback from agent' },
      { digit: '0', label: 'Repeat', audioPrompt: '/audio/kr/repeat_prompt.mp3', action: 'submenu', targetId: 'main_kr', description: 'Repeat menu' },
    ],
  },
  tiv: {
    id: 'main_tiv',
    name: 'Menu Msen',
    language: 'tiv',
    welcomeAudio: '/audio/tiv/welcome.mp3',
    exitAudio: '/audio/tiv/goodbye.mp3',
    options: [
      { digit: '1', label: 'Iyange', audioPrompt: '/audio/tiv/weather_prompt.mp3', action: 'advisory', targetId: 'weather', description: 'Gba iyange' },
      { digit: '2', label: 'Inja', audioPrompt: '/audio/tiv/market_prompt.mp3', action: 'advisory', targetId: 'market_prices', description: 'Gba inja' },
      { digit: '3', label: 'Msen u Tar', audioPrompt: '/audio/tiv/tips_prompt.mp3', action: 'submenu', targetId: 'farming_tips_tiv', description: 'Msen u tar' },
      { digit: '4', label: 'Kwagh u Tar', audioPrompt: '/audio/tiv/pest_prompt.mp3', action: 'advisory', targetId: 'pest_alert', description: 'Kwagh u tar' },
      { digit: '5', label: 'Seer Ior', audioPrompt: '/audio/tiv/agent_prompt.mp3', action: 'callback', description: 'Seer ior' },
      { digit: '0', label: 'Tun', audioPrompt: '/audio/tiv/repeat_prompt.mp3', action: 'submenu', targetId: 'main_tiv', description: 'Tun menu' },
    ],
  },
};

class VoiceAdvisoryService {
  private advisories: BoundedMap<string, VoiceAdvisory> = new BoundedMap(2000, 86400_000);
  private calls: BoundedMap<string, VoiceCall> = new BoundedMap(5000, 43200_000);
  private callbackRequests: BoundedMap<string, CallbackRequest> = new BoundedMap(1000, 86400_000);
  private smsAlerts: BoundedMap<string, SMSAlert> = new BoundedMap(5000, 86400_000);
  private farmerPreferences: BoundedMap<number, FarmerPreferences> = new BoundedMap(5000, 86400_000);

  /**
   * Get IVR menu for a language
   */
  getIVRMenu(language: SupportedLanguage): IVRMenu {
    return IVR_MENUS[language] || IVR_MENUS.english;
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): Array<{ code: SupportedLanguage; name: string; nativeName: string }> {
    return [
      { code: 'english', name: 'English', nativeName: 'English' },
      { code: 'yoruba', name: 'Yoruba', nativeName: 'Yorùbá' },
      { code: 'hausa', name: 'Hausa', nativeName: 'Hausa' },
      { code: 'igbo', name: 'Igbo', nativeName: 'Igbo' },
      { code: 'pidgin', name: 'Nigerian Pidgin', nativeName: 'Pidgin' },
      { code: 'fulfulde', name: 'Fulfulde', nativeName: 'Fulfulde' },
      { code: 'kanuri', name: 'Kanuri', nativeName: 'Kanuri' },
      { code: 'tiv', name: 'Tiv', nativeName: 'Tiv' },
    ];
  }

  /**
   * Create a voice advisory
   */
  async createAdvisory(params: {
    category: AdvisoryCategory;
    title: string;
    content: string;
    priority: VoiceAdvisory['priority'];
    validDays: number;
    targetCrops?: string[];
    targetRegions?: string[];
  }): Promise<VoiceAdvisory> {
    const { category, title, content, priority, validDays, targetCrops, targetRegions } = params;

    const advisoryId = `VA-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    
    // Generate audio URLs for each language (would integrate with TTS service)
    const audioUrls: Record<SupportedLanguage, string> = {
      english: `/audio/advisories/${advisoryId}_en.mp3`,
      yoruba: `/audio/advisories/${advisoryId}_yo.mp3`,
      hausa: `/audio/advisories/${advisoryId}_ha.mp3`,
      igbo: `/audio/advisories/${advisoryId}_ig.mp3`,
      pidgin: `/audio/advisories/${advisoryId}_pcm.mp3`,
      fulfulde: `/audio/advisories/${advisoryId}_ff.mp3`,
      kanuri: `/audio/advisories/${advisoryId}_kr.mp3`,
      tiv: `/audio/advisories/${advisoryId}_tiv.mp3`,
    };

    const advisory: VoiceAdvisory = {
      id: advisoryId,
      category,
      title,
      content,
      audioUrls,
      duration: Math.ceil(content.length / 15), // Rough estimate: 15 chars per second
      priority,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
      targetCrops,
      targetRegions,
      createdAt: new Date(),
    };

    this.advisories.set(advisoryId, advisory);

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'voice-advisory-events',
        messages: [{
          key: advisoryId,
          value: JSON.stringify({
            event: 'advisory_created',
            advisory,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[VoiceAdvisory] Could not emit Kafka event:', error);
    }

    return advisory;
  }

  /**
   * Get advisories for a farmer
   */
  async getAdvisoriesForFarmer(params: {
    farmerId: number;
    crops: string[];
    region: string;
    language: SupportedLanguage;
    category?: AdvisoryCategory;
  }): Promise<VoiceAdvisory[]> {
    const { crops, region, category } = params;
    const now = new Date();

    let advisories = Array.from(this.advisories.values()).filter(a => 
      a.validFrom <= now && a.validUntil >= now
    );

    // Filter by category
    if (category) {
      advisories = advisories.filter(a => a.category === category);
    }

    // Filter by crops
    advisories = advisories.filter(a => 
      !a.targetCrops || a.targetCrops.length === 0 ||
      a.targetCrops.some(c => crops.some(fc => fc.toLowerCase().includes(c.toLowerCase())))
    );

    // Filter by region
    advisories = advisories.filter(a =>
      !a.targetRegions || a.targetRegions.length === 0 ||
      a.targetRegions.some(r => region.toLowerCase().includes(r.toLowerCase()))
    );

    // Sort by priority and date
    return advisories.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  /**
   * Start a voice call session
   */
  async startCall(params: {
    farmerId: number;
    farmerPhone: string;
    language: SupportedLanguage;
  }): Promise<VoiceCall> {
    const { farmerId, farmerPhone, language } = params;

    const callId = `CALL-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const call: VoiceCall = {
      id: callId,
      farmerId,
      farmerPhone,
      language,
      startTime: new Date(),
      menuPath: ['main'],
      advisoriesPlayed: [],
      callbackRequested: false,
      voiceMessageRecorded: false,
      status: 'in_progress',
    };

    this.calls.set(callId, call);

    return call;
  }

  /**
   * Record menu navigation
   */
  async recordMenuNavigation(callId: string, menuId: string): Promise<void> {
    const call = this.calls.get(callId);
    if (call) {
      call.menuPath.push(menuId);
    }
  }

  /**
   * Record advisory played
   */
  async recordAdvisoryPlayed(callId: string, advisoryId: string): Promise<void> {
    const call = this.calls.get(callId);
    if (call) {
      call.advisoriesPlayed.push(advisoryId);
    }
  }

  /**
   * End a voice call
   */
  async endCall(callId: string): Promise<VoiceCall> {
    const call = this.calls.get(callId);
    if (!call) {
      throw new Error('Call not found');
    }

    call.endTime = new Date();
    call.duration = Math.round((call.endTime.getTime() - call.startTime.getTime()) / 1000);
    call.status = call.callbackRequested ? 'callback_pending' : 'completed';

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'voice-advisory-events',
        messages: [{
          key: callId,
          value: JSON.stringify({
            event: 'call_ended',
            call,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[VoiceAdvisory] Could not emit Kafka event:', error);
    }

    return call;
  }

  /**
   * Request callback from agent
   */
  async requestCallback(params: {
    farmerId: number;
    farmerPhone: string;
    farmerName: string;
    language: SupportedLanguage;
    topic: string;
    urgency: CallbackRequest['urgency'];
    voiceMessageUrl?: string;
  }): Promise<CallbackRequest> {
    const { farmerId, farmerPhone, farmerName, language, topic, urgency, voiceMessageUrl } = params;

    const requestId = `CB-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const request: CallbackRequest = {
      id: requestId,
      farmerId,
      farmerPhone,
      farmerName,
      language,
      topic,
      urgency,
      voiceMessageUrl,
      requestedAt: new Date(),
      status: 'pending',
    };

    this.callbackRequests.set(requestId, request);

    return request;
  }

  /**
   * Send SMS alert
   */
  async sendSMSAlert(params: {
    farmerId: number;
    phone: string;
    message: string;
    language: SupportedLanguage;
    category: AdvisoryCategory;
  }): Promise<SMSAlert> {
    const { farmerId, phone, message, language, category } = params;

    const alertId = `SMS-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const alert: SMSAlert = {
      id: alertId,
      farmerId,
      phone,
      message,
      language,
      category,
      sentAt: new Date(),
      deliveryStatus: 'pending',
    };

    this.smsAlerts.set(alertId, alert);

    // Would integrate with SMS gateway
    // Simulate sending
    setTimeout(() => {
      alert.deliveryStatus = 'delivered';
    }, 2000);

    return alert;
  }

  /**
   * Set farmer preferences
   */
  async setFarmerPreferences(preferences: FarmerPreferences): Promise<FarmerPreferences> {
    this.farmerPreferences.set(preferences.farmerId, preferences);
    return preferences;
  }

  /**
   * Get farmer preferences
   */
  getFarmerPreferences(farmerId: number): FarmerPreferences | null {
    return this.farmerPreferences.get(farmerId) || null;
  }

  /**
   * Generate weather advisory in local language
   */
  async generateWeatherAdvisory(params: {
    latitude: number;
    longitude: number;
    language: SupportedLanguage;
  }): Promise<{ text: string; audioUrl: string }> {
    const { latitude, longitude, language } = params;

    let weatherText = '';
    try {
      const weather = await weatherService.getCurrentWeather(latitude, longitude);
      if (weather) {
        weatherText = `Temperature: ${weather.temperature}°C, Humidity: ${weather.humidity}%, ${weather.description}`;
      } else {
        weatherText = 'Weather data is currently unavailable. Please try again later.';
      }
    } catch (err) {
      weatherText = 'Weather data is currently unavailable. Please try again later.';
    }

    const prefix = TRANSLATIONS.weather_update[language] || TRANSLATIONS.weather_update.english;
    const fullText = `${prefix} ${weatherText}`;

    return {
      text: fullText,
      audioUrl: `/audio/weather/${Date.now()}_${language}.mp3`,
    };
  }

  /**
   * Generate market price advisory in local language
   */
  async generateMarketPriceAdvisory(params: {
    crops: string[];
    region: string;
    language: SupportedLanguage;
  }): Promise<{ text: string; audioUrl: string }> {
    const { crops, region, language } = params;

    // Mock market prices (would come from market service)
    const prices: Record<string, number> = {
      maize: 350,
      rice: 800,
      cassava: 150,
      yam: 400,
      tomato: 500,
      pepper: 600,
    };

    const priceTexts = crops
      .filter(c => prices[c.toLowerCase()])
      .map(c => `${c}: ₦${prices[c.toLowerCase()]} per kg`);

    const prefix = TRANSLATIONS.market_prices[language] || TRANSLATIONS.market_prices.english;
    const fullText = priceTexts.length > 0
      ? `${prefix} ${priceTexts.join(', ')}`
      : `${prefix} No price data available for your crops.`;

    return {
      text: fullText,
      audioUrl: `/audio/market/${Date.now()}_${language}.mp3`,
    };
  }

  /**
   * Get translation for a phrase
   */
  getTranslation(phrase: string, language: SupportedLanguage): string {
    return TRANSLATIONS[phrase]?.[language] || TRANSLATIONS[phrase]?.english || phrase;
  }

  /**
   * Get pending callback requests
   */
  getPendingCallbacks(): CallbackRequest[] {
    return Array.from(this.callbackRequests.values())
      .filter(r => r.status === 'pending')
      .sort((a, b) => {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return a.requestedAt.getTime() - b.requestedAt.getTime();
      });
  }

  /**
   * Get call statistics
   */
  getCallStatistics(params: {
    startDate: Date;
    endDate: Date;
  }): {
    totalCalls: number;
    averageDuration: number;
    callsByLanguage: Record<SupportedLanguage, number>;
    callsByCategory: Record<AdvisoryCategory, number>;
    callbacksRequested: number;
    completionRate: number;
  } {
    const { startDate, endDate } = params;

    const periodCalls = Array.from(this.calls.values()).filter(c =>
      c.startTime >= startDate && c.startTime <= endDate
    );

    const callsByLanguage: Record<SupportedLanguage, number> = {
      english: 0, yoruba: 0, hausa: 0, igbo: 0,
      pidgin: 0, fulfulde: 0, kanuri: 0, tiv: 0,
    };

    const callsByCategory: Record<AdvisoryCategory, number> = {
      weather: 0, pest_alert: 0, market_prices: 0, planting_tips: 0,
      harvesting_tips: 0, storage_tips: 0, livestock: 0, finance: 0, general: 0,
    };

    let totalDuration = 0;
    let completedCalls = 0;
    let callbacksRequested = 0;

    for (const call of periodCalls) {
      callsByLanguage[call.language]++;
      if (call.duration) totalDuration += call.duration;
      if (call.status === 'completed') completedCalls++;
      if (call.callbackRequested) callbacksRequested++;

      // Count categories from advisories played
      for (const advisoryId of call.advisoriesPlayed) {
        const advisory = this.advisories.get(advisoryId);
        if (advisory) {
          callsByCategory[advisory.category]++;
        }
      }
    }

    return {
      totalCalls: periodCalls.length,
      averageDuration: periodCalls.length > 0 ? Math.round(totalDuration / periodCalls.length) : 0,
      callsByLanguage,
      callsByCategory,
      callbacksRequested,
      completionRate: periodCalls.length > 0 ? Math.round((completedCalls / periodCalls.length) * 100) : 0,
    };
  }

  /**
   * Get all active advisories
   */
  getActiveAdvisories(): VoiceAdvisory[] {
    const now = new Date();
    return Array.from(this.advisories.values()).filter(a =>
      a.validFrom <= now && a.validUntil >= now
    );
  }
}

export const voiceAdvisoryService = new VoiceAdvisoryService();
