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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Beef, Plus, Search, Heart, Baby, Activity, Milk, AlertTriangle,
  Edit, Scale, Calendar, Tag
} from "lucide-react";

const BREEDS = [
  "Holstein-Friesian", "Jersey", "Brown Swiss", "Ayrshire", "Guernsey",
  "Sahiwal", "Gir", "Red Poll", "Ndama", "White Fulani", "Sokoto Gudali",
  "Muturu", "Kuri", "Bunaji", "Keteku", "Crossbreed", "Other"
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  dry: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  pregnant: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  calving: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  sick: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  sold: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
  deceased: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function DairyHerd() {
  const [search, setSearch] = useState("");
  const [filterBreed, setFilterBreed] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    farmId: 1,
    tagNumber: "",
    name: "",
    breed: "",
    dateOfBirth: "",
    gender: "female" as "female" | "male",
    acquisitionMethod: "" as "" | "born_on_farm" | "purchased" | "gifted" | "inherited",
    acquisitionCost: "",
    sireTag: "",
    damTag: "",
    currentWeight: "",
    notes: "",
  });

  const cowsQuery = trpc.dairy.getCows.useQuery({
    status: filterStatus || undefined,
    breed: filterBreed || undefined,
  }, { retry: false });

  const registerMutation = trpc.dairy.registerCow.useMutation({
    onSuccess: () => {
      toast.success("Cow registered successfully");
      setDialogOpen(false);
      cowsQuery.refetch();
      setForm({ farmId: 1, tagNumber: "", name: "", breed: "", dateOfBirth: "", gender: "female", acquisitionMethod: "", acquisitionCost: "", sireTag: "", damTag: "", currentWeight: "", notes: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = (cowsQuery.data ?? []).filter((cow) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return cow.tagNumber.toLowerCase().includes(q)
      || (cow.name ?? "").toLowerCase().includes(q)
      || cow.breed.toLowerCase().includes(q);
  });

  const statusCounts = (cowsQuery.data ?? []).reduce((acc, cow) => {
    acc[cow.status] = (acc[cow.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    registerMutation.mutate({
      farmId: form.farmId,
      tagNumber: form.tagNumber,
      name: form.name || undefined,
      breed: form.breed,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: form.gender,
      acquisitionMethod: form.acquisitionMethod || undefined,
      acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
      sireTag: form.sireTag || undefined,
      damTag: form.damTag || undefined,
      currentWeight: form.currentWeight ? Number(form.currentWeight) : undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
              <Beef className="w-6 h-6 text-teal-700 dark:text-teal-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Herd Management</h1>
              <p className="text-sm text-muted-foreground">
                {cowsQuery.data?.length ?? 0} cows registered
              </p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="dairy-btn-primary gap-2">
                <Plus className="w-4 h-4" /> Register Cow
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Register New Cow</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tag Number *</Label>
                    <Input
                      placeholder="e.g., COW-001"
                      value={form.tagNumber}
                      onChange={(e) => setForm({ ...form, tagNumber: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input
                      placeholder="e.g., Bessie"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Breed *</Label>
                    <Select value={form.breed} onValueChange={(v) => setForm({ ...form, breed: v })}>
                      <SelectTrigger><SelectValue placeholder="Select breed" /></SelectTrigger>
                      <SelectContent>
                        {BREEDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Gender</Label>
                    <Select value={form.gender} onValueChange={(v: "female" | "male") => setForm({ ...form, gender: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female (Cow)</SelectItem>
                        <SelectItem value="male">Male (Bull)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date of Birth</Label>
                    <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input type="number" placeholder="e.g., 450" value={form.currentWeight} onChange={(e) => setForm({ ...form, currentWeight: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Acquisition</Label>
                    <Select value={form.acquisitionMethod} onValueChange={(v: any) => setForm({ ...form, acquisitionMethod: v })}>
                      <SelectTrigger><SelectValue placeholder="How acquired" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="born_on_farm">Born on Farm</SelectItem>
                        <SelectItem value="purchased">Purchased</SelectItem>
                        <SelectItem value="gifted">Gifted</SelectItem>
                        <SelectItem value="inherited">Inherited</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cost (₦)</Label>
                    <Input type="number" placeholder="Purchase cost" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sire Tag</Label>
                    <Input placeholder="Father's tag" value={form.sireTag} onChange={(e) => setForm({ ...form, sireTag: e.target.value })} />
                  </div>
                  <div>
                    <Label>Dam Tag</Label>
                    <Input placeholder="Mother's tag" value={form.damTag} onChange={(e) => setForm({ ...form, damTag: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <Button type="submit" className="w-full dairy-btn-primary" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? "Registering..." : "Register Cow"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Status summary pills */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Badge
              key={status}
              variant="outline"
              className={`${STATUS_COLORS[status] ?? ""} cursor-pointer`}
              onClick={() => setFilterStatus(filterStatus === status ? "" : status)}
            >
              {status}: {count}
            </Badge>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search by tag, name, or breed..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterBreed} onValueChange={setFilterBreed}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by breed" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Breeds</SelectItem>
              {BREEDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cow table */}
        <Card className="dairy-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Breed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lactation #</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>BCS</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cowsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading herd data...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No cows found. Register your first cow to get started.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((cow) => (
                  <TableRow key={cow.id} className="hover:bg-muted/50 cursor-pointer">
                    <TableCell className="font-mono font-semibold text-teal-700 dark:text-teal-300">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3 h-3" /> {cow.tagNumber}
                      </div>
                    </TableCell>
                    <TableCell>{cow.name || "—"}</TableCell>
                    <TableCell>{cow.breed}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[cow.status] ?? ""}>
                        {cow.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{cow.lactationNumber ?? 0}</TableCell>
                    <TableCell>{cow.currentWeight ? `${cow.currentWeight} kg` : "—"}</TableCell>
                    <TableCell>{cow.bodyConditionScore ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(cow.createdAt).toLocaleDateString()}
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
