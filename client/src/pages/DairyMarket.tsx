import { useState } from "react";
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
  Truck, Factory, DollarSign, Phone, MapPin, Star,
  ShieldCheck, Calendar, Clock, Plus, ArrowRight, Package
} from "lucide-react";

const COLLECTION_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  in_transit: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  collected: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function ProcessorCard({ processor }: { processor: any }) {
  return (
    <Card className="dairy-card hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
              <Factory className="w-5 h-5 text-teal-700 dark:text-teal-300" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">{processor.businessName}</h3>
              <p className="text-xs text-muted-foreground capitalize">{processor.processorType}</p>
            </div>
          </div>
          {processor.verified && (
            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1 text-xs">
              <ShieldCheck className="w-3 h-3" /> Verified
            </Badge>
          )}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {processor.pricePerLiter && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-foreground">
                ₦{(processor.pricePerLiter / 100).toFixed(0)}/liter
              </span>
            </div>
          )}
          {processor.paymentTerms && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{processor.paymentTerms}</span>
            </div>
          )}
          {processor.minDailyVolume && (
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span>Min: {processor.minDailyVolume}L{processor.maxDailyVolume ? ` — Max: ${processor.maxDailyVolume}L` : ""}</span>
            </div>
          )}
          {processor.address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{processor.address}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{processor.phoneNumber}</span>
          </div>
          {processor.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="font-medium text-foreground">{Number(processor.rating).toFixed(1)}</span>
            </div>
          )}
        </div>

        {(processor.acceptedGrades as string[] | null)?.length ? (
          <div className="flex flex-wrap gap-1 mt-3">
            {(processor.acceptedGrades as string[]).map(g => (
              <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="dairy-btn-primary flex-1">
            Schedule Collection
          </Button>
          <Button size="sm" variant="outline" className="flex-1">Contact</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DairyMarket() {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState({
    farmId: "1",
    processorId: "",
    collectionDate: "",
    scheduledTime: "",
    estimatedLiters: "",
    notes: "",
  });

  const processorsQuery = trpc.dairy.getProcessors.useQuery({}, { retry: false });
  const collectionsQuery = trpc.dairy.getMilkCollections.useQuery({}, { retry: false });

  const scheduleMutation = trpc.dairy.scheduleMilkCollection.useMutation({
    onSuccess: () => {
      toast.success("Collection scheduled");
      setScheduleOpen(false);
      collectionsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    scheduleMutation.mutate({
      farmId: Number(form.farmId),
      processorId: Number(form.processorId),
      collectionDate: form.collectionDate,
      scheduledTime: form.scheduledTime || undefined,
      estimatedLiters: Number(form.estimatedLiters),
      notes: form.notes || undefined,
    });
  }

  const processors = processorsQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Truck className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Market & Processors</h1>
              <p className="text-sm text-muted-foreground">
                Direct connections to milk buyers for transparent pricing
              </p>
            </div>
          </div>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild>
              <Button className="dairy-btn-primary gap-2">
                <Plus className="w-4 h-4" /> Schedule Collection
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Schedule Milk Collection</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSchedule} className="space-y-4">
                <div>
                  <Label>Processor *</Label>
                  <Select value={form.processorId} onValueChange={(v) => setForm({ ...form, processorId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select buyer/processor" /></SelectTrigger>
                    <SelectContent>
                      {processors.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.businessName} — ₦{((p.pricePerLiter ?? 0) / 100).toFixed(0)}/L
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Collection Date *</Label>
                    <Input type="date" value={form.collectionDate} onChange={(e) => setForm({ ...form, collectionDate: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Estimated Volume (Liters) *</Label>
                  <Input type="number" step="0.1" placeholder="e.g., 50" value={form.estimatedLiters} onChange={(e) => setForm({ ...form, estimatedLiters: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full dairy-btn-primary" disabled={scheduleMutation.isPending}>
                  {scheduleMutation.isPending ? "Scheduling..." : "Schedule Collection"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="processors" className="space-y-4">
          <TabsList className="dairy-tabs">
            <TabsTrigger value="processors">Processors & Buyers</TabsTrigger>
            <TabsTrigger value="collections">My Collections</TabsTrigger>
          </TabsList>

          <TabsContent value="processors">
            {processorsQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading processors...</div>
            ) : processors.length === 0 ? (
              <Card className="dairy-card">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No processors registered yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {processors.map(p => <ProcessorCard key={p.id} processor={p} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="collections">
            <Card className="dairy-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Price/L</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionsQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : collections.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No collections scheduled. Connect with a processor to start selling milk.
                        </TableCell>
                      </TableRow>
                    ) : collections.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{c.collectionDate}</TableCell>
                        <TableCell className="text-sm">{c.scheduledTime ?? "—"}</TableCell>
                        <TableCell className="font-semibold">{c.totalLiters} L</TableCell>
                        <TableCell>₦{(c.pricePerLiter / 100).toFixed(0)}</TableCell>
                        <TableCell className="font-semibold text-emerald-700 dark:text-emerald-300">
                          ₦{(c.totalAmount / 100).toLocaleString()}
                        </TableCell>
                        <TableCell>{c.qualityGrade ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={COLLECTION_STATUS_COLORS[c.status] ?? ""}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={c.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-800" : ""}>
                            {c.paymentStatus ?? "pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
