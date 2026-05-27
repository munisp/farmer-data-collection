import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function AnalyticsDashboard() {
  const [, setLocation] = useLocation();

  const completionRates = {
    overall: 78,
    byMonth: [
      { month: "Jan", rate: 75 },
      { month: "Feb", rate: 78 },
      { month: "Mar", rate: 82 },
    ],
  };

  const cropPerformance = [
    { crop: "Ginger", journeys: 45, completed: 38, rate: 84 },
    { crop: "Palm Oil", journeys: 52, completed: 41, rate: 79 },
    { crop: "Cocoa", journeys: 38, completed: 30, rate: 79 },
    { crop: "Cassava", journeys: 67, completed: 51, rate: 76 },
    { crop: "Rice", journeys: 43, completed: 32, rate: 74 },
    { crop: "Maize", journeys: 55, completed: 40, rate: 73 },
    { crop: "Soybean", journeys: 29, completed: 21, rate: 72 },
    { crop: "Groundnut", journeys: 31, completed: 22, rate: 71 },
    { crop: "Yam", journeys: 24, completed: 16, rate: 67 },
    { crop: "Cotton", journeys: 18, completed: 11, rate: 61 },
  ];

  const farmerEngagement = {
    activeUsers: 1250,
    newThisMonth: 87,
    avgSessionDuration: "12m 34s",
    returningRate: 68,
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Analytics & Reports</h1>
        <Button onClick={() => setLocation("/admin")}>Back to Dashboard</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Overall Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600">{completionRates.overall}%</div>
            <p className="text-sm text-muted-foreground">Journey completion rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Farmers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{farmerEngagement.activeUsers}</div>
            <p className="text-sm text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-600">{farmerEngagement.newThisMonth}</div>
            <p className="text-sm text-muted-foreground">New registrations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Returning Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-purple-600">{farmerEngagement.returningRate}%</div>
            <p className="text-sm text-muted-foreground">Farmer retention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Completion Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {completionRates.byMonth.map((data) => (
                <div key={data.month}>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold">{data.month}</span>
                    <span className="text-muted-foreground">{data.rate}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full">
                    <div
                      className="h-3 bg-green-500 rounded-full"
                      style={{ width: `${data.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Farmer Engagement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Avg Session Duration</span>
                <span className="font-semibold">{farmerEngagement.avgSessionDuration}</span>
              </div>
              <div className="flex justify-between">
                <span>Daily Active Users</span>
                <span className="font-semibold">342</span>
              </div>
              <div className="flex justify-between">
                <span>Weekly Active Users</span>
                <span className="font-semibold">876</span>
              </div>
              <div className="flex justify-between">
                <span>Monthly Active Users</span>
                <span className="font-semibold">{farmerEngagement.activeUsers}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Crop-Specific Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {cropPerformance.map((crop) => (
              <div key={crop.crop} className="flex items-center gap-4">
                <div className="w-32 font-semibold">{crop.crop}</div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{crop.completed} / {crop.journeys} completed</span>
                    <span className="font-semibold">{crop.rate}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-blue-500 rounded-full"
                      style={{ width: `${crop.rate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button className="w-full" variant="outline">
            📊 Export Completion Rate Report (CSV)
          </Button>
          <Button className="w-full" variant="outline">
            📈 Export Farmer Engagement Report (PDF)
          </Button>
          <Button className="w-full" variant="outline">
            🌾 Export Crop Performance Report (Excel)
          </Button>
          <Button className="w-full" variant="outline">
            📉 Export Workflow Failure Analysis (PDF)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
