/**
 * Lakehouse Data Models
 * 
 * Defines schemas for Bronze, Silver, and Gold layer tables
 * Following the medallion architecture pattern
 */

// ============================================================================
// Bronze Layer Schemas (Raw Event Data)
// ============================================================================

export interface BronzeFarmerEvent {
  event_id: string;
  event_type: 'CREATED' | 'UPDATED' | 'DELETED';
  entity_type: string;
  entity_id: string;
  user_id: number;
  event_timestamp: string;
  farmer_id: number;
  farmer_name: string | null;
  phone_number: string | null;
  cooperative_id: number | null;
  location: string | null;
  raw_data: string; // JSON string
  ingest_date: string;
  _kafka_offset: string;
  _ingest_time: string;
}

export interface BronzeHarvestEvent {
  event_id: string;
  event_type: 'CREATED' | 'UPDATED' | 'DELETED';
  entity_id: string;
  user_id: number;
  event_timestamp: string;
  harvest_id: number;
  crop_id: number | null;
  farm_id: number | null;
  quantity: number | null;
  unit: string | null;
  quality_grade: string | null;
  harvest_date: string | null;
  price_per_unit: number | null;
  total_value: number | null;
  raw_data: string;
  ingest_date: string;
  _kafka_offset: string;
  _ingest_time: string;
}

export interface BronzeLoanEvent {
  event_id: string;
  event_type: 'CREATED' | 'UPDATED' | 'DELETED' | 'DISBURSED' | 'REPAID' | 'DEFAULTED';
  entity_id: string;
  user_id: number;
  event_timestamp: string;
  loan_id: number;
  farmer_id: number;
  loan_amount: number;
  interest_rate: number;
  term_months: number;
  status: string;
  disbursement_date: string | null;
  due_date: string | null;
  raw_data: string;
  ingest_date: string;
  _kafka_offset: string;
  _ingest_time: string;
}

export interface BronzeRepaymentEvent {
  event_id: string;
  event_type: 'CREATED' | 'UPDATED';
  entity_id: string;
  user_id: number;
  event_timestamp: string;
  repayment_id: number;
  loan_id: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  raw_data: string;
  ingest_date: string;
  _kafka_offset: string;
  _ingest_time: string;
}

// ============================================================================
// Silver Layer Schemas (Cleaned & Normalized)
// ============================================================================

// Fact Tables

export interface FactFarmer {
  farmer_id: number;
  user_id: number;
  farmer_name: string;
  phone_number: string;
  email: string | null;
  gender: 'male' | 'female' | 'other' | null;
  date_of_birth: string | null;
  national_id: string | null;
  cooperative_id: number | null;
  location_id: number | null;
  registration_date: string;
  kyc_tier: 'unverified' | 'basic' | 'standard' | 'enhanced' | 'premium';
  kyc_status: 'pending' | 'approved' | 'rejected' | 'expired';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  partition_date: string;
}

export interface FactFarm {
  farm_id: number;
  farmer_id: number;
  farm_name: string;
  size_hectares: number;
  location_lat: number | null;
  location_lng: number | null;
  location_id: number | null;
  soil_type: string | null;
  irrigation_type: string | null;
  ownership_type: 'owned' | 'leased' | 'communal' | null;
  registration_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  partition_date: string;
}

export interface FactHarvest {
  harvest_id: number;
  crop_id: number;
  farm_id: number;
  farmer_id: number;
  crop_type: string;
  variety: string | null;
  quantity: number;
  unit: string;
  quality_grade: string | null;
  harvest_date: string;
  price_per_unit: number | null;
  total_value: number | null;
  currency: string;
  storage_location: string | null;
  sold_quantity: number;
  created_at: string;
  harvest_year: number;
  harvest_month: number;
}

export interface FactExpense {
  expense_id: number;
  farm_id: number;
  farmer_id: number;
  category: string;
  subcategory: string | null;
  amount: number;
  currency: string;
  description: string | null;
  expense_date: string;
  payment_method: string | null;
  vendor: string | null;
  receipt_url: string | null;
  created_at: string;
  expense_year: number;
  expense_month: number;
}

export interface FactLoan {
  loan_id: number;
  farmer_id: number;
  cooperative_id: number | null;
  loan_product_id: number | null;
  loan_amount: number;
  disbursed_amount: number;
  interest_rate: number;
  term_months: number;
  repayment_frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  status: 'pending' | 'approved' | 'disbursed' | 'active' | 'completed' | 'defaulted' | 'written_off';
  application_date: string;
  approval_date: string | null;
  disbursement_date: string | null;
  due_date: string | null;
  completion_date: string | null;
  total_repaid: number;
  outstanding_balance: number;
  days_past_due: number;
  credit_score_at_application: number | null;
  risk_category: string | null;
  currency: string;
  created_at: string;
  loan_year: number;
  loan_month: number;
}

export interface FactRepayment {
  repayment_id: number;
  loan_id: number;
  farmer_id: number;
  scheduled_amount: number;
  paid_amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  scheduled_date: string;
  payment_date: string | null;
  days_late: number;
  payment_method: string | null;
  transaction_reference: string | null;
  status: 'scheduled' | 'paid' | 'partial' | 'missed' | 'waived';
  currency: string;
  created_at: string;
  repayment_year: number;
  repayment_month: number;
}

export interface FactMarketplaceOrder {
  order_id: number;
  buyer_id: number;
  seller_id: number;
  listing_id: number;
  product_type: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  commission_amount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'disputed';
  order_date: string;
  delivery_date: string | null;
  payment_method: string | null;
  payment_status: string;
  currency: string;
  created_at: string;
  order_year: number;
  order_month: number;
}

export interface FactKycVerification {
  verification_id: number;
  farmer_id: number;
  user_id: number;
  verification_type: 'phone' | 'email' | 'document' | 'biometric' | 'address' | 'sanctions' | 'pep';
  status: 'pending' | 'verified' | 'failed' | 'expired';
  verification_date: string;
  expiry_date: string | null;
  verified_by: string | null;
  document_type: string | null;
  risk_score: number | null;
  notes: string | null;
  created_at: string;
  partition_date: string;
}

// Dimension Tables

export interface DimFarmer {
  farmer_key: number; // Surrogate key
  farmer_id: number; // Natural key
  farmer_name: string;
  phone_number: string;
  email: string | null;
  gender: string | null;
  age_group: '18-25' | '26-35' | '36-45' | '46-55' | '56-65' | '65+' | null;
  cooperative_name: string | null;
  region: string | null;
  district: string | null;
  kyc_tier: string;
  farmer_segment: 'smallholder' | 'medium' | 'commercial' | null;
  years_farming: number | null;
  effective_date: string;
  expiry_date: string | null;
  is_current: boolean;
}

export interface DimFarm {
  farm_key: number;
  farm_id: number;
  farm_name: string;
  farmer_id: number;
  size_category: 'micro' | 'small' | 'medium' | 'large';
  soil_type: string | null;
  irrigation_type: string | null;
  region: string | null;
  district: string | null;
  effective_date: string;
  expiry_date: string | null;
  is_current: boolean;
}

export interface DimCooperative {
  cooperative_key: number;
  cooperative_id: number;
  cooperative_name: string;
  registration_number: string | null;
  region: string | null;
  district: string | null;
  member_count: number;
  established_date: string | null;
  cooperative_type: string | null;
  effective_date: string;
  expiry_date: string | null;
  is_current: boolean;
}

export interface DimProduct {
  product_key: number;
  product_id: number;
  product_name: string;
  product_category: string;
  unit_of_measure: string;
  is_perishable: boolean;
  shelf_life_days: number | null;
  effective_date: string;
  expiry_date: string | null;
  is_current: boolean;
}

export interface DimLocation {
  location_key: number;
  location_id: number;
  country: string;
  region: string;
  district: string;
  ward: string | null;
  village: string | null;
  latitude: number | null;
  longitude: number | null;
  climate_zone: string | null;
  agroecological_zone: string | null;
}

export interface DimTime {
  date_key: number; // YYYYMMDD format
  full_date: string;
  day_of_week: number;
  day_name: string;
  day_of_month: number;
  day_of_year: number;
  week_of_year: number;
  month_number: number;
  month_name: string;
  quarter: number;
  year: number;
  is_weekend: boolean;
  is_holiday: boolean;
  fiscal_year: number;
  fiscal_quarter: number;
  season: 'dry' | 'wet' | 'transition';
}

// ============================================================================
// Gold Layer Schemas (Aggregated Analytics)
// ============================================================================

export interface GoldFarmerPerformance {
  farmer_id: number;
  farmer_name: string;
  cooperative_id: number | null;
  report_date: string;
  
  // Farm metrics
  total_farms: number;
  total_farm_area_hectares: number;
  active_crops: number;
  
  // Harvest metrics
  total_harvests_ytd: number;
  total_harvest_value_ytd: number;
  avg_yield_per_hectare: number;
  top_crop_by_value: string | null;
  
  // Financial metrics
  total_revenue_ytd: number;
  total_expenses_ytd: number;
  net_profit_ytd: number;
  profit_margin_pct: number;
  
  // Loan metrics
  total_loans: number;
  active_loans: number;
  total_borrowed: number;
  total_repaid: number;
  outstanding_balance: number;
  on_time_payment_rate: number;
  
  // Engagement metrics
  app_sessions_30d: number;
  last_activity_date: string | null;
  
  // Risk metrics
  credit_score: number | null;
  risk_category: string | null;
  kyc_tier: string;
}

export interface GoldPortfolioRisk {
  report_date: string;
  cooperative_id: number | null;
  
  // Portfolio summary
  total_loans: number;
  total_disbursed: number;
  total_outstanding: number;
  total_repaid: number;
  
  // PAR (Portfolio at Risk) metrics
  par_1_amount: number;  // 1-30 days past due
  par_1_rate: number;
  par_30_amount: number; // 31-60 days past due
  par_30_rate: number;
  par_60_amount: number; // 61-90 days past due
  par_60_rate: number;
  par_90_amount: number; // 90+ days past due
  par_90_rate: number;
  
  // Default metrics
  default_count: number;
  default_amount: number;
  default_rate: number;
  
  // Recovery metrics
  recovered_amount: number;
  recovery_rate: number;
  
  // Risk distribution
  low_risk_count: number;
  medium_risk_count: number;
  high_risk_count: number;
  
  // Concentration risk
  top_10_borrowers_exposure: number;
  single_borrower_limit_breaches: number;
}

export interface GoldChannelEngagement {
  report_date: string;
  channel: 'ussd' | 'sms' | 'whatsapp' | 'voice' | 'pwa' | 'mobile';
  
  // Volume metrics
  total_sessions: number;
  unique_users: number;
  total_messages: number;
  
  // Engagement metrics
  avg_session_duration_seconds: number;
  avg_messages_per_session: number;
  bounce_rate: number;
  
  // Success metrics
  success_rate: number;
  error_rate: number;
  completion_rate: number;
  
  // Cost metrics
  total_cost: number;
  cost_per_session: number;
  cost_per_user: number;
  
  // Feature usage
  top_feature: string;
  feature_usage_breakdown: string; // JSON
}

export interface GoldCropYieldAnalysis {
  report_date: string;
  crop_type: string;
  region: string | null;
  season: string;
  
  // Yield metrics
  total_area_planted_hectares: number;
  total_harvested_quantity: number;
  avg_yield_per_hectare: number;
  min_yield_per_hectare: number;
  max_yield_per_hectare: number;
  yield_std_dev: number;
  
  // Quality metrics
  grade_a_percentage: number;
  grade_b_percentage: number;
  grade_c_percentage: number;
  
  // Price metrics
  avg_price_per_unit: number;
  min_price_per_unit: number;
  max_price_per_unit: number;
  total_value: number;
  
  // Comparison
  yield_vs_national_avg: number;
  yield_vs_previous_season: number;
  
  // Farmer count
  farmer_count: number;
  farm_count: number;
}

export interface GoldLoanPortfolio {
  report_date: string;
  loan_product_id: number | null;
  cooperative_id: number | null;
  
  // Volume metrics
  applications_count: number;
  approvals_count: number;
  disbursements_count: number;
  approval_rate: number;
  
  // Amount metrics
  total_applied: number;
  total_approved: number;
  total_disbursed: number;
  avg_loan_size: number;
  
  // Performance metrics
  collection_rate: number;
  on_time_repayment_rate: number;
  early_repayment_rate: number;
  
  // Turnaround metrics
  avg_approval_days: number;
  avg_disbursement_days: number;
  
  // Interest metrics
  avg_interest_rate: number;
  total_interest_earned: number;
  
  // Term distribution
  short_term_count: number;  // < 6 months
  medium_term_count: number; // 6-12 months
  long_term_count: number;   // > 12 months
}

export interface GoldMarketplaceAnalytics {
  report_date: string;
  product_category: string | null;
  region: string | null;
  
  // Volume metrics
  total_listings: number;
  active_listings: number;
  total_orders: number;
  completed_orders: number;
  
  // Value metrics
  total_gmv: number; // Gross Merchandise Value
  avg_order_value: number;
  total_commission: number;
  
  // Seller metrics
  active_sellers: number;
  avg_listings_per_seller: number;
  top_seller_gmv: number;
  
  // Buyer metrics
  active_buyers: number;
  repeat_buyer_rate: number;
  avg_orders_per_buyer: number;
  
  // Performance metrics
  order_completion_rate: number;
  cancellation_rate: number;
  dispute_rate: number;
  avg_delivery_days: number;
  
  // Price metrics
  avg_price_per_kg: number;
  price_vs_market_avg: number;
}

export interface GoldCooperativePerformance {
  report_date: string;
  cooperative_id: number;
  cooperative_name: string;
  
  // Membership metrics
  total_members: number;
  active_members: number;
  new_members_30d: number;
  churn_rate: number;
  
  // Financial metrics
  total_savings: number;
  total_loans_disbursed: number;
  total_loans_outstanding: number;
  loan_repayment_rate: number;
  
  // Agricultural metrics
  total_farm_area: number;
  total_harvest_value: number;
  avg_yield_per_member: number;
  
  // Marketplace metrics
  total_gmv: number;
  active_sellers: number;
  
  // Engagement metrics
  avg_app_sessions_per_member: number;
  feature_adoption_rate: number;
  
  // Risk metrics
  portfolio_at_risk: number;
  default_rate: number;
  avg_credit_score: number;
}

// ============================================================================
// Schema Definitions for Table Creation
// ============================================================================

export const BRONZE_SCHEMAS = {
  farmer_events: [
    { name: 'event_id', type: 'STRING', nullable: false },
    { name: 'event_type', type: 'STRING', nullable: false },
    { name: 'entity_type', type: 'STRING', nullable: false },
    { name: 'entity_id', type: 'STRING', nullable: false },
    { name: 'user_id', type: 'BIGINT', nullable: false },
    { name: 'event_timestamp', type: 'TIMESTAMP', nullable: false },
    { name: 'farmer_id', type: 'BIGINT', nullable: true },
    { name: 'farmer_name', type: 'STRING', nullable: true },
    { name: 'phone_number', type: 'STRING', nullable: true },
    { name: 'cooperative_id', type: 'BIGINT', nullable: true },
    { name: 'location', type: 'STRING', nullable: true },
    { name: 'raw_data', type: 'STRING', nullable: false },
    { name: 'ingest_date', type: 'DATE', nullable: false },
    { name: '_kafka_offset', type: 'STRING', nullable: false },
    { name: '_ingest_time', type: 'TIMESTAMP', nullable: false },
  ],
  harvest_events: [
    { name: 'event_id', type: 'STRING', nullable: false },
    { name: 'event_type', type: 'STRING', nullable: false },
    { name: 'entity_id', type: 'STRING', nullable: false },
    { name: 'user_id', type: 'BIGINT', nullable: false },
    { name: 'event_timestamp', type: 'TIMESTAMP', nullable: false },
    { name: 'harvest_id', type: 'BIGINT', nullable: true },
    { name: 'crop_id', type: 'BIGINT', nullable: true },
    { name: 'farm_id', type: 'BIGINT', nullable: true },
    { name: 'quantity', type: 'DOUBLE', nullable: true },
    { name: 'unit', type: 'STRING', nullable: true },
    { name: 'quality_grade', type: 'STRING', nullable: true },
    { name: 'harvest_date', type: 'DATE', nullable: true },
    { name: 'price_per_unit', type: 'DOUBLE', nullable: true },
    { name: 'total_value', type: 'DOUBLE', nullable: true },
    { name: 'raw_data', type: 'STRING', nullable: false },
    { name: 'ingest_date', type: 'DATE', nullable: false },
    { name: '_kafka_offset', type: 'STRING', nullable: false },
    { name: '_ingest_time', type: 'TIMESTAMP', nullable: false },
  ],
};

export const SILVER_SCHEMAS = {
  fact_loan: [
    { name: 'loan_id', type: 'BIGINT', nullable: false },
    { name: 'farmer_id', type: 'BIGINT', nullable: false },
    { name: 'cooperative_id', type: 'BIGINT', nullable: true },
    { name: 'loan_product_id', type: 'BIGINT', nullable: true },
    { name: 'loan_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'disbursed_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'interest_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'term_months', type: 'INT', nullable: false },
    { name: 'repayment_frequency', type: 'STRING', nullable: false },
    { name: 'status', type: 'STRING', nullable: false },
    { name: 'application_date', type: 'DATE', nullable: false },
    { name: 'approval_date', type: 'DATE', nullable: true },
    { name: 'disbursement_date', type: 'DATE', nullable: true },
    { name: 'due_date', type: 'DATE', nullable: true },
    { name: 'completion_date', type: 'DATE', nullable: true },
    { name: 'total_repaid', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'outstanding_balance', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'days_past_due', type: 'INT', nullable: false },
    { name: 'credit_score_at_application', type: 'INT', nullable: true },
    { name: 'risk_category', type: 'STRING', nullable: true },
    { name: 'currency', type: 'STRING', nullable: false },
    { name: 'created_at', type: 'TIMESTAMP', nullable: false },
    { name: 'loan_year', type: 'INT', nullable: false },
    { name: 'loan_month', type: 'INT', nullable: false },
  ],
  fact_harvest: [
    { name: 'harvest_id', type: 'BIGINT', nullable: false },
    { name: 'crop_id', type: 'BIGINT', nullable: false },
    { name: 'farm_id', type: 'BIGINT', nullable: false },
    { name: 'farmer_id', type: 'BIGINT', nullable: false },
    { name: 'crop_type', type: 'STRING', nullable: false },
    { name: 'variety', type: 'STRING', nullable: true },
    { name: 'quantity', type: 'DOUBLE', nullable: false },
    { name: 'unit', type: 'STRING', nullable: false },
    { name: 'quality_grade', type: 'STRING', nullable: true },
    { name: 'harvest_date', type: 'DATE', nullable: false },
    { name: 'price_per_unit', type: 'DECIMAL(18,2)', nullable: true },
    { name: 'total_value', type: 'DECIMAL(18,2)', nullable: true },
    { name: 'currency', type: 'STRING', nullable: false },
    { name: 'storage_location', type: 'STRING', nullable: true },
    { name: 'sold_quantity', type: 'DOUBLE', nullable: false },
    { name: 'created_at', type: 'TIMESTAMP', nullable: false },
    { name: 'harvest_year', type: 'INT', nullable: false },
    { name: 'harvest_month', type: 'INT', nullable: false },
  ],
};

export const GOLD_SCHEMAS = {
  fact_portfolio_risk: [
    { name: 'report_date', type: 'DATE', nullable: false },
    { name: 'cooperative_id', type: 'BIGINT', nullable: true },
    { name: 'total_loans', type: 'INT', nullable: false },
    { name: 'total_disbursed', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'total_outstanding', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'total_repaid', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'par_1_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'par_1_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'par_30_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'par_30_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'par_60_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'par_60_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'par_90_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'par_90_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'default_count', type: 'INT', nullable: false },
    { name: 'default_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'default_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'recovered_amount', type: 'DECIMAL(18,2)', nullable: false },
    { name: 'recovery_rate', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'low_risk_count', type: 'INT', nullable: false },
    { name: 'medium_risk_count', type: 'INT', nullable: false },
    { name: 'high_risk_count', type: 'INT', nullable: false },
    { name: 'top_10_borrowers_exposure', type: 'DECIMAL(5,2)', nullable: false },
    { name: 'single_borrower_limit_breaches', type: 'INT', nullable: false },
  ],
};

export default {
  BRONZE_SCHEMAS,
  SILVER_SCHEMAS,
  GOLD_SCHEMAS,
};
