import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  const stats = {
    activeWorkflows: 127,
    completedToday: 45,
    failedWorkflows: 3,
    totalFarmers: 1250,
  };

  const recentWorkflows = [
    { id: "wf-001", type: "Ginger Complete Season", farmer: "Adebayo O.", status: "running", progress: 65 },
    { id: "wf-002", type: "Palm Oil Cooperative", farmer: "Chioma N.", status: "completed", progress: 100 },
    { id: "wf-003", type: "Cocoa Export Cert", farmer: "Ibrahim M.", status: "failed", progress: 40 },
    { id: "wf-004", type: "Cassava Value Chain", farmer: "Ngozi E.", status: "running", progress: 80 },
    { id: "wf-005", type: "Rice Irrigation", farmer: "Yusuf A.", status: "running", progress: 30 },
  ];

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Workflow Admin Dashboard</h1>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Active Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-600">{stats.activeWorkflows}</div>
            <p className="text-sm text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600">{stats.completedToday}</div>
            <p className="text-sm text-muted-foreground">Successful completions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-red-600">{stats.failedWorkflows}</div>
            <p className="text-sm text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Farmers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats.totalFarmers}</div>
            <p className="text-sm text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Workflows</CardTitle>
            <Button onClick={() => setLocation("/admin/workflows")}>View All</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentWorkflows.map((wf) => (
              <div key={wf.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="font-semibold">{wf.type}</div>
                  <div className="text-sm text-muted-foreground">
                    {wf.id} • Farmer: {wf.farmer}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32">
                    <div className="h-2 bg-gray-200 rounded-full">
                      <div
                        className={`h-2 rounded-full ${
                          wf.status === "completed" ? "bg-green-500" :
                          wf.status === "failed" ? "bg-red-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${wf.progress}%` }}
                      />
                    </div>
                    <div className="text-xs text-center mt-1">{wf.progress}%</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    wf.status === "completed" ? "bg-green-100 text-green-800" :
                    wf.status === "failed" ? "bg-red-100 text-red-800" :
                    "bg-blue-100 text-blue-800"
                  }`}>
                    {wf.status}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setLocation(`/admin/workflows/${wf.id}`)}>
                    Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => setLocation("/admin/workflows")}>
              View All Workflows
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setLocation("/admin/analytics")}>
              View Analytics
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setLocation("/admin/farmers")}>
              Manage Farmers
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Temporal Server</span>
                <span className="text-green-600 font-semibold">✓ Healthy</span>
              </div>
              <div className="flex justify-between">
                <span>Kafka</span>
                <span className="text-green-600 font-semibold">✓ Healthy</span>
              </div>
              <div className="flex justify-between">
                <span>Redis</span>
                <span className="text-green-600 font-semibold">✓ Healthy</span>
              </div>
              <div className="flex justify-between">
                <span>PostgreSQL</span>
                <span className="text-green-600 font-semibold">✓ Healthy</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
