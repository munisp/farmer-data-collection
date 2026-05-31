import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useState } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PWAInstallPrompt, OnlineStatusIndicator, PWAUpdatePrompt } from "./components/PWAInstallPrompt";
import { LowBandwidthProvider, ConnectionBanner } from "./components/LowBandwidthProvider";
import { AuthProvider } from "./contexts/AuthContext";
import { trpc, queryClient, getTRPCClient } from "./lib/trpc";
import { WebSocketProvider } from "./contexts/WebSocketNotificationContext";
import { TutorialProvider } from "./contexts/TutorialContext";
import { LocalizationProvider } from "./contexts/LocalizationContext";
import { Toaster } from "@/components/ui/sonner";

const NotFound = lazy(() => import("./pages/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Farmers = lazy(() => import("./pages/Farmers"));
const Farms = lazy(() => import("./pages/Farms"));
const Crops = lazy(() => import("./pages/Crops"));
const Livestock = lazy(() => import("./pages/Livestock"));
const FarmInputs = lazy(() => import("./pages/FarmInputs"));
const Harvests = lazy(() => import("./pages/Harvests"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Reports = lazy(() => import("./pages/Reports"));
const FinancialReports = lazy(() => import("./pages/FinancialReports"));
const ExportScheduler = lazy(() => import("./pages/ExportScheduler"));
const MultiFarmDashboard = lazy(() => import("./pages/MultiFarmDashboard"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));
const MarketplaceBrowse = lazy(() => import("./pages/MarketplaceBrowse"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const MarketplaceListing = lazy(() => import("./pages/MarketplaceListing"));
const GroupBuying = lazy(() => import("./pages/GroupBuying"));
const ShoppingCart = lazy(() => import("./pages/ShoppingCart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const MyListings = lazy(() => import("./pages/MyListings"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const MySales = lazy(() => import("./pages/MySales"));
const Messages = lazy(() => import("./pages/Messages"));
const YieldPredictor = lazy(() => import("./pages/YieldPredictor"));
const PriceForecast = lazy(() => import("./pages/PriceForecast"));
const SellerAnalytics = lazy(() => import("./pages/SellerAnalytics"));
const TransactionHistory = lazy(() => import("./pages/TransactionHistory"));
const BulkExport = lazy(() => import("./pages/BulkExport"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdvancedAnalytics = lazy(() => import("./pages/AdvancedAnalytics"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Achievements = lazy(() => import("./pages/Achievements"));
const WorkflowAdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const WorkflowList = lazy(() => import("./pages/admin/WorkflowList"));
const WorkflowDetail = lazy(() => import("./pages/admin/WorkflowDetail"));
const AnalyticsDashboard = lazy(() => import("./pages/admin/AnalyticsDashboard"));
const ReviewAnalytics = lazy(() => import("./pages/ReviewAnalytics"));
const ModerationAnalytics = lazy(() => import("./pages/ModerationAnalytics"));
const UserJourneys = lazy(() => import("./pages/UserJourneys"));
const ModelLibrary = lazy(() => import("./pages/ModelLibrary"));
const ModelDownloads = lazy(() => import("./pages/ModelDownloads"));
const ModelBenchmarks = lazy(() => import("./pages/ModelBenchmarks"));
const SpatialAnalytics = lazy(() => import("./pages/SpatialAnalytics"));
const SpatialReports = lazy(() => import("./pages/SpatialReports"));
const FarmDetail = lazy(() => import("./pages/FarmDetail"));
const AgriculturalIntelligenceDashboard = lazy(() => import("./pages/AgriculturalIntelligenceDashboard"));
const AccountingDashboard = lazy(() => import("./pages/AccountingDashboard"));
const HRDashboard = lazy(() => import("./pages/HRDashboard"));
const InventoryDashboard = lazy(() => import("./pages/InventoryDashboard"));
const BankingDashboard = lazy(() => import("./pages/BankingDashboard"));
const MicrofinanceDashboard = lazy(() => import("./pages/MicrofinanceDashboard"));
const LoanApprovals = lazy(() => import("./pages/LoanApprovals"));
const MyLoans = lazy(() => import("./pages/MyLoans"));
const LenderDetail = lazy(() => import("./pages/LenderDetail"));
const DisbursementAnalytics = lazy(() => import("./pages/DisbursementAnalytics"));
const AdminDisbursements = lazy(() => import("./pages/AdminDisbursements"));
const RepaymentTracking = lazy(() => import("./pages/RepaymentTracking"));
const CreditScoreDashboard = lazy(() => import("./pages/CreditScoreDashboard"));
const LenderComparison = lazy(() => import("./pages/LenderComparison"));
const LoanCalculator = lazy(() => import("./pages/LoanCalculator"));
const BorrowerRiskAssessment = lazy(() => import("./pages/BorrowerRiskAssessment"));
const LoanApplicationForm = lazy(() => import("./pages/LoanApplicationForm"));
const MyApplications = lazy(() => import("./pages/MyApplications"));
const CropWizard = lazy(() => import("./pages/CropWizard"));
const CropDashboard = lazy(() => import("./pages/crops/CropDashboard"));
const JourneyTracker = lazy(() => import("./pages/journeys/JourneyTracker"));
const EventAnalytics = lazy(() => import("./pages/EventAnalytics"));
const NotificationPreferences = lazy(() => import("./pages/NotificationPreferences"));
const BorrowerDashboard = lazy(() => import("./pages/BorrowerDashboard"));
const PrecisionAgDashboard = lazy(() => import("./pages/PrecisionAgDashboard"));
const SatelliteImagery = lazy(() => import("./pages/SatelliteImagery"));
const FieldOverview = lazy(() => import("./pages/FieldOverview"));
const AIDiagnostics = lazy(() => import("./pages/AIDiagnostics"));
const EquipmentTracker = lazy(() => import("./pages/EquipmentTracker"));
const YieldPrediction = lazy(() => import("./pages/YieldPrediction"));
const AdminApplicationReview = lazy(() => import("./pages/AdminApplicationReview"));
const SmsManagement = lazy(() => import("./pages/SmsManagement"));
const SmsTemplates = lazy(() => import("./pages/admin/SmsTemplates"));
const SmsScheduling = lazy(() => import("./pages/admin/SmsScheduling"));
const SmsAnalytics = lazy(() => import("./pages/admin/SmsAnalytics"));
const ERPNextIntegration = lazy(() => import("./pages/admin/ERPNextIntegration"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const GPSTracking = lazy(() => import("./pages/GPSTracking"));
const AgriculturalModels = lazy(() => import("./pages/AgriculturalModels"));
const WeatherDashboard = lazy(() => import("./pages/WeatherDashboard"));
const QuickFarmerRegistration = lazy(() => import("./pages/QuickFarmerRegistration"));
const FarmersEnhanced = lazy(() => import("./pages/FarmersEnhanced"));
const FarmerDetailPage = lazy(() => import("./pages/FarmerDetailPage"));
const FarmersMapView = lazy(() => import("./pages/FarmersMapView"));
const DataQualityDashboard = lazy(() => import("./pages/DataQualityDashboard"));
const FarmerVerification = lazy(() => import("./pages/FarmerVerification"));
const FieldAgentDashboard = lazy(() => import("./pages/FieldAgentDashboard"));
const ExchangeDashboard = lazy(() => import("./pages/ExchangeDashboard"));
const ExchangeTrade = lazy(() => import("./pages/ExchangeTrade"));
const ExchangeMyOrders = lazy(() => import("./pages/ExchangeMyOrders"));
const ExchangeMyTrades = lazy(() => import("./pages/ExchangeMyTrades"));
const FarmerFinancialProfile = lazy(() => import("./pages/FarmerFinancialProfile"));
const RiskComplianceDashboard = lazy(() => import("./pages/RiskComplianceDashboard"));
const OnboardingWizard = lazy(() => import("./pages/OnboardingWizard"));
const CooperativeDashboard = lazy(() => import("./pages/CooperativeDashboard"));
const CreditScoreView = lazy(() => import("./pages/CreditScoreView"));
const NotificationCenter = lazy(() => import("./pages/NotificationCenter"));
const TraceabilityDashboard = lazy(() => import("./pages/TraceabilityDashboard"));
const AgentTasksDashboard = lazy(() => import("./pages/AgentTasksDashboard"));
const PortfolioAtRiskDashboard = lazy(() => import("./pages/PortfolioAtRiskDashboard"));
const InputYieldAnalytics = lazy(() => import("./pages/InputYieldAnalytics"));
const LandSuitabilityAssessment = lazy(() => import("./pages/LandSuitabilityAssessment"));
const FarmGeotagging = lazy(() => import("./pages/FarmGeotagging"));
const DeliveryDashboard = lazy(() => import("./pages/DeliveryDashboard"));
const MobileMoneyDashboard = lazy(() => import("./pages/MobileMoneyDashboard"));
const ChamaGroupLending = lazy(() => import("./pages/ChamaGroupLending"));
const ColdChainMonitoring = lazy(() => import("./pages/ColdChainMonitoring"));
const PriceAlertsDashboard = lazy(() => import("./pages/PriceAlertsDashboard"));
const SubscriptionBoxes = lazy(() => import("./pages/SubscriptionBoxes"));
const DroneFlightDashboard = lazy(() => import("./pages/DroneFlightDashboard"));
const EquipmentFleetDashboard = lazy(() => import("./pages/EquipmentFleetDashboard"));
const IoTSensorDashboard = lazy(() => import("./pages/IoTSensorDashboard"));
const AIAdvisorDashboard = lazy(() => import("./pages/AIAdvisorDashboard"));
const KycVerification = lazy(() => import("./pages/KycVerification"));
const KycAdminDashboard = lazy(() => import("./pages/KycAdminDashboard"));
const SoilAnalysis = lazy(() => import("./pages/SoilAnalysis"));
const RetailStoreDashboard = lazy(() => import("./pages/RetailStoreDashboard"));
const OrderReturns = lazy(() => import("./pages/OrderReturns"));
const FreshnessTracking = lazy(() => import("./pages/FreshnessTracking"));
const WeatherAlerts = lazy(() => import("./pages/WeatherAlerts"));
const PaymentReconciliation = lazy(() => import("./pages/PaymentReconciliation"));
const VoiceNavigation = lazy(() => import("./pages/VoiceNavigation"));
const AggregationHub = lazy(() => import("./pages/AggregationHub"));
const AquacultureDashboard = lazy(() => import("./pages/AquacultureDashboard"));
const AquacultureFeed = lazy(() => import("./pages/AquacultureFeed"));
const AquacultureAI = lazy(() => import("./pages/AquacultureAI"));

function Router() {
  return (
    <ErrorBoundary>
    <Suspense fallback={null}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/" component={Dashboard} />
        <Route path="/farmers" component={Farmers} />
        <Route path="/farmers-enhanced" component={FarmersEnhanced} />
        <Route path="/farmers-map" component={FarmersMapView} />
        <Route path="/farmers/:id" component={FarmerDetailPage} />
        <Route path="/quick-farmer-registration" component={QuickFarmerRegistration} />
        <Route path="/field-agent" component={FieldAgentDashboard} />
        <Route path="/farms" component={Farms} />
        <Route path="/farms/:id" component={FarmDetail} />
        <Route path="/crops" component={Crops} />
        <Route path="/livestock" component={Livestock} />
        <Route path="/inputs" component={FarmInputs} />
        <Route path="/harvests" component={Harvests} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/reports" component={Reports} />
        <Route path="/financial-reports" component={FinancialReports} />
        <Route path="/export-scheduler" component={ExportScheduler} />
        <Route path="/multi-farm" component={MultiFarmDashboard} />
        <Route path="/admin" component={AdminOverview} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/audit-logs" component={AdminAuditLogs} />
        <Route path="/marketplace" component={MarketplaceBrowse} />
        <Route path="/marketplace/create" component={MarketplaceListing} />
        <Route path="/marketplace/edit/:id" component={MarketplaceListing} />
        <Route path="/marketplace/:id" component={ProductDetail} />
        <Route path="/group-buying" component={GroupBuying} />
        <Route path="/cart" component={ShoppingCart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/my-listings" component={MyListings} />
        <Route path="/my-orders" component={MyOrders} />
        <Route path="/my-sales" component={MySales} />
        <Route path="/messages" component={Messages} />
        <Route path="/yield-predictor" component={YieldPredictor} />
        <Route path="/price-forecast" component={PriceForecast} />
        <Route path="/seller-analytics" component={SellerAnalytics} />
        <Route path="/transactions" component={TransactionHistory} />
        <Route path="/export" component={BulkExport} />
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/workflows-dashboard" component={WorkflowAdminDashboard} />
        <Route path="/admin/workflows" component={WorkflowList} />
        <Route path="/admin/workflows/:workflowId" component={WorkflowDetail} />
        <Route path="/admin/workflow-analytics" component={AnalyticsDashboard} />
        <Route path="/admin/review-analytics" component={ReviewAnalytics} />
        <Route path="/admin/moderation-analytics" component={ModerationAnalytics} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/data-quality" component={DataQualityDashboard} />
        <Route path="/farmer-verification" component={FarmerVerification} />
        <Route path="/advanced-analytics" component={AdvancedAnalytics} />
        <Route path="/achievements" component={Achievements} />
        <Route path="/journeys" component={UserJourneys} />
        <Route path="/models" component={ModelLibrary} />
        <Route path="/models/downloads" component={ModelDownloads} />
        <Route path="/models/benchmarks" component={ModelBenchmarks} />
        <Route path="/spatial-analytics" component={SpatialAnalytics} />
        <Route path="/spatial-reports" component={SpatialReports} />
        <Route path="/gps-tracking" component={GPSTracking} />
        <Route path="/farm-geotagging" component={FarmGeotagging} />
        <Route path="/agricultural-models" component={AgriculturalModels} />
        <Route path="/weather" component={WeatherDashboard} />
        <Route path="/agricultural-intelligence" component={AgriculturalIntelligenceDashboard} />
        <Route path="/accounting" component={AccountingDashboard} />
        <Route path="/hr" component={HRDashboard} />
        <Route path="/inventory" component={InventoryDashboard} />
        <Route path="/banking" component={BankingDashboard} />
        <Route path="/microfinance" component={MicrofinanceDashboard} />
        <Route path="/loan-approvals" component={LoanApprovals} />
        <Route path="/my-loans" component={MyLoans} />
        <Route path="/lenders/:id" component={LenderDetail} />
        <Route path="/admin/disbursements" component={AdminDisbursements} />
        <Route path="/disbursement-analytics" component={DisbursementAnalytics} />
        <Route path="/repayment-tracking" component={RepaymentTracking} />
        <Route path="/credit-score" component={CreditScoreDashboard} />
        <Route path="/credit-scores">{() => <Redirect to="/credit-score" />}</Route>
        <Route path="/lender-comparison" component={LenderComparison} />
        <Route path="/loan-calculator" component={LoanCalculator} />
        <Route path="/admin/risk-assessment" component={BorrowerRiskAssessment} />
        <Route path="/apply-loan" component={LoanApplicationForm} />
        <Route path="/my-applications" component={MyApplications} />
        <Route path="/admin/application-review/:id" component={AdminApplicationReview} />
        <Route path="/admin/sms-management" component={SmsManagement} />
        <Route path="/admin/sms-templates" component={SmsTemplates} />
        <Route path="/admin/sms-scheduling" component={SmsScheduling} />
        <Route path="/admin/sms-analytics" component={SmsAnalytics} />
        <Route path="/admin/erpnext-integration" component={ERPNextIntegration} />
        <Route path="/settings" component={UserSettings} />
        <Route path="/crop-wizard" component={CropWizard} />
        <Route path="/crops/dashboard" component={CropDashboard} />
        <Route path="/journeys/tracker" component={JourneyTracker} />
        <Route path="/borrower-dashboard" component={BorrowerDashboard} />
        <Route path="/precision-agriculture" component={PrecisionAgDashboard} />
        <Route path="/satellite-imagery" component={SatelliteImagery} />
        <Route path="/field-overview" component={FieldOverview} />
        <Route path="/ai-diagnosis" component={AIDiagnostics} />
        <Route path="/equipment-tracker" component={EquipmentTracker} />
        <Route path="/yield-prediction" component={YieldPrediction} />
        <Route path="/crop-yield">{() => <Redirect to="/yield-prediction" />}</Route>
        <Route path="/event-analytics" component={EventAnalytics} />
        <Route path="/notification-preferences" component={NotificationPreferences} />
        <Route path="/exchange" component={ExchangeDashboard} />
        <Route path="/exchange/my-orders" component={ExchangeMyOrders} />
        <Route path="/exchange/my-trades" component={ExchangeMyTrades} />
        <Route path="/exchange/:symbol" component={ExchangeTrade} />
        <Route path="/farmers/:farmerId/financial" component={FarmerFinancialProfile} />
        <Route path="/risk-compliance" component={RiskComplianceDashboard} />
        <Route path="/onboarding" component={OnboardingWizard} />
        <Route path="/cooperatives" component={CooperativeDashboard} />
        <Route path="/credit-score-view" component={CreditScoreView} />
        <Route path="/notifications" component={NotificationCenter} />
        <Route path="/traceability" component={TraceabilityDashboard} />
        <Route path="/agent-tasks" component={AgentTasksDashboard} />
        <Route path="/portfolio-risk" component={PortfolioAtRiskDashboard} />
        <Route path="/input-yield-analytics" component={InputYieldAnalytics} />
        <Route path="/land-suitability" component={LandSuitabilityAssessment} />
        <Route path="/delivery" component={DeliveryDashboard} />
        <Route path="/delivery/tracking" component={DeliveryDashboard} />
        <Route path="/mobile-money" component={MobileMoneyDashboard} />
        <Route path="/chama" component={ChamaGroupLending} />
        <Route path="/cold-chain" component={ColdChainMonitoring} />
        <Route path="/price-alerts" component={PriceAlertsDashboard} />
        <Route path="/subscriptions" component={SubscriptionBoxes} />
        {/* === Next-Gen AI Equipment & LLM Pages === */}
        <Route path="/drone-operations" component={DroneFlightDashboard} />
        <Route path="/drone-flights">{() => <Redirect to="/drone-operations" />}</Route>
        <Route path="/equipment-fleet" component={EquipmentFleetDashboard} />
        <Route path="/iot-sensors" component={IoTSensorDashboard} />
        <Route path="/ai-advisor" component={AIAdvisorDashboard} />
        {/* === KYC/KYB Verification === */}
        <Route path="/kyc" component={KycVerification} />
        <Route path="/admin/kyc" component={KycAdminDashboard} />
        {/* === Soil Analysis === */}
        <Route path="/soil-analysis" component={SoilAnalysis} />
        <Route path="/retail/store" component={RetailStoreDashboard} />
        <Route path="/retail/demand" component={RetailStoreDashboard} />
        <Route path="/retail/standing-orders" component={RetailStoreDashboard} />
        <Route path="/retail/invoices" component={RetailStoreDashboard} />
        <Route path="/retail/bulk-order" component={RetailStoreDashboard} />
        <Route path="/returns" component={OrderReturns} />
        <Route path="/freshness" component={FreshnessTracking} />
        <Route path="/weather-alerts" component={WeatherAlerts} />
        <Route path="/payment-reconciliation" component={PaymentReconciliation} />
        <Route path="/voice-navigation" component={VoiceNavigation} />
        <Route path="/cooperative-dashboard" component={CooperativeDashboard} />
        <Route path="/aggregation-hub" component={AggregationHub} />
        <Route path="/aquaculture" component={AquacultureDashboard} />
        <Route path="/aquaculture/feed" component={AquacultureFeed} />
        <Route path="/aquaculture/ai" component={AquacultureAI} />
        <Route path="/:rest*" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
    </ErrorBoundary>
  );
}

const LazySyncProvider = lazy(async () => {
  const module = await import("./hooks/useSyncWithWebSocket");
  return { default: module.SyncProvider };
});

const LazySyncStatusButton = lazy(async () => {
  const module = await import("./components/ui/offline-indicator");
  return { default: module.SyncStatusButton };
});

function AppShell() {
  const [location] = useLocation();
  const isAuthRoute = location === "/login" || location === "/register";

  const appContent = (
    <TutorialProvider>
      <Toaster />
      {!isAuthRoute && <ConnectionBanner />}
      {!isAuthRoute && <OnlineStatusIndicator />}
      <Router />
      {!isAuthRoute && (
        <Suspense fallback={null}>
          <LazySyncStatusButton />
        </Suspense>
      )}
      {!isAuthRoute && <PWAInstallPrompt />}
      {!isAuthRoute && <PWAUpdatePrompt />}
    </TutorialProvider>
  );

  if (isAuthRoute) {
    return appContent;
  }

  return (
    <Suspense fallback={appContent}>
      <LazySyncProvider>{appContent}</LazySyncProvider>
    </Suspense>
  );
}

function App() {
  const [trpcClient] = useState(() => getTRPCClient());

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <LocalizationProvider>
              <ThemeProvider defaultTheme="light">
                <LowBandwidthProvider>
                  <TooltipProvider>
                    <WebSocketProvider>
                      <AppShell />
                    </WebSocketProvider>
                  </TooltipProvider>
                </LowBandwidthProvider>
              </ThemeProvider>
            </LocalizationProvider>
          </AuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}

export default App;
