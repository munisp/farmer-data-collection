import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useDatabase } from "@/hooks/useDatabase";
import { livestock, farms } from "@/db/schema";
import { Plus, Loader2, Beef } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq } from "drizzle-orm";

interface Livestock {
  id: number;
  farmId: number;
  animalType: string;
  breed: string | null;
  quantity: number;
  purpose: string | null;
  acquisitionDate: Date;
  acquisitionCost: number | null;
  currentValue: number | null;
  healthStatus: string | null;
  notes: string | null;
  createdAt: Date;
}

interface Farm {
  id: number;
  farmName: string;
}

export default function LivestockPage() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [livestockList, setLivestockList] = useState<Livestock[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    farmId: "",
    animalType: "",
    breed: "",
    quantity: "",
    purpose: "",
    acquisitionDate: "",
    acquisitionCost: "",
    currentValue: "",
    healthStatus: "healthy",
    notes: "",
  });

  useEffect(() => {
    if (!isInitialized) return;
    fetchData();
  }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [livestockData, farmsData] = await Promise.all([
        db.select().from(livestock).where(eq(livestock.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
      ]);
      setLivestockList(livestockData as Livestock[]);
      setFarmsList(farmsData as Farm[]);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to load livestock");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.farmId || !formData.animalType || !formData.quantity || !formData.acquisitionDate) {
      toast.error("Farm, animal type, quantity, and acquisition date are required");
      return;
    }

    try {
      setSubmitting(true);
      if (!user) {
        toast.error("User not authenticated");
        return;
      }
      await db.insert(livestock).values({
        userId: user.id,
        farmId: parseInt(formData.farmId),
        animalType: formData.animalType,
        breed: formData.breed || null,
        quantity: parseInt(formData.quantity),
        purpose: formData.purpose || null,
        acquisitionDate: new Date(formData.acquisitionDate),
        acquisitionCost: formData.acquisitionCost ? Math.round(parseFloat(formData.acquisitionCost) * 100) : null,
        currentValue: formData.currentValue ? Math.round(parseFloat(formData.currentValue) * 100) : null,
        healthStatus: formData.healthStatus || "healthy",
        notes: formData.notes || null,
      });

      toast.success("Livestock added successfully");
      setOpen(false);
      setFormData({
        farmId: "",
        animalType: "",
        breed: "",
        quantity: "",
        purpose: "",
        acquisitionDate: "",
        acquisitionCost: "",
        currentValue: "",
        healthStatus: "healthy",
        notes: "",
      });
      fetchData();
    } catch (err) {
      console.error("Failed to add livestock:", err);
      toast.error("Failed to add livestock");
    } finally {
      setSubmitting(false);
    }
  };

  const getFarmName = (farmId: number) => {
    const farm = farmsList.find((f) => f.id === farmId);
    return farm ? farm.farmName : "Unknown";
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "-";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getHealthStatusColor = (status: string | null) => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "sick":
        return "bg-red-500";
      case "recovering":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  if (!isInitialized || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Livestock</h1>
            <p className="text-muted-foreground mt-2">Track and manage livestock records</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={farmsList.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Livestock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Livestock Record</DialogTitle>
                <DialogDescription>
                  Record new livestock on your farm
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="farmId">Farm *</Label>
                  <Select value={formData.farmId} onValueChange={(value) => setFormData({ ...formData, farmId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a farm" />
                    </SelectTrigger>
                    <SelectContent>
                      {farmsList.map((farm) => (
                        <SelectItem key={farm.id} value={farm.id.toString()}>
                          {farm.farmName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="animalType">Animal Type *</Label>
                    <Input
                      id="animalType"
                      value={formData.animalType}
                      onChange={(e) => setFormData({ ...formData, animalType: e.target.value })}
                      placeholder="e.g., Cattle, Goats, Poultry"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="breed">Breed</Label>
                    <Input
                      id="breed"
                      value={formData.breed}
                      onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purpose">Purpose</Label>
                    <Input
                      id="purpose"
                      value={formData.purpose}
                      onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      placeholder="e.g., Meat, Dairy, Eggs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acquisitionDate">Acquisition Date *</Label>
                  <Input
                    id="acquisitionDate"
                    type="date"
                    value={formData.acquisitionDate}
                    onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="acquisitionCost">Acquisition Cost ($)</Label>
                    <Input
                      id="acquisitionCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.acquisitionCost}
                      onChange={(e) => setFormData({ ...formData, acquisitionCost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentValue">Current Value ($)</Label>
                    <Input
                      id="currentValue"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.currentValue}
                      onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="healthStatus">Health Status</Label>
                  <Select value={formData.healthStatus} onValueChange={(value) => setFormData({ ...formData, healthStatus: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="healthy">Healthy</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="recovering">Recovering</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Beef className="w-4 h-4 mr-2" />
                        Add Livestock
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {farmsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farms Available</CardTitle>
              <CardDescription>
                You need to add farms before tracking livestock
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Farms section to add your first farm.
              </p>
            </CardContent>
          </Card>
        ) : livestockList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Livestock Recorded</CardTitle>
              <CardDescription>
                Get started by recording your first livestock
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the "Add Livestock" button above to start tracking livestock.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Livestock Records ({livestockList.length})</CardTitle>
              <CardDescription>View and manage all livestock records</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Animal Type</TableHead>
                    <TableHead>Farm</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Acquisition Cost</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Health Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {livestockList.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.animalType}
                        {item.breed && (
                          <span className="text-muted-foreground text-sm ml-1">
                            ({item.breed})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getFarmName(item.farmId)}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.purpose || "-"}</TableCell>
                      <TableCell>{formatCurrency(item.acquisitionCost)}</TableCell>
                      <TableCell>{formatCurrency(item.currentValue)}</TableCell>
                      <TableCell>
                        <Badge className={getHealthStatusColor(item.healthStatus)}>
                          {item.healthStatus || "unknown"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
