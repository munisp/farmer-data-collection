import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import type { NavCategory } from "./BottomNavBar";
import {
  LayoutDashboard, Users, Tractor, Sprout, Package, Receipt, Truck,
  ShoppingCart, TrendingUp, Wallet, CreditCard, Building2, MapPin,
  Satellite, Cloud, Brain, LineChart, BarChart3, FileText, Target,
  Briefcase, ClipboardList, MessageSquare, Calculator, Globe, Shield,
  Bell, UserCheck, Thermometer, Zap, Plane, Wifi, Bot, Leaf,
  DollarSign, ArrowUpDown, Phone, Home, Settings
} from "lucide-react";

interface FeatureCard {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  description: string;
  badge?: string;
}

interface FeatureSection {
  title: string;
  cards: FeatureCard[];
}

const categoryFeatures: Record<NavCategory, FeatureSection[]> = {
  home: [
    {
      title: "Overview",
      cards: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard, description: "Farm overview & metrics" },
        { href: "/notifications", label: "Notifications", icon: Bell, description: "Alerts & updates" },
        { href: "/onboarding", label: "Get Started", icon: Target, description: "Setup wizard" },
        { href: "/settings", label: "Settings", icon: Settings, description: "App preferences" },
      ],
    },
    {
      title: "Quick Actions",
      cards: [
        { href: "/quick-farmer-registration", label: "Add Farmer", icon: Users, description: "Quick registration" },
        { href: "/crop-wizard", label: "Crop Wizard", icon: Sprout, description: "Guided crop setup" },
        { href: "/multi-farm", label: "Multi-Farm", icon: Home, description: "Manage all farms" },
      ],
    },
  ],
  farm: [
    {
      title: "Farm Management",
      cards: [
        { href: "/farms", label: "My Farms", icon: Tractor, description: "Manage farm plots" },
        { href: "/crops", label: "Crops", icon: Sprout, description: "Crop tracking" },
        { href: "/livestock", label: "Livestock", icon: Truck, description: "Animal management" },
        { href: "/harvests", label: "Harvests", icon: Package, description: "Record harvests" },
        { href: "/expenses", label: "Expenses", icon: Receipt, description: "Track spending" },
        { href: "/inputs", label: "Farm Inputs", icon: Sprout, description: "Seeds & fertilizer" },
      ],
    },
    {
      title: "Equipment & IoT",
      cards: [
        { href: "/equipment-tracker", label: "Equipment", icon: Tractor, description: "Track machinery" },
        { href: "/drone-flights", label: "Drone Flights", icon: Plane, description: "Aerial surveys", badge: "NEW" },
        { href: "/equipment-fleet", label: "Fleet", icon: Truck, description: "Fleet management", badge: "NEW" },
        { href: "/iot-sensors", label: "IoT Sensors", icon: Wifi, description: "Sensor networks", badge: "NEW" },
      ],
    },
    {
      title: "AI & Intelligence",
      cards: [
        { href: "/ai-diagnosis", label: "Crop Doctor", icon: Brain, description: "AI disease diagnosis" },
        { href: "/yield-prediction", label: "Yield Forecast", icon: TrendingUp, description: "ML predictions" },
        { href: "/ai-advisor", label: "AI Advisor", icon: Bot, description: "Chat with AI", badge: "NEW" },
        { href: "/soil-analysis", label: "Soil Analysis", icon: Leaf, description: "Soil health check", badge: "NEW" },
      ],
    },
    {
      title: "Spatial & Weather",
      cards: [
        { href: "/weather", label: "Weather", icon: Cloud, description: "Forecasts & alerts" },
        { href: "/satellite-imagery", label: "Satellite", icon: Satellite, description: "NDVI imagery" },
        { href: "/precision-agriculture", label: "Precision Ag", icon: Target, description: "Variable rate" },
        { href: "/farm-geotagging", label: "Geotag Farm", icon: MapPin, description: "GPS boundaries" },
        { href: "/gps-tracking", label: "GPS Tracking", icon: MapPin, description: "Live tracking" },
        { href: "/field-overview", label: "Field View", icon: Globe, description: "EOS overview" },
      ],
    },
  ],
  market: [
    {
      title: "Marketplace",
      cards: [
        { href: "/marketplace", label: "Browse", icon: ShoppingCart, description: "Find produce" },
        { href: "/marketplace/create", label: "Sell", icon: Package, description: "Create listing" },
        { href: "/my-listings", label: "My Listings", icon: ClipboardList, description: "Manage listings" },
        { href: "/my-orders", label: "My Orders", icon: ShoppingCart, description: "Track orders" },
        { href: "/my-sales", label: "My Sales", icon: Receipt, description: "Sales history" },
        { href: "/group-buying", label: "Group Buy", icon: Users, description: "Bulk purchasing" },
      ],
    },
    {
      title: "Supply Chain",
      cards: [
        { href: "/delivery", label: "Delivery", icon: Truck, description: "Track shipments", badge: "NEW" },
        { href: "/cold-chain", label: "Cold Chain", icon: Thermometer, description: "Temperature monitoring", badge: "NEW" },
        { href: "/traceability", label: "Traceability", icon: Target, description: "QR trace" },
        { href: "/subscriptions", label: "Subscriptions", icon: Package, description: "Produce boxes", badge: "NEW" },
        { href: "/price-alerts", label: "Price Alerts", icon: Bell, description: "Market prices", badge: "NEW" },
      ],
    },
    {
      title: "Commodity Exchange",
      cards: [
        { href: "/exchange", label: "Exchange", icon: TrendingUp, description: "Trade commodities" },
        { href: "/exchange/my-orders", label: "Orders", icon: ClipboardList, description: "Exchange orders" },
        { href: "/exchange/my-trades", label: "Trades", icon: LineChart, description: "Trade history" },
      ],
    },
    {
      title: "Communication",
      cards: [
        { href: "/messages", label: "Messages", icon: MessageSquare, description: "Chat with buyers" },
        { href: "/cart", label: "Cart", icon: ShoppingCart, description: "Shopping cart" },
      ],
    },
  ],
  finance: [
    {
      title: "Loans & Credit",
      cards: [
        { href: "/microfinance", label: "Microfinance", icon: Wallet, description: "Loan dashboard" },
        { href: "/apply-loan", label: "Apply", icon: CreditCard, description: "New loan" },
        { href: "/my-loans", label: "My Loans", icon: Wallet, description: "Active loans" },
        { href: "/my-applications", label: "Applications", icon: ClipboardList, description: "Loan status" },
        { href: "/credit-score", label: "Credit Score", icon: Target, description: "Your score" },
        { href: "/loan-calculator", label: "Calculator", icon: Calculator, description: "Estimate payments" },
      ],
    },
    {
      title: "Payments & Banking",
      cards: [
        { href: "/mobile-money", label: "Mobile Money", icon: Phone, description: "M-Pesa / MTN", badge: "NEW" },
        { href: "/banking", label: "Banking", icon: Building2, description: "Bank dashboard" },
        { href: "/accounting", label: "Accounting", icon: Calculator, description: "Books & ledger" },
        { href: "/repayment-tracking", label: "Repayments", icon: ArrowUpDown, description: "Track payments" },
      ],
    },
    {
      title: "Group Finance",
      cards: [
        { href: "/chama", label: "Chama/VSLA", icon: Users, description: "Group lending", badge: "NEW" },
        { href: "/borrower-dashboard", label: "Borrower", icon: Wallet, description: "Borrower view" },
        { href: "/lender-comparison", label: "Compare", icon: LineChart, description: "Lender rates" },
      ],
    },
    {
      title: "Reports",
      cards: [
        { href: "/financial-reports", label: "Reports", icon: FileText, description: "Financial reports" },
      ],
    },
  ],
  more: [
    {
      title: "Analytics & Reports",
      cards: [
        { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Farm analytics" },
        { href: "/advanced-analytics", label: "Advanced", icon: LineChart, description: "Deep analysis" },
        { href: "/reports", label: "Reports", icon: FileText, description: "Generate reports" },
        { href: "/spatial-analytics", label: "Spatial", icon: Globe, description: "Map analytics" },
        { href: "/spatial-reports", label: "Map Reports", icon: FileText, description: "Spatial reports" },
        { href: "/export", label: "Export", icon: FileText, description: "Bulk export" },
      ],
    },
    {
      title: "AI Models",
      cards: [
        { href: "/models", label: "ML Models", icon: Brain, description: "Model library" },
        { href: "/agricultural-intelligence", label: "Ag Intelligence", icon: Brain, description: "AI insights" },
        { href: "/price-forecast", label: "Price Forecast", icon: LineChart, description: "ML predictions" },
        { href: "/input-yield-analytics", label: "Input/Yield", icon: BarChart3, description: "Correlations" },
      ],
    },
    {
      title: "People & Teams",
      cards: [
        { href: "/farmers-enhanced", label: "Farmers", icon: Users, description: "Manage farmers" },
        { href: "/farmers-map", label: "Farmer Map", icon: MapPin, description: "Geographic view" },
        { href: "/cooperatives", label: "Cooperatives", icon: Users, description: "Co-op dashboard" },
        { href: "/field-agent", label: "Field Agent", icon: Briefcase, description: "Agent tasks" },
        { href: "/farmer-verification", label: "Verify", icon: UserCheck, description: "KYC checks" },
        { href: "/kyc", label: "KYC/KYB", icon: Shield, description: "Identity verification", badge: "NEW" },
      ],
    },
    {
      title: "Admin",
      cards: [
        { href: "/admin", label: "Admin", icon: Shield, description: "Administration" },
        { href: "/admin/kyc", label: "KYC Admin", icon: Shield, description: "Review verifications" },
        { href: "/data-quality", label: "Data Quality", icon: BarChart3, description: "Quality checks" },
        { href: "/risk-compliance", label: "Compliance", icon: Shield, description: "Risk & AML" },
      ],
    },
  ],
};

interface CategoryHubProps {
  category: NavCategory;
}

export default function CategoryHub({ category }: CategoryHubProps) {
  const [, setLocation] = useLocation();
  const sections = categoryFeatures[category];

  if (!sections) return null;

  const categoryTitles: Record<NavCategory, string> = {
    home: "Home",
    farm: "Farm & Agriculture",
    market: "Marketplace & Supply Chain",
    finance: "Finance & Payments",
    more: "Analytics & More",
  };

  return (
    <div className="pb-20 md:pb-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{categoryTitles[category]}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {sections.reduce((acc, s) => acc + s.cards.length, 0)} features available
        </p>
      </div>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
              {section.title}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.href}
                    onClick={() => setLocation(card.href)}
                    className={cn(
                      "relative flex flex-col items-center text-center p-4 rounded-xl",
                      "bg-card border border-border shadow-sm",
                      "hover:shadow-md hover:border-primary/30 hover:bg-accent/50",
                      "active:scale-[0.97] transition-all duration-150",
                      "touch-manipulation min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/50"
                    )}
                  >
                    {card.badge && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                        {card.badge}
                      </span>
                    )}
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-foreground leading-tight">{card.label}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                      {card.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
