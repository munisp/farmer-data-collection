import { cn } from "@/lib/utils";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Users,
  Sprout,
  Warehouse,
  TrendingUp,
  CreditCard,
  BarChart3,
  Settings,
  ShoppingCart,
  Repeat,
  Brain,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { Button } from "./button";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/", icon: <Home className="w-5 h-5" /> },
      { label: "Farmers", href: "/farmers", icon: <Users className="w-5 h-5" /> },
      { label: "Farms", href: "/farms", icon: <Warehouse className="w-5 h-5" /> },
      { label: "Crops", href: "/crops", icon: <Sprout className="w-5 h-5" /> },
    ],
  },
  {
    title: "Financial",
    items: [
      { label: "Microfinance", href: "/microfinance", icon: <CreditCard className="w-5 h-5" /> },
      { label: "Banking", href: "/banking", icon: <TrendingUp className="w-5 h-5" /> },
      { label: "Loan Calculator", href: "/loan-calculator", icon: <BarChart3 className="w-5 h-5" /> },
    ],
  },
  {
    title: "Marketplace",
    items: [
      { label: "Browse", href: "/marketplace", icon: <ShoppingCart className="w-5 h-5" /> },
      { label: "Exchange", href: "/exchange", icon: <Repeat className="w-5 h-5" /> },
    ],
  },
    {
      title: "Insights & AI",
      items: [
        { label: "Analytics", href: "/analytics", icon: <BarChart3 className="w-5 h-5" /> },
        { label: "Yield Prediction", href: "/yield-prediction", icon: <TrendingUp className="w-5 h-5" /> },
        { label: "Agricultural Intelligence", href: "/agricultural-intelligence", icon: <Brain className="w-5 h-5" /> },
        { label: "Agricultural Models", href: "/agricultural-models", icon: <Sprout className="w-5 h-5" /> },
        { label: "AI Models", href: "/models", icon: <Brain className="w-5 h-5" /> },
      ],
    },
  {
    title: "Admin",
    items: [
      { label: "Settings", href: "/settings", icon: <Settings className="w-5 h-5" /> },
      { label: "Risk & Compliance", href: "/risk-compliance", icon: <Shield className="w-5 h-5" /> },
    ],
  },
];

interface ModernSidebarProps {
  className?: string;
}

export function ModernSidebar({ className }: ModernSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "sidebar-modern h-screen flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Sprout className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">AgriFinance</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav role="navigation" aria-label="Navigation" className="flex-1 overflow-y-auto py-4 px-2">
        {navigationGroups.map((group) => (
          <div key={group.title} className="sidebar-nav-group">
            {!collapsed && (
              <p className="sidebar-nav-group-title">{group.title}</p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href}>
                  <a
                    className={cn(
                      "sidebar-nav-item",
                      location === item.href && "active",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sm font-medium">JD</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">John Doe</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                john@example.com
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

interface MobileNavProps {
  className?: string;
}

export function MobileNav({ className }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  const quickNavItems = [
    { label: "Home", href: "/", icon: <Home className="w-5 h-5" /> },
    { label: "Marketplace", href: "/marketplace", icon: <ShoppingCart className="w-5 h-5" /> },
    { label: "Exchange", href: "/exchange", icon: <Repeat className="w-5 h-5" /> },
    { label: "Analytics", href: "/analytics", icon: <BarChart3 className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* Mobile Header */}
      <header
        className={cn(
          "lg:hidden fixed top-0 left-0 right-0 h-14 bg-background border-b border-border z-40 flex items-center justify-between px-4",
          className
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Sprout className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold">AgriFinance</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div
        className={cn(
          "lg:hidden fixed top-14 left-0 right-0 bottom-0 bg-background z-50 transform transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <nav role="navigation" aria-label="Navigation" className="p-4 overflow-y-auto h-full">
          {navigationGroups.map((group) => (
            <div key={group.title} className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-3">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <a
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        location === item.href
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setOpen(false)}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </a>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Navigation */}
      <nav role="navigation" aria-label="Navigation" className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border z-40 flex items-center justify-around px-2">
        {quickNavItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <a
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                location === item.href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {item.icon}
              <span className="text-xs">{item.label}</span>
            </a>
          </Link>
        ))}
      </nav>
    </>
  );
}
