import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  Users,
  Shield,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  MapPin,
  Leaf,
  BarChart3,
  Calendar,
  Package,
  Receipt,
  QrCode,
  CloudRain,
  ClipboardList,
  IdCard,
  Banknote,
  Layers,
  Wheat,
  CreditCard,
  ChevronRight,
  Phone,
  MessageSquare,
  Smartphone,
  Globe,
  Mic,
} from "lucide-react";

type JourneyStatus = 'not_started' | 'in_progress' | 'completed' | 'failed' | 'blocked';
type JourneyChannel = 'USSD' | 'SMS' | 'WhatsApp' | 'PWA' | 'Mobile' | 'Voice';
type JourneyCategory = 'onboarding' | 'farming' | 'financial' | 'marketplace' | 'analytics' | 'compliance' | 'sustainability';

interface JourneyStep {
  id: string;
  title: string;
  description?: string;
  status: JourneyStatus;
  startedAt?: string;
  completedAt?: string;
  actionLabel?: string;
  actionRoute?: string;
}

interface JourneySummary {
  id: string;
  title: string;
  description: string;
  category: JourneyCategory;
  channels: JourneyChannel[];
  status: JourneyStatus;
  progress: number;
  lastUpdate: string;
  steps: JourneyStep[];
  icon: any;
  color: string;
}

const JOURNEY_CATALOG: JourneySummary[] = [
  {
    id: 'farmer_onboarding',
    title: 'Farmer Onboarding with KYC',
    description: 'Complete farmer registration with identity verification and ERPNext sync',
    category: 'onboarding',
    channels: ['USSD', 'SMS', 'WhatsApp', 'PWA', 'Mobile'],
    status: 'not_started',
    progress: 0,
    lastUpdate: '',
    icon: Users,
    color: '#3B82F6',
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
    icon: MapPin,
    color: '#10B981',
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
    icon: DollarSign,
    color: '#F59E0B',
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
    icon: ShoppingCart,
    color: '#8B5CF6',
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
    icon: CreditCard,
    color: '#EC4899',
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
    icon: TrendingUp,
    color: '#06B6D4',
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
    icon: Layers,
    color: '#84CC16',
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
    icon: Users,
    color: '#6366F1',
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
    icon: Banknote,
    color: '#F97316',
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
    icon: Shield,
    color: '#EF4444',
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
    icon: Package,
    color: '#14B8A6',
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
    icon: Wheat,
    color: '#A3E635',
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
    icon: ClipboardList,
    color: '#64748B',
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
    icon: IdCard,
    color: '#0EA5E9',
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
    icon: Leaf,
    color: '#22C55E',
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
    icon: QrCode,
    color: '#7C3AED',
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
    icon: CloudRain,
    color: '#0284C7',
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
    icon: Receipt,
    color: '#DC2626',
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
    icon: BarChart3,
    color: '#9333EA',
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
    icon: Calendar,
    color: '#059669',
    steps: [
      { id: 'create_season', title: 'Create Season', description: 'Define season period', status: 'not_started' },
      { id: 'crop_selection', title: 'Select Crops', description: 'Choose crops to plant', status: 'not_started' },
      { id: 'suitability_check', title: 'Suitability Check', description: 'Verify land suitability', status: 'not_started' },
      { id: 'yield_forecast', title: 'Yield Forecast', description: 'Predict yields', status: 'not_started' },
      { id: 'price_forecast', title: 'Price Forecast', description: 'Forecast prices', status: 'not_started' },
    ],
  },
];

const CATEGORY_CONFIG: Record<JourneyCategory, { label: string; color: string }> = {
  onboarding: { label: 'Onboarding', color: 'bg-blue-100 text-blue-800' },
  farming: { label: 'Farming', color: 'bg-green-100 text-green-800' },
  financial: { label: 'Financial', color: 'bg-yellow-100 text-yellow-800' },
  marketplace: { label: 'Marketplace', color: 'bg-purple-100 text-purple-800' },
  analytics: { label: 'Analytics', color: 'bg-cyan-100 text-cyan-800' },
  compliance: { label: 'Compliance', color: 'bg-gray-100 text-gray-800' },
  sustainability: { label: 'Sustainability', color: 'bg-emerald-100 text-emerald-800' },
};

const CHANNEL_ICONS: Record<JourneyChannel, any> = {
  USSD: Phone,
  SMS: MessageSquare,
  WhatsApp: MessageSquare,
  PWA: Globe,
  Mobile: Smartphone,
  Voice: Mic,
};

export default function UserJourneys() {
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [selectedJourney, setSelectedJourney] = useState<JourneySummary | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<JourneyCategory | "all">("all");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    fetchJourneys();
  }, []);

  const fetchJourneys = async () => {
    const mockJourneys: JourneySummary[] = JOURNEY_CATALOG.map((journey, index) => {
      const completedSteps = index < 5 ? journey.steps.length : index < 10 ? Math.floor(journey.steps.length * 0.6) : 0;
      const progress = Math.round((completedSteps / journey.steps.length) * 100);
      
      return {
        ...journey,
        status: index < 5 ? 'completed' as JourneyStatus : index < 10 ? 'in_progress' as JourneyStatus : 'not_started' as JourneyStatus,
        progress,
        lastUpdate: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
        steps: journey.steps.map((step, stepIndex) => ({
          ...step,
          status: stepIndex < completedSteps ? 'completed' as JourneyStatus : stepIndex === completedSteps ? 'in_progress' as JourneyStatus : 'not_started' as JourneyStatus,
          startedAt: stepIndex <= completedSteps ? new Date(Date.now() - Math.random() * 86400000 * 3).toISOString() : undefined,
          completedAt: stepIndex < completedSteps ? new Date(Date.now() - Math.random() * 86400000).toISOString() : undefined,
        })),
      };
    });

    setJourneys(mockJourneys);
  };

  const getStatusIcon = (status: JourneyStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "in_progress":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "failed":
      case "blocked":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: JourneyStatus) => {
    const variants: Record<JourneyStatus, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      in_progress: "secondary",
      failed: "destructive",
      blocked: "destructive",
      not_started: "outline",
    };

    return (
      <Badge variant={variants[status]}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const filteredJourneys = journeys.filter((journey) => {
    const statusMatch = activeTab === "all" || 
      (activeTab === "active" && journey.status === "in_progress") ||
      (activeTab === "completed" && journey.status === "completed") ||
      (activeTab === "pending" && journey.status === "not_started");
    
    const categoryMatch = categoryFilter === "all" || journey.category === categoryFilter;
    
    return statusMatch && categoryMatch;
  });

  const stats = {
    total: journeys.length,
    completed: journeys.filter((j) => j.status === "completed").length,
    inProgress: journeys.filter((j) => j.status === "in_progress").length,
    notStarted: journeys.filter((j) => j.status === "not_started").length,
  };

  const openJourneyDetail = (journey: JourneySummary) => {
    setSelectedJourney(journey);
    setIsDrawerOpen(true);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container py-6">
          <h1 className="text-3xl font-bold">User Journeys</h1>
          <p className="text-muted-foreground mt-2">
            Track your farming activities across all 20 orchestrated workflows
          </p>
        </div>
      </div>

      <div className="container py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Journeys</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Not Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-400">{stats.notStarted}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={categoryFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter("all")}
          >
            All Categories
          </Button>
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
            <Button
              key={key}
              variant={categoryFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter(key as JourneyCategory)}
            >
              {config.label}
            </Button>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All ({journeys.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({stats.inProgress})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
            <TabsTrigger value="pending">Not Started ({stats.notStarted})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredJourneys.map((journey) => {
                const JourneyIcon = journey.icon;

                return (
                  <Card
                    key={journey.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer group"
                    onClick={() => openJourneyDetail(journey)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div 
                          className="p-3 rounded-lg"
                          style={{ backgroundColor: `${journey.color}20` }}
                        >
                          <JourneyIcon 
                            className="h-6 w-6" 
                            style={{ color: journey.color }}
                          />
                        </div>
                        {getStatusIcon(journey.status)}
                      </div>
                      <CardTitle className="mt-3 text-base group-hover:text-primary transition-colors">
                        {journey.title}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-2">
                        {journey.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge className={CATEGORY_CONFIG[journey.category].color} variant="outline">
                            {CATEGORY_CONFIG[journey.category].label}
                          </Badge>
                          {getStatusBadge(journey.status)}
                        </div>
                        
                        <div className="flex gap-1 flex-wrap">
                          {journey.channels.slice(0, 3).map((channel) => {
                            const ChannelIcon = CHANNEL_ICONS[channel];
                            return (
                              <Badge key={channel} variant="outline" className="text-xs px-1.5 py-0.5">
                                <ChannelIcon className="h-3 w-3 mr-1" />
                                {channel}
                              </Badge>
                            );
                          })}
                          {journey.channels.length > 3 && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                              +{journey.channels.length - 3}
                            </Badge>
                          )}
                        </div>

                        {journey.status !== "not_started" && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{journey.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{ 
                                  width: `${journey.progress}%`,
                                  backgroundColor: journey.color 
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <Button className="w-full mt-2" variant="ghost" size="sm">
                          View Details
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {filteredJourneys.length === 0 && (
          <Card className="mt-6">
            <CardContent className="py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No journeys found</h3>
              <p className="text-muted-foreground">
                Try adjusting your filters to see more journeys
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedJourney && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${selectedJourney.color}20` }}
                  >
                    <selectedJourney.icon 
                      className="h-6 w-6" 
                      style={{ color: selectedJourney.color }}
                    />
                  </div>
                  <div>
                    <SheetTitle>{selectedJourney.title}</SheetTitle>
                    <SheetDescription>{selectedJourney.description}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <ScrollArea className="h-[calc(100vh-200px)] mt-6">
                <div className="space-y-6 pr-4">
                  <div className="flex items-center justify-between">
                    <Badge className={CATEGORY_CONFIG[selectedJourney.category].color}>
                      {CATEGORY_CONFIG[selectedJourney.category].label}
                    </Badge>
                    {getStatusBadge(selectedJourney.status)}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Overall Progress</span>
                      <span className="font-medium">{selectedJourney.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ 
                          width: `${selectedJourney.progress}%`,
                          backgroundColor: selectedJourney.color 
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Available Channels</h4>
                    <div className="flex gap-2 flex-wrap">
                      {selectedJourney.channels.map((channel) => {
                        const ChannelIcon = CHANNEL_ICONS[channel];
                        return (
                          <Badge key={channel} variant="outline">
                            <ChannelIcon className="h-3 w-3 mr-1" />
                            {channel}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-sm font-medium mb-4">Journey Steps</h4>
                    <div className="space-y-4">
                      {selectedJourney.steps.map((step, index) => (
                        <div key={step.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div 
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                step.status === 'completed' 
                                  ? 'bg-green-100 text-green-700' 
                                  : step.status === 'in_progress'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {step.status === 'completed' ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            {index < selectedJourney.steps.length - 1 && (
                              <div 
                                className={`w-0.5 h-8 mt-1 ${
                                  step.status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
                                }`}
                              />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between">
                              <h5 className="font-medium text-sm">{step.title}</h5>
                              {step.status === 'in_progress' && (
                                <Badge variant="secondary" className="text-xs">Current</Badge>
                              )}
                            </div>
                            {step.description && (
                              <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                            )}
                            {step.completedAt && (
                              <p className="text-xs text-green-600 mt-1">
                                Completed {formatDate(step.completedAt)}
                              </p>
                            )}
                            {step.status === 'in_progress' && step.actionLabel && (
                              <Button size="sm" className="mt-2" variant="outline">
                                {step.actionLabel}
                                <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedJourney.lastUpdate && (
                    <>
                      <Separator />
                      <div className="text-xs text-muted-foreground">
                        Last updated: {formatDate(selectedJourney.lastUpdate)}
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button className="flex-1" style={{ backgroundColor: selectedJourney.color }}>
                      {selectedJourney.status === 'not_started' ? 'Start Journey' : 'Continue Journey'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
