import { publishEvent, createEvent, TOPICS, EVENT_TYPES } from './kafka';

// Farm event producers
export async function publishFarmCreated(farmId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.CREATED,
    'farm',
    farmId,
    userId,
    data
  );
  await publishEvent(TOPICS.FARM_EVENTS, event);
}

export async function publishFarmUpdated(farmId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.UPDATED,
    'farm',
    farmId,
    userId,
    data
  );
  await publishEvent(TOPICS.FARM_EVENTS, event);
}

export async function publishFarmDeleted(farmId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.DELETED,
    'farm',
    farmId,
    userId,
    data
  );
  await publishEvent(TOPICS.FARM_EVENTS, event);
}

// Crop event producers
export async function publishCropCreated(cropId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.CREATED,
    'crop',
    cropId,
    userId,
    data
  );
  await publishEvent(TOPICS.CROP_EVENTS, event);
}

export async function publishCropUpdated(cropId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.UPDATED,
    'crop',
    cropId,
    userId,
    data
  );
  await publishEvent(TOPICS.CROP_EVENTS, event);
}

export async function publishCropDeleted(cropId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.DELETED,
    'crop',
    cropId,
    userId,
    data
  );
  await publishEvent(TOPICS.CROP_EVENTS, event);
}

// Livestock event producers
export async function publishLivestockCreated(livestockId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.CREATED,
    'livestock',
    livestockId,
    userId,
    data
  );
  await publishEvent(TOPICS.LIVESTOCK_EVENTS, event);
}

export async function publishLivestockUpdated(livestockId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.UPDATED,
    'livestock',
    livestockId,
    userId,
    data
  );
  await publishEvent(TOPICS.LIVESTOCK_EVENTS, event);
}

export async function publishLivestockDeleted(livestockId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.DELETED,
    'livestock',
    livestockId,
    userId,
    data
  );
  await publishEvent(TOPICS.LIVESTOCK_EVENTS, event);
}

// Harvest event producers
export async function publishHarvestCreated(harvestId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.CREATED,
    'harvest',
    harvestId,
    userId,
    data
  );
  await publishEvent(TOPICS.HARVEST_EVENTS, event);
}

export async function publishHarvestUpdated(harvestId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.UPDATED,
    'harvest',
    harvestId,
    userId,
    data
  );
  await publishEvent(TOPICS.HARVEST_EVENTS, event);
}

export async function publishHarvestDeleted(harvestId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.DELETED,
    'harvest',
    harvestId,
    userId,
    data
  );
  await publishEvent(TOPICS.HARVEST_EVENTS, event);
}

// Expense event producers
export async function publishExpenseCreated(expenseId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.CREATED,
    'expense',
    expenseId,
    userId,
    data
  );
  await publishEvent(TOPICS.EXPENSE_EVENTS, event);
}

export async function publishExpenseUpdated(expenseId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.UPDATED,
    'expense',
    expenseId,
    userId,
    data
  );
  await publishEvent(TOPICS.EXPENSE_EVENTS, event);
}

export async function publishExpenseDeleted(expenseId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(
    EVENT_TYPES.DELETED,
    'expense',
    expenseId,
    userId,
    data
  );
  await publishEvent(TOPICS.EXPENSE_EVENTS, event);
}

// Analytics event producer
export async function publishAnalyticsEvent(
  eventType: string,
  entityType: string,
  entityId: string | number,
  userId: number,
  data: any
) {
  const event = createEvent(
    eventType,
    entityType,
    entityId,
    userId,
    data
  );
  await publishEvent(TOPICS.ANALYTICS, event);
}

// Notification event producer
export async function publishNotification(
  userId: number,
  notificationType: string,
  data: any
) {
  const event = createEvent(
    notificationType,
    'notification',
    `notification-${Date.now()}`,
    userId,
    data
  );
  await publishEvent(TOPICS.NOTIFICATIONS, event);
}

// Cache invalidation event producer
export async function publishCacheInvalidation(
  entityType: string,
  entityId: string | number,
  userId: number
) {
  const event = createEvent(
    'CACHE_INVALIDATE',
    entityType,
    entityId,
    userId,
    { patterns: [`${entityType}:*`, 'dashboard:*'] }
  );
  await publishEvent(TOPICS.CACHE_INVALIDATION, event);
}
