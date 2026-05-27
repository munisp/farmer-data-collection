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
import { useDatabase } from "@/hooks/useDatabase";
import { farmInputs, farms, crops } from "@/db/schema";
import { Plus, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq } from "drizzle-orm";

interface FarmInput {
  id: number;
  farmId: number;
  cropId: number | null;
  inputType: string;
  inputName: string;
  quantity: string;
  unit: string;
  costPerUnit: number | null;
  totalCost: number | null;
  supplier: string | null;
  purchaseDate: Date;
  applicationDate: Date | null;
  notes: string | null;
  createdAt: Date;
}

interface Farm {
  id: number;
  farmName: string;
}

interface Crop {
  id: number;
  cropName: string;
}

export default function FarmInputs() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [inputsList, setInputsList] = useState<FarmInput[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [cropsList, setCropsList] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    farmId: "",
    cropId: "",
    inputType: "seed",
    inputName: "",
    quantity: "",
    unit: "",
    costPerUnit: "",
    totalCost: "",
    supplier: "",
    purchaseDate: "",
    applicationDate: "",
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
      const [inputsData, farmsData, cropsData] = await Promise.all([
        db.select().from(farmInputs).where(eq(farmInputs.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
        db.select({ id: crops.id, cropName: crops.cropName }).from(crops).where(eq(crops.userId, Number(user.id))),
      ]);
      setInputsList(inputsData as FarmInput[]);
      setFarmsList(farmsData as Farm[]);
      setCropsList(cropsData as Crop[]);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to load farm inputs");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.farmId || !formData.inputType || !formData.inputName || !formData.quantity || !formData.unit || !formData.purchaseDate) {
      toast.error("Farm, input type, name, quantity, unit, and purchase date are required");
      return;
    }

    try {
      setSubmitting(true);
      if (!user) {
        toast.error("User not authenticated");
        return;
      }
      await db.insert(farmInputs).values({
        userId: user.id,
        farmId: parseInt(formData.farmId),
        cropId: formData.cropId ? parseInt(formData.cropId) : null,
        inputType: formData.inputType,
        inputName: formData.inputName,
        quantity: formData.quantity,
        unit: formData.unit,
        costPerUnit: formData.costPerUnit ? Math.round(parseFloat(formData.costPerUnit) * 100) : null,
        totalCost: formData.totalCost ? Math.round(parseFloat(formData.totalCost) * 100) : null,
        supplier: formData.supplier || null,
        purchaseDate: new Date(formData.purchaseDate),
        applicationDate: formData.applicationDate ? new Date(formData.applicationDate) : null,
        notes: formData.notes || null,
      });

      toast.success("Farm input added successfully");
      setOpen(false);
      setFormData({
        farmId: "",
        cropId: "",
        inputType: "seed",
        inputName: "",
        quantity: "",
        unit: "",
        costPerUnit: "",
        totalCost: "",
        supplier: "",
        purchaseDate: "",
        applicationDate: "",
        notes: "",
      });
      fetchData();
    } catch (err) {
      console.error("Failed to add farm input:", err);
      toast.error("Failed to add farm input");
    } finally {
      setSubmitting(false);
    }
  };

  const getFarmName = (farmId: number) => {
    const farm = farmsList.find((f) => f.id === farmId);
    return farm ? farm.farmName : "Unknown";
  };

  const getCropName = (cropId: number | null) => {
    if (!cropId) return "-";
    const crop = cropsList.find((c) => c.id === cropId);
    return crop ? crop.cropName : "Unknown";
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "-";
    return `$${(cents / 100).toFixed(2)}`;
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
            <h1 className="text-3xl font-bold text-foreground">Farm Inputs</h1>
            <p className="text-muted-foreground mt-2">Track seeds, fertilizers, pesticides, and other inputs</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={farmsList.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Input
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Farm Input</DialogTitle>
                <DialogDescription>
                  Record a new farm input purchase or application
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

                <div className="space-y-2">
                  <Label htmlFor="cropId">Crop (Optional)</Label>
                  <Select value={formData.cropId} onValueChange={(value) => setFormData({ ...formData, cropId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a crop (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {cropsList.map((crop) => (
                        <SelectItem key={crop.id} value={crop.id.toString()}>
                          {crop.cropName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inputType">Input Type *</Label>
                    <Select value={formData.inputType} onValueChange={(value) => setFormData({ ...formData, inputType: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seed">Seed</SelectItem>
                        <SelectItem value="fertilizer">Fertilizer</SelectItem>
                        <SelectItem value="pesticide">Pesticide</SelectItem>
                        <SelectItem value="herbicide">Herbicide</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inputName">Input Name *</Label>
                    <Input
                      id="inputName"
                      value={formData.inputName}
                      onChange={(e) => setFormData({ ...formData, inputName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit *</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="e.g., kg, liters, bags"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="costPerUnit">Cost Per Unit ($)</Label>
                    <Input
                      id="costPerUnit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.costPerUnit}
                      onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalCost">Total Cost ($)</Label>
                    <Input
                      id="totalCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.totalCost}
                      onChange={(e) => setFormData({ ...formData, totalCost: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input
                    id="supplier"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchaseDate">Purchase Date *</Label>
                    <Input
                      id="purchaseDate"
                      type="date"
                      value={formData.purchaseDate}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="applicationDate">Application Date</Label>
                    <Input
                      id="applicationDate"
                      type="date"
                      value={formData.applicationDate}
                      onChange={(e) => setFormData({ ...formData, applicationDate: e.target.value })}
                    />
                  </div>
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
                        <Package className="w-4 h-4 mr-2" />
                        Add Input
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
                You need to add farms before tracking inputs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Farms section to add your first farm.
              </p>
            </CardContent>
          </Card>
        ) : inputsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farm Inputs Recorded</CardTitle>
              <CardDescription>
                Get started by recording your first farm input
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the "Add Input" button above to start tracking farm inputs.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Farm Input Records ({inputsList.length})</CardTitle>
              <CardDescription>View and manage all farm input records</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Input Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Farm</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Purchase Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inputsList.map((input) => (
                    <TableRow key={input.id}>
                      <TableCell className="font-medium">{input.inputName}</TableCell>
                      <TableCell className="capitalize">{input.inputType}</TableCell>
                      <TableCell>{getFarmName(input.farmId)}</TableCell>
                      <TableCell>{getCropName(input.cropId)}</TableCell>
                      <TableCell>
                        {input.quantity} {input.unit}
                      </TableCell>
                      <TableCell>{formatCurrency(input.totalCost)}</TableCell>
                      <TableCell>
                        {new Date(input.purchaseDate).toLocaleDateString()}
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
