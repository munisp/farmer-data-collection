import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { TRPC_URL } from '@/utils/constants';
import { authService } from '../auth';
import type { AuthTokens, User } from '@/types/models';

// Import AppRouter type from server (shared types)
// In production, this would be imported from a shared package
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppRouter = any;

interface BackendUser {
  id: number | string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
}

interface BackendAuthResponse {
  success: boolean;
  token: string;
  user: BackendUser;
}

interface MobileAuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface MarketplaceProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  quantityAvailable: number;
  status: string;
  images?: string[];
  averageRating?: number;
  totalReviews?: number;
}

export interface MarketplaceOrderSummary {
  id: string;
  orderNumber: string;
  date: string;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus?: string;
  itemCount: number;
}

export interface MarketplaceOrderInput {
  productId: number;
  quantity: number;
  price: number;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentMethod: string;
}

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      headers: async () => {
        const token = await authService.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

function splitName(name: string) {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: 'Farmer', lastName: 'User' };
  }

  const parts = normalized.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'User' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function normalizeUser(user: BackendUser): User {
  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || user.email;
  const now = new Date().toISOString();

  return {
    id: String(user.id),
    email: user.email,
    name,
    role: user.role === 'admin' ? 'admin' : 'farmer',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeAuthResponse(response: BackendAuthResponse): MobileAuthResponse {
  return {
    user: normalizeUser(response.user),
    tokens: {
      accessToken: response.token,
      refreshToken: response.token,
    },
  };
}

function normalizePrice(value: number) {
  return value > 1000 ? value / 100 : value;
}

function normalizeMarketplaceStatus(status: string): MarketplaceOrderSummary['status'] {
  if (status === 'confirmed') return 'processing';
  if (status === 'paid') return 'processing';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'delivered') return 'delivered';
  if (status === 'shipped') return 'shipped';
  return 'pending';
}

// API wrapper with error handling
export class ApiClient {
  async login(email: string, password: string): Promise<MobileAuthResponse> {
    try {
      const response = await trpcClient.auth.login.mutate({ email, password }) as BackendAuthResponse;
      return normalizeAuthResponse(response);
    } catch (error) {
      console.error('[API] Login error:', error);
      throw error;
    }
  }

  async register(email: string, password: string, name: string): Promise<MobileAuthResponse> {
    try {
      const { firstName, lastName } = splitName(name);
      const response = await trpcClient.auth.register.mutate({
        email,
        password,
        firstName,
        lastName,
      }) as BackendAuthResponse;

      return normalizeAuthResponse(response);
    } catch (error) {
      console.error('[API] Registration error:', error);
      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const user = await authService.getUser();
      if (!user) {
        throw new Error('No authenticated user available for token refresh');
      }

      const response = await trpcClient.auth.me.query(undefined, {
        context: {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        },
      }) as BackendUser | null;

      if (!response) {
        throw new Error('Token refresh failed');
      }

      return {
        accessToken: refreshToken,
        refreshToken,
      };
    } catch (error) {
      console.error('[API] Token refresh error:', error);
      throw error;
    }
  }

  async searchMarketplaceProducts(keyword?: string): Promise<MarketplaceProduct[]> {
    try {
      const results = await trpcClient.marketplace.searchProducts.query({
        keyword: keyword?.trim() || undefined,
      }) as Array<any>;

      return results.map((product) => ({
        id: String(product.id),
        name: product.name,
        description: product.description || 'No description provided.',
        category: product.category,
        price: normalizePrice(product.price),
        unit: product.unit,
        quantityAvailable: Number(product.quantityAvailable ?? 0),
        status: product.status,
      }));
    } catch (error) {
      console.error('[API] Marketplace search error:', error);
      throw error;
    }
  }

  async getMarketplaceProduct(id: string): Promise<MarketplaceProduct> {
    try {
      const product = await trpcClient.marketplace.getProduct.query({ id: Number(id) }) as any;
      return {
        id: String(product.id),
        name: product.name,
        description: product.description || 'No description provided.',
        category: product.category,
        price: normalizePrice(product.price),
        unit: product.unit,
        quantityAvailable: Number(product.quantityAvailable ?? 0),
        status: product.status,
        images: Array.isArray(product.images) ? product.images : [],
        averageRating: typeof product.averageRating === 'number' ? product.averageRating : 0,
        totalReviews: typeof product.totalReviews === 'number' ? product.totalReviews : 0,
      };
    } catch (error) {
      console.error('[API] Marketplace product error:', error);
      throw error;
    }
  }

  async createMarketplaceOrder(input: MarketplaceOrderInput) {
    try {
      return await trpcClient.marketplace.createOrder.mutate({
        items: [
          {
            productId: input.productId,
            quantity: input.quantity,
            price: input.price,
          },
        ],
        shippingAddress: input.shippingAddress,
        paymentMethod: input.paymentMethod,
      });
    } catch (error) {
      console.error('[API] Marketplace order creation error:', error);
      throw error;
    }
  }

  async listMarketplaceOrders(): Promise<MarketplaceOrderSummary[]> {
    try {
      const orders = await trpcClient.marketplace.listOrders.query() as Array<any>;
      return orders.map((order) => ({
        id: String(order.id),
        orderNumber: order.orderNumber || `ORD-${order.id}`,
        date: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
        total: normalizePrice(Number(order.totalAmount ?? 0)),
        status: normalizeMarketplaceStatus(order.status),
        paymentStatus: order.paymentStatus,
        itemCount: Array.isArray(order.items) ? order.items.length : 1,
      }));
    } catch (error) {
      console.error('[API] Marketplace orders error:', error);
      throw error;
    }
  }

  async syncHarvest(harvest: unknown) {
    try {
      const token = await authService.getAccessToken();
      const response = await fetch(`${TRPC_URL.replace('/trpc', '')}/harvests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(harvest),
      });

      if (!response.ok) {
        throw new Error('Harvest sync failed');
      }

      return await response.json();
    } catch (error) {
      console.error('[API] Harvest sync error:', error);
      throw error;
    }
  }

  async syncExpense(expense: unknown) {
    try {
      const token = await authService.getAccessToken();
      const response = await fetch(`${TRPC_URL.replace('/trpc', '')}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(expense),
      });

      if (!response.ok) {
        throw new Error('Expense sync failed');
      }

      return await response.json();
    } catch (error) {
      console.error('[API] Expense sync error:', error);
      throw error;
    }
  }

  async uploadImage(uri: string): Promise<string> {
    try {
      const token = await authService.getAccessToken();
      const formData = new FormData();

      // @ts-ignore - React Native FormData supports uri
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      });

      const response = await fetch(`${TRPC_URL.replace('/trpc', '')}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Image upload failed');
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('[API] Image upload error:', error);
      throw error;
    }
  }
}

export const apiClient = new ApiClient();
