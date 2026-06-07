import { logger } from "../logger.js";

export type ChannelType = "prices" | "tracking" | "iot" | "delivery" | "notifications" | "market_depth";

export interface WebSocketMessage {
  channel: ChannelType;
  event: string;
  data: any;
  timestamp: string;
  senderId?: string;
}

export interface SubscriptionOptions {
  channel: ChannelType;
  filters?: Record<string, string>;
  userId?: string;
  tenantId?: string;
}

interface Subscriber {
  id: string;
  userId?: string;
  tenantId?: string;
  channels: Map<ChannelType, Record<string, string>>;
  connectedAt: string;
  lastActivity: string;
  messageCount: number;
}

const subscribers = new Map<string, Subscriber>();
const channelSubscribers = new Map<ChannelType, Set<string>>();

const channels: ChannelType[] = ["prices", "tracking", "iot", "delivery", "notifications", "market_depth"];
for (const ch of channels) channelSubscribers.set(ch, new Set());

export function addSubscriber(subscriberId: string, options: SubscriptionOptions): { success: boolean; subscriberId: string } {
  let sub = subscribers.get(subscriberId);
  if (!sub) {
    sub = { id: subscriberId, userId: options.userId, tenantId: options.tenantId, channels: new Map(), connectedAt: new Date().toISOString(), lastActivity: new Date().toISOString(), messageCount: 0 };
    subscribers.set(subscriberId, sub);
  }
  sub.channels.set(options.channel, options.filters || {});
  channelSubscribers.get(options.channel)?.add(subscriberId);
  logger.info("[WebSocket] Subscriber added", { subscriberId, channel: options.channel });
  return { success: true, subscriberId };
}

export function removeSubscriber(subscriberId: string): void {
  const sub = subscribers.get(subscriberId);
  if (!sub) return;
  for (const [channel] of sub.channels) {
    channelSubscribers.get(channel)?.delete(subscriberId);
  }
  subscribers.delete(subscriberId);
}

export function publish(message: WebSocketMessage): { delivered: number } {
  const channelSubs = channelSubscribers.get(message.channel);
  if (!channelSubs) return { delivered: 0 };

  let delivered = 0;
  for (const subId of channelSubs) {
    const sub = subscribers.get(subId);
    if (!sub) continue;
    const filters = sub.channels.get(message.channel) || {};
    if (matchesFilters(message.data, filters)) {
      sub.messageCount++;
      sub.lastActivity = new Date().toISOString();
      delivered++;
    }
  }
  return { delivered };
}

function matchesFilters(data: any, filters: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (data[key] !== undefined && String(data[key]) !== value) return false;
  }
  return true;
}

export function publishPriceUpdate(commodity: string, price: number, currency: string, exchange: string): { delivered: number } {
  return publish({ channel: "prices", event: "price_update", data: { commodity, price, currency, exchange, change: Math.round((Math.random() - 0.5) * 10 * 100) / 100 }, timestamp: new Date().toISOString() });
}

export function publishDeliveryUpdate(deliveryId: string, status: string, location: { lat: number; lng: number }, eta: string): { delivered: number } {
  return publish({ channel: "delivery", event: "status_update", data: { deliveryId, status, location, eta }, timestamp: new Date().toISOString() });
}

export function publishIoTReading(sensorId: string, type: string, value: number, unit: string, farmId: string): { delivered: number } {
  return publish({ channel: "iot", event: "sensor_reading", data: { sensorId, type, value, unit, farmId }, timestamp: new Date().toISOString() });
}

export function getHubStats() {
  const channelStats: Record<string, number> = {};
  for (const [channel, subs] of channelSubscribers) channelStats[channel] = subs.size;
  const allSubs = Array.from(subscribers.values());
  return {
    totalSubscribers: subscribers.size,
    channelStats,
    totalMessages: allSubs.reduce((s, sub) => s + sub.messageCount, 0),
    avgMessagesPerSubscriber: subscribers.size > 0 ? Math.round(allSubs.reduce((s, sub) => s + sub.messageCount, 0) / subscribers.size) : 0,
  };
}
