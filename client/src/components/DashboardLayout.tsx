import { ReactNode, useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Users, 
  Tractor, 
  Sprout, 
  Receipt,
  LayoutDashboard,
  FileText,
  BarChart3,
  Shield,
  Settings,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Coins
} from "lucide-react";
import { APP_TITLE } from "@/const";
import { SyncStatus } from "@/components/SyncStatus";
import { useLocalization, CURRENCY_OPTIONS, LANGUAGE_OPTIONS, Currency, Language } from "@/contexts/LocalizationContext";
import BottomNavBar, { getActiveCategory, type NavCategory } from "./BottomNavBar";
import CategoryHub from "./CategoryHub";

interface DashboardLayoutProps {
  children: ReactNode;
}

import { 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  Wallet, 
  CreditCard, 
  Building2, 
  MapPin, 
  Satellite, 
  Cloud, 
  Bell, 
  UserCheck,
  Truck,
  LineChart,
  Brain,
  MessageSquare,
  Calculator,
  ClipboardList,
  Target,
  Briefcase,
  Globe,
  Phone,
  Thermometer,
  Wifi,
  Bot,
  Leaf,
  Plane,
  Award,
  Home,
  Zap,
  BookOpen,
  Activity,
  RotateCcw,
  Store,
  FileCheck,
  Snowflake,
  Mic,
  AlertTriangle,
  ArrowRightLeft,
  Warehouse,
  Fish,
  Droplets
} from "lucide-react";

// Navigation sections organized by domain
const navSections = [
  {
    title: "Core",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/quick-farmer-registration", label: "Quick Add Farmer", icon: Users },
      { href: "/farmers-enhanced", label: "Manage Farmers", icon: Users },
      { href: "/farms", label: "Farms", icon: Tractor },
      { href: "/crops", label: "Crops", icon: Sprout },
      { href: "/crop-wizard", label: "Crop Wizard", icon: Sprout },
      { href: "/crops/dashboard", label: "Crop Dashboard", icon: Sprout },
      { href: "/livestock", label: "Livestock", icon: Truck },
      { href: "/harvests", label: "Harvests", icon: Package },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/multi-farm", label: "Multi-Farm", icon: Home },
      { href: "/onboarding", label: "Onboarding Wizard", icon: BookOpen },
    ]
  },
  {
    title: "Inventory & Supply",
    items: [
      { href: "/inventory", label: "Inventory Management", icon: Package },
      { href: "/inputs", label: "Farm Inputs", icon: Sprout },
      { href: "/equipment-tracker", label: "Equipment Tracker", icon: Tractor },
      { href: "/traceability", label: "Traceability", icon: Target },
    ]
  },
  {
    title: "Marketplace",
    items: [
      { href: "/marketplace", label: "Browse Marketplace", icon: ShoppingCart },
      { href: "/group-buying", label: "Group Buying", icon: Users },
      { href: "/marketplace/create", label: "Create Listing", icon: Package },
      { href: "/my-listings", label: "My Listings", icon: ClipboardList },
      { href: "/my-orders", label: "My Orders", icon: ShoppingCart },
      { href: "/my-sales", label: "My Sales", icon: Receipt },
      { href: "/cart", label: "Shopping Cart", icon: ShoppingCart },
      { href: "/checkout", label: "Checkout", icon: CreditCard },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/seller-analytics", label: "Seller Analytics", icon: LineChart },
      { href: "/transactions", label: "Transaction History", icon: Receipt },
      { href: "/returns", label: "Returns & Refunds", icon: RotateCcw },
      { href: "/freshness", label: "Freshness Tracking", icon: Snowflake },
    ]
  },
  {
    title: "Retail & B2B",
    items: [
      { href: "/retail/store", label: "My Retail Store", icon: Store },
      { href: "/retail/demand", label: "Retail Demand", icon: TrendingUp },
      { href: "/retail/standing-orders", label: "Standing Orders", icon: FileCheck },
      { href: "/retail/invoices", label: "Invoices", icon: Receipt },
      { href: "/retail/bulk-order", label: "Bulk Ordering", icon: Package },
    ]
  },
  {
    title: "Commodity Exchange",
    items: [
      { href: "/exchange", label: "Exchange Dashboard", icon: TrendingUp },
      { href: "/exchange/my-orders", label: "My Exchange Orders", icon: ClipboardList },
      { href: "/exchange/my-trades", label: "My Trades", icon: LineChart },
    ]
  },
  {
    title: "Supply Chain & Delivery",
    items: [
      { href: "/delivery", label: "Delivery Dashboard", icon: Truck },
      { href: "/delivery/tracking", label: "Live Tracking", icon: MapPin },
      { href: "/aggregation-hub", label: "Aggregation Hub", icon: Warehouse },
      { href: "/cold-chain", label: "Cold Chain Monitoring", icon: Thermometer },
      { href: "/freshness", label: "Freshness Tracking", icon: Leaf },
      { href: "/traceability", label: "Produce Traceability", icon: Target },
      { href: "/price-alerts", label: "Price Alerts", icon: Bell },
      { href: "/subscriptions", label: "Subscription Boxes", icon: Package },
    ]
  },
  {
    title: "Financial & Microfinance",
    items: [
      { href: "/microfinance", label: "Microfinance Dashboard", icon: Wallet },
      { href: "/apply-loan", label: "Apply for Loan", icon: CreditCard },
      { href: "/my-loans", label: "My Loans", icon: Wallet },
      { href: "/my-applications", label: "My Applications", icon: ClipboardList },
      { href: "/repayment-tracking", label: "Repayment Tracking", icon: Calculator },
      { href: "/banking", label: "Banking Dashboard", icon: Building2 },
      { href: "/accounting", label: "Accounting", icon: Calculator },
      { href: "/credit-score", label: "Credit Score", icon: Target },
      { href: "/credit-score-view", label: "Score Details", icon: Target },
      { href: "/loan-calculator", label: "Loan Calculator", icon: Calculator },
      { href: "/lender-comparison", label: "Compare Lenders", icon: LineChart },
      { href: "/borrower-dashboard", label: "Borrower Dashboard", icon: Wallet },
      { href: "/mobile-money", label: "Mobile Money", icon: Phone },
      { href: "/chama", label: "Chama / VSLA", icon: Users },
      { href: "/disbursement-analytics", label: "Disbursement Analytics", icon: BarChart3 },
    ]
  },
  {
    title: "Spatial & Weather",
    items: [
      { href: "/farmers-map", label: "Farmers Map", icon: MapPin },
      { href: "/gps-tracking", label: "GPS Tracking", icon: MapPin },
      { href: "/farm-geotagging", label: "Geotag My Farm", icon: Target },
      { href: "/satellite-imagery", label: "Satellite Imagery", icon: Satellite },
      { href: "/field-overview", label: "Field Overview (EOS)", icon: Satellite },
      { href: "/spatial-analytics", label: "Spatial Analytics", icon: Globe },
      { href: "/weather", label: "Weather Dashboard", icon: Cloud },
      { href: "/weather-alerts", label: "Weather Alerts", icon: AlertTriangle },
      { href: "/precision-agriculture", label: "Precision Agriculture", icon: Target },
    ]
  },
  {
    title: "AI & Analytics",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/advanced-analytics", label: "Advanced Analytics", icon: LineChart },
      { href: "/ai-diagnosis", label: "AI Crop Diagnosis", icon: Brain },
      { href: "/soil-analysis", label: "Soil Analysis", icon: Leaf },
      { href: "/yield-prediction", label: "Yield Prediction", icon: TrendingUp },
      { href: "/land-suitability", label: "Land Suitability", icon: Sprout },
      { href: "/price-forecast", label: "Price Forecast", icon: LineChart },
      { href: "/agricultural-intelligence", label: "Ag Intelligence", icon: Brain },
      { href: "/ai-advisor", label: "AI Advisor", icon: Bot },
      { href: "/models", label: "ML Models", icon: Brain },
      { href: "/models/downloads", label: "Model Downloads", icon: Brain },
      { href: "/models/benchmarks", label: "Model Benchmarks", icon: Brain },
      { href: "/input-yield-analytics", label: "Input/Yield Analytics", icon: BarChart3 },
      { href: "/agricultural-models", label: "Agricultural Models", icon: Zap },
    ]
  },
  {
    title: "Equipment & IoT",
    items: [
      { href: "/drone-operations", label: "Drone Operations", icon: Plane },
      { href: "/equipment-fleet", label: "Equipment Fleet", icon: Truck },
      { href: "/iot-sensors", label: "IoT Sensors", icon: Wifi },
    ]
  },
  {
    title: "Reports & Export",
    items: [
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/financial-reports", label: "Financial Reports", icon: FileText },
      { href: "/spatial-reports", label: "Spatial Reports", icon: FileText },
      { href: "/export", label: "Bulk Export", icon: FileText },
      { href: "/export-scheduler", label: "Export Scheduler", icon: FileText },
    ]
  },
  {
    title: "Cooperatives & Agents",
    items: [
      { href: "/cooperatives", label: "Cooperatives", icon: Users },
      { href: "/cooperative-dashboard", label: "Cooperative Dashboard", icon: BarChart3 },
      { href: "/field-agent", label: "Field Agent Dashboard", icon: Briefcase },
      { href: "/agent-tasks", label: "Agent Tasks", icon: ClipboardList },
      { href: "/farmer-verification", label: "Farmer Verification", icon: UserCheck },
      { href: "/kyc", label: "KYC / KYB Verification", icon: Shield },
    ]
  },
  {
    title: "Notifications & Preferences",
    items: [
      { href: "/notifications", label: "Notification Center", icon: Bell },
      { href: "/notification-preferences", label: "Notification Preferences", icon: Settings },
      { href: "/achievements", label: "Achievements", icon: Award },
      { href: "/journeys", label: "User Journeys", icon: Activity },
      { href: "/event-analytics", label: "Event Analytics", icon: BarChart3 },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/voice-navigation", label: "Voice Navigation", icon: Mic },
    ]
  },
  {
    title: "Aquaculture",
    items: [
      { href: "/aquaculture", label: "Pond Dashboard", icon: Fish },
      { href: "/aquaculture/feed", label: "Feed & Harvest", icon: Droplets },
      { href: "/aquaculture/ai", label: "Fish Health AI", icon: Brain },
    ]
  },
  {
    title: "Payments & Reconciliation",
    items: [
      { href: "/payment-reconciliation", label: "Payment Reconciliation", icon: ArrowRightLeft },
    ]
  },
];

const adminNavItems = [
  { href: "/admin", label: "Admin Dashboard", icon: Shield },
  { href: "/admin/dashboard", label: "Workflow Admin", icon: LayoutDashboard },
  { href: "/admin/users", label: "User Management", icon: Users },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText },
  { href: "/loan-approvals", label: "Loan Approvals", icon: CreditCard },
  { href: "/admin/disbursements", label: "Disbursements", icon: Wallet },
  { href: "/admin/risk-assessment", label: "Risk Assessment", icon: Target },
  { href: "/risk-compliance", label: "Risk & Compliance", icon: Shield },
  { href: "/portfolio-risk", label: "Portfolio at Risk", icon: LineChart },
  { href: "/admin/sms-management", label: "SMS Management", icon: MessageSquare },
  { href: "/admin/sms-templates", label: "SMS Templates", icon: FileText },
  { href: "/admin/sms-scheduling", label: "SMS Scheduling", icon: ClipboardList },
  { href: "/admin/sms-analytics", label: "SMS Analytics", icon: BarChart3 },
  { href: "/admin/workflows", label: "Workflows", icon: Activity },
  { href: "/admin/workflow-analytics", label: "Workflow Analytics", icon: BarChart3 },
  { href: "/admin/review-analytics", label: "Review Analytics", icon: LineChart },
  { href: "/admin/moderation-analytics", label: "Moderation", icon: Shield },
  { href: "/admin/erpnext-integration", label: "ERPNext Integration", icon: Globe },
  { href: "/admin/kyc", label: "KYC Admin", icon: Shield },
  { href: "/data-quality", label: "Data Quality", icon: BarChart3 },
  { href: "/hr", label: "HR Dashboard", icon: Users },
];

// Hub routes that show category grid instead of a specific page
const HUB_ROUTES = ["/hub/farm", "/hub/market", "/hub/finance", "/hub/more"];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const { settings, updateSettings, changeLanguage, t } = useLocalization();

  const isAdmin = user?.role === 'admin';
  const [activeCategory, setActiveCategory] = useState<NavCategory>(() => getActiveCategory(location));
  const [showCategoryHub, setShowCategoryHub] = useState(false);

  // Update active category when route changes
  useEffect(() => {
    setActiveCategory(getActiveCategory(location));
    setShowCategoryHub(false);
  }, [location]);

  const handleCategoryChange = useCallback((category: NavCategory) => {
    if (category === "home") {
      setLocation("/");
      setShowCategoryHub(false);
    } else if (category === activeCategory && !showCategoryHub) {
      setShowCategoryHub(true);
    } else {
      setActiveCategory(category);
      setShowCategoryHub(true);
    }
  }, [activeCategory, showCategoryHub, setLocation]);

  const toggleSection = useCallback((title: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <h1 className="text-lg font-bold text-card-foreground">{APP_TITLE}</h1>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar - Desktop & Mobile */}
      <aside className={cn(
        "w-full md:w-64 border-r border-border bg-card transition-all duration-300 md:block",
        mobileMenuOpen ? "block fixed inset-0 z-50 overflow-y-auto" : "hidden md:block"
      )}>
        {/* Desktop Header */}
        <div className="hidden md:block p-6 border-b border-border">
          <h1 className="text-xl font-bold text-card-foreground">{APP_TITLE}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('appTagline')}</p>
          
          {/* Currency & Language Selectors */}
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-muted-foreground" />
              <select
                value={settings.currency}
                onChange={(e) => updateSettings({ currency: e.target.value as Currency })}
                className="flex-1 text-xs bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-muted-foreground" />
              <select
                value={settings.language}
                onChange={(e) => changeLanguage(e.target.value as Language)}
                className="flex-1 text-xs bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          
          {user && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">{t('loggedInAs')}</p>
              <p className="text-sm font-medium text-card-foreground">
                {user.firstName} {user.lastName}
              </p>
              <button
                onClick={logout}
                className="text-xs text-destructive hover:underline mt-1"
              >
                {t('logout')}
              </button>
            </div>
          )}
        </div>

        {/* Mobile Header in Sidebar */}
        <div className="md:hidden p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-card-foreground">{APP_TITLE}</h1>
              {user && (
                <p className="text-sm text-muted-foreground mt-1">
                  {user.firstName} {user.lastName}
                </p>
              )}
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 hover:bg-accent rounded-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Mobile Currency & Language Selectors */}
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-muted-foreground" />
              <select
                value={settings.currency}
                onChange={(e) => updateSettings({ currency: e.target.value as Currency })}
                className="flex-1 text-sm bg-background border border-input rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-muted-foreground" />
              <select
                value={settings.language}
                onChange={(e) => changeLanguage(e.target.value as Language)}
                className="flex-1 text-sm bg-background border border-input rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <nav role="navigation" aria-label="Navigation" className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-200px)]">
          {/* Main Navigation Sections — collapsible */}
          {navSections.map((section, sectionIndex) => {
            const isCollapsed = collapsedSections.has(section.title);
            return (
            <div key={section.title} className={sectionIndex > 0 ? "pt-3 mt-3 border-t border-border" : ""}>
              <button
                onClick={() => toggleSection(section.title)}
                className="flex items-center justify-between w-full px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span>{section.title}</span>
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {!isCollapsed && section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 rounded-lg transition-colors touch-manipulation min-h-[40px] text-sm",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-card-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">{item.label}</span>
                    </a>
                  </Link>
                );
              })}
            </div>
          );
          })}

          {/* Admin Section */}
          {isAdmin && (
            <div className="pt-4 mt-4 border-t border-border">
              <button
                onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full text-left hover:bg-accent min-h-[48px]"
              >
                <Shield className="w-5 h-5" />
                <span className="font-medium flex-1">Admin</span>
                {adminMenuOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {adminMenuOpen && (
                <div className="ml-4 mt-1 space-y-1">
                  {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.href;
                    return (
                      <Link key={item.href} href={item.href}>
                        <a
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm min-h-[44px]",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-card-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </a>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          <div className="pt-4 mt-4 border-t border-border">
            <Link href="/settings">
              <a
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors min-h-[48px]",
                  location === "/settings"
                    ? "bg-primary text-primary-foreground"
                    : "text-card-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Settings className="w-5 h-5" />
                <span className="font-medium">Settings</span>
              </a>
            </Link>
          </div>

          {/* Mobile Logout */}
          <div className="md:hidden pt-4 mt-4 border-t border-border">
            <button
              onClick={() => {
                logout();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full text-left text-destructive hover:bg-destructive/10 min-h-[48px]"
            >
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col pb-16 md:pb-0">
        <SyncStatus />
        <div className="container py-4 md:py-8 flex-1 px-4">
          {showCategoryHub ? <CategoryHub category={activeCategory} /> : children}
        </div>
      </main>

      {/* Bottom Navigation Bar — mobile only */}
      <BottomNavBar activeCategory={activeCategory} onCategoryChange={handleCategoryChange} />

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
