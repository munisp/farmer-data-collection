/**
 * Chart of Accounts (COA) for Nigerian Smallholder Farmers
 * 
 * Simplified accounting structure designed for farmers with 0.5-5 hectares
 * Based on Nigerian accounting standards and agricultural best practices
 */

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum AccountCategory {
  // Assets
  CASH = 'CASH',
  BANK = 'BANK',
  MOBILE_MONEY = 'MOBILE_MONEY',
  INVENTORY = 'INVENTORY',
  EQUIPMENT = 'EQUIPMENT',
  LAND = 'LAND',
  RECEIVABLES = 'RECEIVABLES',
  
  // Liabilities
  LOANS = 'LOANS',
  PAYABLES = 'PAYABLES',
  ADVANCES = 'ADVANCES',
  
  // Equity
  CAPITAL = 'CAPITAL',
  RETAINED_EARNINGS = 'RETAINED_EARNINGS',
  
  // Revenue
  CROP_SALES = 'CROP_SALES',
  LIVESTOCK_SALES = 'LIVESTOCK_SALES',
  SERVICES = 'SERVICES',
  SUBSIDIES = 'SUBSIDIES',
  
  // Expenses
  SEEDS = 'SEEDS',
  FERTILIZER = 'FERTILIZER',
  PESTICIDES = 'PESTICIDES',
  LABOR = 'LABOR',
  EQUIPMENT_RENTAL = 'EQUIPMENT_RENTAL',
  TRANSPORT = 'TRANSPORT',
  UTILITIES = 'UTILITIES',
  INTEREST = 'INTEREST',
  DEPRECIATION = 'DEPRECIATION',
}

export interface ChartOfAccount {
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentCode?: string;
  isActive: boolean;
  currency: string;
  description?: string;
}

/**
 * Pre-configured Chart of Accounts for Nigerian Farmers
 * Accounts are numbered using a 4-digit system:
 * 1000-1999: Assets
 * 2000-2999: Liabilities
 * 3000-3999: Equity
 * 4000-4999: Revenue
 * 5000-5999: Expenses
 */
export const FARMER_COA: ChartOfAccount[] = [
  // ============================================================================
  // ASSETS (1000-1999)
  // ============================================================================
  
  // Current Assets - Cash & Bank
  {
    code: '1000',
    name: 'Cash on Hand',
    type: AccountType.ASSET,
    category: AccountCategory.CASH,
    isActive: true,
    currency: 'NGN',
    description: 'Physical cash held by farmer',
  },
  {
    code: '1010',
    name: 'Bank Account - GTBank',
    type: AccountType.ASSET,
    category: AccountCategory.BANK,
    isActive: true,
    currency: 'NGN',
    description: 'Guaranty Trust Bank account',
  },
  {
    code: '1011',
    name: 'Bank Account - Access Bank',
    type: AccountType.ASSET,
    category: AccountCategory.BANK,
    isActive: true,
    currency: 'NGN',
    description: 'Access Bank account',
  },
  {
    code: '1012',
    name: 'Bank Account - First Bank',
    type: AccountType.ASSET,
    category: AccountCategory.BANK,
    isActive: true,
    currency: 'NGN',
    description: 'First Bank of Nigeria account',
  },
  {
    code: '1020',
    name: 'Mobile Money - Paga',
    type: AccountType.ASSET,
    category: AccountCategory.MOBILE_MONEY,
    isActive: true,
    currency: 'NGN',
    description: 'Paga mobile wallet',
  },
  {
    code: '1021',
    name: 'Mobile Money - OPay',
    type: AccountType.ASSET,
    category: AccountCategory.MOBILE_MONEY,
    isActive: true,
    currency: 'NGN',
    description: 'OPay mobile wallet',
  },
  {
    code: '1022',
    name: 'Mobile Money - PalmPay',
    type: AccountType.ASSET,
    category: AccountCategory.MOBILE_MONEY,
    isActive: true,
    currency: 'NGN',
    description: 'PalmPay mobile wallet',
  },
  
  // Current Assets - Inventory
  {
    code: '1100',
    name: 'Crop Inventory',
    type: AccountType.ASSET,
    category: AccountCategory.INVENTORY,
    isActive: true,
    currency: 'NGN',
    description: 'Harvested crops in storage',
  },
  {
    code: '1110',
    name: 'Seeds Inventory',
    type: AccountType.ASSET,
    category: AccountCategory.INVENTORY,
    isActive: true,
    currency: 'NGN',
    description: 'Seeds for planting',
  },
  {
    code: '1120',
    name: 'Fertilizer Inventory',
    type: AccountType.ASSET,
    category: AccountCategory.INVENTORY,
    isActive: true,
    currency: 'NGN',
    description: 'Fertilizers in stock',
  },
  {
    code: '1130',
    name: 'Pesticides Inventory',
    type: AccountType.ASSET,
    category: AccountCategory.INVENTORY,
    isActive: true,
    currency: 'NGN',
    description: 'Pesticides and herbicides in stock',
  },
  
  // Fixed Assets
  {
    code: '1200',
    name: 'Farm Equipment',
    type: AccountType.ASSET,
    category: AccountCategory.EQUIPMENT,
    isActive: true,
    currency: 'NGN',
    description: 'Tractors, plows, harvesters, etc.',
  },
  {
    code: '1210',
    name: 'Irrigation Equipment',
    type: AccountType.ASSET,
    category: AccountCategory.EQUIPMENT,
    isActive: true,
    currency: 'NGN',
    description: 'Pumps, pipes, sprinklers',
  },
  {
    code: '1220',
    name: 'Storage Facilities',
    type: AccountType.ASSET,
    category: AccountCategory.EQUIPMENT,
    isActive: true,
    currency: 'NGN',
    description: 'Silos, warehouses, cold storage',
  },
  {
    code: '1300',
    name: 'Farmland',
    type: AccountType.ASSET,
    category: AccountCategory.LAND,
    isActive: true,
    currency: 'NGN',
    description: 'Land owned by farmer',
  },
  
  // Receivables
  {
    code: '1400',
    name: 'Accounts Receivable',
    type: AccountType.ASSET,
    category: AccountCategory.RECEIVABLES,
    isActive: true,
    currency: 'NGN',
    description: 'Money owed by buyers',
  },
  
  // ============================================================================
  // LIABILITIES (2000-2999)
  // ============================================================================
  
  {
    code: '2000',
    name: 'Microfinance Loans',
    type: AccountType.LIABILITY,
    category: AccountCategory.LOANS,
    isActive: true,
    currency: 'NGN',
    description: 'Loans from microfinance institutions',
  },
  {
    code: '2010',
    name: 'Bank Loans',
    type: AccountType.LIABILITY,
    category: AccountCategory.LOANS,
    isActive: true,
    currency: 'NGN',
    description: 'Loans from commercial banks',
  },
  {
    code: '2020',
    name: 'Cooperative Loans',
    type: AccountType.LIABILITY,
    category: AccountCategory.LOANS,
    isActive: true,
    currency: 'NGN',
    description: 'Loans from farmer cooperatives',
  },
  {
    code: '2100',
    name: 'Accounts Payable',
    type: AccountType.LIABILITY,
    category: AccountCategory.PAYABLES,
    isActive: true,
    currency: 'NGN',
    description: 'Money owed to suppliers',
  },
  {
    code: '2200',
    name: 'Customer Advances',
    type: AccountType.LIABILITY,
    category: AccountCategory.ADVANCES,
    isActive: true,
    currency: 'NGN',
    description: 'Prepayments received from buyers',
  },
  
  // ============================================================================
  // EQUITY (3000-3999)
  // ============================================================================
  
  {
    code: '3000',
    name: 'Owner Capital',
    type: AccountType.EQUITY,
    category: AccountCategory.CAPITAL,
    isActive: true,
    currency: 'NGN',
    description: 'Initial investment by farmer',
  },
  {
    code: '3100',
    name: 'Retained Earnings',
    type: AccountType.EQUITY,
    category: AccountCategory.RETAINED_EARNINGS,
    isActive: true,
    currency: 'NGN',
    description: 'Accumulated profits',
  },
  
  // ============================================================================
  // REVENUE (4000-4999)
  // ============================================================================
  
  // Crop Sales
  {
    code: '4000',
    name: 'Maize Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from maize sales',
  },
  {
    code: '4010',
    name: 'Rice Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from rice sales',
  },
  {
    code: '4020',
    name: 'Cassava Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from cassava sales',
  },
  {
    code: '4030',
    name: 'Yam Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from yam sales',
  },
  {
    code: '4040',
    name: 'Sorghum Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from sorghum sales',
  },
  {
    code: '4050',
    name: 'Millet Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from millet sales',
  },
  {
    code: '4060',
    name: 'Cowpea Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from cowpea sales',
  },
  {
    code: '4070',
    name: 'Groundnut Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from groundnut sales',
  },
  {
    code: '4080',
    name: 'Other Crop Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.CROP_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from other crops',
  },
  
  // Livestock Sales
  {
    code: '4100',
    name: 'Cattle Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.LIVESTOCK_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from cattle sales',
  },
  {
    code: '4110',
    name: 'Goat Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.LIVESTOCK_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from goat sales',
  },
  {
    code: '4120',
    name: 'Poultry Sales',
    type: AccountType.REVENUE,
    category: AccountCategory.LIVESTOCK_SALES,
    isActive: true,
    currency: 'NGN',
    description: 'Revenue from poultry sales',
  },
  
  // Other Revenue
  {
    code: '4200',
    name: 'Government Subsidies',
    type: AccountType.REVENUE,
    category: AccountCategory.SUBSIDIES,
    isActive: true,
    currency: 'NGN',
    description: 'Subsidies from government programs',
  },
  {
    code: '4210',
    name: 'Equipment Rental Income',
    type: AccountType.REVENUE,
    category: AccountCategory.SERVICES,
    isActive: true,
    currency: 'NGN',
    description: 'Income from renting equipment',
  },
  
  // ============================================================================
  // EXPENSES (5000-5999)
  // ============================================================================
  
  // Direct Farming Expenses
  {
    code: '5000',
    name: 'Seeds Expense',
    type: AccountType.EXPENSE,
    category: AccountCategory.SEEDS,
    isActive: true,
    currency: 'NGN',
    description: 'Cost of seeds purchased',
  },
  {
    code: '5010',
    name: 'Fertilizer Expense',
    type: AccountType.EXPENSE,
    category: AccountCategory.FERTILIZER,
    isActive: true,
    currency: 'NGN',
    description: 'Cost of fertilizers',
  },
  {
    code: '5020',
    name: 'Pesticides Expense',
    type: AccountType.EXPENSE,
    category: AccountCategory.PESTICIDES,
    isActive: true,
    currency: 'NGN',
    description: 'Cost of pesticides and herbicides',
  },
  {
    code: '5100',
    name: 'Labor - Casual',
    type: AccountType.EXPENSE,
    category: AccountCategory.LABOR,
    isActive: true,
    currency: 'NGN',
    description: 'Wages for casual laborers',
  },
  {
    code: '5110',
    name: 'Labor - Permanent',
    type: AccountType.EXPENSE,
    category: AccountCategory.LABOR,
    isActive: true,
    currency: 'NGN',
    description: 'Salaries for permanent workers',
  },
  {
    code: '5200',
    name: 'Equipment Rental',
    type: AccountType.EXPENSE,
    category: AccountCategory.EQUIPMENT_RENTAL,
    isActive: true,
    currency: 'NGN',
    description: 'Cost of renting tractors, harvesters, etc.',
  },
  {
    code: '5210',
    name: 'Equipment Maintenance',
    type: AccountType.EXPENSE,
    category: AccountCategory.EQUIPMENT_RENTAL,
    isActive: true,
    currency: 'NGN',
    description: 'Repairs and maintenance of equipment',
  },
  {
    code: '5220',
    name: 'Fuel',
    type: AccountType.EXPENSE,
    category: AccountCategory.UTILITIES,
    isActive: true,
    currency: 'NGN',
    description: 'Fuel for equipment and vehicles',
  },
  {
    code: '5300',
    name: 'Transport',
    type: AccountType.EXPENSE,
    category: AccountCategory.TRANSPORT,
    isActive: true,
    currency: 'NGN',
    description: 'Transportation of produce and inputs',
  },
  {
    code: '5310',
    name: 'Water',
    type: AccountType.EXPENSE,
    category: AccountCategory.UTILITIES,
    isActive: true,
    currency: 'NGN',
    description: 'Water for irrigation',
  },
  {
    code: '5320',
    name: 'Electricity',
    type: AccountType.EXPENSE,
    category: AccountCategory.UTILITIES,
    isActive: true,
    currency: 'NGN',
    description: 'Electricity costs',
  },
  
  // Financial Expenses
  {
    code: '5400',
    name: 'Loan Interest',
    type: AccountType.EXPENSE,
    category: AccountCategory.INTEREST,
    isActive: true,
    currency: 'NGN',
    description: 'Interest paid on loans',
  },
  {
    code: '5410',
    name: 'Bank Charges',
    type: AccountType.EXPENSE,
    category: AccountCategory.INTEREST,
    isActive: true,
    currency: 'NGN',
    description: 'Bank fees and charges',
  },
  
  // Depreciation
  {
    code: '5500',
    name: 'Depreciation - Equipment',
    type: AccountType.EXPENSE,
    category: AccountCategory.DEPRECIATION,
    isActive: true,
    currency: 'NGN',
    description: 'Depreciation of farm equipment',
  },
  {
    code: '5510',
    name: 'Depreciation - Buildings',
    type: AccountType.EXPENSE,
    category: AccountCategory.DEPRECIATION,
    isActive: true,
    currency: 'NGN',
    description: 'Depreciation of storage facilities',
  },
];

/**
 * Get account by code
 */
export function getAccountByCode(code: string): ChartOfAccount | undefined {
  return FARMER_COA.find(account => account.code === code);
}

/**
 * Get accounts by type
 */
export function getAccountsByType(type: AccountType): ChartOfAccount[] {
  return FARMER_COA.filter(account => account.type === type && account.isActive);
}

/**
 * Get accounts by category
 */
export function getAccountsByCategory(category: AccountCategory): ChartOfAccount[] {
  return FARMER_COA.filter(account => account.category === category && account.isActive);
}

/**
 * Get revenue account for crop
 */
export function getCropRevenueAccount(cropName: string): string {
  const mapping: Record<string, string> = {
    'Maize': '4000',
    'Rice': '4010',
    'Cassava': '4020',
    'Yam': '4030',
    'Sorghum': '4040',
    'Millet': '4050',
    'Cowpea': '4060',
    'Groundnut': '4070',
  };
  return mapping[cropName] || '4080'; // Default to "Other Crop Sales"
}

/**
 * Get expense account for category
 */
export function getExpenseAccount(category: string): string {
  const mapping: Record<string, string> = {
    'seeds': '5000',
    'fertilizers': '5010',
    'pesticides': '5020',
    'labor': '5100',
    'equipment': '5200',
    'transport': '5300',
    'fuel': '5220',
    'water': '5310',
    'electricity': '5320',
    'maintenance': '5210',
  };
  return mapping[category.toLowerCase()] || '5000';
}

/**
 * Validate account code format (4 digits)
 */
export function isValidAccountCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

/**
 * Get account type from code
 */
export function getAccountTypeFromCode(code: string): AccountType | null {
  const firstDigit = parseInt(code[0]);
  switch (firstDigit) {
    case 1: return AccountType.ASSET;
    case 2: return AccountType.LIABILITY;
    case 3: return AccountType.EQUITY;
    case 4: return AccountType.REVENUE;
    case 5: return AccountType.EXPENSE;
    default: return null;
  }
}
