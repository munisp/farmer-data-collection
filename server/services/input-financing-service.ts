/**
 * Input Financing & Smart Procurement Service
 * Integrates with microfinance, TigerBeetle, and marketplace for input procurement
 * Supports pre-approved credit lines, bulk purchasing, and supplier management
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { createTigerBeetleLedger, TigerBeetleLedger } from "./tigerbeetle-ledger.js";
import { createTemporalService, TemporalWorkflowService } from "./temporal-workflow-service.js";
import { publishEvent, createEvent } from "../kafka.js";
import { logger } from '../logger.js';

let tigerBeetleLedger: TigerBeetleLedger | null = null;

async function getTigerBeetleLedger(): Promise<TigerBeetleLedger | null> {
  if (!tigerBeetleLedger) {
    try {
      tigerBeetleLedger = createTigerBeetleLedger();
    } catch (error) {
      logger.warn('[InputFinancing] TigerBeetle not available:', error);
    }
  }
  return tigerBeetleLedger;
}

export type InputCategory = 
  | 'seeds' 
  | 'fertilizers' 
  | 'pesticides' 
  | 'herbicides' 
  | 'equipment' 
  | 'irrigation'
  | 'storage'
  | 'packaging';

export type FinancingStatus = 
  | 'pre_approved' 
  | 'applied' 
  | 'approved' 
  | 'disbursed' 
  | 'partially_repaid' 
  | 'fully_repaid'
  | 'defaulted';

export interface CreditLine {
  id: string;
  farmerId: number;
  maxAmount: number;
  availableAmount: number;
  interestRate: number;
  termMonths: number;
  status: FinancingStatus;
  approvedCategories: InputCategory[];
  approvedSuppliers: string[];
  disbursements: InputDisbursement[];
  repayments: InputRepayment[];
  createdAt: Date;
  expiresAt: Date;
}

export interface InputDisbursement {
  id: string;
  creditLineId: string;
  amount: number;
  category: InputCategory;
  supplierId: string;
  supplierName: string;
  items: InputItem[];
  status: 'pending' | 'approved' | 'disbursed' | 'delivered' | 'cancelled';
  disbursedAt?: Date;
  deliveredAt?: Date;
  transactionId?: string;
}

export interface InputItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  qualityGrade?: string;
}

export interface InputRepayment {
  id: string;
  creditLineId: string;
  amount: number;
  principal: number;
  interest: number;
  paidAt: Date;
  source: 'harvest_sale' | 'manual' | 'cooperative' | 'insurance_payout';
  transactionId?: string;
}

export interface Supplier {
  id: string;
  name: string;
  categories: InputCategory[];
  rating: number;
  totalOrders: number;
  onTimeDeliveryRate: number;
  qualityScore: number;
  location: string;
  certifications: string[];
  bulkDiscountTiers: BulkDiscountTier[];
  paymentTerms: string;
  minOrderValue: number;
  deliveryDays: number;
}

export interface BulkDiscountTier {
  minQuantity: number;
  discountPercent: number;
}

export interface BulkPurchaseGroup {
  id: string;
  category: InputCategory;
  productName: string;
  supplierId: string;
  targetQuantity: number;
  currentQuantity: number;
  unitPrice: number;
  bulkPrice: number;
  savingsPercent: number;
  participants: BulkParticipant[];
  status: 'forming' | 'ready' | 'ordered' | 'delivered' | 'cancelled';
  deadline: Date;
  createdAt: Date;
}

export interface BulkParticipant {
  farmerId: number;
  quantity: number;
  contribution: number;
  status: 'committed' | 'paid' | 'received';
}

// Pre-configured suppliers (would come from database)
const SUPPLIERS: Supplier[] = [
  {
    id: 'sup_001',
    name: 'AgroInputs Nigeria Ltd',
    categories: ['seeds', 'fertilizers', 'pesticides'],
    rating: 4.5,
    totalOrders: 1250,
    onTimeDeliveryRate: 0.92,
    qualityScore: 4.3,
    location: 'Lagos, Nigeria',
    certifications: ['ISO 9001', 'NAFDAC Approved'],
    bulkDiscountTiers: [
      { minQuantity: 100, discountPercent: 5 },
      { minQuantity: 500, discountPercent: 10 },
      { minQuantity: 1000, discountPercent: 15 },
    ],
    paymentTerms: 'Net 30',
    minOrderValue: 50000,
    deliveryDays: 5,
  },
  {
    id: 'sup_002',
    name: 'FarmTech Equipment Co',
    categories: ['equipment', 'irrigation', 'storage'],
    rating: 4.2,
    totalOrders: 890,
    onTimeDeliveryRate: 0.88,
    qualityScore: 4.5,
    location: 'Ibadan, Nigeria',
    certifications: ['SON Certified'],
    bulkDiscountTiers: [
      { minQuantity: 10, discountPercent: 5 },
      { minQuantity: 50, discountPercent: 12 },
    ],
    paymentTerms: 'Net 45',
    minOrderValue: 100000,
    deliveryDays: 7,
  },
  {
    id: 'sup_003',
    name: 'SeedCo Africa',
    categories: ['seeds'],
    rating: 4.8,
    totalOrders: 2100,
    onTimeDeliveryRate: 0.95,
    qualityScore: 4.7,
    location: 'Nairobi, Kenya',
    certifications: ['KEPHIS Certified', 'ISO 22000'],
    bulkDiscountTiers: [
      { minQuantity: 50, discountPercent: 8 },
      { minQuantity: 200, discountPercent: 15 },
      { minQuantity: 500, discountPercent: 20 },
    ],
    paymentTerms: 'Net 30',
    minOrderValue: 25000,
    deliveryDays: 10,
  },
];

// Input catalog (would come from database)
const INPUT_CATALOG: Record<InputCategory, Array<{
  id: string;
  name: string;
  unit: string;
  basePrice: number;
  supplierId: string;
}>> = {
  seeds: [
    { id: 'seed_maize_hybrid', name: 'Hybrid Maize Seeds (SAMMAZ 15)', unit: 'kg', basePrice: 2500, supplierId: 'sup_003' },
    { id: 'seed_rice_faro44', name: 'Rice Seeds (FARO 44)', unit: 'kg', basePrice: 1800, supplierId: 'sup_003' },
    { id: 'seed_cassava_tms', name: 'Cassava Stems (TMS 30572)', unit: 'bundle', basePrice: 500, supplierId: 'sup_001' },
    { id: 'seed_palm_tenera', name: 'Oil Palm Seedlings (Tenera)', unit: 'seedling', basePrice: 1500, supplierId: 'sup_001' },
    { id: 'seed_cocoa_hybrid', name: 'Cocoa Pods (Hybrid)', unit: 'pod', basePrice: 200, supplierId: 'sup_001' },
  ],
  fertilizers: [
    { id: 'fert_npk_15_15_15', name: 'NPK 15-15-15', unit: '50kg bag', basePrice: 18000, supplierId: 'sup_001' },
    { id: 'fert_urea', name: 'Urea (46-0-0)', unit: '50kg bag', basePrice: 22000, supplierId: 'sup_001' },
    { id: 'fert_organic_compost', name: 'Organic Compost', unit: '25kg bag', basePrice: 3500, supplierId: 'sup_001' },
    { id: 'fert_dap', name: 'DAP (18-46-0)', unit: '50kg bag', basePrice: 25000, supplierId: 'sup_001' },
  ],
  pesticides: [
    { id: 'pest_cypermethrin', name: 'Cypermethrin 10% EC', unit: 'liter', basePrice: 4500, supplierId: 'sup_001' },
    { id: 'pest_lambda', name: 'Lambda-cyhalothrin', unit: 'liter', basePrice: 5500, supplierId: 'sup_001' },
    { id: 'pest_neem_oil', name: 'Neem Oil (Organic)', unit: 'liter', basePrice: 3000, supplierId: 'sup_001' },
  ],
  herbicides: [
    { id: 'herb_glyphosate', name: 'Glyphosate 360 SL', unit: 'liter', basePrice: 3500, supplierId: 'sup_001' },
    { id: 'herb_paraquat', name: 'Paraquat', unit: 'liter', basePrice: 4000, supplierId: 'sup_001' },
    { id: 'herb_atrazine', name: 'Atrazine 80% WP', unit: 'kg', basePrice: 5000, supplierId: 'sup_001' },
  ],
  equipment: [
    { id: 'equip_sprayer_knapsack', name: 'Knapsack Sprayer (16L)', unit: 'unit', basePrice: 15000, supplierId: 'sup_002' },
    { id: 'equip_cutlass', name: 'Cutlass (Heavy Duty)', unit: 'unit', basePrice: 3500, supplierId: 'sup_002' },
    { id: 'equip_hoe', name: 'Hoe (Standard)', unit: 'unit', basePrice: 2500, supplierId: 'sup_002' },
    { id: 'equip_wheelbarrow', name: 'Wheelbarrow (100L)', unit: 'unit', basePrice: 25000, supplierId: 'sup_002' },
  ],
  irrigation: [
    { id: 'irrig_drip_kit', name: 'Drip Irrigation Kit (1 acre)', unit: 'kit', basePrice: 150000, supplierId: 'sup_002' },
    { id: 'irrig_sprinkler', name: 'Sprinkler System (1/2 acre)', unit: 'kit', basePrice: 85000, supplierId: 'sup_002' },
    { id: 'irrig_pump_2hp', name: 'Water Pump (2HP)', unit: 'unit', basePrice: 75000, supplierId: 'sup_002' },
  ],
  storage: [
    { id: 'stor_hermetic_bag', name: 'Hermetic Storage Bags (100kg)', unit: 'bag', basePrice: 2500, supplierId: 'sup_002' },
    { id: 'stor_silo_1ton', name: 'Metal Silo (1 ton)', unit: 'unit', basePrice: 180000, supplierId: 'sup_002' },
    { id: 'stor_tarpaulin', name: 'Tarpaulin (6x8m)', unit: 'unit', basePrice: 8000, supplierId: 'sup_002' },
  ],
  packaging: [
    { id: 'pack_jute_bag', name: 'Jute Bags (100kg)', unit: 'bag', basePrice: 800, supplierId: 'sup_001' },
    { id: 'pack_poly_bag', name: 'Polypropylene Bags (50kg)', unit: 'bag', basePrice: 350, supplierId: 'sup_001' },
  ],
};

class InputFinancingService {
  private creditLines: BoundedMap<string, CreditLine> = new BoundedMap(5000, 86400_000);
  private bulkGroups: BoundedMap<string, BulkPurchaseGroup> = new BoundedMap(2000, 86400_000);

  /**
   * Check pre-approval eligibility for a farmer
   */
  async checkPreApproval(farmerId: number): Promise<{
    eligible: boolean;
    maxAmount: number;
    interestRate: number;
    termMonths: number;
    approvedCategories: InputCategory[];
    reasons: string[];
  }> {
    // Would integrate with credit scoring service
    const creditScore = await this.getFarmerCreditScore(farmerId);
    const farmData = await this.getFarmerData(farmerId);

    const reasons: string[] = [];
    let eligible = true;
    let maxAmount = 0;
    let interestRate = 0.24; // 24% annual default
    let termMonths = 6;
    const approvedCategories: InputCategory[] = [];

    // Credit score requirements
    if (creditScore >= 700) {
      maxAmount = 2000000;
      interestRate = 0.18;
      termMonths = 12;
      approvedCategories.push('seeds', 'fertilizers', 'pesticides', 'herbicides', 'equipment', 'irrigation', 'storage', 'packaging');
      reasons.push('Excellent credit score qualifies for premium financing');
    } else if (creditScore >= 600) {
      maxAmount = 1000000;
      interestRate = 0.22;
      termMonths = 9;
      approvedCategories.push('seeds', 'fertilizers', 'pesticides', 'herbicides');
      reasons.push('Good credit score qualifies for standard financing');
    } else if (creditScore >= 500) {
      maxAmount = 500000;
      interestRate = 0.26;
      termMonths = 6;
      approvedCategories.push('seeds', 'fertilizers');
      reasons.push('Fair credit score qualifies for basic financing');
    } else {
      eligible = false;
      reasons.push('Credit score below minimum threshold (500)');
    }

    // Farm size bonus
    if (farmData.totalHectares >= 5) {
      maxAmount *= 1.5;
      reasons.push('Farm size bonus applied (+50%)');
    }

    // Cooperative membership bonus
    if (farmData.cooperativeMember) {
      interestRate -= 0.02;
      reasons.push('Cooperative membership discount (-2% interest)');
    }

    // Previous loan history
    if (farmData.previousLoansRepaid > 0 && farmData.defaultRate === 0) {
      maxAmount *= 1.2;
      reasons.push('Good repayment history bonus (+20%)');
    }

    return {
      eligible,
      maxAmount: Math.round(maxAmount),
      interestRate,
      termMonths,
      approvedCategories,
      reasons,
    };
  }

  /**
   * Create a credit line for input financing
   */
  async createCreditLine(params: {
    farmerId: number;
    requestedAmount: number;
    categories: InputCategory[];
  }): Promise<CreditLine> {
    const { farmerId, requestedAmount, categories } = params;

    // Check pre-approval
    const preApproval = await this.checkPreApproval(farmerId);
    if (!preApproval.eligible) {
      throw new Error('Farmer not eligible for input financing');
    }

    const approvedAmount = Math.min(requestedAmount, preApproval.maxAmount);
    const approvedCategories = categories.filter(c => preApproval.approvedCategories.includes(c));

    const creditLineId = `CL-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + preApproval.termMonths);

    const creditLine: CreditLine = {
      id: creditLineId,
      farmerId,
      maxAmount: approvedAmount,
      availableAmount: approvedAmount,
      interestRate: preApproval.interestRate,
      termMonths: preApproval.termMonths,
      status: 'approved',
      approvedCategories,
      approvedSuppliers: SUPPLIERS.filter(s => 
        s.categories.some(c => approvedCategories.includes(c))
      ).map(s => s.id),
      disbursements: [],
      repayments: [],
      createdAt: new Date(),
      expiresAt,
    };

    this.creditLines.set(creditLineId, creditLine);

    // Record in TigerBeetle
    try {
      const ledger = await getTigerBeetleLedger();
      if (ledger) {
        await ledger.recordTransaction({
          type: 'credit_line_created',
          amount: approvedAmount,
          fromAccountId: 'input_financing_pool',
          toAccountId: `credit_line_${creditLineId}`,
          metadata: { creditLineId, farmerId },
        });
      }
    } catch (error) {
      logger.warn('[InputFinancing] Could not record in TigerBeetle:', error);
    }

    // Emit event
    try {
      await publishEvent('financing-events', createEvent(
        'credit_line_created',
        'credit_line',
        creditLineId,
        farmerId,
        creditLine
      ));
    } catch (error) {
      logger.warn('[InputFinancing] Could not emit Kafka event:', error);
    }

    return creditLine;
  }

  /**
   * Request disbursement for input purchase
   */
  async requestDisbursement(params: {
    creditLineId: string;
    supplierId: string;
    items: Array<{ inputId: string; quantity: number }>;
  }): Promise<InputDisbursement> {
    const { creditLineId, supplierId, items } = params;

    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) {
      throw new Error('Credit line not found');
    }

    if (creditLine.status !== 'approved' && creditLine.status !== 'disbursed') {
      throw new Error('Credit line not active');
    }

    const supplier = SUPPLIERS.find(s => s.id === supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    // Calculate total and validate
    const inputItems: InputItem[] = [];
    let totalAmount = 0;

    for (const item of items) {
      const category = Object.keys(INPUT_CATALOG).find(cat => 
        INPUT_CATALOG[cat as InputCategory].some(i => i.id === item.inputId)
      ) as InputCategory;

      if (!category || !creditLine.approvedCategories.includes(category)) {
        throw new Error(`Category ${category} not approved for this credit line`);
      }

      const input = INPUT_CATALOG[category].find(i => i.id === item.inputId);
      if (!input) {
        throw new Error(`Input ${item.inputId} not found`);
      }

      const itemTotal = input.basePrice * item.quantity;
      inputItems.push({
        name: input.name,
        quantity: item.quantity,
        unit: input.unit,
        unitPrice: input.basePrice,
        totalPrice: itemTotal,
      });
      totalAmount += itemTotal;
    }

    // Apply bulk discount
    const discount = this.calculateBulkDiscount(supplier, inputItems);
    totalAmount = Math.round(totalAmount * (1 - discount));

    if (totalAmount > creditLine.availableAmount) {
      throw new Error('Insufficient credit available');
    }

    const disbursementId = `DIS-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const disbursement: InputDisbursement = {
      id: disbursementId,
      creditLineId,
      amount: totalAmount,
      category: inputItems[0] ? Object.keys(INPUT_CATALOG).find(cat =>
        INPUT_CATALOG[cat as InputCategory].some(i => i.name === inputItems[0].name)
      ) as InputCategory : 'seeds',
      supplierId,
      supplierName: supplier.name,
      items: inputItems,
      status: 'pending',
    };

    // Auto-approve if within limits
    disbursement.status = 'approved';

    // Disburse to supplier via TigerBeetle
    try {
      const ledger = await getTigerBeetleLedger();
      if (ledger) {
        const txResult = await ledger.recordTransaction({
          type: 'input_disbursement',
          amount: totalAmount,
          fromAccountId: `credit_line_${creditLineId}`,
          toAccountId: `supplier_${supplierId}`,
          metadata: { disbursementId, creditLineId, supplierId },
        });

        disbursement.status = 'disbursed';
        disbursement.disbursedAt = new Date();
        disbursement.transactionId = txResult?.transactionId;
      }
    } catch (error) {
      logger.warn('[InputFinancing] Could not disburse:', error);
    }

    // Update credit line
    creditLine.availableAmount -= totalAmount;
    creditLine.disbursements.push(disbursement);
    creditLine.status = 'disbursed';

    return disbursement;
  }

  /**
   * Record repayment
   */
  async recordRepayment(params: {
    creditLineId: string;
    amount: number;
    source: InputRepayment['source'];
  }): Promise<InputRepayment> {
    const { creditLineId, amount, source } = params;

    const creditLine = this.creditLines.get(creditLineId);
    if (!creditLine) {
      throw new Error('Credit line not found');
    }

    const totalDisbursed = creditLine.disbursements.reduce((sum, d) => sum + d.amount, 0);
    const totalRepaid = creditLine.repayments.reduce((sum, r) => sum + r.amount, 0);
    const outstanding = totalDisbursed - totalRepaid;

    if (amount > outstanding) {
      throw new Error('Repayment amount exceeds outstanding balance');
    }

    // Calculate principal and interest split
    const interestPortion = outstanding * (creditLine.interestRate / 12);
    const interest = Math.min(amount, interestPortion);
    const principal = amount - interest;

    const repaymentId = `REP-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const repayment: InputRepayment = {
      id: repaymentId,
      creditLineId,
      amount,
      principal,
      interest,
      paidAt: new Date(),
      source,
    };

    // Record in TigerBeetle
    try {
      const ledger = await getTigerBeetleLedger();
      if (ledger) {
        const txResult = await ledger.recordTransaction({
          type: 'input_repayment',
          amount,
          fromAccountId: creditLine.farmerId.toString(),
          toAccountId: 'input_financing_pool',
          metadata: { repaymentId, creditLineId, source },
        });
        repayment.transactionId = txResult?.transactionId;
      }
    } catch (error) {
      logger.warn('[InputFinancing] Could not record repayment:', error);
    }

    creditLine.repayments.push(repayment);

    // Update status
    const newOutstanding = outstanding - amount;
    if (newOutstanding <= 0) {
      creditLine.status = 'fully_repaid';
      creditLine.availableAmount = creditLine.maxAmount; // Reset available amount
    } else {
      creditLine.status = 'partially_repaid';
    }

    return repayment;
  }

  /**
   * Get input catalog by category
   */
  getInputCatalog(category?: InputCategory): Record<string, any[]> {
    if (category) {
      return { [category]: INPUT_CATALOG[category] || [] };
    }
    return INPUT_CATALOG;
  }

  /**
   * Get suppliers by category
   */
  getSuppliers(category?: InputCategory): Supplier[] {
    if (category) {
      return SUPPLIERS.filter(s => s.categories.includes(category));
    }
    return SUPPLIERS;
  }

  /**
   * Create or join a bulk purchase group
   */
  async joinBulkPurchase(params: {
    farmerId: number;
    inputId: string;
    quantity: number;
  }): Promise<BulkPurchaseGroup> {
    const { farmerId, inputId, quantity } = params;

    // Find the input
    let input: any;
    let category: InputCategory | undefined;
    for (const [cat, items] of Object.entries(INPUT_CATALOG)) {
      const found = items.find(i => i.id === inputId);
      if (found) {
        input = found;
        category = cat as InputCategory;
        break;
      }
    }

    if (!input || !category) {
      throw new Error('Input not found');
    }

    const supplier = SUPPLIERS.find(s => s.id === input.supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }

    // Find existing group or create new one
    let group = Array.from(this.bulkGroups.values()).find(g =>
      g.category === category &&
      g.productName === input.name &&
      g.status === 'forming'
    );

    if (!group) {
      const groupId = `BG-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7); // 7 days to form group

      // Calculate bulk price based on target quantity
      const targetQuantity = supplier.bulkDiscountTiers[supplier.bulkDiscountTiers.length - 1]?.minQuantity || 100;
      const discount = this.calculateBulkDiscountForQuantity(supplier, targetQuantity);
      const bulkPrice = Math.round(input.basePrice * (1 - discount));

      group = {
        id: groupId,
        category,
        productName: input.name,
        supplierId: supplier.id,
        targetQuantity,
        currentQuantity: 0,
        unitPrice: input.basePrice,
        bulkPrice,
        savingsPercent: Math.round(discount * 100),
        participants: [],
        status: 'forming',
        deadline,
        createdAt: new Date(),
      };

      this.bulkGroups.set(groupId, group);
    }

    // Add participant
    const contribution = quantity * group.bulkPrice;
    group.participants.push({
      farmerId,
      quantity,
      contribution,
      status: 'committed',
    });
    group.currentQuantity += quantity;

    // Check if target reached
    if (group.currentQuantity >= group.targetQuantity) {
      group.status = 'ready';
    }

    return group;
  }

  /**
   * Get farmer's credit lines
   */
  async getFarmerCreditLines(farmerId: number): Promise<CreditLine[]> {
    return Array.from(this.creditLines.values()).filter(cl => cl.farmerId === farmerId);
  }

  /**
   * Get bulk purchase groups
   */
  getBulkPurchaseGroups(category?: InputCategory): BulkPurchaseGroup[] {
    const groups = Array.from(this.bulkGroups.values());
    if (category) {
      return groups.filter(g => g.category === category);
    }
    return groups;
  }

  // Private helper methods

  private async getFarmerCreditScore(farmerId: number): Promise<number> {
    try {
      const { CreditScoringService } = await import("./credit-scoring.js");
      const scorer = new CreditScoringService();
      const result = await scorer.calculateCreditScore(farmerId);
      return result.score;
    } catch (err) {
      return 600; // conservative default if scoring unavailable
    }
  }

  private async getFarmerData(farmerId: number): Promise<{
    totalHectares: number;
    cooperativeMember: boolean;
    previousLoansRepaid: number;
    defaultRate: number;
  }> {
    try {
      const { getDb } = await import("../db.js");
      const db = await getDb();
      if (!db) throw new Error('DB unavailable');
      const { farms, loans } = await import("../../drizzle/schema.js");
      const { eq, sql } = await import("drizzle-orm");
      
      const farmerFarms = await db.select({ totalArea: sql<number>`COALESCE(SUM(${farms.farmSize}), 0)` }).from(farms).where(eq(farms.farmerId, farmerId));
      const totalHectares = Number(farmerFarms[0]?.totalArea ?? 2);
      
      const loanHistory = await db.select({
        total: sql<number>`COUNT(*)`,
        repaid: sql<number>`COUNT(*) FILTER (WHERE status = 'repaid')`,
        defaulted: sql<number>`COUNT(*) FILTER (WHERE status = 'defaulted')`,
      }).from(loans).where(eq(loans.userId, farmerId));
      
      const total = Number(loanHistory[0]?.total ?? 0);
      const repaid = Number(loanHistory[0]?.repaid ?? 0);
      const defaulted = Number(loanHistory[0]?.defaulted ?? 0);

      return {
        totalHectares,
        cooperativeMember: false,
        previousLoansRepaid: repaid,
        defaultRate: total > 0 ? defaulted / total : 0,
      };
    } catch (err) {
      return { totalHectares: 2, cooperativeMember: false, previousLoansRepaid: 0, defaultRate: 0 };
    }
  }

  private calculateBulkDiscount(supplier: Supplier, items: InputItem[]): number {
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    return this.calculateBulkDiscountForQuantity(supplier, totalQuantity);
  }

  private calculateBulkDiscountForQuantity(supplier: Supplier, quantity: number): number {
    let discount = 0;
    for (const tier of supplier.bulkDiscountTiers) {
      if (quantity >= tier.minQuantity) {
        discount = tier.discountPercent / 100;
      }
    }
    return discount;
  }
}

export const inputFinancingService = new InputFinancingService();
