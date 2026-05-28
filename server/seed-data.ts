import { getDb } from './db';
import {
  users,
  farmers,
  farms,
  crops,
  produceListings,
  marketplaceOrders,
  orderItems,
  shoppingCartItems,
  buyerProfiles,
  marketplaceMessages,
} from '../drizzle/schema';
import bcrypt from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';
import { logger } from './logger.js';

interface SeedUserDefinition {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: 'farmer' | 'buyer' | 'admin';
}

const seedUsers: SeedUserDefinition[] = [
  {
    email: 'demo@farmer.com',
    password: 'demo123',
    firstName: 'Amina',
    lastName: 'Yusuf',
    phoneNumber: '+2348010000001',
    role: 'farmer',
  },
  {
    email: 'buyer@agrifinance.com',
    password: 'demo123',
    firstName: 'Chinedu',
    lastName: 'Okoro',
    phoneNumber: '+2348010000002',
    role: 'buyer',
  },
  {
    email: 'seller@agrifinance.com',
    password: 'demo123',
    firstName: 'Grace',
    lastName: 'Adeyemi',
    phoneNumber: '+2348010000003',
    role: 'farmer',
  },
];

export async function seedDatabase() {
  const db = await getDb();
  if (!db) {
    logger.error('Database connection failed');
    return;
  }

  try {
    logger.info('Starting database seeding...');

    const userMap = new Map<string, number>();

    for (const definition of seedUsers) {
      const existing = await db.select().from(users).where(eq(users.email, definition.email)).limit(1);
      if (existing.length > 0) {
        userMap.set(definition.email, existing[0].id);
        continue;
      }

      const hashedPassword = await bcrypt.hash(definition.password, 10);
      const [createdUser] = await db
        .insert(users)
        .values({
          email: definition.email,
          password: hashedPassword,
          firstName: definition.firstName,
          lastName: definition.lastName,
          phoneNumber: definition.phoneNumber,
          role: definition.role,
          isActive: true,
        })
        .returning();

      userMap.set(definition.email, createdUser.id);
      logger.info(`Seeded user: ${createdUser.email}`);
    }

    const primaryFarmerUserId = userMap.get('demo@farmer.com')!;
    const secondaryFarmerUserId = userMap.get('seller@agrifinance.com')!;
    const buyerUserId = userMap.get('buyer@agrifinance.com')!;

    const farmerProfiles = [
      {
        userId: primaryFarmerUserId,
        firstName: 'Amina',
        lastName: 'Yusuf',
        phoneNumber: '+2348010000001',
        email: 'demo@farmer.com',
        address: 'Kuje Farm Settlement',
        village: 'Kuje',
        district: 'Kuje',
        region: 'FCT',
        nationalId: 'NG-AMINA-001',
        verificationStatus: 'verified',
        verificationNotes: 'Seeded verified field farmer profile',
      },
      {
        userId: secondaryFarmerUserId,
        firstName: 'Grace',
        lastName: 'Adeyemi',
        phoneNumber: '+2348010000003',
        email: 'seller@agrifinance.com',
        address: 'Bashorun Market Road',
        village: 'Bashorun',
        district: 'Ibadan North',
        region: 'Oyo',
        nationalId: 'NG-GRACE-002',
        verificationStatus: 'verified',
        verificationNotes: 'Seeded verified marketplace seller profile',
      },
    ];

    const farmerIdByUserId = new Map<number, number>();
    for (const profile of farmerProfiles) {
      const existing = await db.select().from(farmers).where(eq(farmers.userId, profile.userId)).limit(1);
      if (existing.length > 0) {
        farmerIdByUserId.set(profile.userId, existing[0].id);
        continue;
      }

      const [createdFarmer] = await db.insert(farmers).values(profile).returning();
      farmerIdByUserId.set(profile.userId, createdFarmer.id);
      logger.info(`Seeded farmer: ${createdFarmer.firstName} ${createdFarmer.lastName}`);
    }

    const farmDefinitions = [
      {
        userId: primaryFarmerUserId,
        farmerId: farmerIdByUserId.get(primaryFarmerUserId)!,
        farmName: 'Kuje Fresh Produce Cooperative Farm',
        farmSize: '18.50',
        farmSizeUnit: 'acres',
        location: 'Kuje, Abuja, Nigeria',
        latitude: '8.8767000',
        longitude: '7.2276000',
        soilType: 'Loamy',
        irrigationType: 'Drip',
      },
      {
        userId: secondaryFarmerUserId,
        farmerId: farmerIdByUserId.get(secondaryFarmerUserId)!,
        farmName: 'Ibadan Agro Hub',
        farmSize: '12.00',
        farmSizeUnit: 'acres',
        location: 'Ibadan, Oyo, Nigeria',
        latitude: '7.3775000',
        longitude: '3.9470000',
        soilType: 'Sandy loam',
        irrigationType: 'Sprinkler',
      },
    ];

    const farmIdByUserId = new Map<number, number>();
    for (const farmDefinition of farmDefinitions) {
      const existing = await db.select().from(farms).where(and(eq(farms.userId, farmDefinition.userId), eq(farms.farmName, farmDefinition.farmName))).limit(1);
      if (existing.length > 0) {
        farmIdByUserId.set(farmDefinition.userId, existing[0].id);
        continue;
      }

      const [createdFarm] = await db.insert(farms).values(farmDefinition).returning();
      farmIdByUserId.set(farmDefinition.userId, createdFarm.id);
      logger.info(`Seeded farm: ${createdFarm.farmName}`);
    }

    const cropDefinitions = [
      {
        userId: primaryFarmerUserId,
        farmId: farmIdByUserId.get(primaryFarmerUserId)!,
        cropName: 'Tomato',
        cropVariety: 'Roma VF',
        plantingDate: new Date('2026-02-15'),
        expectedHarvestDate: new Date('2026-05-20'),
        areaPlanted: '5.50',
        areaUnit: 'acres',
        season: 'Dry Season',
        status: 'growing',
      },
      {
        userId: primaryFarmerUserId,
        farmId: farmIdByUserId.get(primaryFarmerUserId)!,
        cropName: 'Maize',
        cropVariety: 'SAMMAZ 52',
        plantingDate: new Date('2026-03-01'),
        expectedHarvestDate: new Date('2026-07-01'),
        areaPlanted: '8.00',
        areaUnit: 'acres',
        season: 'Wet Season',
        status: 'planted',
      },
      {
        userId: secondaryFarmerUserId,
        farmId: farmIdByUserId.get(secondaryFarmerUserId)!,
        cropName: 'Pepper',
        cropVariety: 'Tatase',
        plantingDate: new Date('2026-01-20'),
        expectedHarvestDate: new Date('2026-05-01'),
        areaPlanted: '3.20',
        areaUnit: 'acres',
        season: 'Dry Season',
        status: 'growing',
      },
    ];

    const cropIdByKey = new Map<string, number>();
    for (const cropDefinition of cropDefinitions) {
      const existing = await db
        .select()
        .from(crops)
        .where(and(eq(crops.userId, cropDefinition.userId), eq(crops.cropName, cropDefinition.cropName), eq(crops.farmId, cropDefinition.farmId)))
        .limit(1);

      if (existing.length > 0) {
        cropIdByKey.set(`${cropDefinition.userId}:${cropDefinition.cropName}`, existing[0].id);
        continue;
      }

      const [createdCrop] = await db.insert(crops).values(cropDefinition).returning();
      cropIdByKey.set(`${cropDefinition.userId}:${cropDefinition.cropName}`, createdCrop.id);
      logger.info(`Seeded crop: ${createdCrop.cropName}`);
    }

    const existingBuyerProfile = await db.select().from(buyerProfiles).where(eq(buyerProfiles.userId, buyerUserId)).limit(1);
    if (existingBuyerProfile.length === 0) {
      await db.insert(buyerProfiles).values({
        userId: buyerUserId,
        businessName: 'Agri Retail Buyers Ltd',
        businessType: 'retailer',
        preferences: {
          organicOnly: false,
          deliveryOnly: false,
          maxDistance: 250,
        },
      });
      logger.info('Seeded buyer profile');
    }

    const listingDefinitions = [
      {
        userId: primaryFarmerUserId,
        farmId: farmIdByUserId.get(primaryFarmerUserId)!,
        cropId: cropIdByKey.get(`${primaryFarmerUserId}:Tomato`)!,
        title: 'Fresh Roma Tomatoes - Grade A',
        description: 'Freshly harvested Roma tomatoes suitable for retail and food service buyers.',
        category: 'vegetables',
        quantity: 120,
        unit: 'crates',
        pricePerUnit: 8500,
        minimumOrder: 5,
        organic: true,
        location: JSON.stringify({ city: 'Abuja', state: 'FCT', country: 'Nigeria' }) as any,
        harvestDate: new Date('2026-04-10'),
        availableFrom: new Date('2026-04-12'),
        availableUntil: new Date('2026-05-30'),
        photos: JSON.stringify(['https://images.unsplash.com/photo-1546470427-e26264be0b0d']) as any,
        certifications: JSON.stringify(['organic', 'traceable']) as any,
        deliveryOptions: JSON.stringify({ pickup: true, delivery: true, shipping: false }) as any,
        views: 124,
        favorites: 19,
        status: 'active',
      },
      {
        userId: primaryFarmerUserId,
        farmId: farmIdByUserId.get(primaryFarmerUserId)!,
        cropId: cropIdByKey.get(`${primaryFarmerUserId}:Maize`)!,
        title: 'Premium Yellow Maize',
        description: 'Clean dried yellow maize in sealed bags for wholesalers and processors.',
        category: 'grains',
        quantity: 90,
        unit: 'bags',
        pricePerUnit: 12000,
        minimumOrder: 3,
        organic: false,
        location: JSON.stringify({ city: 'Abuja', state: 'FCT', country: 'Nigeria' }) as any,
        harvestDate: new Date('2026-04-01'),
        availableFrom: new Date('2026-04-05'),
        availableUntil: new Date('2026-06-30'),
        photos: JSON.stringify(['https://images.unsplash.com/photo-1601593768799-76af4098d545']) as any,
        certifications: JSON.stringify(['moisture-tested']) as any,
        deliveryOptions: JSON.stringify({ pickup: true, delivery: true, shipping: true }) as any,
        views: 88,
        favorites: 13,
        status: 'active',
      },
      {
        userId: secondaryFarmerUserId,
        farmId: farmIdByUserId.get(secondaryFarmerUserId)!,
        cropId: cropIdByKey.get(`${secondaryFarmerUserId}:Pepper`)!,
        title: 'Red Bell Pepper Bulk Harvest',
        description: 'Uniform quality peppers for grocery chains, restaurants, and distributors.',
        category: 'vegetables',
        quantity: 60,
        unit: 'bags',
        pricePerUnit: 15000,
        minimumOrder: 2,
        organic: true,
        location: JSON.stringify({ city: 'Ibadan', state: 'Oyo', country: 'Nigeria' }) as any,
        harvestDate: new Date('2026-04-08'),
        availableFrom: new Date('2026-04-09'),
        availableUntil: new Date('2026-05-31'),
        photos: JSON.stringify(['https://images.unsplash.com/photo-1563565375-f3fdfdbefa83']) as any,
        certifications: JSON.stringify(['organic']) as any,
        deliveryOptions: JSON.stringify({ pickup: true, delivery: false, shipping: true }) as any,
        views: 76,
        favorites: 11,
        status: 'active',
      },
    ];

    const listingIdsByTitle = new Map<string, number>();
    for (const listingDefinition of listingDefinitions) {
      const existing = await db
        .select()
        .from(produceListings)
        .where(and(eq(produceListings.userId, listingDefinition.userId), eq(produceListings.title, listingDefinition.title)))
        .limit(1);

      if (existing.length > 0) {
        listingIdsByTitle.set(listingDefinition.title, existing[0].id);
        continue;
      }

      const [createdListing] = await db.insert(produceListings).values(listingDefinition as any).returning();
      listingIdsByTitle.set(listingDefinition.title, createdListing.id);
      logger.info(`Seeded listing: ${createdListing.title}`);
    }

    const existingCartItems = await db.select().from(shoppingCartItems).where(eq(shoppingCartItems.userId, buyerUserId));
    if (existingCartItems.length === 0) {
      await db.insert(shoppingCartItems).values([
        {
          userId: buyerUserId,
          listingId: listingIdsByTitle.get('Fresh Roma Tomatoes - Grade A')!,
          quantity: 8,
        },
        {
          userId: buyerUserId,
          listingId: listingIdsByTitle.get('Premium Yellow Maize')!,
          quantity: 4,
        },
      ]);
      logger.info('Seeded marketplace cart');
    }

    const existingOrders = await db.select().from(marketplaceOrders).where(eq(marketplaceOrders.buyerId, buyerUserId)).limit(1);
    if (existingOrders.length === 0) {
      const [pendingOrder] = await db
        .insert(marketplaceOrders)
        .values({
          buyerId: buyerUserId,
          sellerId: primaryFarmerUserId,
          orderNumber: `ORD-SEED-${Date.now()}`,
          totalAmount: 42500,
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentMethod: 'card',
          deliveryMethod: 'delivery',
          deliveryAddress: JSON.stringify({ street: '12 Adetokunbo Ademola Crescent', city: 'Abuja', state: 'FCT', zip: '900001', country: 'Nigeria' }) as any,
          deliveryDate: new Date('2026-04-20'),
          notes: 'Seeded lifecycle order for fulfilment demo',
          confirmedAt: new Date('2026-04-14T09:00:00Z'),
        })
        .returning();

      await db.insert(orderItems).values([
        {
          orderId: pendingOrder.id,
          listingId: listingIdsByTitle.get('Fresh Roma Tomatoes - Grade A')!,
          quantity: 5,
          pricePerUnit: 8500,
          totalPrice: 42500,
          productTitle: 'Fresh Roma Tomatoes - Grade A',
          productUnit: 'crates',
        },
      ]);

      await db.insert(marketplaceMessages).values([
        {
          senderId: buyerUserId,
          recipientId: primaryFarmerUserId,
          orderId: pendingOrder.id,
          listingId: listingIdsByTitle.get('Fresh Roma Tomatoes - Grade A')!,
          subject: 'Delivery coordination',
          message: 'Please confirm the earliest delivery slot for this week.',
        },
        {
          senderId: primaryFarmerUserId,
          recipientId: buyerUserId,
          orderId: pendingOrder.id,
          listingId: listingIdsByTitle.get('Fresh Roma Tomatoes - Grade A')!,
          subject: 'Re: Delivery coordination',
          message: 'Confirmed for Thursday morning. Tracking details will follow once dispatched.',
        },
      ]);

      logger.info('Seeded marketplace lifecycle order and conversation');
    }

    const seededListingIds = Array.from(listingIdsByTitle.values());
    if (seededListingIds.length > 0) {
      await db
        .update(produceListings)
        .set({ updatedAt: new Date() })
        .where(inArray(produceListings.id, seededListingIds));
    }

    logger.info('Database seeding completed successfully!');
    return {
      success: true,
      users: Object.fromEntries(userMap.entries()),
      seededListings: listingIdsByTitle.size,
      seededFarms: farmIdByUserId.size,
      seededFarmers: farmerIdByUserId.size,
    };
  } catch (error) {
    logger.error('Error seeding database:', error);
    throw error;
  }
}
