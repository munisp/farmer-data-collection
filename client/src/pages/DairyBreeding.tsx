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
import { Baby, Plus, CheckCircle, Clock, X, Syringe, Calendar } from "lucide-react";

const OUTCOME_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  pregnant: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  calved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  aborted: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
};

export default function DairyBreeding() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    cowId: "",
    breedingDate: new Date().toISOString().split("T")[0],
    method: "artificial_insemination" as "artificial_insemination" | "natural_mating" | "embryo_transfer",
    sireBreed: "",
    sireTag: "",
    aiTechnicianName: "",
    strawNumber: "",
    notes: "",
  });

  const cowsQuery = trpc.dairy.getCows.useQuery({}, { retry: false });
  const breedingQuery = trpc.dairy.getBreedingRecords.useQuery({}, { retry: false });

  const recordMutation = trpc.dairy.recordBreeding.useMutation({
    onSuccess: () => {
      toast.success("Breeding event recorded");
      setDialogOpen(false);
      breedingQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cowMap = useMemo(() => {
    const m = new Map<number, string>();
    (cowsQuery.data ?? []).forEach((c) => m.set(c.id, `${c.tagNumber}${c.name ? ` (${c.name})` : ""}`));
    return m;
  }, [cowsQuery.data]);

  const stats = useMemo(() => {
    const records = breedingQuery.data ?? [];
    return {
      total: records.length,
      pregnant: records.filter((r) => r.outcome === "pregnant").length,
      pending: records.filter((r) => r.outcome === "pending").length,
      failed: records.filter((r) => r.outcome === "failed").length,
      calved: records.filter((r) => r.outcome === "calved").length,
    };
  }, [breedingQuery.data]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    recordMutation.mutate({
      cowId: Number(form.cowId),
      breedingDate: form.breedingDate,
      method: form.method,
      sireBreed: form.sireBreed || undefined,
      sireTag: form.sireTag || undefined,
      aiTechnicianName: form.aiTechnicianName || undefined,
      strawNumber: form.strawNumber || undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <Baby className="w-6 h-6 text-purple-700 dark:text-purple-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Breeding Records</h1>
              <p className="text-sm text-muted-foreground">Track AI, natural mating, pregnancy & calving</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="dairy-btn-primary gap-2">
                <Plus className="w-4 h-4" /> Record Breeding
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Breeding Event</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Cow *</Label>
                  <Select value={form.cowId} onValueChange={(v) => setForm({ ...form, cowId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select cow" /></SelectTrigger>
                    <SelectContent>
                      {(cowsQuery.data ?? []).filter((c) => c.gender === "female").map((cow) => (
                        <SelectItem key={cow.id} value={String(cow.id)}>
                          {cow.tagNumber}{cow.name ? ` — ${cow.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Breeding Date *</Label>
                    <Input type="date" value={form.breedingDate} onChange={(e) => setForm({ ...form, breedingDate: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Method *</Label>
                    <Select value={form.method} onValueChange={(v: any) => setForm({ ...form, method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="artificial_insemination">Artificial Insemination</SelectItem>
                        <SelectItem value="natural_mating">Natural Mating</SelectItem>
                        <SelectItem value="embryo_transfer">Embryo Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sire Breed</Label>
                    <Input placeholder="e.g., Holstein" value={form.sireBreed} onChange={(e) => setForm({ ...form, sireBreed: e.target.value })} />
                  </div>
                  <div>
                    <Label>Sire Tag</Label>
                    <Input placeholder="Bull tag #" value={form.sireTag} onChange={(e) => setForm({ ...form, sireTag: e.target.value })} />
                  </div>
                </div>
                {form.method === "artificial_insemination" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>AI Technician</Label>
                      <Input placeholder="Technician name" value={form.aiTechnicianName} onChange={(e) => setForm({ ...form, aiTechnicianName: e.target.value })} />
                    </div>
                    <div>
                      <Label>Straw Number</Label>
                      <Input placeholder="Semen straw #" value={form.strawNumber} onChange={(e) => setForm({ ...form, strawNumber: e.target.value })} />
                    </div>
                  </div>
                )}
                <div>
                  <Label>Notes</Label>
                  <Textarea placeholder="Observations..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <Button type="submit" className="w-full dairy-btn-primary" disabled={recordMutation.isPending}>
                  {recordMutation.isPending ? "Recording..." : "Record Breeding"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Calendar, color: "text-foreground" },
            { label: "Pregnant", value: stats.pregnant, icon: Baby, color: "text-purple-600" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600" },
            { label: "Calved", value: stats.calved, icon: CheckCircle, color: "text-emerald-600" },
            { label: "Failed", value: stats.failed, icon: X, color: "text-red-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="dairy-card">
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Records table */}
        <Card className="dairy-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cow</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Sire</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Expected Calving</TableHead>
                  <TableHead>Pregnancy Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breedingQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : (breedingQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No breeding records. Click "Record Breeding" to add one.
                    </TableCell>
                  </TableRow>
                ) : (breedingQuery.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.breedingDate}</TableCell>
                    <TableCell className="font-mono text-teal-700 dark:text-teal-300 text-sm">
                      {cowMap.get(r.cowId) ?? `#${r.cowId}`}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{r.method.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-sm">
                      {r.sireBreed ? `${r.sireBreed}${r.sireTag ? ` (${r.sireTag})` : ""}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={OUTCOME_COLORS[r.outcome ?? "pending"]}>
                        {r.outcome ?? "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.expectedCalvingDate ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.pregnancyCheckDate ?? "—"}</TableCell>
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
