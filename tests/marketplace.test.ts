/**
 * Comprehensive Tests for Marketplace Features
 * 
 * Tests all marketplace-related tRPC routers:
 * - Products
 * - Orders
 * - Payments
 * - Reviews
 * - Shipping
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../server/trpc';
import { getDb, closeDb } from '../server/db';
import { users, produceListings, marketplaceOrders, orderItems, marketplaceReviews } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// Test user credentials
const testSeller = {
  email: 'marketplace-seller@example.com',
  password: 'SellerPassword123!',
  name: 'Test Seller',
};

const testBuyer = {
  email: 'marketplace-buyer@example.com',
  password: 'BuyerPassword123!',
  name: 'Test Buyer',
};

let sellerId: number;
let buyerId: number;
let productId: number;
let orderId: number;

// Create test users
async function createTestUsers() {
  const db = await getDb();
  if (!db) console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;

  // Check if users already exist
  const existingSeller = await db
    .select()
    .from(users)
    .where(eq(users.email, testSeller.email))
    .limit(1);
  
  if (existingSeller.length > 0) {
    sellerId = existingSeller[0].id;
  } else {
    // Create seller
    const hashedPassword1 = await bcrypt.hash(testSeller.password, 10);
    const [seller] = await db
      .insert(users)
      .values({
        email: testSeller.email,
        password: hashedPassword1,
        firstName: 'Test',
        lastName: 'Seller',
        role: 'farmer',
      })
      .returning();
    sellerId = seller.id;
  }

  const existingBuyer = await db
    .select()
    .from(users)
    .where(eq(users.email, testBuyer.email))
    .limit(1);
  
  if (existingBuyer.length > 0) {
    buyerId = existingBuyer[0].id;
  } else {
    // Create buyer
    const hashedPassword2 = await bcrypt.hash(testBuyer.password, 10);
    const [buyer] = await db
      .insert(users)
      .values({
        email: testBuyer.email,
        password: hashedPassword2,
        firstName: 'Test',
        lastName: 'Buyer',
        role: 'farmer',
      })
      .returning();
    buyerId = buyer.id;
  }
}

// Create seller context
function createSellerContext() {
  return {
    user: { id: sellerId, email: testSeller.email },
    req: { ip: '127.0.0.1' },
  };
}

// Create buyer context
function createBuyerContext() {
  return {
    user: { id: buyerId, email: testBuyer.email },
    req: { ip: '127.0.0.1' },
  };
}

// Clean up test data
async function cleanupTestData() {
  const db = await getDb();
  if (!db) return;

  try {
    // Delete in correct order to respect foreign keys
    await db.delete(marketplaceReviews).where(eq(marketplaceReviews.userId, buyerId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId || 0));
    await db.delete(marketplaceOrders).where(eq(marketplaceOrders.buyerId, buyerId));
    await db.delete(produceListings).where(eq(produceListings.userId, sellerId));
    await db.delete(users).where(eq(users.id, sellerId));
    await db.delete(users).where(eq(users.id, buyerId));
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

describe('Marketplace - Products', () => {
  let caller: any;

  beforeAll(async () => {
    await createTestUsers();
    const ctx = createSellerContext();
    caller = appRouter.createCaller(ctx);
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeDb();
  });

  it('should create a product listing', async () => {
    const result = await caller.marketplace.createProduct({
      name: 'Organic Tomatoes',
      description: 'Fresh organic tomatoes from our farm',
      category: 'vegetables',
      price: 5.99,
      unit: 'kg',
      quantityAvailable: 100,
      images: ['https://example.com/tomatoes.jpg'],
      location: 'Test Farm, Test County',
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Organic Tomatoes');
    expect(result.price).toBe(5.99);
    expect(result.status).toBe('active');
    productId = result.id;
  });

  it('should list all products', async () => {
    const result = await caller.marketplace.listProducts();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should get product by id', async () => {
    const result = await caller.marketplace.getProduct({ id: productId });

    expect(result).toBeDefined();
    expect(result.id).toBe(productId);
    expect(result.name).toBe('Organic Tomatoes');
  });

  it('should update product', async () => {
    const result = await caller.marketplace.updateProduct({
      id: productId,
      price: 6.49,
      quantityAvailable: 90,
    });

    expect(result).toBeDefined();
    expect(result.price).toBe(6.49);
    expect(result.quantityAvailable).toBe(90);
  });

  it('should search products by category', async () => {
    const result = await caller.marketplace.searchProducts({
      category: 'vegetables',
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].category).toBe('vegetables');
  });

  it('should search products by keyword', async () => {
    const result = await caller.marketplace.searchProducts({
      keyword: 'tomato',
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should filter products by price range', async () => {
    const result = await caller.marketplace.searchProducts({
      minPrice: 5,
      maxPrice: 10,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    result.forEach((product: any) => {
      expect(product.price).toBeGreaterThanOrEqual(5);
      expect(product.price).toBeLessThanOrEqual(10);
    });
  });
});

describe('Marketplace - Orders', () => {
  let buyerCaller: any;
  let sellerCaller: any;
  let testProductId: number;
  let testOrderId: number;

  beforeAll(async () => {
    // Ensure users are created first
    if (!sellerId || !buyerId) {
      await createTestUsers();
    }
    
    const buyerCtx = createBuyerContext();
    buyerCaller = appRouter.createCaller(buyerCtx);

    const sellerCtx = createSellerContext();
    sellerCaller = appRouter.createCaller(sellerCtx);
    
    // Create a product for order testing
    const product = await sellerCaller.marketplace.createProduct({
      name: 'Order Test Product',
      description: 'Product for order tests',
      category: 'vegetables',
      price: 6.49,
      unit: 'kg',
      quantityAvailable: 100,
      images: [],
      location: 'Test Farm',
    });
    testProductId = product.id;
  });

  it('should create an order', async () => {
    const result = await buyerCaller.marketplace.createOrder({
      items: [
        {
          productId: testProductId,
          quantity: 5,
          price: 6.49,
        },
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345',
        country: 'Test Country',
      },
      paymentMethod: 'mobile_money',
    });

    expect(result).toBeDefined();
    expect(result.totalAmount).toBe(5 * 6.49);
    expect(result.status).toBe('pending');
    testOrderId = result.id;
  });

  it('should list buyer orders', async () => {
    const result = await buyerCaller.marketplace.listOrders();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].buyerId).toBe(buyerId);
  });

  it('should get order details', async () => {
    const result = await buyerCaller.marketplace.getOrder({ id: testOrderId });

    expect(result).toBeDefined();
    expect(result.id).toBe(testOrderId);
    expect(result.items.length).toBe(1);
    expect(result.items[0].productId).toBe(testProductId);
  });

  it('should confirm order payment', async () => {
    const result = await buyerCaller.marketplace.confirmPayment({
      orderId: testOrderId,
      paymentReference: 'PAY123456',
      amount: 5 * 6.49,
    });

    expect(result).toBeDefined();
    expect(result.paymentStatus).toBe('paid');
  });

  it('should seller confirm order', async () => {
    const result = await sellerCaller.marketplace.confirmOrder({
      orderId: testOrderId,
      estimatedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('confirmed');
  });

  it('should update order status to shipped', async () => {
    const result = await sellerCaller.marketplace.updateOrderStatus({
      orderId: testOrderId,
      status: 'shipped',
      trackingNumber: 'TRACK123',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('shipped');
    expect(result.trackingNumber).toBe('TRACK123');
  });

  it('should buyer confirm delivery', async () => {
    const result = await buyerCaller.marketplace.confirmDelivery({
      orderId: testOrderId,
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('delivered');
  });
});

describe('Marketplace - Reviews', () => {
  let buyerCaller: any;
  let testProductId: number;
  let testOrderId: number;

  beforeAll(async () => {
    // Ensure users are created first
    if (!sellerId || !buyerId) {
      await createTestUsers();
    }
    
    const buyerCtx = createBuyerContext();
    buyerCaller = appRouter.createCaller(buyerCtx);
    
    const sellerCtx = createSellerContext();
    const sellerCaller = appRouter.createCaller(sellerCtx);
    
    // Create a product for review testing
    const product = await sellerCaller.marketplace.createProduct({
      name: 'Review Test Product',
      description: 'Product for review tests',
      category: 'vegetables',
      price: 5.99,
      unit: 'kg',
      quantityAvailable: 100,
      images: [],
      location: 'Test Farm',
    });
    testProductId = product.id;
    
    // Create an order for review testing
    const order = await buyerCaller.marketplace.createOrder({
      items: [{
        productId: testProductId,
        quantity: 2,
        price: 5.99,
      }],
      shippingAddress: {
        street: '123 Main St',
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345',
        country: 'Test Country',
      },
      paymentMethod: 'mobile_money',
    });
    testOrderId = order.id;
  });

  it('should create a product review', async () => {
    const result = await buyerCaller.marketplace.createReview({
      productId: testProductId,
      orderId: testOrderId,
      rating: 5,
      comment: 'Excellent quality tomatoes! Very fresh.',
    });

    expect(result).toBeDefined();
    expect(result.rating).toBe(5);
    expect(result.comment).toContain('Excellent');
  });

  it('should list product reviews', async () => {
    const result = await buyerCaller.marketplace.getProductReviews({
      productId: testProductId,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].productId).toBe(testProductId);
  });

  it('should calculate average rating', async () => {
    const result = await buyerCaller.marketplace.getProduct({ id: testProductId });

    expect(result).toBeDefined();
    expect(result.averageRating).toBe(5);
    expect(result.totalReviews).toBe(1);
  });
});

describe('Marketplace - Analytics', () => {
  let sellerCaller: any;

  beforeAll(async () => {
    // Ensure users are created first
    if (!sellerId) {
      await createTestUsers();
    }
    
    const sellerCtx = createSellerContext();
    sellerCaller = appRouter.createCaller(sellerCtx);
  });

  it('should get seller sales summary', async () => {
    const result = await sellerCaller.marketplace.getSalesSummary();

    expect(result).toBeDefined();
    expect(result.totalOrders).toBeGreaterThan(0);
    expect(result.totalRevenue).toBeGreaterThan(0);
    expect(result.averageOrderValue).toBeGreaterThan(0);
  });

  it('should get best selling products', async () => {
    const result = await sellerCaller.marketplace.getBestSellingProducts();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get sales by category', async () => {
    const result = await sellerCaller.marketplace.getSalesByCategory();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get monthly sales trend', async () => {
    const result = await sellerCaller.marketplace.getMonthlySales({
      startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      endDate: new Date(),
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('Marketplace - Inventory Management', () => {
  let sellerCaller: any;
  let testProductId: number;

  beforeAll(async () => {
    // Ensure users are created first
    if (!sellerId) {
      await createTestUsers();
    }
    
    const sellerCtx = createSellerContext();
    sellerCaller = appRouter.createCaller(sellerCtx);
    
    // Create a product for inventory testing
    const product = await sellerCaller.marketplace.createProduct({
      name: 'Inventory Test Product',
      description: 'Product for inventory management tests',
      category: 'vegetables',
      price: 3.99,
      unit: 'kg',
      quantityAvailable: 100,
      images: [],
      location: 'Test Farm',
    });
    testProductId = product.id;
  });

  it('should update product inventory', async () => {
    const result = await sellerCaller.marketplace.updateInventory({
      productId: testProductId,
      quantityChange: -5, // Sold 5 units
      reason: 'Order fulfilled',
    });

    expect(result).toBeDefined();
    expect(result.quantityAvailable).toBe(95); // 100 - 5
  });

  it('should get low stock products', async () => {
    const result = await sellerCaller.marketplace.getLowStockProducts({
      threshold: 100,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should deactivate out-of-stock product', async () => {
    // First, set quantity to 0
    await sellerCaller.marketplace.updateInventory({
      productId: testProductId,
      quantityChange: -95,
      reason: 'Sold out',
    });

    // Then deactivate
    const result = await sellerCaller.marketplace.updateProduct({
      id: testProductId,
      status: 'out_of_stock',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('out_of_stock');
    expect(result.quantityAvailable).toBe(0);
  });
});
