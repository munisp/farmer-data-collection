import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sprout,
  Users,
  Landmark,
  ShoppingCart,
  BarChart3,
  Building2,
  ArrowRight,
  ArrowLeft,
  Check,
  Smartphone,
  Wallet,
  TrendingUp,
  Package,
  FileText,
  Settings,
  Shield,
} from "lucide-react";

// Guided Onboarding Wizard
// Persona-based onboarding that activates only relevant features

type Persona = "farmer" | "cooperative" | "mfi" | "trader" | "admin";

interface PersonaConfig {
  id: Persona;
  title: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  steps: OnboardingStep[];
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: string;
  path: string;
  optional?: boolean;
}

const personas: PersonaConfig[] = [
  {
    id: "farmer",
    title: "Smallholder Farmer",
    description: "Manage your farm, track crops, access loans, and sell produce",
    icon: <Sprout className="h-8 w-8" />,
    features: [
      "Farm Management",
      "Crop Tracking",
      "Weather Alerts",
      "Microfinance Loans",
      "Marketplace Selling",
      "USSD Access",
    ],
    steps: [
      {
        id: "profile",
        title: "Complete Your Profile",
        description: "Add your personal details and contact information",
        icon: <Users className="h-5 w-5" />,
        action: "Complete Profile",
        path: "/settings/profile",
      },
      {
        id: "kyc",
        title: "Verify Your Identity",
        description: "Complete KYC verification to access loans, trading, and financial services",
        icon: <Shield className="h-5 w-5" />,
        action: "Start Verification",
        path: "/kyc",
      },
      {
        id: "farm",
        title: "Register Your Farm",
        description: "Add your farm location, size, and soil type",
        icon: <Sprout className="h-5 w-5" />,
        action: "Add Farm",
        path: "/farms/new",
      },
      {
        id: "crops",
        title: "Add Your Crops",
        description: "Track what you're growing this season",
        icon: <Package className="h-5 w-5" />,
        action: "Add Crops",
        path: "/crops/new",
      },
      {
        id: "ussd",
        title: "Set Up USSD Access",
        description: "Access the platform from any phone via *384*123#",
        icon: <Smartphone className="h-5 w-5" />,
        action: "Learn More",
        path: "/help/ussd",
        optional: true,
      },
      {
        id: "loan",
        title: "Check Loan Eligibility",
        description: "See what financing options are available to you",
        icon: <Landmark className="h-5 w-5" />,
        action: "Check Eligibility",
        path: "/microfinance/calculator",
        optional: true,
      },
    ],
  },
  {
    id: "cooperative",
    title: "Cooperative Manager",
    description: "Manage member farmers, aggregate produce, and coordinate sales",
    icon: <Users className="h-8 w-8" />,
    features: [
      "Member Management",
      "Bulk Aggregation",
      "Group Loans",
      "Marketplace Bulk Sales",
      "Analytics Dashboard",
      "SMS Broadcasts",
    ],
    steps: [
      {
        id: "profile",
        title: "Set Up Cooperative Profile",
        description: "Add your cooperative details and registration info",
        icon: <Building2 className="h-5 w-5" />,
        action: "Complete Profile",
        path: "/settings/cooperative",
      },
      {
        id: "kyb",
        title: "Business Verification (KYB)",
        description: "Verify your cooperative registration and director details for compliance",
        icon: <Shield className="h-5 w-5" />,
        action: "Start KYB Verification",
        path: "/kyc",
      },
      {
        id: "members",
        title: "Add Member Farmers",
        description: "Import or register your cooperative members",
        icon: <Users className="h-5 w-5" />,
        action: "Add Members",
        path: "/farmers/import",
      },
      {
        id: "aggregation",
        title: "Set Up Aggregation",
        description: "Configure collection points and schedules",
        icon: <Package className="h-5 w-5" />,
        action: "Configure",
        path: "/aggregation/setup",
      },
      {
        id: "marketplace",
        title: "Create Bulk Listings",
        description: "List aggregated produce on the marketplace",
        icon: <ShoppingCart className="h-5 w-5" />,
        action: "Create Listing",
        path: "/marketplace/new",
      },
      {
        id: "analytics",
        title: "View Analytics",
        description: "Track cooperative performance and member activity",
        icon: <BarChart3 className="h-5 w-5" />,
        action: "View Dashboard",
        path: "/analytics",
        optional: true,
      },
    ],
  },
  {
    id: "mfi",
    title: "MFI Officer",
    description: "Manage loan applications, disbursements, and collections",
    icon: <Landmark className="h-8 w-8" />,
    features: [
      "Loan Applications",
      "Credit Scoring",
      "Disbursement",
      "Collection Tracking",
      "Risk Assessment",
      "Portfolio Analytics",
    ],
    steps: [
      {
        id: "profile",
        title: "Complete Officer Profile",
        description: "Set up your MFI officer account",
        icon: <Users className="h-5 w-5" />,
        action: "Complete Profile",
        path: "/settings/profile",
      },
      {
        id: "kyc",
        title: "Identity Verification",
        description: "Verify your identity to access financial operations",
        icon: <Shield className="h-5 w-5" />,
        action: "Start Verification",
        path: "/kyc",
      },
      {
        id: "products",
        title: "Review Loan Products",
        description: "Familiarize yourself with available loan products",
        icon: <FileText className="h-5 w-5" />,
        action: "View Products",
        path: "/microfinance/products",
      },
      {
        id: "applications",
        title: "Process Applications",
        description: "Review and process pending loan applications",
        icon: <Landmark className="h-5 w-5" />,
        action: "View Applications",
        path: "/microfinance/applications",
      },
      {
        id: "collections",
        title: "Set Up Collections",
        description: "Configure collection schedules and reminders",
        icon: <Wallet className="h-5 w-5" />,
        action: "Configure",
        path: "/microfinance/collections",
      },
      {
        id: "risk",
        title: "Review Risk Dashboard",
        description: "Monitor portfolio risk and delinquency",
        icon: <TrendingUp className="h-5 w-5" />,
        action: "View Dashboard",
        path: "/risk-compliance",
        optional: true,
      },
    ],
  },
  {
    id: "trader",
    title: "Commodity Trader",
    description: "Trade agricultural commodities on the exchange",
    icon: <BarChart3 className="h-8 w-8" />,
    features: [
      "Order Book Trading",
      "Price Discovery",
      "Position Management",
      "Settlement",
      "Market Analytics",
      "Price Alerts",
    ],
    steps: [
      {
        id: "profile",
        title: "Complete Trader Profile",
        description: "Set up your trader account and verification",
        icon: <Users className="h-5 w-5" />,
        action: "Complete Profile",
        path: "/settings/profile",
      },
      {
        id: "kyc",
        title: "Complete KYC Verification",
        description: "Submit required documents for trading",
        icon: <FileText className="h-5 w-5" />,
        action: "Start KYC",
        path: "/settings/kyc",
      },
      {
        id: "deposit",
        title: "Fund Your Account",
        description: "Deposit funds to start trading",
        icon: <Wallet className="h-5 w-5" />,
        action: "Deposit",
        path: "/exchange/deposit",
      },
      {
        id: "explore",
        title: "Explore Commodities",
        description: "Browse available commodities and prices",
        icon: <Package className="h-5 w-5" />,
        action: "Browse",
        path: "/exchange",
      },
      {
        id: "trade",
        title: "Place Your First Trade",
        description: "Execute a buy or sell order",
        icon: <BarChart3 className="h-5 w-5" />,
        action: "Start Trading",
        path: "/exchange/trade/MAIZE",
        optional: true,
      },
    ],
  },
  {
    id: "admin",
    title: "Platform Administrator",
    description: "Manage users, monitor platform health, and configure settings",
    icon: <Settings className="h-8 w-8" />,
    features: [
      "User Management",
      "System Monitoring",
      "Audit Logs",
      "Configuration",
      "Reports",
      "Compliance",
    ],
    steps: [
      {
        id: "users",
        title: "Review User Management",
        description: "Manage platform users and roles",
        icon: <Users className="h-5 w-5" />,
        action: "View Users",
        path: "/admin/users",
      },
      {
        id: "monitoring",
        title: "Check System Health",
        description: "Review platform metrics and alerts",
        icon: <BarChart3 className="h-5 w-5" />,
        action: "View Dashboard",
        path: "/admin/monitoring",
      },
      {
        id: "audit",
        title: "Review Audit Logs",
        description: "Check recent administrative actions",
        icon: <FileText className="h-5 w-5" />,
        action: "View Logs",
        path: "/risk-compliance",
      },
      {
        id: "settings",
        title: "Configure Settings",
        description: "Review and update platform settings",
        icon: <Settings className="h-5 w-5" />,
        action: "Configure",
        path: "/admin/settings",
      },
    ],
  },
];

export default function OnboardingWizard() {
  const [, setLocation] = useLocation();
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const persona = personas.find((p) => p.id === selectedPersona);
  const progress = persona
    ? (completedSteps.size / persona.steps.length) * 100
    : 0;

  const handlePersonaSelect = (personaId: Persona) => {
    setSelectedPersona(personaId);
    setCurrentStep(0);
    setCompletedSteps(new Set());
  };

  const handleStepComplete = (stepId: string) => {
    setCompletedSteps((prev) => new Set([...Array.from(prev), stepId]));
    if (persona && currentStep < persona.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepAction = (step: OnboardingStep) => {
    handleStepComplete(step.id);
    setLocation(step.path);
  };

  const handleSkipStep = () => {
    if (persona && currentStep < persona.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinish = () => {
    // Save onboarding completion to localStorage
    localStorage.setItem("onboarding_completed", "true");
    localStorage.setItem("user_persona", selectedPersona || "");
    setLocation("/dashboard");
  };

  // Persona Selection Screen
  if (!selectedPersona) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4">
        <div className="container mx-auto max-w-4xl py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Welcome to Farmer Platform</h1>
            <p className="text-muted-foreground text-lg">
              Tell us about yourself so we can personalize your experience
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {personas.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-green-500 hover:shadow-lg transition-all"
                onClick={() => handlePersonaSelect(p.id)}
              >
                <CardHeader className="text-center">
                  <div className="mx-auto mb-2 p-3 bg-green-100 rounded-full w-fit">
                    {p.icon}
                  </div>
                  <CardTitle>{p.title}</CardTitle>
                  <CardDescription>{p.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {p.features.slice(0, 4).map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                    {p.features.length > 4 && (
                      <Badge variant="outline" className="text-xs">
                        +{p.features.length - 4} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Button variant="ghost" onClick={() => setLocation("/dashboard")}>
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Onboarding Steps Screen
  const step = persona?.steps[currentStep];
  const isLastStep = persona && currentStep === persona.steps.length - 1;
  const allStepsCompleted = persona && completedSteps.size === persona.steps.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4">
      <div className="container mx-auto max-w-2xl py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setSelectedPersona(null)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Change Role
          </Button>

          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-100 rounded-full">{persona?.icon}</div>
            <div>
              <h1 className="text-2xl font-bold">{persona?.title} Setup</h1>
              <p className="text-muted-foreground">
                Step {currentStep + 1} of {persona?.steps.length}
              </p>
            </div>
          </div>

          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Cards */}
        <div className="space-y-4 mb-8">
          {persona?.steps.map((s, index) => {
            const isCompleted = completedSteps.has(s.id);
            const isCurrent = index === currentStep;
            const isPast = index < currentStep;

            return (
              <Card
                key={s.id}
                className={`transition-all ${
                  isCurrent
                    ? "border-green-500 shadow-lg"
                    : isCompleted
                    ? "border-green-200 bg-green-50"
                    : "opacity-60"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        isCompleted
                          ? "bg-green-500 text-white"
                          : isCurrent
                          ? "bg-green-100"
                          : "bg-gray-100"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        s.icon
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{s.title}</h3>
                        {s.optional && (
                          <Badge variant="outline" className="text-xs">
                            Optional
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    </div>
                    {isCurrent && !isCompleted && (
                      <div className="flex gap-2">
                        {s.optional && (
                          <Button variant="ghost" size="sm" onClick={handleSkipStep}>
                            Skip
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleStepAction(s)}>
                          {s.action}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    )}
                    {isCompleted && (
                      <Badge className="bg-green-500">Completed</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {allStepsCompleted || isLastStep ? (
            <Button onClick={handleFinish} className="bg-green-600 hover:bg-green-700">
              Go to Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setLocation("/dashboard")}
            >
              Skip Setup
            </Button>
          )}
        </div>

        {/* Features Preview */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Features Available to You</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {persona?.features.map((feature) => (
                <Badge key={feature} variant="secondary">
                  {feature}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
