import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Heart, Plus, Syringe, AlertTriangle, Shield, Stethoscope,
  Clock, CheckCircle, DollarSign
} from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  severe: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const CATEGORY_ICONS: Record<string, typeof Syringe> = {
  vaccination: Shield,
  deworming: Syringe,
  treatment: Stethoscope,
  checkup: Heart,
  injury: AlertTriangle,
  disease: AlertTriangle,
};

export default function DairyHealth() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [form, setForm] = useState({
    cowId: "",
    logDate: new Date().toISOString().split("T")[0],
    category: "checkup" as "vaccination" | "deworming" | "treatment" | "checkup" | "injury" | "disease",
    condition: "",
    severity: "mild" as "mild" | "moderate" | "severe" | "critical",
    treatment: "",
    medication: "",
    dosage: "",
    vetName: "",
    withdrawalPeriodDays: "",
    cost: "",
    notes: "",
  });

  const cowsQuery = trpc.dairy.getCows.useQuery({}, { retry: false });
  const healthQuery = trpc.dairy.getHealthLogs.useQuery({
    category: filterCategory || undefined,
  }, { retry: false });

  const logMutation = trpc.dairy.logHealth.useMutation({
    onSuccess: () => {
      toast.success("Health log saved");
      setDialogOpen(false);
      healthQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cowMap = useMemo(() => {
    const m = new Map<number, string>();
    (cowsQuery.data ?? []).forEach((c) => m.set(c.id, `${c.tagNumber}${c.name ? ` (${c.name})` : ""}`));
    return m;
  }, [cowsQuery.data]);

  const unresolvedCount = (healthQuery.data ?? []).filter((l) => !l.resolved).length;
  const totalCost = (healthQuery.data ?? []).reduce((sum, l) => sum + (l.cost ?? 0), 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    logMutation.mutate({
      cowId: Number(form.cowId),
      logDate: form.logDate,
      category: form.category,
      condition: form.condition,
      severity: form.severity,
      treatment: form.treatment || undefined,
      medication: form.medication || undefined,
      dosage: form.dosage || undefined,
      vetName: form.vetName || undefined,
      withdrawalPeriodDays: form.withdrawalPeriodDays ? Number(form.withdrawalPeriodDays) : undefined,
      cost: form.cost ? Number(form.cost) : undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
              <Heart className="w-6 h-6 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Health Monitoring</h1>
              <p className="text-sm text-muted-foreground">
                {unresolvedCount > 0 ? (
                  <span className="text-red-600 dark:text-red-400 font-semibold">{unresolvedCount} unresolved</span>
                ) : "All clear"} &middot; ₦{(totalCost / 100).toLocaleString()} total vet costs
              </p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="dairy-btn-primary gap-2">
                <Plus className="w-4 h-4" /> Log Health Event
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Log Health Event</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Cow *</Label>
                  <Select value={form.cowId} onValueChange={(v) => setForm({ ...form, cowId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select cow" /></SelectTrigger>
                    <SelectContent>
                      {(cowsQuery.data ?? []).map((cow) => (
                        <SelectItem key={cow.id} value={String(cow.id)}>
                          {cow.tagNumber}{cow.name ? ` — ${cow.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={form.logDate} onChange={(e) => setForm({ ...form, logDate: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Category *</Label>
                    <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vaccination">Vaccination</SelectItem>
                        <SelectItem value="deworming">Deworming</SelectItem>
                        <SelectItem value="treatment">Treatment</SelectItem>
                        <SelectItem value="checkup">Checkup</SelectItem>
                        <SelectItem value="injury">Injury</SelectItem>
                        <SelectItem value="disease">Disease</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Condition *</Label>
                    <Input placeholder="e.g., Mastitis, FMD Vaccine" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Severity</Label>
                    <Select value={form.severity} onValueChange={(v: any) => setForm({ ...form, severity: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mild">Mild</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="severe">Severe</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Treatment</Label>
                  <Textarea placeholder="Treatment description..." value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Medication</Label>
                    <Input placeholder="Drug name" value={form.medication} onChange={(e) => setForm({ ...form, medication: e.target.value })} />
                  </div>
                  <div>
                    <Label>Dosage</Label>
                    <Input placeholder="e.g., 5ml IM" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Vet Name</Label>
                    <Input placeholder="Veterinarian" value={form.vetName} onChange={(e) => setForm({ ...form, vetName: e.target.value })} />
                  </div>
                  <div>
                    <Label>Withdrawal (days)</Label>
                    <Input type="number" placeholder="e.g., 7" value={form.withdrawalPeriodDays} onChange={(e) => setForm({ ...form, withdrawalPeriodDays: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Cost (₦)</Label>
                  <Input type="number" placeholder="Vet cost in kobo" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </div>
                <Button type="submit" className="w-full dairy-btn-primary" disabled={logMutation.isPending}>
                  {logMutation.isPending ? "Saving..." : "Save Health Log"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          {["", "vaccination", "deworming", "treatment", "checkup", "injury", "disease"].map(cat => (
            <Button
              key={cat}
              variant={filterCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterCategory(cat)}
              className={filterCategory === cat ? "dairy-btn-primary" : ""}
            >
              {cat || "All"}
            </Button>
          ))}
        </div>

        {/* Health log table */}
        <Card className="dairy-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cow</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {healthQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : (healthQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No health records found.
                    </TableCell>
                  </TableRow>
                ) : (healthQuery.data ?? []).map((log) => {
                  const CatIcon = CATEGORY_ICONS[log.category] ?? Heart;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">{log.logDate}</TableCell>
                      <TableCell className="font-mono text-teal-700 dark:text-teal-300 text-sm">
                        {cowMap.get(log.cowId) ?? `#${log.cowId}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 capitalize text-sm">
                          <CatIcon className="w-3.5 h-3.5" /> {log.category}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{log.condition}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SEVERITY_COLORS[log.severity]}>
                          {log.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">{log.medication ?? "—"}</TableCell>
                      <TableCell className="text-sm">{log.cost ? `₦${(log.cost / 100).toLocaleString()}` : "—"}</TableCell>
                      <TableCell>
                        {log.resolved ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-600" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
