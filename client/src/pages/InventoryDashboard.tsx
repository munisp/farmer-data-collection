import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, Users, TrendingDown, DollarSign, Plus, Edit, Trash2, AlertTriangle, Clock, ClipboardCheck, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function InventoryDashboard() {
  const [activeTab, setActiveTab] = useState("items");
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const { formatCurrency, getCurrencySymbol } = useLocalization();

  // Queries
  const { data: stats, refetch: refetchStats } = trpc.inventory.getInventoryStats.useQuery();
  const { data: items, refetch: refetchItems } = trpc.inventory.getInventoryItems.useQuery();
  const { data: suppliers, refetch: refetchSuppliers } = trpc.inventory.getSuppliers.useQuery();
  const { data: transactions, refetch: refetchTransactions } = trpc.inventory.getInventoryTransactions.useQuery({});
  const { data: lowStockItems } = trpc.inventory.getLowStockItems.useQuery();
  const { data: valuation } = trpc.inventory.getInventoryValuation.useQuery();
  const { data: expiringItems } = trpc.inventoryEnhancements.getExpiringItems.useQuery({ daysAhead: 30 });
  const { data: expiredItems } = trpc.inventoryEnhancements.getExpiredItems.useQuery();
  const { data: demandForecast } = trpc.inventoryEnhancements.getDemandForecast.useQuery();
  const stockTakeMutation = trpc.inventoryEnhancements.recordStockTake.useMutation({
    onSuccess: () => { toast.success("Stock take recorded"); refetchItems(); refetchStats(); },
    onError: (err) => toast.error(err.message),
  });

  // Mutations
  const createItem = trpc.inventory.createInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("Inventory item created successfully");
      refetchItems();
      refetchStats();
      setIsItemDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateItem = trpc.inventory.updateInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("Inventory item updated successfully");
      refetchItems();
      refetchStats();
      setIsItemDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteItem = trpc.inventory.deleteInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("Inventory item deleted successfully");
      refetchItems();
      refetchStats();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createSupplier = trpc.inventory.createSupplier.useMutation({
    onSuccess: () => {
      toast.success("Supplier created successfully");
      refetchSuppliers();
      refetchStats();
      setIsSupplierDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateSupplier = trpc.inventory.updateSupplier.useMutation({
    onSuccess: () => {
      toast.success("Supplier updated successfully");
      refetchSuppliers();
      refetchStats();
      setIsSupplierDialogOpen(false);
      setSelectedSupplier(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteSupplier = trpc.inventory.deleteSupplier.useMutation({
    onSuccess: () => {
      toast.success("Supplier deleted successfully");
      refetchSuppliers();
      refetchStats();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createTransaction = trpc.inventory.createInventoryTransaction.useMutation({
    onSuccess: () => {
      toast.success("Transaction recorded successfully");
      refetchTransactions();
      refetchItems();
      refetchStats();
      setIsTransactionDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Form handlers
  const handleItemSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data: any = {
      itemType: formData.get("itemType") as string,
      itemName: formData.get("itemName") as string,
      category: formData.get("category") as string || undefined,
      unit: formData.get("unit") as string,
      quantityOnHand: parseInt(formData.get("quantityOnHand") as string) || 0,
      reorderLevel: parseInt(formData.get("reorderLevel") as string) || 0,
      unitCost: parseFloat(formData.get("unitCost") as string),
      supplierId: formData.get("supplierId") ? parseInt(formData.get("supplierId") as string) : undefined,
      storageLocation: formData.get("storageLocation") as string || undefined,
      expiryDate: formData.get("expiryDate") as string || undefined,
      batchNumber: formData.get("batchNumber") as string || undefined,
    };

    if (selectedItem) {
      updateItem.mutate({ id: selectedItem.item.id, ...data });
    } else {
      createItem.mutate(data);
    }
  };

  const handleSupplierSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      name: formData.get("name") as string,
      contactPerson: formData.get("contactPerson") as string || undefined,
      phoneNumber: formData.get("phoneNumber") as string || undefined,
      email: formData.get("email") as string || undefined,
      address: formData.get("address") as string || undefined,
      paymentTerms: formData.get("paymentTerms") as string || undefined,
      rating: formData.get("rating") ? parseInt(formData.get("rating") as string) : undefined,
    };

    if (selectedSupplier) {
      updateSupplier.mutate({ id: selectedSupplier.id, ...data });
    } else {
      createSupplier.mutate(data);
    }
  };

  const handleTransactionSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      itemId: parseInt(formData.get("itemId") as string),
      transactionType: formData.get("transactionType") as "purchase" | "usage" | "adjustment" | "transfer",
      quantity: parseInt(formData.get("quantity") as string),
      unitCost: formData.get("unitCost") ? parseFloat(formData.get("unitCost") as string) : undefined,
      transactionDate: formData.get("transactionDate") as string,
      reference: formData.get("reference") as string || undefined,
      notes: formData.get("notes") as string || undefined,
    };

    createTransaction.mutate(data);
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">Track stock levels, manage suppliers, and monitor inventory value</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalItems || 0}</div>
              <p className="text-xs text-muted-foreground">In inventory</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.inventoryValue || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Total value</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.lowStockItems || 0}</div>
              <p className="text-xs text-muted-foreground">Need reorder</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeSuppliers || 0}</div>
              <p className="text-xs text-muted-foreground">Suppliers</p>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert */}
        {lowStockItems && lowStockItems.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Low Stock Alert
              </CardTitle>
              <CardDescription>The following items need to be reordered</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lowStockItems.map((item) => (
                  <div key={item.item.id} className="flex justify-between items-center p-2 bg-destructive/10 rounded">
                    <div>
                      <p className="font-medium">{item.item.itemName}</p>
                      <p className="text-sm text-muted-foreground">
                        Current: {item.item.quantityOnHand} {item.item.unit} | Reorder at: {item.item.reorderLevel} {item.item.unit}
                      </p>
                    </div>
                    {item.supplier && (
                      <Badge variant="outline">{item.supplier.name}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="items">Inventory Items</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="expiry">Expiry Alerts</TabsTrigger>
            <TabsTrigger value="demand">Demand Forecast</TabsTrigger>
          </TabsList>

          {/* Inventory Items Tab */}
          <TabsContent value="items" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Inventory Items</h2>
              <div className="flex gap-2">
                <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <TrendingDown className="mr-2 h-4 w-4" />
                      Record Transaction
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Inventory Transaction</DialogTitle>
                      <DialogDescription>Add purchase, usage, or adjustment</DialogDescription>
                    </DialogHeader>
                    <form aria-label="Submit form" onSubmit={handleTransactionSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="itemId">Item</Label>
                        <Select name="itemId" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items?.map((item) => (
                              <SelectItem key={item.item.id} value={item.item.id.toString()}>
                                {item.item.itemName} ({item.item.quantityOnHand} {item.item.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="transactionType">Transaction Type</Label>
                        <Select name="transactionType" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="purchase">Purchase</SelectItem>
                            <SelectItem value="usage">Usage</SelectItem>
                            <SelectItem value="adjustment">Adjustment</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="quantity">Quantity (use negative for usage)</Label>
                        <Input
                          id="quantity"
                          name="quantity"
                          type="number"
                          required
                          placeholder="e.g., 100 for purchase, -50 for usage"
                        />
                      </div>
                      <div>
                        <Label htmlFor="unitCost">Unit Cost ($, optional)</Label>
                        <Input
                          id="unitCost"
                          name="unitCost"
                          type="number"
                          step="0.01"
                          placeholder="Leave blank to use item's unit cost"
                        />
                      </div>
                      <div>
                        <Label htmlFor="transactionDate">Transaction Date</Label>
                        <Input
                          id="transactionDate"
                          name="transactionDate"
                          type="date"
                          required
                          defaultValue={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div>
                        <Label htmlFor="reference">Reference (optional)</Label>
                        <Input
                          id="reference"
                          name="reference"
                          placeholder="PO #, Invoice #, etc."
                        />
                      </div>
                      <div>
                        <Label htmlFor="notes">Notes (optional)</Label>
                        <Input
                          id="notes"
                          name="notes"
                          placeholder="Additional notes"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit">Record</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setSelectedItem(null)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{selectedItem ? "Edit Item" : "Add New Item"}</DialogTitle>
                      <DialogDescription>
                        {selectedItem ? "Update item information" : "Enter item details"}
                      </DialogDescription>
                    </DialogHeader>
                    <form aria-label="Submit form" onSubmit={handleItemSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="itemType">Item Type</Label>
                          <Select name="itemType" required defaultValue={selectedItem?.item.itemType}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seed">Seed</SelectItem>
                              <SelectItem value="fertilizer">Fertilizer</SelectItem>
                              <SelectItem value="pesticide">Pesticide</SelectItem>
                              <SelectItem value="equipment">Equipment</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="itemName">Item Name</Label>
                          <Input
                            id="itemName"
                            name="itemName"
                            defaultValue={selectedItem?.item.itemName}
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="category">Category (optional)</Label>
                          <Input
                            id="category"
                            name="category"
                            defaultValue={selectedItem?.item.category}
                            placeholder="e.g., Organic, Hybrid"
                          />
                        </div>
                        <div>
                          <Label htmlFor="unit">Unit</Label>
                          <Input
                            id="unit"
                            name="unit"
                            defaultValue={selectedItem?.item.unit}
                            placeholder="kg, liters, bags, pieces"
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="quantityOnHand">Quantity on Hand</Label>
                          <Input
                            id="quantityOnHand"
                            name="quantityOnHand"
                            type="number"
                            defaultValue={selectedItem?.item.quantityOnHand || 0}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="reorderLevel">Reorder Level</Label>
                          <Input
                            id="reorderLevel"
                            name="reorderLevel"
                            type="number"
                            defaultValue={selectedItem?.item.reorderLevel || 0}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="unitCost">Unit Cost ($)</Label>
                          <Input
                            id="unitCost"
                            name="unitCost"
                            type="number"
                            step="0.01"
                            defaultValue={selectedItem?.item.unitCost ? (selectedItem.item.unitCost / 100).toFixed(2) : ""}
                            required
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="supplierId">Supplier (optional)</Label>
                          <Select name="supplierId" defaultValue={selectedItem?.item.supplierId?.toString()}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select supplier" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {suppliers?.map((supplier) => (
                                <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                  {supplier.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="storageLocation">Storage Location (optional)</Label>
                          <Input
                            id="storageLocation"
                            name="storageLocation"
                            defaultValue={selectedItem?.item.storageLocation}
                            placeholder="Warehouse A, Shelf 3"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="expiryDate">Expiry Date (optional)</Label>
                          <Input
                            id="expiryDate"
                            name="expiryDate"
                            type="date"
                            defaultValue={selectedItem?.item.expiryDate ? format(new Date(selectedItem.item.expiryDate), "yyyy-MM-dd") : ""}
                          />
                        </div>
                        <div>
                          <Label htmlFor="batchNumber">Batch Number (optional)</Label>
                          <Input
                            id="batchNumber"
                            name="batchNumber"
                            defaultValue={selectedItem?.item.batchNumber}
                            placeholder="BATCH-2024-001"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          {selectedItem ? "Update" : "Create"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Total Value</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items?.map((item) => {
                      const isLowStock = item.item.quantityOnHand < item.item.reorderLevel;
                      const totalValue = (item.item.quantityOnHand * item.item.unitCost) / 100;
                      
                      return (
                        <TableRow key={item.item.id}>
                          <TableCell className="font-medium">{item.item.itemName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.item.itemType}</Badge>
                          </TableCell>
                          <TableCell>
                            {item.item.quantityOnHand} {item.item.unit}
                          </TableCell>
                                                    <TableCell>{formatCurrency(item.item.unitCost / 100)}</TableCell>
                                                    <TableCell>{formatCurrency(totalValue)}</TableCell>
                          <TableCell>{item.supplier?.name || "-"}</TableCell>
                          <TableCell>
                            {isLowStock ? (
                              <Badge variant="destructive">Low Stock</Badge>
                            ) : (
                              <Badge variant="default">In Stock</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setIsItemDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this item?")) {
                                    deleteItem.mutate({ id: item.item.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!items || items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No inventory items found. Add your first item to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Suppliers Tab */}
          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Suppliers</h2>
              <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setSelectedSupplier(null)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Supplier
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{selectedSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
                    <DialogDescription>
                      {selectedSupplier ? "Update supplier information" : "Enter supplier details"}
                    </DialogDescription>
                  </DialogHeader>
                  <form aria-label="Submit form" onSubmit={handleSupplierSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Supplier Name</Label>
                      <Input
                        id="name"
                        name="name"
                        defaultValue={selectedSupplier?.name}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="contactPerson">Contact Person (optional)</Label>
                      <Input
                        id="contactPerson"
                        name="contactPerson"
                        defaultValue={selectedSupplier?.contactPerson}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="phoneNumber">Phone (optional)</Label>
                        <Input
                          id="phoneNumber"
                          name="phoneNumber"
                          defaultValue={selectedSupplier?.phoneNumber}
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email (optional)</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          defaultValue={selectedSupplier?.email}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="address">Address (optional)</Label>
                      <Input
                        id="address"
                        name="address"
                        defaultValue={selectedSupplier?.address}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="paymentTerms">Payment Terms (optional)</Label>
                        <Input
                          id="paymentTerms"
                          name="paymentTerms"
                          defaultValue={selectedSupplier?.paymentTerms}
                          placeholder="Net 30, COD"
                        />
                      </div>
                      <div>
                        <Label htmlFor="rating">Rating (1-5, optional)</Label>
                        <Input
                          id="rating"
                          name="rating"
                          type="number"
                          min="1"
                          max="5"
                          defaultValue={selectedSupplier?.rating}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsSupplierDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">
                        {selectedSupplier ? "Update" : "Create"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Payment Terms</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers?.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>{supplier.contactPerson || "-"}</TableCell>
                        <TableCell>{supplier.phoneNumber || "-"}</TableCell>
                        <TableCell>{supplier.email || "-"}</TableCell>
                        <TableCell>{supplier.paymentTerms || "-"}</TableCell>
                        <TableCell>
                          {supplier.rating ? `${"⭐".repeat(supplier.rating)}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={supplier.isActive ? "default" : "secondary"}>
                            {supplier.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedSupplier(supplier);
                                setIsSupplierDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this supplier?")) {
                                  deleteSupplier.mutate({ id: supplier.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!suppliers || suppliers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No suppliers found. Add your first supplier to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="space-y-4">
            <h2 className="text-xl font-semibold">Transaction History</h2>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.map((txn) => (
                      <TableRow key={txn.transaction.id}>
                        <TableCell>
                          {format(new Date(txn.transaction.transactionDate), "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell className="font-medium">{txn.item.itemName}</TableCell>
                        <TableCell>
                          <Badge variant={
                            txn.transaction.transactionType === "purchase" ? "default" :
                            txn.transaction.transactionType === "usage" ? "secondary" :
                            "outline"
                          }>
                            {txn.transaction.transactionType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {txn.transaction.quantity > 0 ? "+" : ""}
                          {txn.transaction.quantity} {txn.item.unit}
                        </TableCell>
                        <TableCell>
                          {txn.transaction.unitCost ? formatCurrency(txn.transaction.unitCost / 100) : "-"}
                        </TableCell>
                        <TableCell>
                          {txn.transaction.totalCost ? formatCurrency(txn.transaction.totalCost / 100) : "-"}
                        </TableCell>
                        <TableCell>{txn.transaction.reference || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate">{txn.transaction.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {!transactions || transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No transactions found. Record transactions to track inventory movements.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <h2 className="text-xl font-semibold">Inventory Analytics</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Inventory Valuation by Type</CardTitle>
                  <CardDescription>Total value and quantity by item type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {valuation?.map((val) => (
                      <div key={val.itemType} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium capitalize">{val.itemType}</span>
                          <span className="text-sm text-muted-foreground">
                            {val.itemCount} items
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold">{formatCurrency(val.totalValue)}</span>
                          <span className="text-sm text-muted-foreground">
                            {val.totalQuantity} units
                          </span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${(val.totalValue / (stats?.inventoryValue || 1)) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {!valuation || valuation.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No data available. Add inventory items to see analytics.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory Summary</CardTitle>
                  <CardDescription>Key metrics and insights</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded">
                    <span className="text-sm font-medium">Total Items</span>
                    <span className="text-lg font-bold">{stats?.totalItems || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded">
                    <span className="text-sm font-medium">Total Value</span>
                    <span className="text-lg font-bold">{formatCurrency(stats?.inventoryValue || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-destructive/10 rounded">
                    <span className="text-sm font-medium">Low Stock Items</span>
                    <span className="text-lg font-bold text-destructive">{stats?.lowStockItems || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded">
                    <span className="text-sm font-medium">Active Suppliers</span>
                    <span className="text-lg font-bold">{stats?.activeSuppliers || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded">
                    <span className="text-sm font-medium">Total Transactions</span>
                    <span className="text-lg font-bold">{transactions?.length || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Expiry Alerts Tab */}
          <TabsContent value="expiry" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-yellow-600" />Expiring Soon (30 days)</CardTitle>
                  <CardDescription>{expiringItems?.length || 0} items expiring within 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {!expiringItems || expiringItems.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No items expiring soon</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Expiry</TableHead><TableHead>Days Left</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {expiringItems.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell>{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}</TableCell>
                            <TableCell><Badge className={item.daysUntilExpiry <= 7 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>{item.daysUntilExpiry}d</Badge></TableCell>
                            <TableCell>{item.quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-600" />Expired Items</CardTitle>
                  <CardDescription>{expiredItems?.length || 0} items past expiry date</CardDescription>
                </CardHeader>
                <CardContent>
                  {!expiredItems || expiredItems.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No expired items</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Expired On</TableHead><TableHead>Days Ago</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {expiredItems.map((item: any) => (
                          <TableRow key={item.id} className="bg-red-50">
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell>{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}</TableCell>
                            <TableCell><Badge className="bg-red-100 text-red-800">{item.daysExpired}d ago</Badge></TableCell>
                            <TableCell>{item.quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Demand Forecast Tab */}
          <TabsContent value="demand" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Demand Forecast & Reorder Alerts</CardTitle>
                <CardDescription>AI-powered demand prediction based on usage patterns</CardDescription>
              </CardHeader>
              <CardContent>
                {!demandForecast || demandForecast.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Not enough transaction data for forecasting</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Current Stock</TableHead><TableHead>Avg Daily Use</TableHead><TableHead>Days Until Stockout</TableHead><TableHead>Reorder Alert</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {demandForecast.map((item: any) => (
                        <TableRow key={item.itemId}>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell>{item.currentStock}</TableCell>
                          <TableCell>{item.avgDailyUsage.toFixed(1)}</TableCell>
                          <TableCell>
                            <Badge className={item.daysUntilStockout <= 7 ? 'bg-red-100 text-red-800' : item.daysUntilStockout <= 14 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}>
                              {item.daysUntilStockout === Infinity ? '∞' : item.daysUntilStockout.toFixed(0)} days
                            </Badge>
                          </TableCell>
                          <TableCell>{item.reorderAlert ? <Badge className="bg-red-100 text-red-800">Reorder Now</Badge> : <Badge className="bg-green-100 text-green-800">OK</Badge>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
