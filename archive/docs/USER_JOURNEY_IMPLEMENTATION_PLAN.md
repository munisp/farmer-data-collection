# User Journey Implementation Plan

**Date:** November 25, 2025  
**Goal:** Implement 10 end-to-end user journeys with Temporal orchestration and full middleware integration

## Implementation Strategy

### Phase 3: Missing Features (Current)
- Database schema additions
- Messaging service extensions
- UI components for journey tracking

### Phase 4: Temporal Orchestration Layer
- 10 Temporal workflows (Python)
- Activity implementations
- Workflow coordination service (Go)

### Phase 5: Middleware Integration
- TigerBeetle financial ledger (Go)
- Lakehouse analytics (Python)
- Full Kafka/Dapr/Fluvio/APISIX/Keycloak/Permify integration

### Phase 6: UI/UX Updates
- PWA journey tracking dashboard
- Mobile journey progress screens
- Multi-channel inbox

## Missing Features Breakdown

### 1. Database Tables (8 new tables)

```sql
-- Farm profiles for USSD creation
CREATE TABLE farm_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  farm_name VARCHAR(255),
  farm_size DECIMAL(10,2),
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Planting records
CREATE TABLE planting_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  crop_id INTEGER REFERENCES crops(id),
  planting_date DATE,
  expected_harvest_date DATE,
  area DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Loan accounts
CREATE TABLE loan_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(12,2),
  interest_rate DECIMAL(5,2),
  status VARCHAR(50), -- pending, active, repaid, defaulted
  disbursed_at TIMESTAMP,
  due_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Group savings
CREATE TABLE group_savings (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(255),
  leader_user_id INTEGER REFERENCES users(id),
  total_balance DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER REFERENCES group_savings(id),
  user_id INTEGER REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW()
);

-- Insurance
CREATE TABLE insurance_policies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  policy_type VARCHAR(100),
  coverage_amount DECIMAL(12,2),
  premium DECIMAL(10,2),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE insurance_claims (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER REFERENCES insurance_policies(id),
  user_id INTEGER REFERENCES users(id),
  claim_amount DECIMAL(12,2),
  damage_type VARCHAR(100),
  status VARCHAR(50), -- pending, approved, rejected, paid
  created_at TIMESTAMP DEFAULT NOW()
);

-- Negotiations
CREATE TABLE negotiations (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER REFERENCES produce_listings(id),
  buyer_id INTEGER REFERENCES users(id),
  seller_id INTEGER REFERENCES users(id),
  initial_price DECIMAL(10,2),
  counter_price DECIMAL(10,2),
  final_price DECIMAL(10,2),
  status VARCHAR(50), -- active, accepted, rejected
  created_at TIMESTAMP DEFAULT NOW()
);

-- Planting calendars
CREATE TABLE planting_calendars (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  year INTEGER,
  crop_type VARCHAR(100),
  planting_month INTEGER,
  harvest_month INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Messaging Service Extensions

```typescript
// Add to server/services/messaging-service.ts

export async function createFarmProfile(
  userId: number,
  data: { farmName: string; farmSize: number; lat?: number; lng?: number }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [farm] = await db.insert(farmProfiles).values({
    userId,
    farmName: data.farmName,
    farmSize: data.farmSize,
    locationLat: data.lat,
    locationLng: data.lng,
  }).returning();
  
  return farm.id;
}

export async function recordPlanting(
  userId: number,
  data: { cropId: number; plantingDate: Date; area: number }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [planting] = await db.insert(plantingRecords).values({
    userId,
    cropId: data.cropId,
    plantingDate: data.plantingDate,
    area: data.area,
    expectedHarvestDate: new Date(data.plantingDate.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days
  }).returning();
  
  return planting.id;
}

export async function applyForLoan(
  userId: number,
  amount: number,
  purpose: string
): Promise<{ loanId: number; approved: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Credit scoring logic
  const harvests = await db.select().from(harvests).where(eq(harvests.userId, userId));
  const totalRevenue = harvests.reduce((sum, h) => sum + (h.quantity * (h.pricePerUnit || 0)), 0);
  
  const approved = totalRevenue > amount * 2; // Simple rule: revenue > 2x loan amount
  
  const [loan] = await db.insert(loanAccounts).values({
    userId,
    amount,
    interestRate: 5.0,
    status: approved ? 'active' : 'rejected',
    disbursedAt: approved ? new Date() : null,
    dueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
  }).returning();
  
  return {
    loanId: loan.id,
    approved,
    reason: approved ? undefined : "Insufficient harvest history",
  };
}

export async function createGroupSavings(
  leaderUserId: number,
  groupName: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [group] = await db.insert(groupSavings).values({
    groupName,
    leaderUserId,
    totalBalance: 0,
  }).returning();
  
  // Add leader as first member
  await db.insert(groupMembers).values({
    groupId: group.id,
    userId: leaderUserId,
  });
  
  return group.id;
}

export async function fileInsuranceClaim(
  userId: number,
  policyId: number,
  data: { damageType: string; claimAmount: number }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [claim] = await db.insert(insuranceClaims).values({
    policyId,
    userId,
    damageType: data.damageType,
    claimAmount: data.claimAmount,
    status: 'pending',
  }).returning();
  
  return claim.id;
}

export async function startNegotiation(
  listingId: number,
  buyerId: number,
  sellerId: number,
  offerPrice: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [negotiation] = await db.insert(negotiations).values({
    listingId,
    buyerId,
    sellerId,
    initialPrice: offerPrice,
    status: 'active',
  }).returning();
  
  return negotiation.id;
}

export async function generatePlantingCalendar(
  userId: number,
  year: number
): Promise<Array<{ cropType: string; plantingMonth: number; harvestMonth: number }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // ML-based recommendation (simplified)
  const calendar = [
    { cropType: 'Maize', plantingMonth: 4, harvestMonth: 7 },
    { cropType: 'Rice', plantingMonth: 5, harvestMonth: 9 },
    { cropType: 'Cassava', plantingMonth: 3, harvestMonth: 12 },
  ];
  
  for (const entry of calendar) {
    await db.insert(plantingCalendars).values({
      userId,
      year,
      ...entry,
    });
  }
  
  return calendar;
}
```

### 3. Temporal Workflows (Python)

Create `services/python/temporal-workflows/user_journeys/` directory with 10 workflow files.

### 4. TigerBeetle Integration (Go)

Create `services/go/tigerbeetle-service/` for financial ledger.

### 5. Lakehouse Integration (Python)

Create `services/python/lakehouse-service/` for analytics.

### 6. UI Components

**PWA:**
- Journey tracking dashboard
- Multi-channel inbox
- Loan management
- Group savings
- Insurance claims

**Mobile:**
- Journey progress tracker
- USSD simulator
- SMS conversation view

## Implementation Order

1. **Database Schema** (30 min) - Create all 8 tables
2. **Messaging Service** (1 hour) - Add 7 new functions
3. **Temporal Workflows** (3 hours) - Implement 10 workflows
4. **TigerBeetle Service** (2 hours) - Financial ledger
5. **Lakehouse Service** (2 hours) - Analytics
6. **Middleware Integration** (2 hours) - Connect all services
7. **PWA UI** (2 hours) - Journey tracking + inbox
8. **Mobile UI** (1 hour) - Journey progress screens
9. **Testing** (1 hour) - End-to-end journey tests
10. **Documentation** (30 min) - Deployment guide

**Total Time:** ~15 hours

## Success Criteria

- ✅ All 10 user journeys executable end-to-end
- ✅ Temporal orchestrates all workflows
- ✅ All middleware integrated (Kafka, Dapr, Fluvio, etc.)
- ✅ TigerBeetle tracks all financial transactions
- ✅ Lakehouse stores analytics data
- ✅ PWA and mobile UI updated
- ✅ 0 TypeScript/Go/Python errors
- ✅ Comprehensive tests passing
