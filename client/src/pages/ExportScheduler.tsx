import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Download, Mail, Clock, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";

interface ExportSchedule {
  id: string;
  name: string;
  dataType: "crops" | "expenses" | "harvests" | "financial";
  frequency: "daily" | "weekly" | "monthly";
  time: string; // HH:MM format
  email?: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export default function ExportScheduler() {
  const [schedules, setSchedules] = useState<ExportSchedule[]>([]);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Partial<ExportSchedule>>({
    name: "",
    dataType: "crops",
    frequency: "weekly",
    time: "09:00",
    email: "",
    enabled: true,
  });

  // Load schedules from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("export-schedules");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSchedules(parsed.map((s: any) => ({
          ...s,
          lastRun: s.lastRun ? new Date(s.lastRun) : undefined,
          nextRun: s.nextRun ? new Date(s.nextRun) : undefined,
        })));
      } catch (error) {
        console.error("Failed to load schedules:", error);
      }
    }
  }, []);

  // Save schedules to localStorage
  const saveSchedules = (newSchedules: ExportSchedule[]) => {
    localStorage.setItem("export-schedules", JSON.stringify(newSchedules));
    setSchedules(newSchedules);
  };

  // Calculate next run time
  const calculateNextRun = (frequency: string, time: string): Date => {
    const now = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    // If time has passed today, move to next occurrence
    if (next <= now) {
      switch (frequency) {
        case "daily":
          next.setDate(next.getDate() + 1);
          break;
        case "weekly":
          next.setDate(next.getDate() + 7);
          break;
        case "monthly":
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }

    return next;
  };

  // Add new schedule
  const handleAddSchedule = () => {
    if (!formData.name || !formData.dataType || !formData.frequency || !formData.time) {
      toast.error("Please fill in all required fields");
      return;
    }

    const newSchedule: ExportSchedule = {
      id: Date.now().toString(),
      name: formData.name,
      dataType: formData.dataType as any,
      frequency: formData.frequency as any,
      time: formData.time,
      email: formData.email || undefined,
      enabled: formData.enabled ?? true,
      nextRun: calculateNextRun(formData.frequency!, formData.time),
    };

    saveSchedules([...schedules, newSchedule]);
    setShowAddForm(false);
    setFormData({
      name: "",
      dataType: "crops",
      frequency: "weekly",
      time: "09:00",
      email: "",
      enabled: true,
    });
    toast.success("Export schedule created");
  };

  // Delete schedule
  const handleDeleteSchedule = (id: string) => {
    saveSchedules(schedules.filter(s => s.id !== id));
    toast.success("Schedule deleted");
  };

  // Toggle schedule enabled/disabled
  const handleToggleSchedule = (id: string) => {
    saveSchedules(
      schedules.map(s =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      )
    );
    toast.success("Schedule updated");
  };

  // Manual export
  const handleManualExport = async (dataType: string, format: "csv" | "json" = "csv") => {
    setExportingType(dataType);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const params = {
        format,
        startDate: thirtyDaysAgo.toISOString(),
        endDate: now.toISOString(),
      };

      let result;
      // Call appropriate export procedure based on data type
      switch (dataType) {
        case "crops":
          result = await queryClient.fetchQuery({
            queryKey: [["export", "exportCrops"], { input: params, type: "query" }],
            queryFn: () => fetch("/api/trpc/export.exportCrops?input=" + encodeURIComponent(JSON.stringify(params)))
              .then(res => res.json())
              .then(data => data.result.data)
          });
          break;
        case "expenses":
          result = await queryClient.fetchQuery({
            queryKey: [["export", "exportExpenses"], { input: params, type: "query" }],
            queryFn: () => fetch("/api/trpc/export.exportExpenses?input=" + encodeURIComponent(JSON.stringify(params)))
              .then(res => res.json())
              .then(data => data.result.data)
          });
          break;
        case "harvests":
          result = await queryClient.fetchQuery({
            queryKey: [["export", "exportHarvests"], { input: params, type: "query" }],
            queryFn: () => fetch("/api/trpc/export.exportHarvests?input=" + encodeURIComponent(JSON.stringify(params)))
              .then(res => res.json())
              .then(data => data.result.data)
          });
          break;
        case "financial":
          result = await queryClient.fetchQuery({
            queryKey: [["export", "exportFinancialSummary"], { input: params, type: "query" }],
            queryFn: () => fetch("/api/trpc/export.exportFinancialSummary?input=" + encodeURIComponent(JSON.stringify(params)))
              .then(res => res.json())
              .then(data => data.result.data)
          });
          break;
        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }

      // Create blob and trigger download
      const blob = new Blob([result.data], { type: result.contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${formatDataType(dataType)} exported successfully!`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(`Failed to export ${dataType}: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setExportingType(null);
    }
  };

  // Format frequency for display
  const formatFrequency = (frequency: string) => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  // Format data type for display
  const formatDataType = (dataType: string) => {
    const types: Record<string, string> = {
      crops: "Crops",
      expenses: "Expenses",
      harvests: "Harvests",
      financial: "Financial Reports",
    };
    return types[dataType] || dataType;
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Export Scheduler</h1>
            <p className="text-muted-foreground mt-2">
              Automate data exports and receive reports on schedule
            </p>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
        </div>

        {/* Manual Export Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Manual Export</CardTitle>
            <CardDescription>
              Export your data immediately without scheduling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                onClick={() => handleManualExport("crops")}
                className="h-20 flex-col"
                disabled={exportingType !== null}
              >
                {exportingType === "crops" ? (
                  <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                ) : (
                  <Download className="h-6 w-6 mb-2" />
                )}
                {exportingType === "crops" ? "Exporting..." : "Export Crops"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleManualExport("expenses")}
                className="h-20 flex-col"
                disabled={exportingType !== null}
              >
                {exportingType === "expenses" ? (
                  <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                ) : (
                  <Download className="h-6 w-6 mb-2" />
                )}
                {exportingType === "expenses" ? "Exporting..." : "Export Expenses"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleManualExport("harvests")}
                className="h-20 flex-col"
                disabled={exportingType !== null}
              >
                {exportingType === "harvests" ? (
                  <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                ) : (
                  <Download className="h-6 w-6 mb-2" />
                )}
                {exportingType === "harvests" ? "Exporting..." : "Export Harvests"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleManualExport("financial")}
                className="h-20 flex-col"
                disabled={exportingType !== null}
              >
                {exportingType === "financial" ? (
                  <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                ) : (
                  <Download className="h-6 w-6 mb-2" />
                )}
                {exportingType === "financial" ? "Exporting..." : "Export Financial Reports"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Add Schedule Form */}
        {showAddForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>New Export Schedule</CardTitle>
              <CardDescription>
                Configure automated data exports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="schedule-name">Schedule Name</Label>
                  <Input
                    id="schedule-name"
                    placeholder="e.g., Weekly Crops Report"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="data-type">Data Type</Label>
                  <Select
                    value={formData.dataType}
                    onValueChange={(value: any) => setFormData({ ...formData, dataType: value })}
                  >
                    <SelectTrigger id="data-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crops">Crops</SelectItem>
                      <SelectItem value="expenses">Expenses</SelectItem>
                      <SelectItem value="harvests">Harvests</SelectItem>
                      <SelectItem value="financial">Financial Reports</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select
                    value={formData.frequency}
                    onValueChange={(value: any) => setFormData({ ...formData, frequency: value })}
                  >
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Send exports to this email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddSchedule}>
                  Create Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scheduled Exports List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Scheduled Exports</h2>
          
          {schedules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No scheduled exports yet</p>
                <p className="text-sm">Create a schedule to automate your data exports</p>
              </CardContent>
            </Card>
          ) : (
            schedules.map((schedule) => (
              <Card key={schedule.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <Checkbox
                        checked={schedule.enabled}
                        onCheckedChange={() => handleToggleSchedule(schedule.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{schedule.name}</h3>
                          {!schedule.enabled && (
                            <span className="text-xs bg-muted px-2 py-1 rounded">Disabled</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {formatDataType(schedule.dataType)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatFrequency(schedule.frequency)} at {schedule.time}
                          </span>
                          {schedule.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {schedule.email}
                            </span>
                          )}
                        </div>
                        {schedule.nextRun && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Next run: {schedule.nextRun.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleManualExport(schedule.dataType)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Run Now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSchedule(schedule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
