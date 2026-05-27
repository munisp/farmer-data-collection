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
