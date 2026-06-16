import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Sprout,
  ShoppingCart,
  Wallet,
  MoreHorizontal,
} from "lucide-react";

export type NavCategory = "home" | "farm" | "market" | "finance" | "more";

interface BottomNavBarProps {
  activeCategory: NavCategory;
  onCategoryChange: (category: NavCategory) => void;
}

const tabs: { id: NavCategory; label: string; icon: typeof LayoutDashboard; routes: string[] }[] = [
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    routes: ["/", "/notifications", "/settings", "/onboarding"],
  },
  {
    id: "farm",
    label: "Farm",
    icon: Sprout,
    routes: [
      "/farms", "/crops", "/livestock", "/harvests", "/expenses", "/inputs",
      "/equipment-tracker", "/weather", "/satellite-imagery", "/precision-agriculture",
      "/field-overview", "/gps-tracking", "/farm-geotagging", "/yield-prediction",
      "/ai-diagnosis", "/drone-flights", "/equipment-fleet", "/iot-sensors",
      "/ai-advisor", "/soil-analysis",
    ],
  },
  {
    id: "market",
    label: "Market",
    icon: ShoppingCart,
    routes: [
      "/marketplace", "/my-listings", "/my-orders", "/my-sales", "/cart",
      "/checkout", "/group-buying", "/messages", "/marketplace/create",
      "/exchange", "/exchange/my-orders", "/exchange/my-trades",
      "/delivery", "/cold-chain", "/price-alerts", "/subscriptions",
      "/traceability",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    routes: [
      "/microfinance", "/apply-loan", "/my-loans", "/my-applications",
      "/repayment-tracking", "/banking", "/accounting", "/credit-score",
      "/loan-calculator", "/lender-comparison", "/borrower-dashboard",
      "/mobile-money", "/chama", "/financial-reports",
    ],
  },
  {
    id: "more",
    label: "More",
    icon: MoreHorizontal,
    routes: [
      "/analytics", "/advanced-analytics", "/reports", "/spatial-analytics",
      "/spatial-reports", "/export", "/export-scheduler", "/cooperatives",
      "/field-agent", "/agent-tasks", "/farmer-verification",
      "/farmers-enhanced", "/farmers-map", "/quick-farmer-registration",
      "/data-quality", "/models", "/agricultural-intelligence",
      "/admin", "/risk-compliance",
    ],
  },
];

export function getActiveCategory(location: string): NavCategory {
  for (const tab of tabs) {
    if (tab.routes.some(r => location === r || location.startsWith(r + "/"))) {
      return tab.id;
    }
  }
  return "home";
}

export default function BottomNavBar({ activeCategory, onCategoryChange }: BottomNavBarProps) {
  const [location] = useLocation();

  return (
    <nav role="navigation" aria-label="Navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onCategoryChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-2 px-1 transition-all duration-200 touch-manipulation min-h-[56px] relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-primary/70"
              )}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
              <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn("text-[10px] mt-0.5 font-medium", isActive && "font-semibold")}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
