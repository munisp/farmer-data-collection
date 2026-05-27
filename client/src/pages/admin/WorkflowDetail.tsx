import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams, useLocation } from "wouter";

export default function WorkflowDetail() {
  const params = useParams<{ workflowId: string }>();
  const [, setLocation] = useLocation();
  const workflowId = params.workflowId || "";

  const workflow = {
    id: workflowId,
    type: "Ginger Complete Season",
    farmer: "Adebayo Ogunleye",
    status: "running",
    startDate: "2025-01-15T08:00:00Z",
    progress: 65,
    currentStep: "Fertilizer Application",
    steps: [
      { name: "Land Preparation", status: "completed", completedAt: "2025-01-16", duration: "2 days" },
      { name: "Planting", status: "completed", completedAt: "2025-01-18", duration: "1 day" },
      { name: "Fertilizer Application", status: "in_progress", startedAt: "2025-01-20", duration: "ongoing" },
      { name: "Pest Control", status: "pending", duration: "-" },
      { name: "Harvest", status: "pending", duration: "-" },
      { name: "Post-Harvest Processing", status: "pending", duration: "-" },
      { name: "Marketing & Sale", status: "pending", duration: "-" },
    ],
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{workflow.type}</h1>
          <p className="text-muted-foreground">Workflow ID: {workflow.id}</p>
        </div>
        <Button onClick={() => setLocation("/admin/workflows")}>Back to List</Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="px-4 py-2 rounded-full bg-blue-100 text-blue-800 font-semibold">
              {workflow.status}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{workflow.progress}%</div>
            <div className="h-2 bg-gray-200 rounded-full mt-2">
              <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${workflow.progress}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Step</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold">{workflow.currentStep}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Workflow Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Farmer</div>
              <div className="font-semibold">{workflow.farmer}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Start Date</div>
              <div className="font-semibold">{new Date(workflow.startDate).toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Workflow Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workflow.steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  step.status === "completed" ? "bg-green-500 text-white" :
                  step.status === "in_progress" ? "bg-blue-500 text-white" :
                  "bg-gray-200 text-gray-600"
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{step.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {step.status === "completed" && `Completed: ${step.completedAt}`}
                    {step.status === "in_progress" && `Started: ${step.startedAt}`}
                    {step.status === "pending" && "Not started"}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Duration: {step.duration}
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  step.status === "completed" ? "bg-green-100 text-green-800" :
                  step.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {step.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button variant="outline">Retry Failed Steps</Button>
          <Button variant="outline">Pause Workflow</Button>
          <Button variant="destructive">Terminate Workflow</Button>
        </CardContent>
      </Card>
    </div>
  );
}
