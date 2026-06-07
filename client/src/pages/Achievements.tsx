import { trpc } from "@/lib/trpc";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OnboardingWizard, AchievementBadge } from "@/components/OnboardingWizard";
import { 
  Trophy, 
  Tractor, 
  Sprout, 
  ShoppingBag, 
  TrendingUp,
  Users,
  Star,
  Target,
  Zap
} from "lucide-react";
import { toast } from "sonner";

export default function Achievements() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  const achievements = [
    {
      title: "First Farm",
      description: "Add your first farm to the platform",
      icon: Tractor,
      unlocked: true,
      progress: 100,
    },
    {
      title: "Green Thumb",
      description: "Record 10 different crops",
      icon: Sprout,
      unlocked: true,
      progress: 100,
    },
    {
      title: "Marketplace Seller",
      description: "List your first product for sale",
      icon: ShoppingBag,
      unlocked: false,
      progress: 0,
    },
    {
      title: "Data Analyst",
      description: "Export your data 5 times",
      icon: TrendingUp,
      unlocked: false,
      progress: 40,
    },
    {
      title: "Community Member",
      description: "Complete 10 marketplace transactions",
      icon: Users,
      unlocked: false,
      progress: 30,
    },
    {
      title: "AI Explorer",
      description: "Use ML predictions 20 times",
      icon: Zap,
      unlocked: false,
      progress: 65,
    },
    {
      title: "Master Farmer",
      description: "Manage 5 farms with 50+ crops",
      icon: Star,
      unlocked: false,
      progress: 20,
    },
    {
      title: "Goal Achiever",
      description: "Complete all onboarding steps",
      icon: Target,
      unlocked: true,
      progress: 100,
    },
  ];

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalPoints = unlockedCount * 100;

  const handleOnboardingComplete = () => {
    toast.success("Onboarding completed! 🎉", {
      description: "You've unlocked the Goal Achiever badge!",
    });
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Achievements & Onboarding</h1>
          <p className="text-muted-foreground mt-1">
            Track your progress and unlock badges as you explore the platform
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Achievements Unlocked</CardTitle>
              <Trophy className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{unlockedCount} / {achievements.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((unlockedCount / achievements.length) * 100)}% complete
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Points</CardTitle>
              <Star className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPoints}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Earn 100 points per achievement
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Next Milestone</CardTitle>
              <Target className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Marketplace Seller</div>
              <p className="text-xs text-muted-foreground mt-1">
                List your first product
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Onboarding */}
        <Card className="border-2 border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  Take a guided tour to learn about all the platform features
                </CardDescription>
              </div>
              <Button onClick={() => setShowOnboarding(true)}>
                Start Tour
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold">5/5 Complete</span>
            </div>
          </CardContent>
        </Card>

        {/* Achievements Grid */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Your Achievements</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map((achievement, index) => (
              <AchievementBadge key={index} {...achievement} />
            ))}
          </div>
        </div>

        {/* Tips */}
        <Card>
          <CardHeader>
            <CardTitle>How to Earn Achievements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Explore Features:</strong> Try different parts of the platform to unlock new badges</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Stay Active:</strong> Regular usage helps you progress toward milestones</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Complete Tasks:</strong> Each achievement has specific requirements - check your progress</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Share & Connect:</strong> Engage with the marketplace and community features</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Onboarding Wizard */}
      <OnboardingWizard
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={handleOnboardingComplete}
      />
    </DashboardLayout>
  );
}
