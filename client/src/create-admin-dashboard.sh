#!/bin/bash

# Create Admin Dashboard Homepage
cat > pages/admin/AdminDashboard.tsx << 'EOF'
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
EOF

# Create Workflow List Page
cat > pages/admin/WorkflowList.tsx << 'EOF'
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export default function WorkflowList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const workflows = [
    { id: "wf-001", type: "Ginger Complete Season", farmer: "Adebayo O.", status: "running", startDate: "2025-01-15", progress: 65 },
    { id: "wf-002", type: "Palm Oil Cooperative", farmer: "Chioma N.", status: "completed", startDate: "2025-01-10", progress: 100 },
    { id: "wf-003", type: "Cocoa Export Cert", farmer: "Ibrahim M.", status: "failed", startDate: "2025-01-20", progress: 40 },
    { id: "wf-004", type: "Cassava Value Chain", farmer: "Ngozi E.", status: "running", startDate: "2025-01-18", progress: 80 },
    { id: "wf-005", type: "Rice Irrigation", farmer: "Yusuf A.", status: "running", startDate: "2025-01-22", progress: 30 },
    { id: "wf-006", type: "Maize Livestock Feed", farmer: "Fatima B.", status: "completed", startDate: "2025-01-05", progress: 100 },
    { id: "wf-007", type: "Soybean Export Agg", farmer: "Emeka C.", status: "running", startDate: "2025-01-25", progress: 50 },
    { id: "wf-008", type: "Groundnut Oil Process", farmer: "Aisha D.", status: "pending", startDate: "2025-01-26", progress: 0 },
  ];

  const filteredWorkflows = workflows.filter(wf => {
    const matchesSearch = wf.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         wf.farmer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         wf.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || wf.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">All Workflows</h1>
        <Button onClick={() => setLocation("/admin")}>Back to Dashboard</Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Search workflows, farmers, or IDs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {filteredWorkflows.map((wf) => (
              <div key={wf.id} className="p-4 hover:bg-accent cursor-pointer" onClick={() => setLocation(`/admin/workflows/${wf.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{wf.type}</div>
                    <div className="text-sm text-muted-foreground">
                      {wf.id} • Farmer: {wf.farmer} • Started: {wf.startDate}
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
                      wf.status === "pending" ? "bg-gray-100 text-gray-800" :
                      "bg-blue-100 text-blue-800"
                    }`}>
                      {wf.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {filteredWorkflows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No workflows found matching your criteria
        </div>
      )}
    </div>
  );
}
EOF

# Create Workflow Detail Page
cat > pages/admin/WorkflowDetail.tsx << 'EOF'
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
EOF

echo "Admin dashboard pages created successfully!"
