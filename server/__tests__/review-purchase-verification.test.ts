import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { appRouter } from '../trpc.js';
import { getDb } from '../db';
import { users, produceListings, marketplaceOrders, orderItems, productReviews } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

/**
 * Test suite for product review purchase verification
 * Tests that reviews correctly verify if user purchased the product
 */

describe('Product Review Purchase Verification', () => {
  let db: any;
  let sellerId: number;
  let buyerId: number;
  let listingId: number;
  let orderId: number;

  beforeAll(async () => {
    db = await getDb();
    
    // Create seller
    const [seller] = await db!.insert(users).values({
      email: `seller-${Date.now()}@example.com`,
      password: 'hashed_password',
      firstName: 'Seller',
      lastName: 'User',
      role: 'farmer',
    }).returning();
    sellerId = seller.id;

    // Create buyer
    const [buyer] = await db!.insert(users).values({
      email: `buyer-${Date.now()}@example.com`,
      password: 'hashed_password',
      firstName: 'Buyer',
      lastName: 'User',
      role: 'farmer',
    }).returning();
    buyerId = buyer.id;

    // Create listing
    const [listing] = await db!.insert(produceListings).values({
      userId: sellerId,
      title: 'Test Tomatoes',
      category: 'vegetables',
      quantity: 100,
      unit: 'kg',
      pricePerUnit: 50000, // 500 NGN
      totalPrice: 5000000, // 100 kg * 50000 per unit
      organic: false,
      deliveryOptions: JSON.stringify({ pickup: true, delivery: false, shipping: false }),
      photos: JSON.stringify([]),
      status: 'active',
    }).returning();
    listingId = listing.id;

    // Create order
    const [order] = await db!.insert(marketplaceOrders).values({
      buyerId: buyerId,
      sellerId: sellerId,
      orderNumber: `ORD-${Date.now()}`,
      status: 'completed',
      totalAmount: 2500000, // 25,000 NGN
      paymentMethod: 'card',
      deliveryMethod: 'pickup',
    }).returning();
    orderId = order.id;

    // Create order item
    await db!.insert(orderItems).values({
      orderId: orderId,
      listingId: listingId,
      quantity: 50,
      pricePerUnit: 50000,
      totalPrice: 2500000,
      productTitle: 'Test Tomatoes',
      productUnit: 'kg',
    });
  });

  afterEach(async () => {
    // Clean up reviews after each test
    if (listingId) {
      await db!.delete(productReviews).where(eq(productReviews.listingId, listingId));
    }
  });

  afterAll(async () => {
    // Cleanup in reverse order
    if (listingId) {
      await db!.delete(productReviews).where(eq(productReviews.listingId, listingId));
    }
    if (orderId) {
      await db!.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db!.delete(marketplaceOrders).where(eq(marketplaceOrders.id, orderId));
    }
    if (listingId) {
      await db!.delete(produceListings).where(eq(produceListings.id, listingId));
    }
    if (buyerId) {
      await db!.delete(users).where(eq(users.id, buyerId));
    }
    if (sellerId) {
      await db!.delete(users).where(eq(users.id, sellerId));
    }
  });

  it('should verify purchase when user bought the product', async () => {
    const caller = appRouter.createCaller({
      user: { id: buyerId, email: 'buyer@example.com' },
      token: 'test-token',
      keycloakUser: null,
    });

    const review = await caller.productReviews.submitReview({
      listingId: listingId,
      orderId: orderId,
      rating: 5,
      title: 'Great tomatoes!',
      comment: 'Very fresh and tasty',
    });

    expect(review).toBeDefined();
    expect(review.verifiedPurchase).toBe(true);
    expect(review.rating).toBe(5);
  });

  it('should not verify purchase when orderId is not provided', async () => {
    const caller = appRouter.createCaller({
      user: { id: buyerId, email: 'buyer@example.com' },
      token: 'test-token',
      keycloakUser: null,
    });

    const review = await caller.productReviews.submitReview({
      listingId: listingId,
      rating: 4,
      title: 'Good product',
      comment: 'Satisfied with purchase',
    });

    expect(review).toBeDefined();
    expect(review.verifiedPurchase).toBe(false);
  });

  it('should not verify purchase when user did not buy the product', async () => {
    // Create another buyer who didn't purchase
    const [anotherBuyer] = await db!.insert(users).values({
      email: `another-buyer-${Date.now()}@example.com`,
      password: 'hashed_password',
      firstName: 'Another',
      lastName: 'Buyer',
      role: 'farmer',
    }).returning();

    const caller = appRouter.createCaller({
      user: { id: anotherBuyer.id, email: 'another@example.com' },
      token: 'test-token',
      keycloakUser: null,
    });

    const review = await caller.productReviews.submitReview({
      listingId: listingId,
      orderId: orderId, // This order doesn't belong to this user
      rating: 3,
      title: 'Review without purchase',
      comment: 'Just reviewing',
    });

    expect(review).toBeDefined();
    expect(review.verifiedPurchase).toBe(false);

    // Cleanup
    await db!.delete(users).where(eq(users.id, anotherBuyer.id));
  });

  it('should not verify purchase when listing was not in the order', async () => {
    // Create another listing not in the order
    const [anotherListing] = await db!.insert(produceListings).values({
      userId: sellerId,
      title: 'Test Potatoes',
      category: 'vegetables',
      quantity: 50,
      unit: 'kg',
      pricePerUnit: 40000,
      totalPrice: 2000000, // 50 kg * 40000 per unit
      organic: false,
      deliveryOptions: JSON.stringify({ pickup: true, delivery: false, shipping: false }),
      photos: JSON.stringify([]),
      status: 'active',
    }).returning();

    const caller = appRouter.createCaller({
      user: { id: buyerId, email: 'buyer@example.com' },
      token: 'test-token',
      keycloakUser: null,
    });

    const review = await caller.productReviews.submitReview({
      listingId: anotherListing.id,
      orderId: orderId, // Order doesn't contain this listing
      rating: 4,
      title: 'Different product',
      comment: 'Not in my order',
    });

    expect(review).toBeDefined();
    expect(review.verifiedPurchase).toBe(false);

    // Cleanup
    await db!.delete(produceListings).where(eq(produceListings.id, anotherListing.id));
  });
});
