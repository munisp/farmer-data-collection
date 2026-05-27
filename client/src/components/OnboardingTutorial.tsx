import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

export interface TutorialStep {
  title: string;
  description: string;
  targetSelector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  action?: () => void;
}

interface OnboardingTutorialProps {
  steps: TutorialStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingTutorial({ steps, onComplete, onSkip }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(true);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    if (step.targetSelector) {
      const element = document.querySelector(step.targetSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        // Calculate position based on target element and desired position
        let top = 0;
        let left = 0;

        switch (step.position) {
          case "top":
            top = rect.top + scrollTop - 20;
            left = rect.left + scrollLeft + rect.width / 2;
            break;
          case "bottom":
            top = rect.bottom + scrollTop + 20;
            left = rect.left + scrollLeft + rect.width / 2;
            break;
          case "left":
            top = rect.top + scrollTop + rect.height / 2;
            left = rect.left + scrollLeft - 20;
            break;
          case "right":
            top = rect.top + scrollTop + rect.height / 2;
            left = rect.right + scrollLeft + 20;
            break;
          case "center":
          default:
            top = window.innerHeight / 2 + scrollTop;
            left = window.innerWidth / 2 + scrollLeft;
            break;
        }

        setPosition({ top, left });

        // Scroll element into view
        element.scrollIntoView({ behavior: "smooth", block: "center" });

        // Add highlight effect
        element.classList.add("tutorial-highlight");
        return () => {
          element.classList.remove("tutorial-highlight");
        };
      }
    } else {
      // Center the tutorial card
      setPosition({
        top: window.innerHeight / 2 + (window.scrollY || document.documentElement.scrollTop),
        left: window.innerWidth / 2 + (window.scrollX || document.documentElement.scrollLeft),
      });
    }
  }, [currentStep, step.targetSelector, step.position]);

  const handleNext = () => {
    if (step.action) {
      step.action();
    }

    if (isLastStep) {
      setIsVisible(false);
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    onSkip();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40 pointer-events-none" />

      {/* Tutorial Card */}
      <Card
        className="fixed z-50 w-80 shadow-lg"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{step.title}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <p className="text-sm text-muted-foreground">{step.description}</p>
          <div className="flex items-center gap-1 mt-4">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index === currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between pt-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={isFirstStep}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip
            </Button>
            <Button size="sm" onClick={handleNext}>
              {isLastStep ? "Finish" : "Next"}
              {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}
