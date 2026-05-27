import { TutorialStep } from "@/components/OnboardingTutorial";

export const tutorialSteps: TutorialStep[] = [
  {
    title: "Welcome to Farmer Data Collection! 🌾",
    description: "This quick tutorial will show you the key features to help you collect and manage farmer data efficiently. Let's get started!",
    position: "center",
  },
  {
    title: "Quick Add Farmer",
    description: "Use this feature to quickly register new farmers in the field. It's optimized for mobile use with offline support, so you can collect data anywhere.",
    targetSelector: 'a[href="/quick-farmer-registration"]',
    position: "right",
  },
  {
    title: "Manage Farmers",
    description: "View, search, and manage all registered farmers. You can filter, sort, export data, and perform bulk operations from here.",
    targetSelector: 'a[href="/farmers-enhanced"]',
    position: "right",
  },
  {
    title: "Sync Status",
    description: "Keep track of your offline data here. When you're back online, pending records will automatically sync to the server.",
    targetSelector: '[data-tutorial="sync-status"]',
    position: "bottom",
  },
  {
    title: "Dashboard Overview",
    description: "Your dashboard shows key metrics, recent activities, and collection progress. Check here daily to track your performance.",
    targetSelector: 'a[href="/"]',
    position: "right",
  },
  {
    title: "You're All Set! 🎉",
    description: "You now know the basics! Start by adding your first farmer using the Quick Add feature. You can replay this tutorial anytime from Settings.",
    position: "center",
  },
];
