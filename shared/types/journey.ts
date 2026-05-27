/**
 * Shared Journey Types for PWA and Mobile
 * These types define the canonical journey model used across all platforms
 */

export type JourneyStatus = 'not_started' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export type JourneyChannel = 'USSD' | 'SMS' | 'WhatsApp' | 'PWA' | 'Mobile' | 'Voice';

export type JourneyCategory = 
  | 'onboarding'
  | 'farming'
  | 'financial'
  | 'marketplace'
  | 'analytics'
  | 'compliance'
  | 'sustainability';

export interface JourneyStep {
  id: string;
  title: string;
  description?: string;
  status: JourneyStatus;
  startedAt?: string;
  completedAt?: string;
  actionLabel?: string;
  actionRoute?: string;
}

export interface JourneySummary {
  id: string;
  title: string;
  description: string;
  category: JourneyCategory;
  channels: JourneyChannel[];
  status: JourneyStatus;
  progress: number;
  lastUpdate: string;
  steps: JourneyStep[];
  icon?: string;
  color?: string;
  uiPages?: string[];
  backendServices?: string[];
}

/**
 * The canonical 20 user journeys from the Temporal orchestrator
 * Mapped to UI-friendly format for PWA and Mobile
 */
export const JOURNEY_CATALOG: JourneySummary[] = [
  {
    id: 'farmer_onboarding',
    title: 'Farmer Onboarding with KYC',
    description: 'Complete farmer registration with identity verification and ERPNext sync',
    category: 'onboarding',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'user-plus',
    color: '#3B82F6',
    uiPages: ['FarmerOnboardingWizard', 'QuickFarmerRegistration'],
    backendServices: ['kyc-router', 'erpnext-router', 'keycloak-service'],
    steps: [
      { id: 'create_account', title: 'Create Account', description: 'Register with phone number', status: 'not_started' },
      { id: 'verify_otp', title: 'Verify OTP', description: 'Confirm phone ownership', status: 'not_started' },
      { id: 'basic_info', title: 'Basic Information', description: 'Enter name and details', status: 'not_started' },
      { id: 'kyc_documents', title: 'KYC Documents', description: 'Upload ID and photos', status: 'not_started' },
      { id: 'credit_score', title: 'Credit Score', description: 'Initial credit assessment', status: 'not_started' },
      { id: 'erpnext_sync', title: 'System Sync', description: 'Sync to ERPNext', status: 'not_started' },
    ],
  },
  {
    id: 'farm_geotagging',
    title: 'Farm Geotagging & Boundary Mapping',
    description: 'Map farm boundaries with GPS coordinates and calculate area',
    category: 'farming',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'map-pin',
    color: '#10B981',
    uiPages: ['FarmGeotagging', 'GPSTracking', 'FarmersMapView'],
    backendServices: ['gps-tracking-router', 'spatial-router'],
    steps: [
      { id: 'gps_accuracy', title: 'GPS Accuracy Check', description: 'Ensure GPS signal quality', status: 'not_started' },
      { id: 'center_point', title: 'Mark Center Point', description: 'Save farm center location', status: 'not_started' },
      { id: 'boundary_walk', title: 'Walk Boundary', description: 'Record farm perimeter', status: 'not_started' },
      { id: 'area_calculation', title: 'Calculate Area', description: 'Compute farm size', status: 'not_started' },
      { id: 'postgis_save', title: 'Save to Database', description: 'Store spatial data', status: 'not_started' },
    ],
  },
  {
    id: 'loan_application',
    title: 'Loan Application with Credit Scoring',
    description: 'Apply for farm loans with ML-powered credit assessment',
    category: 'financial',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'dollar-sign',
    color: '#F59E0B',
    uiPages: ['LoanApplicationForm', 'BorrowerDashboard', 'CreditScoreView'],
    backendServices: ['microfinance-router', 'credit-scoring-router'],
    steps: [
      { id: 'kyc_check', title: 'KYC Verification', description: 'Verify identity status', status: 'not_started' },
      { id: 'credit_score', title: 'Credit Score', description: 'ML credit assessment', status: 'not_started' },
      { id: 'risk_assessment', title: 'Risk Assessment', description: 'Evaluate loan risk', status: 'not_started' },
      { id: 'loan_terms', title: 'Loan Terms', description: 'Calculate interest rate', status: 'not_started' },
      { id: 'approval', title: 'Approval', description: 'Final loan decision', status: 'not_started' },
    ],
  },
  {
    id: 'marketplace_listing',
    title: 'Marketplace Listing',
    description: 'List products on marketplace with quality grading',
    category: 'marketplace',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'shopping-bag',
    color: '#8B5CF6',
    uiPages: ['MarketplaceBrowse', 'MarketplaceListing', 'MyListings'],
    backendServices: ['exchange-router'],
    steps: [
      { id: 'product_info', title: 'Product Details', description: 'Enter product information', status: 'not_started' },
      { id: 'quality_grade', title: 'Quality Grading', description: 'AI quality assessment', status: 'not_started' },
      { id: 'traceability', title: 'Traceability', description: 'Create trace record', status: 'not_started' },
      { id: 'listing_live', title: 'Go Live', description: 'Publish listing', status: 'not_started' },
    ],
  },
  {
    id: 'order_processing',
    title: 'Order Processing with Payment',
    description: 'Process marketplace orders with TigerBeetle escrow',
    category: 'marketplace',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'credit-card',
    color: '#EC4899',
    uiPages: ['Checkout', 'MyOrders', 'MySales'],
    backendServices: ['exchange-router', 'tigerbeetle-ledger'],
    steps: [
      { id: 'verify_listing', title: 'Verify Availability', description: 'Check stock', status: 'not_started' },
      { id: 'create_order', title: 'Create Order', description: 'Place order', status: 'not_started' },
      { id: 'escrow', title: 'Escrow Payment', description: 'Hold funds securely', status: 'not_started' },
      { id: 'delivery', title: 'Delivery', description: 'Ship products', status: 'not_started' },
      { id: 'release_funds', title: 'Release Funds', description: 'Complete payment', status: 'not_started' },
    ],
  },
  {
    id: 'yield_prediction',
    title: 'Yield Prediction with AI/ML',
    description: 'Get AI-powered yield forecasts based on weather and soil data',
    category: 'analytics',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'trending-up',
    color: '#06B6D4',
    uiPages: ['YieldPrediction', 'AgriculturalModels', 'PrecisionAgDashboard'],
    backendServices: ['ml-models-router', 'agricultural-intelligence-router'],
    steps: [
      { id: 'weather_data', title: 'Weather Data', description: 'Fetch weather forecast', status: 'not_started' },
      { id: 'soil_data', title: 'Soil Analysis', description: 'Get soil conditions', status: 'not_started' },
      { id: 'ml_prediction', title: 'ML Prediction', description: 'Run yield model', status: 'not_started' },
      { id: 'harvest_date', title: 'Optimal Harvest', description: 'Calculate best date', status: 'not_started' },
      { id: 'recommendations', title: 'Recommendations', description: 'Generate advice', status: 'not_started' },
    ],
  },
  {
    id: 'land_suitability',
    title: 'Land Suitability Assessment',
    description: 'Analyze land for crop suitability using spatial analytics',
    category: 'farming',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'layers',
    color: '#84CC16',
    uiPages: ['LandSuitabilityAssessment', 'SpatialAnalytics'],
    backendServices: ['land-suitability-router', 'spatial-router'],
    steps: [
      { id: 'soil_analysis', title: 'Soil Analysis', description: 'Analyze soil characteristics', status: 'not_started' },
      { id: 'climate_analysis', title: 'Climate Analysis', description: 'Evaluate climate data', status: 'not_started' },
      { id: 'suitability_score', title: 'Suitability Score', description: 'Calculate score', status: 'not_started' },
      { id: 'crop_recommendations', title: 'Crop Recommendations', description: 'Suggest best crops', status: 'not_started' },
    ],
  },
  {
    id: 'cooperative_management',
    title: 'Cooperative Management & Revenue',
    description: 'Manage cooperative members and distribute revenue',
    category: 'financial',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'users',
    color: '#6366F1',
    uiPages: ['CooperativeDashboard', 'PortfolioAtRiskDashboard'],
    backendServices: ['cooperative-router', 'tigerbeetle-ledger'],
    steps: [
      { id: 'member_payments', title: 'Process Payments', description: '70% member distribution', status: 'not_started' },
      { id: 'cooperative_fund', title: 'Cooperative Fund', description: '20% reserve', status: 'not_started' },
      { id: 'notifications', title: 'Notifications', description: 'Notify members', status: 'not_started' },
    ],
  },
  {
    id: 'loan_disbursement',
    title: 'Loan Disbursement & Repayment',
    description: 'Disburse approved loans and track repayments',
    category: 'financial',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'banknote',
    color: '#F97316',
    uiPages: ['AdminDisbursements', 'RepaymentTracking', 'MyLoans'],
    backendServices: ['disbursement-router', 'microfinance-router'],
    steps: [
      { id: 'create_loan', title: 'Create Loan Record', description: 'Initialize loan', status: 'not_started' },
      { id: 'ledger_entry', title: 'Ledger Entry', description: 'TigerBeetle record', status: 'not_started' },
      { id: 'bank_transfer', title: 'Bank Transfer', description: 'Process disbursement', status: 'not_started' },
      { id: 'repayment_schedule', title: 'Repayment Schedule', description: 'Generate schedule', status: 'not_started' },
      { id: 'erpnext_sync', title: 'ERPNext Sync', description: 'Sync to ERP', status: 'not_started' },
    ],
  },
  {
    id: 'crop_insurance',
    title: 'Weather-Indexed Crop Insurance',
    description: 'Purchase crop insurance with weather-based triggers',
    category: 'financial',
    channels: ['USSD', 'SMS', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'shield',
    color: '#EF4444',
    uiPages: ['RiskComplianceDashboard'],
    backendServices: ['crop-insurance-service', 'weather-router'],
    steps: [
      { id: 'risk_assessment', title: 'Risk Assessment', description: 'Assess farm risk', status: 'not_started' },
      { id: 'create_policy', title: 'Create Policy', description: 'Generate insurance policy', status: 'not_started' },
      { id: 'premium_payment', title: 'Premium Payment', description: 'Process via TigerBeetle', status: 'not_started' },
      { id: 'weather_monitoring', title: 'Weather Monitoring', description: 'Set up alerts', status: 'not_started' },
    ],
  },
  {
    id: 'input_financing',
    title: 'Input Financing for Farmers',
    description: 'Finance farm inputs like seeds and fertilizers',
    category: 'financial',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'package',
    color: '#14B8A6',
    uiPages: ['FarmerFinancialProfile', 'InputYieldAnalytics'],
    backendServices: ['input-financing-service', 'microfinance-router'],
    steps: [
      { id: 'eligibility', title: 'Check Eligibility', description: 'Verify farmer status', status: 'not_started' },
      { id: 'create_financing', title: 'Create Financing', description: 'Set up financing record', status: 'not_started' },
      { id: 'input_orders', title: 'Input Orders', description: 'Create input orders', status: 'not_started' },
      { id: 'ledger_entry', title: 'Ledger Entry', description: 'TigerBeetle record', status: 'not_started' },
    ],
  },
  {
    id: 'harvest_recording',
    title: 'Harvest Recording & Quality Grading',
    description: 'Record harvests with AI-powered quality assessment',
    category: 'farming',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'wheat',
    color: '#A3E635',
    uiPages: ['Harvests', 'AIDiagnostics'],
    backendServices: ['harvest-activities', 'ml-models-router'],
    steps: [
      { id: 'record_harvest', title: 'Record Harvest', description: 'Enter harvest details', status: 'not_started' },
      { id: 'quality_grade', title: 'Quality Grading', description: 'AI quality assessment', status: 'not_started' },
      { id: 'market_price', title: 'Market Price', description: 'Get current prices', status: 'not_started' },
      { id: 'storage_recommendation', title: 'Storage Advice', description: 'Storage recommendations', status: 'not_started' },
    ],
  },
  {
    id: 'agent_tasks',
    title: 'Agent Task Assignment',
    description: 'Assign and verify field agent tasks',
    category: 'compliance',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'clipboard-list',
    color: '#64748B',
    uiPages: ['AgentTasksDashboard', 'FieldAgentDashboard'],
    backendServices: ['agent-productivity-router'],
    steps: [
      { id: 'create_task', title: 'Create Task', description: 'Define task details', status: 'not_started' },
      { id: 'assign_agent', title: 'Assign Agent', description: 'Select field agent', status: 'not_started' },
      { id: 'notification', title: 'Send Notification', description: 'Notify agent', status: 'not_started' },
      { id: 'verification', title: 'Verification', description: 'Verify completion', status: 'not_started' },
    ],
  },
  {
    id: 'kyc_verification',
    title: 'KYC Verification Process',
    description: 'Complete identity verification with document processing',
    category: 'compliance',
    channels: ['WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'id-card',
    color: '#0EA5E9',
    uiPages: ['KycVerification', 'KycAdminDashboard'],
    backendServices: ['kyc-router', 'kyc-service'],
    steps: [
      { id: 'document_upload', title: 'Upload Documents', description: 'Submit ID documents', status: 'not_started' },
      { id: 'identity_verify', title: 'Identity Verification', description: 'Verify identity', status: 'not_started' },
      { id: 'kyc_score', title: 'KYC Score', description: 'Calculate tier', status: 'not_started' },
      { id: 'permify_sync', title: 'Authorization Sync', description: 'Update permissions', status: 'not_started' },
    ],
  },
  {
    id: 'carbon_credits',
    title: 'Carbon Credit Registration',
    description: 'Register farms for carbon credit programs',
    category: 'sustainability',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'leaf',
    color: '#22C55E',
    uiPages: ['SustainabilityDashboard'],
    backendServices: ['carbon-credit-service'],
    steps: [
      { id: 'register_project', title: 'Register Project', description: 'Create carbon project', status: 'not_started' },
      { id: 'estimate_credits', title: 'Estimate Credits', description: 'Calculate potential', status: 'not_started' },
      { id: 'market_price', title: 'Market Price', description: 'Get credit prices', status: 'not_started' },
      { id: 'verification_request', title: 'Request Verification', description: 'Submit for verification', status: 'not_started' },
    ],
  },
  {
    id: 'traceability',
    title: 'Traceability Chain Creation',
    description: 'Create product traceability with QR codes',
    category: 'compliance',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'qr-code',
    color: '#7C3AED',
    uiPages: ['TraceabilityDashboard'],
    backendServices: ['traceability-router'],
    steps: [
      { id: 'create_record', title: 'Create Record', description: 'Initialize traceability', status: 'not_started' },
      { id: 'link_harvest', title: 'Link Harvest', description: 'Connect to harvest', status: 'not_started' },
      { id: 'generate_qr', title: 'Generate QR Code', description: 'Create QR code', status: 'not_started' },
      { id: 'blockchain_record', title: 'Blockchain Record', description: 'Store on chain', status: 'not_started' },
    ],
  },
  {
    id: 'weather_alerts',
    title: 'Weather Alert & Advisory',
    description: 'Receive weather alerts and farming advisories',
    category: 'farming',
    channels: ['USSD', 'SMS', 'Voice', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'cloud-rain',
    color: '#0284C7',
    uiPages: ['WeatherDashboard', 'NotificationCenter'],
    backendServices: ['weather-router', 'voice-advisory-service'],
    steps: [
      { id: 'create_alert', title: 'Create Alert', description: 'Generate weather alert', status: 'not_started' },
      { id: 'affected_crops', title: 'Affected Crops', description: 'Identify at-risk crops', status: 'not_started' },
      { id: 'recommendations', title: 'Recommendations', description: 'Generate advice', status: 'not_started' },
      { id: 'notifications', title: 'Send Notifications', description: 'Multi-channel alerts', status: 'not_started' },
    ],
  },
  {
    id: 'expense_tracking',
    title: 'Expense Tracking & Budgeting',
    description: 'Track farm expenses with budget alerts',
    category: 'financial',
    channels: ['SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'receipt',
    color: '#DC2626',
    uiPages: ['Expenses', 'FinancialReports'],
    backendServices: ['expense-activities', 'accounting-services'],
    steps: [
      { id: 'record_expense', title: 'Record Expense', description: 'Enter expense details', status: 'not_started' },
      { id: 'ledger_entry', title: 'Ledger Entry', description: 'TigerBeetle record', status: 'not_started' },
      { id: 'budget_check', title: 'Budget Check', description: 'Check against budget', status: 'not_started' },
      { id: 'erpnext_sync', title: 'ERPNext Sync', description: 'Sync to ERP', status: 'not_started' },
    ],
  },
  {
    id: 'analytics_dashboard',
    title: 'Analytics Dashboard Generation',
    description: 'Generate comprehensive analytics reports',
    category: 'analytics',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'bar-chart',
    color: '#9333EA',
    uiPages: ['Analytics', 'AdvancedAnalytics', 'InputYieldAnalytics'],
    backendServices: ['analytics-router', 'analytics-service'],
    steps: [
      { id: 'fetch_data', title: 'Fetch Data', description: 'Query Lakehouse', status: 'not_started' },
      { id: 'calculate_metrics', title: 'Calculate Metrics', description: 'Compute KPIs', status: 'not_started' },
      { id: 'ml_insights', title: 'ML Insights', description: 'Generate AI insights', status: 'not_started' },
      { id: 'cache_report', title: 'Cache Report', description: 'Store in Redis', status: 'not_started' },
    ],
  },
  {
    id: 'season_planning',
    title: 'Multi-Crop Season Planning',
    description: 'Plan farming season with multiple crops',
    category: 'farming',
    channels: ['PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: 'calendar',
    color: '#059669',
    uiPages: ['Crops', 'MultiFarmDashboard', 'CropWizard'],
    backendServices: ['crop-activities', 'land-suitability-router'],
    steps: [
      { id: 'create_season', title: 'Create Season', description: 'Define season period', status: 'not_started' },
      { id: 'crop_selection', title: 'Select Crops', description: 'Choose crops to plant', status: 'not_started' },
      { id: 'suitability_check', title: 'Suitability Check', description: 'Verify land suitability', status: 'not_started' },
      { id: 'yield_forecast', title: 'Yield Forecast', description: 'Predict yields', status: 'not_started' },
      { id: 'price_forecast', title: 'Price Forecast', description: 'Forecast prices', status: 'not_started' },
    ],
  },
];

/**
 * Helper functions for journey management
 */
export function calculateJourneyProgress(steps: JourneyStep[]): number {
  if (steps.length === 0) return 0;
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  return Math.round((completedSteps / steps.length) * 100);
}

export function getJourneyStatusFromSteps(steps: JourneyStep[]): JourneyStatus {
  if (steps.every(s => s.status === 'completed')) return 'completed';
  if (steps.some(s => s.status === 'failed')) return 'failed';
  if (steps.some(s => s.status === 'blocked')) return 'blocked';
  if (steps.some(s => s.status === 'in_progress' || s.status === 'completed')) return 'in_progress';
  return 'not_started';
}

export function getJourneysByCategory(category: JourneyCategory): JourneySummary[] {
  return JOURNEY_CATALOG.filter(j => j.category === category);
}

export function getJourneysByChannel(channel: JourneyChannel): JourneySummary[] {
  return JOURNEY_CATALOG.filter(j => j.channels.includes(channel));
}

export function getJourneyById(id: string): JourneySummary | undefined {
  return JOURNEY_CATALOG.find(j => j.id === id);
}
