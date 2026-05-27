/**
 * USSD Fallback Services
 * 
 * Provides USSD and SMS fallback for data submission when internet is unavailable
 */

export { ussdFallback, default } from './ussdFallback';
export type {
  USSDCodes,
  SMSCodes,
  USSDSession,
  USSDQueueItem,
  SMSQueueItem,
  USSDFallbackSettings,
  FallbackStatus,
} from './ussdFallback';
