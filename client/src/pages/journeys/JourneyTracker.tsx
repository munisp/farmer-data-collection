import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useParams } from "wouter";

export default function JourneyTracker() {
  const params = useParams();
  const { cropId, journeyId } = params;

  const journeySteps = [
    { id: 1, name: "Land Preparation", status: "completed", progress: 100 },
    { id: 2, name: "Planting", status: "completed", progress: 100 },
    { id: 3, name: "Fertilizer Application", status: "in_progress", progress: 60 },
    { id: 4, name: "Pest Control", status: "pending", progress: 0 },
    { id: 5, name: "Harvest", status: "pending", progress: 0 },
    { id: 6, name: "Post-Harvest Processing", status: "pending", progress: 0 },
    { id: 7, name: "Marketing & Sale", status: "pending", progress: 0 },
  ];

  const overallProgress = journeySteps.reduce((sum, step) => sum + step.progress, 0) / journeySteps.length;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Journey Progress</h1>
      <p className="text-muted-foreground mb-8">Track your farming journey from planting to sale</p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Overall Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={overallProgress} className="mb-2" />
          <p className="text-sm text-muted-foreground">{Math.round(overallProgress)}% complete</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {journeySteps.map((step) => (
          <Card key={step.id} className={step.status === "in_progress" ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {step.id}. {step.name}
                </CardTitle>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  step.status === "completed" ? "bg-green-100 text-green-800" :
                  step.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {step.status.replace("_", " ")}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={step.progress} className="mb-4" />
              {step.status === "in_progress" && (
                <Button size="sm">Continue Step</Button>
              )}
              {step.status === "pending" && (
                <Button size="sm" variant="outline" disabled>Not Started</Button>
              )}
              {step.status === "completed" && (
                <Button size="sm" variant="ghost">View Details</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
