import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Milk, Plus, TrendingUp, Droplets, Thermometer, BarChart3,
  Calendar, AlertTriangle, CheckCircle
} from "lucide-react";

const QUALITY_COLORS: Record<string, string> = {
  grade_a: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  grade_b: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  grade_c: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default function DairyMilk() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "365d">("30d");

  const [form, setForm] = useState({
    cowId: "",
    recordDate: new Date().toISOString().split("T")[0],
    session: "morning" as "morning" | "afternoon" | "evening",
    quantityLiters: "",
    fatPercentage: "",
    proteinPercentage: "",
    temperature: "",
    quality: "grade_a" as "grade_a" | "grade_b" | "grade_c" | "rejected",
    notes: "",
  });

  const cowsQuery = trpc.dairy.getCows.useQuery({ status: "active" }, { retry: false });
  const recordsQuery = trpc.dairy.getMilkRecords.useQuery({ limit: 100 }, { retry: false });
  const analyticsQuery = trpc.dairy.getMilkAnalytics.useQuery({ period }, { retry: false });

  const recordMutation = trpc.dairy.recordMilk.useMutation({
    onSuccess: () => {
      toast.success("Milk record saved");
      setDialogOpen(false);
      recordsQuery.refetch();
      analyticsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cowMap = useMemo(() => {
    const m = new Map<number, string>();
    (cowsQuery.data ?? []).forEach((c) => m.set(c.id, `${c.tagNumber}${c.name ? ` (${c.name})` : ""}`));
    return m;
  }, [cowsQuery.data]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    recordMutation.mutate({
      cowId: Number(form.cowId),
      recordDate: form.recordDate,
      session: form.session,
      quantityLiters: Number(form.quantityLiters),
      fatPercentage: form.fatPercentage ? Number(form.fatPercentage) : undefined,
      proteinPercentage: form.proteinPercentage ? Number(form.proteinPercentage) : undefined,
      temperature: form.temperature ? Number(form.temperature) : undefined,
      quality: form.quality,
      notes: form.notes || undefined,
    });
  }

  const analytics = analyticsQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
              <Milk className="w-6 h-6 text-sky-700 dark:text-sky-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Milk Production</h1>
              <p className="text-sm text-muted-foreground">Record and track daily milk yield</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="dairy-btn-primary gap-2">
                <Plus className="w-4 h-4" /> Record Milk
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Milk Production</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Cow *</Label>
                  <Select value={form.cowId} onValueChange={(v) => setForm({ ...form, cowId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select cow" /></SelectTrigger>
                    <SelectContent>
                      {(cowsQuery.data ?? []).map((cow) => (
                        <SelectItem key={cow.id} value={String(cow.id)}>
                          {cow.tagNumber}{cow.name ? ` — ${cow.name}` : ""} ({cow.breed})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={form.recordDate} onChange={(e) => setForm({ ...form, recordDate: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Session *</Label>
                    <Select value={form.session} onValueChange={(v: any) => setForm({ ...form, session: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantity (Liters) *</Label>
                    <Input type="number" step="0.1" placeholder="e.g., 8.5" value={form.quantityLiters} onChange={(e) => setForm({ ...form, quantityLiters: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Quality Grade</Label>
                    <Select value={form.quality} onValueChange={(v: any) => setForm({ ...form, quality: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="grade_a">Grade A</SelectItem>
                        <SelectItem value="grade_b">Grade B</SelectItem>
                        <SelectItem value="grade_c">Grade C</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Fat %</Label>
                    <Input type="number" step="0.1" placeholder="e.g., 3.8" value={form.fatPercentage} onChange={(e) => setForm({ ...form, fatPercentage: e.target.value })} />
                  </div>
                  <div>
                    <Label>Protein %</Label>
                    <Input type="number" step="0.1" placeholder="e.g., 3.2" value={form.proteinPercentage} onChange={(e) => setForm({ ...form, proteinPercentage: e.target.value })} />
                  </div>
                  <div>
                    <Label>Temp (°C)</Label>
                    <Input type="number" step="0.1" placeholder="e.g., 4.0" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full dairy-btn-primary" disabled={recordMutation.isPending}>
                  {recordMutation.isPending ? "Saving..." : "Save Record"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Analytics cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="dairy-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Droplets className="w-4 h-4 text-sky-600" />
                <span className="text-xs text-muted-foreground uppercase">Total Yield</span>
              </div>
              <p className="text-xl font-bold">{analytics?.totalLiters.toLocaleString() ?? "—"} L</p>
              <p className="text-xs text-muted-foreground">{analytics?.totalRecords ?? 0} records</p>
            </CardContent>
          </Card>
          <Card className="dairy-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-muted-foreground uppercase">Avg/Session</span>
              </div>
              <p className="text-xl font-bold">{analytics?.avgLitersPerSession.toFixed(1) ?? "—"} L</p>
              <p className="text-xs text-muted-foreground">{analytics?.activeCows ?? 0} active cows</p>
            </CardContent>
          </Card>
          <Card className="dairy-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-amber-600" />
                <span className="text-xs text-muted-foreground uppercase">Avg Fat</span>
              </div>
              <p className="text-xl font-bold">{analytics?.avgFatPercentage.toFixed(1) ?? "—"}%</p>
              <p className="text-xs text-muted-foreground">target: 3.5-4.5%</p>
            </CardContent>
          </Card>
          <Card className="dairy-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Thermometer className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-muted-foreground uppercase">Avg Protein</span>
              </div>
              <p className="text-xl font-bold">{analytics?.avgProteinPercentage.toFixed(1) ?? "—"}%</p>
              <p className="text-xs text-muted-foreground">target: 3.0-3.5%</p>
            </CardContent>
          </Card>
        </div>

        {/* Period selector */}
        <div className="flex gap-2">
          {(["7d", "30d", "90d", "365d"] as const).map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
              className={period === p ? "dairy-btn-primary" : ""}
            >
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : p === "90d" ? "90 Days" : "1 Year"}
            </Button>
          ))}
        </div>

        {/* Records table */}
        <Card className="dairy-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-600" />
              Recent Records
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cow</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Liters</TableHead>
                  <TableHead>Fat %</TableHead>
                  <TableHead>Protein %</TableHead>
                  <TableHead>Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : (recordsQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No milk records yet. Click "Record Milk" to add your first entry.
                    </TableCell>
                  </TableRow>
                ) : (recordsQuery.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.recordDate}</TableCell>
                    <TableCell className="font-mono text-teal-700 dark:text-teal-300 text-sm">
                      {cowMap.get(r.cowId) ?? `#${r.cowId}`}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{r.session}</TableCell>
                    <TableCell className="font-semibold">{r.quantityLiters} L</TableCell>
                    <TableCell>{r.fatPercentage?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell>{r.proteinPercentage?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={QUALITY_COLORS[r.quality ?? "grade_a"] ?? ""}>
                        {(r.quality ?? "grade_a").replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
