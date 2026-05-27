import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface TutorialContextType {
  hasCompletedTutorial: boolean;
  showTutorial: boolean;
  startTutorial: () => void;
  completeTutorial: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const TUTORIAL_STORAGE_KEY = "farmer-app-tutorial-completed";

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState<boolean>(() => {
    // Check localStorage on initialization
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return completed === "true";
  });

  const [showTutorial, setShowTutorial] = useState<boolean>(false);

  // Auto-show tutorial for first-time users
  useEffect(() => {
    if (!hasCompletedTutorial) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTutorial]);

  const startTutorial = () => {
    setShowTutorial(true);
  };

  const completeTutorial = () => {
    setHasCompletedTutorial(true);
    setShowTutorial(false);
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  };

  const skipTutorial = () => {
    setHasCompletedTutorial(true);
    setShowTutorial(false);
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  };

  return (
    <TutorialContext.Provider
      value={{
        hasCompletedTutorial,
        showTutorial,
        startTutorial,
        completeTutorial,
        skipTutorial,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error("useTutorial must be used within a TutorialProvider");
  }
  return context;
}
