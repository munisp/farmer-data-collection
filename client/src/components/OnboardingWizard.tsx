import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Tractor, 
  Sprout, 
  ShoppingBag, 
  TrendingUp,
  ArrowRight,
  X,
  Play
} from "lucide-react";

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  videoUrl?: string;
  tips: string[];
  action: {
    label: string;
    href: string;
  };
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome to Farmer Data Collection!",
    description: "Let's get you started with a quick tour of the platform. This will only take 2 minutes.",
    icon: CheckCircle2,
    tips: [
      "Track all your farm data in one place",
      "Access powerful analytics and ML predictions",
      "Connect with buyers through the marketplace",
      "Export your data anytime in CSV or JSON format",
    ],
    action: {
      label: "Start Tour",
      href: "#",
    },
  },
  {
    id: 2,
    title: "Set Up Your Farm",
    description: "Add your farm details to start tracking crops, livestock, and expenses.",
    icon: Tractor,
    tips: [
      "Add farm location and size",
      "Specify soil type and irrigation",
      "Upload farm photos",
      "Track multiple farms if needed",
    ],
    action: {
      label: "Add Your Farm",
      href: "/farms",
    },
  },
  {
    id: 3,
    title: "Record Your Crops",
    description: "Keep track of what you're growing, planting dates, and expected harvests.",
    icon: Sprout,
    tips: [
      "Log planting and harvest dates",
      "Track crop varieties and yields",
      "Monitor crop health and status",
      "Get AI-powered yield predictions",
    ],
    action: {
      label: "Add Crops",
      href: "/crops",
    },
  },
  {
    id: 4,
    title: "Explore the Marketplace",
    description: "Buy and sell agricultural products directly with other farmers and buyers.",
    icon: ShoppingBag,
    tips: [
      "List your produce for sale",
      "Browse available products",
      "Secure payment processing",
      "Real-time order notifications",
    ],
    action: {
      label: "Visit Marketplace",
      href: "/marketplace",
    },
  },
  {
    id: 5,
    title: "Unlock AI Insights",
    description: "Use machine learning to predict yields and forecast prices for better planning.",
    icon: TrendingUp,
    tips: [
      "Get crop yield predictions",
      "View price forecasts",
      "Analyze seasonal patterns",
      "Compare regional performance",
    ],
    action: {
      label: "Try AI Predictor",
      href: "/yield-predictor",
    },
  },
];

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingWizard({ open, onClose, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = onboardingSteps[currentStep];
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100;

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
      onClose();
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleActionClick = () => {
    if (step.action.href !== "#") {
      window.location.href = step.action.href;
      onClose();
    } else {
      handleNext();
    }
  };

  const StepIcon = step.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        {/* Close Button */}
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {/* Header */}
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-primary/10 rounded-lg">
              <StepIcon className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl">{step.title}</DialogTitle>
              <Badge variant="secondary" className="mt-1">
                Step {currentStep + 1} of {onboardingSteps.length}
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-base">{step.description}</DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress)}% Complete</span>
            <span>{onboardingSteps.length - currentStep - 1} steps remaining</span>
          </div>
        </div>

        {/* Video Player (if available) */}
        {step.videoUrl && (
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <Button size="lg" variant="secondary">
                <Play className="w-6 h-6 mr-2" />
                Watch Tutorial
              </Button>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="space-y-3">
          <h4 className="font-semibold">Key Features:</h4>
          <ul className="space-y-2">
            {step.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleSkip}>
            Skip Tour
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>
                Previous
              </Button>
            )}
            <Button onClick={handleActionClick}>
              {step.action.label}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex justify-center gap-2 pt-2">
          {onboardingSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentStep
                  ? "w-8 bg-primary"
                  : index < currentStep
                  ? "w-2 bg-primary/50"
                  : "w-2 bg-muted"
              }`}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Achievement Badge Component
interface AchievementBadgeProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  unlocked: boolean;
  progress?: number;
}

export function AchievementBadge({ title, description, icon: Icon, unlocked, progress }: AchievementBadgeProps) {
  return (
    <div
      className={`p-4 border-2 rounded-lg transition-all ${
        unlocked
          ? "border-yellow-400 bg-yellow-50"
          : "border-muted bg-muted/30 opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg ${
            unlocked ? "bg-yellow-400 text-yellow-900" : "bg-muted"
          }`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold">{title}</h4>
            {unlocked && <Badge variant="secondary">Unlocked!</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {!unlocked && progress !== undefined && (
            <div className="mt-2">
              <Progress value={progress} className="h-1" />
              <p className="text-xs text-muted-foreground mt-1">{progress}% complete</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
