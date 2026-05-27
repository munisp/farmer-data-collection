/**
 * USSD Fallback Integration Service for React Native
 * 
 * Features:
 * - Automatic fallback to USSD when data connectivity is poor/unavailable
 * - USSD session management and menu navigation
 * - SMS-based data submission as secondary fallback
 * - Offline data queuing for USSD submission
 * - Integration with native dialer for USSD codes
 * - Session state persistence across app restarts
 * - Network quality monitoring for automatic fallback triggers
 */

import { Linking, Platform, Alert } from 'react-native';
import * as Network from 'expo-network';
import * as SMS from 'expo-sms';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants
const USSD_SESSION_KEY = 'ussd_session_state';
const USSD_QUEUE_KEY = 'ussd_submission_queue';
const USSD_SETTINGS_KEY = 'ussd_fallback_settings';
const SMS_QUEUE_KEY = 'sms_submission_queue';

// USSD service codes (configurable per deployment)
const DEFAULT_USSD_CODES = {
  mainMenu: '*384*1#',
  registerFarmer: '*384*1*1#',
  recordHarvest: '*384*1*2#',
  checkPrices: '*384*1*3#',
  weatherAlert: '*384*1*4#',
  loanApplication: '*384*1*5#',
  checkBalance: '*384*1*6#',
};

// SMS shortcodes
const DEFAULT_SMS_CODES = {
  dataSubmission: '40384',
  helpLine: '40385',
};

// Types
export interface USSDCodes {
  mainMenu: string;
  registerFarmer: string;
  recordHarvest: string;
  checkPrices: string;
  weatherAlert: string;
  loanApplication: string;
  checkBalance: string;
}

export interface SMSCodes {
  dataSubmission: string;
  helpLine: string;
}

export interface USSDSession {
  id: string;
  code: string;
  startedAt: number;
  lastActivityAt: number;
  menuPath: string[];
  inputHistory: string[];
  status: 'active' | 'completed' | 'timeout' | 'error';
}

export interface USSDQueueItem {
  id: string;
  type: 'harvest' | 'farmer' | 'expense' | 'loan' | 'price_check' | 'weather';
  data: Record<string, any>;
  ussdCode: string;
  ussdInputs: string[];
  smsFormat?: string;
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface SMSQueueItem {
  id: string;
  recipient: string;
  message: string;
  type: 'data' | 'alert' | 'confirmation';
  priority: 'high' | 'normal' | 'low';
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt?: number;
  status: 'pending' | 'sent' | 'failed';
  error?: string;
}

export interface USSDFallbackSettings {
  enabled: boolean;
  autoFallbackOnPoorNetwork: boolean;
  networkQualityThreshold: '2g' | '3g' | 'offline';
  ussdCodes: USSDCodes;
  smsCodes: SMSCodes;
  sessionTimeoutMs: number;
  maxRetries: number;
  preferSMSOverUSSD: boolean;
  confirmBeforeDialing: boolean;
}

export interface FallbackStatus {
  isOnline: boolean;
  networkQuality: 'offline' | '2g' | '3g' | '4g' | 'wifi';
  shouldUseFallback: boolean;
  fallbackMethod: 'none' | 'ussd' | 'sms';
  pendingUSSDItems: number;
  pendingSMSItems: number;
  activeSession: USSDSession | null;
}

// Default settings
const DEFAULT_SETTINGS: USSDFallbackSettings = {
  enabled: true,
  autoFallbackOnPoorNetwork: true,
  networkQualityThreshold: '2g',
  ussdCodes: DEFAULT_USSD_CODES,
  smsCodes: DEFAULT_SMS_CODES,
  sessionTimeoutMs: 180000, // 3 minutes
  maxRetries: 3,
  preferSMSOverUSSD: false,
  confirmBeforeDialing: true,
};

// Data formatters for USSD/SMS
const DATA_FORMATTERS = {
  harvest: (data: Record<string, any>): { ussdInputs: string[]; smsFormat: string } => ({
    ussdInputs: [
      data.cropType || '',
      String(data.quantity || ''),
      data.unit || 'kg',
      data.farmId || '',
    ],
    smsFormat: `HARVEST ${data.cropType} ${data.quantity}${data.unit} ${data.farmId || 'NOFARM'}`,
  }),
  
  farmer: (data: Record<string, any>): { ussdInputs: string[]; smsFormat: string } => ({
    ussdInputs: [
      data.firstName || '',
      data.lastName || '',
      data.phone || '',
      data.village || '',
      data.district || '',
    ],
    smsFormat: `REGISTER ${data.firstName} ${data.lastName} ${data.phone} ${data.village} ${data.district}`,
  }),
  
  expense: (data: Record<string, any>): { ussdInputs: string[]; smsFormat: string } => ({
    ussdInputs: [
      data.category || '',
      String(data.amount || ''),
      data.description || '',
    ],
    smsFormat: `EXPENSE ${data.category} ${data.amount} ${data.description || 'NODESC'}`,
  }),
  
  loan: (data: Record<string, any>): { ussdInputs: string[]; smsFormat: string } => ({
    ussdInputs: [
      String(data.amount || ''),
      data.purpose || '',
      String(data.termMonths || ''),
    ],
    smsFormat: `LOAN ${data.amount} ${data.purpose} ${data.termMonths}M`,
  }),
  
  price_check: (data: Record<string, any>): { ussdInputs: string[]; smsFormat: string } => ({
    ussdInputs: [
      data.cropType || '',
      data.market || '',
    ],
    smsFormat: `PRICE ${data.cropType} ${data.market || 'LOCAL'}`,
  }),
  
  weather: (data: Record<string, any>): { ussdInputs: string[]; smsFormat: string } => ({
    ussdInputs: [
      data.location || '',
      data.days || '3',
    ],
    smsFormat: `WEATHER ${data.location || 'MYLOC'} ${data.days || '3'}D`,
  }),
};

class USSDFallbackService {
  private settings: USSDFallbackSettings = DEFAULT_SETTINGS;
  private ussdQueue: Map<string, USSDQueueItem> = new Map();
  private smsQueue: Map<string, SMSQueueItem> = new Map();
  private activeSession: USSDSession | null = null;
  private networkCheckInterval: NodeJS.Timeout | null = null;
  private statusCallbacks: Array<(status: FallbackStatus) => void> = [];

  /**
   * Initialize the USSD fallback service
   */
  async init(): Promise<void> {
    await this.loadSettings();
    await this.loadQueues();
    await this.loadSession();
    this.startNetworkMonitoring();
    console.log('[USSDFallback] Initialized');
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(USSD_SETTINGS_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('[USSDFallback] Failed to load settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings(settings: Partial<USSDFallbackSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await AsyncStorage.setItem(USSD_SETTINGS_KEY, JSON.stringify(this.settings));
  }

  /**
   * Get current settings
   */
  getSettings(): USSDFallbackSettings {
    return { ...this.settings };
  }

  /**
   * Load queues from storage
   */
  private async loadQueues(): Promise<void> {
    try {
      const ussdStored = await AsyncStorage.getItem(USSD_QUEUE_KEY);
      if (ussdStored) {
        this.ussdQueue = new Map(JSON.parse(ussdStored));
      }
      
      const smsStored = await AsyncStorage.getItem(SMS_QUEUE_KEY);
      if (smsStored) {
        this.smsQueue = new Map(JSON.parse(smsStored));
      }
    } catch (error) {
      console.error('[USSDFallback] Failed to load queues:', error);
    }
  }

  /**
   * Save queues to storage
   */
  private async saveQueues(): Promise<void> {
    try {
      await AsyncStorage.setItem(USSD_QUEUE_KEY, JSON.stringify(Array.from(this.ussdQueue.entries())));
      await AsyncStorage.setItem(SMS_QUEUE_KEY, JSON.stringify(Array.from(this.smsQueue.entries())));
    } catch (error) {
      console.error('[USSDFallback] Failed to save queues:', error);
    }
  }

  /**
   * Load active session from storage
   */
  private async loadSession(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(USSD_SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored) as USSDSession;
        // Check if session is still valid (not timed out)
        if (Date.now() - session.lastActivityAt < this.settings.sessionTimeoutMs) {
          this.activeSession = session;
        } else {
          // Session expired
          await AsyncStorage.removeItem(USSD_SESSION_KEY);
        }
      }
    } catch (error) {
      console.error('[USSDFallback] Failed to load session:', error);
    }
  }

  /**
   * Save active session to storage
   */
  private async saveSession(): Promise<void> {
    try {
      if (this.activeSession) {
        await AsyncStorage.setItem(USSD_SESSION_KEY, JSON.stringify(this.activeSession));
      } else {
        await AsyncStorage.removeItem(USSD_SESSION_KEY);
      }
    } catch (error) {
      console.error('[USSDFallback] Failed to save session:', error);
    }
  }

  /**
   * Start network quality monitoring
   */
  private startNetworkMonitoring(): void {
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
    }
    
    this.networkCheckInterval = setInterval(async () => {
      const status = await this.getStatus();
      this.notifyStatusChange(status);
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop network monitoring
   */
  stopNetworkMonitoring(): void {
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
  }

  /**
   * Detect network quality
   */
  private async detectNetworkQuality(): Promise<'offline' | '2g' | '3g' | '4g' | 'wifi'> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        return 'offline';
      }
      
      switch (networkState.type) {
        case Network.NetworkStateType.WIFI:
          return 'wifi';
        case Network.NetworkStateType.CELLULAR:
          // Default to 3g for cellular (expo-network doesn't provide generation)
          return '3g';
        default:
          return '3g';
      }
    } catch (error) {
      return 'offline';
    }
  }

  /**
   * Check if fallback should be used based on network quality
   */
  private shouldUseFallback(quality: 'offline' | '2g' | '3g' | '4g' | 'wifi'): boolean {
    if (!this.settings.enabled || !this.settings.autoFallbackOnPoorNetwork) {
      return false;
    }
    
    const qualityOrder = ['offline', '2g', '3g', '4g', 'wifi'];
    const currentIndex = qualityOrder.indexOf(quality);
    const thresholdIndex = qualityOrder.indexOf(this.settings.networkQualityThreshold);
    
    return currentIndex <= thresholdIndex;
  }

  /**
   * Get current fallback status
   */
  async getStatus(): Promise<FallbackStatus> {
    const networkQuality = await this.detectNetworkQuality();
    const shouldUseFallback = this.shouldUseFallback(networkQuality);
    
    let fallbackMethod: 'none' | 'ussd' | 'sms' = 'none';
    if (shouldUseFallback) {
      fallbackMethod = this.settings.preferSMSOverUSSD ? 'sms' : 'ussd';
    }
    
    return {
      isOnline: networkQuality !== 'offline',
      networkQuality,
      shouldUseFallback,
      fallbackMethod,
      pendingUSSDItems: Array.from(this.ussdQueue.values()).filter(i => i.status === 'pending').length,
      pendingSMSItems: Array.from(this.smsQueue.values()).filter(i => i.status === 'pending').length,
      activeSession: this.activeSession,
    };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: FallbackStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify status change to all subscribers
   */
  private notifyStatusChange(status: FallbackStatus): void {
    this.statusCallbacks.forEach(callback => callback(status));
  }

  /**
   * Queue data for USSD submission
   */
  async queueForUSSD(
    type: USSDQueueItem['type'],
    data: Record<string, any>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<USSDQueueItem> {
    const formatter = DATA_FORMATTERS[type];
    if (!formatter) {
      throw new Error(`Unknown data type: ${type}`);
    }
    
    const { ussdInputs, smsFormat } = formatter(data);
    const ussdCode = this.getUSSDCodeForType(type);
    
    const item: USSDQueueItem = {
      id: `ussd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      ussdCode,
      ussdInputs,
      smsFormat,
      priority,
      retryCount: 0,
      maxRetries: this.settings.maxRetries,
      createdAt: Date.now(),
      status: 'pending',
    };
    
    this.ussdQueue.set(item.id, item);
    await this.saveQueues();
    
    console.log(`[USSDFallback] Queued USSD item: ${item.id} (${type})`);
    return item;
  }

  /**
   * Queue data for SMS submission
   */
  async queueForSMS(
    type: USSDQueueItem['type'],
    data: Record<string, any>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<SMSQueueItem> {
    const formatter = DATA_FORMATTERS[type];
    if (!formatter) {
      throw new Error(`Unknown data type: ${type}`);
    }
    
    const { smsFormat } = formatter(data);
    
    const item: SMSQueueItem = {
      id: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipient: this.settings.smsCodes.dataSubmission,
      message: smsFormat,
      type: 'data',
      priority,
      retryCount: 0,
      maxRetries: this.settings.maxRetries,
      createdAt: Date.now(),
      status: 'pending',
    };
    
    this.smsQueue.set(item.id, item);
    await this.saveQueues();
    
    console.log(`[USSDFallback] Queued SMS item: ${item.id}`);
    return item;
  }

  /**
   * Get USSD code for data type
   */
  private getUSSDCodeForType(type: USSDQueueItem['type']): string {
    switch (type) {
      case 'harvest':
        return this.settings.ussdCodes.recordHarvest;
      case 'farmer':
        return this.settings.ussdCodes.registerFarmer;
      case 'loan':
        return this.settings.ussdCodes.loanApplication;
      case 'price_check':
        return this.settings.ussdCodes.checkPrices;
      case 'weather':
        return this.settings.ussdCodes.weatherAlert;
      default:
        return this.settings.ussdCodes.mainMenu;
    }
  }

  /**
   * Dial a USSD code
   */
  async dialUSSD(code: string, confirm: boolean = true): Promise<boolean> {
    // Encode USSD code for URL
    const encodedCode = encodeURIComponent(code);
    const telUrl = Platform.OS === 'android' 
      ? `tel:${encodedCode}` 
      : `tel://${encodedCode}`;
    
    // Check if we can open the dialer
    const canOpen = await Linking.canOpenURL(telUrl);
    if (!canOpen) {
      console.error('[USSDFallback] Cannot open dialer');
      return false;
    }
    
    // Confirm with user if required
    if (confirm && this.settings.confirmBeforeDialing) {
      return new Promise((resolve) => {
        Alert.alert(
          'Dial USSD Code',
          `This will dial ${code} to submit your data via USSD. Continue?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Dial', onPress: async () => {
              try {
                await Linking.openURL(telUrl);
                resolve(true);
              } catch (error) {
                console.error('[USSDFallback] Failed to dial:', error);
                resolve(false);
              }
            }},
          ]
        );
      });
    }
    
    try {
      await Linking.openURL(telUrl);
      return true;
    } catch (error) {
      console.error('[USSDFallback] Failed to dial:', error);
      return false;
    }
  }

  /**
   * Send an SMS
   */
  async sendSMS(recipient: string, message: string): Promise<boolean> {
    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
      console.error('[USSDFallback] SMS not available');
      return false;
    }
    
    try {
      const { result } = await SMS.sendSMSAsync([recipient], message);
      return result === 'sent' || result === 'unknown'; // 'unknown' on Android means SMS app was opened
    } catch (error) {
      console.error('[USSDFallback] Failed to send SMS:', error);
      return false;
    }
  }

  /**
   * Process next item in USSD queue
   */
  async processNextUSSDItem(): Promise<USSDQueueItem | null> {
    // Get highest priority pending item
    const pendingItems = Array.from(this.ussdQueue.values())
      .filter(i => i.status === 'pending' && i.retryCount < i.maxRetries)
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    
    if (pendingItems.length === 0) {
      return null;
    }
    
    const item = pendingItems[0];
    item.status = 'processing';
    item.lastAttemptAt = Date.now();
    this.ussdQueue.set(item.id, item);
    await this.saveQueues();
    
    // Create session
    this.activeSession = {
      id: `session_${Date.now()}`,
      code: item.ussdCode,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      menuPath: [],
      inputHistory: [],
      status: 'active',
    };
    await this.saveSession();
    
    // Dial USSD code
    const dialed = await this.dialUSSD(item.ussdCode);
    
    if (dialed) {
      // User needs to complete the USSD session manually
      // We'll provide instructions
      this.showUSSDInstructions(item);
      return item;
    } else {
      item.status = 'failed';
      item.retryCount++;
      item.error = 'Failed to dial USSD code';
      this.ussdQueue.set(item.id, item);
      await this.saveQueues();
      return null;
    }
  }

  /**
   * Show USSD input instructions to user
   */
  private showUSSDInstructions(item: USSDQueueItem): void {
    const inputs = item.ussdInputs.filter(i => i !== '');
    const instructions = inputs.map((input, index) => `${index + 1}. Enter: ${input}`).join('\n');
    
    Alert.alert(
      'USSD Instructions',
      `After the USSD menu appears, enter the following:\n\n${instructions}\n\nTap "Done" when you've completed the USSD session.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => this.cancelCurrentSession() },
        { text: 'Done', onPress: () => this.completeCurrentSession(item.id) },
      ],
      { cancelable: false }
    );
  }

  /**
   * Mark current session as completed
   */
  async completeCurrentSession(itemId?: string): Promise<void> {
    if (this.activeSession) {
      this.activeSession.status = 'completed';
      this.activeSession.lastActivityAt = Date.now();
    }
    
    if (itemId) {
      const item = this.ussdQueue.get(itemId);
      if (item) {
        item.status = 'completed';
        this.ussdQueue.set(itemId, item);
      }
    }
    
    this.activeSession = null;
    await this.saveSession();
    await this.saveQueues();
    
    console.log('[USSDFallback] Session completed');
  }

  /**
   * Cancel current session
   */
  async cancelCurrentSession(): Promise<void> {
    if (this.activeSession) {
      this.activeSession.status = 'error';
      this.activeSession = null;
      await this.saveSession();
    }
    
    console.log('[USSDFallback] Session cancelled');
  }

  /**
   * Process next item in SMS queue
   */
  async processNextSMSItem(): Promise<SMSQueueItem | null> {
    const pendingItems = Array.from(this.smsQueue.values())
      .filter(i => i.status === 'pending' && i.retryCount < i.maxRetries)
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    
    if (pendingItems.length === 0) {
      return null;
    }
    
    const item = pendingItems[0];
    item.lastAttemptAt = Date.now();
    
    const sent = await this.sendSMS(item.recipient, item.message);
    
    if (sent) {
      item.status = 'sent';
    } else {
      item.retryCount++;
      if (item.retryCount >= item.maxRetries) {
        item.status = 'failed';
        item.error = 'Max retries exceeded';
      }
    }
    
    this.smsQueue.set(item.id, item);
    await this.saveQueues();
    
    return item;
  }

  /**
   * Process all pending items (USSD or SMS based on settings)
   */
  async processAllPending(): Promise<{ ussd: number; sms: number; failed: number }> {
    let ussdProcessed = 0;
    let smsProcessed = 0;
    let failed = 0;
    
    const status = await this.getStatus();
    
    if (status.fallbackMethod === 'sms' || this.settings.preferSMSOverUSSD) {
      // Process SMS queue
      while (true) {
        const item = await this.processNextSMSItem();
        if (!item) break;
        
        if (item.status === 'sent') {
          smsProcessed++;
        } else if (item.status === 'failed') {
          failed++;
        }
      }
    } else {
      // Process USSD queue (one at a time due to user interaction required)
      const item = await this.processNextUSSDItem();
      if (item) {
        ussdProcessed = 1;
      }
    }
    
    return { ussd: ussdProcessed, sms: smsProcessed, failed };
  }

  /**
   * Get pending items count
   */
  getPendingCount(): { ussd: number; sms: number } {
    return {
      ussd: Array.from(this.ussdQueue.values()).filter(i => i.status === 'pending').length,
      sms: Array.from(this.smsQueue.values()).filter(i => i.status === 'pending').length,
    };
  }

  /**
   * Get all queue items
   */
  getQueueItems(): { ussd: USSDQueueItem[]; sms: SMSQueueItem[] } {
    return {
      ussd: Array.from(this.ussdQueue.values()),
      sms: Array.from(this.smsQueue.values()),
    };
  }

  /**
   * Remove item from queue
   */
  async removeFromQueue(id: string): Promise<void> {
    if (this.ussdQueue.has(id)) {
      this.ussdQueue.delete(id);
    }
    if (this.smsQueue.has(id)) {
      this.smsQueue.delete(id);
    }
    await this.saveQueues();
  }

  /**
   * Clear all queues
   */
  async clearQueues(): Promise<void> {
    this.ussdQueue.clear();
    this.smsQueue.clear();
    await this.saveQueues();
  }

  /**
   * Quick submit - automatically choose best method
   */
  async quickSubmit(
    type: USSDQueueItem['type'],
    data: Record<string, any>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<{ method: 'ussd' | 'sms'; itemId: string }> {
    const status = await this.getStatus();
    
    if (status.fallbackMethod === 'sms' || this.settings.preferSMSOverUSSD) {
      const item = await this.queueForSMS(type, data, priority);
      await this.processNextSMSItem();
      return { method: 'sms', itemId: item.id };
    } else {
      const item = await this.queueForUSSD(type, data, priority);
      await this.processNextUSSDItem();
      return { method: 'ussd', itemId: item.id };
    }
  }

  /**
   * Get help via SMS
   */
  async requestHelp(topic?: string): Promise<boolean> {
    const message = topic ? `HELP ${topic}` : 'HELP';
    return this.sendSMS(this.settings.smsCodes.helpLine, message);
  }

  /**
   * Check service availability
   */
  async checkServiceAvailability(): Promise<{
    ussd: boolean;
    sms: boolean;
    dialer: boolean;
  }> {
    const smsAvailable = await SMS.isAvailableAsync();
    const dialerAvailable = await Linking.canOpenURL('tel:*100#');
    
    return {
      ussd: dialerAvailable,
      sms: smsAvailable,
      dialer: dialerAvailable,
    };
  }
}

// Singleton instance
export const ussdFallback = new USSDFallbackService();

export default ussdFallback;
