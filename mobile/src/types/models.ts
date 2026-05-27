// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'farmer' | 'admin';
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Harvest Types
export interface Harvest {
  id: string;
  cropType: string;
  quantity: number;
  unit: string;
  harvestDate: string;
  locationLat?: number;
  locationLng?: number;
  photoUri?: string;
  notes?: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHarvestInput {
  cropType: string;
  quantity: number;
  unit: string;
  harvestDate: string;
  locationLat?: number;
  locationLng?: number;
  photoUri?: string;
  notes?: string;
}

// Expense Types
export interface Expense {
  id: string;
  category: string;
  amount: number;
  description?: string;
  expenseDate: string;
  receiptUri?: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  category: string;
  amount: number;
  description?: string;
  expenseDate: string;
  receiptUri?: string;
}

// Marketplace Types
export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  price: number;
  unit: string;
  quantity: number;
  cropType: string;
  sellerId: string;
  sellerName: string;
  imageUri?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  listingId: string;
  quantity: number;
  listing: MarketplaceListing;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// ML Prediction Types
export interface YieldPrediction {
  cropType: string;
  predictedYield: number;
  unit: string;
  confidence: number;
  factors: {
    weather: number;
    soil: number;
    historical: number;
  };
  createdAt: string;
}

export interface PriceForecast {
  cropType: string;
  currentPrice: number;
  forecastPrice: number;
  change: number;
  changePercent: number;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
  createdAt: string;
}

// Sync Types
export interface SyncQueueItem {
  id: number;
  entityType: 'harvest' | 'expense' | 'listing';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: string;
  retryCount: number;
  createdAt: string;
}

export interface SyncStatus {
  lastSync?: string;
  pendingItems: number;
  syncing: boolean;
  error?: string;
}

// Location Types
export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

// Notification Types
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: string;
}
