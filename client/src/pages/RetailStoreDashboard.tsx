import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Store, Package, FileText, TrendingUp, Plus, ShoppingCart } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function RetailStoreDashboard() {
  const { toast } = useToast();
  const { formatCurrency } = useLocalization();
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({
    name: "", businessType: "grocery" as const, address: "", city: "",
    state: "", country: "Nigeria", contactPhone: "", contactEmail: "",
    paymentTerms: "cod" as const,
  });

  const myStores = trpc.retailStore.getMyStore.useQuery(undefined, {
    retry: false,
  });

  const registerMutation = trpc.retailStore.registerStore.useMutation({
    onSuccess: () => {
      toast({ title: "Store registered successfully" });
      setShowRegister(false);
      myStores.refetch();
    },
  });

  const handleRegister = () => {
    if (!form.name || !form.address || !form.city) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }
    registerMutation.mutate(form);
  };

  const stores = myStores.data || [];

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Store className="h-6 w-6" /> Retail Store Portal
            </h1>
            <p className="text-muted-foreground">Manage your retail store, standing orders, and bulk purchasing</p>
          </div>
          {stores.length === 0 && (
            <Button onClick={() => setShowRegister(true)}>
              <Plus className="h-4 w-4 mr-2" /> Register Store
            </Button>
          )}
        </div>

        {showRegister && (
          <Card>
            <CardHeader><CardTitle>Register Your Retail Store</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Store Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Business Type</Label>
                  <select className="w-full border rounded p-2" value={form.businessType}
                    onChange={e => setForm(f => ({ ...f, businessType: e.target.value as typeof form.businessType }))}>
                    <option value="supermarket">Supermarket</option>
                    <option value="grocery">Grocery Store</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="hotel">Hotel</option>
                    <option value="school">School</option>
                    <option value="hospital">Hospital</option>
                    <option value="wholesaler">Wholesaler</option>
                  </select>
                </div>
                <div>
                  <Label>Address *</Label>
                  <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div>
                  <Label>City *</Label>
                  <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <select className="w-full border rounded p-2" value={form.paymentTerms}
                    onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value as typeof form.paymentTerms }))}>
                    <option value="cod">Cash on Delivery</option>
                    <option value="net_7">Net 7 Days</option>
                    <option value="net_14">Net 14 Days</option>
                    <option value="net_30">Net 30 Days</option>
                    <option value="prepaid">Prepaid</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRegister} disabled={registerMutation.isPending}>Register</Button>
                <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {stores.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stores.map((store: { id: number; name: string; businessType: string; address: string | null; city: string | null; verified: boolean | null; tier: string | null; paymentTerms: string | null; creditLimit: number | null; creditUsed: number | null }) => (
              <Card key={store.id}>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg">{store.name}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{store.businessType}</p>
                  <p className="text-sm mt-1">{store.address}, {store.city}</p>
                  <div className="mt-3 flex gap-2 text-xs">
                    <span className={`px-2 py-1 rounded ${store.verified ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {store.verified ? "Verified" : "Pending Verification"}
                    </span>
                    <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 capitalize">{store.tier}</span>
                  </div>
                  <div className="mt-3 text-sm">
                    <p>Payment: <span className="font-medium uppercase">{store.paymentTerms}</span></p>
                    <p>Credit: {formatCurrency((store.creditLimit || 0) - (store.creditUsed || 0))} available</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => window.location.href = "/retail/standing-orders"}>
            <CardContent className="pt-6 flex items-center gap-3">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-semibold">Standing Orders</p>
                <p className="text-sm text-muted-foreground">Recurring supply</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md" onClick={() => window.location.href = "/retail/bulk-order"}>
            <CardContent className="pt-6 flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-semibold">Bulk Order</p>
                <p className="text-sm text-muted-foreground">Volume purchasing</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md" onClick={() => window.location.href = "/retail/invoices"}>
            <CardContent className="pt-6 flex items-center gap-3">
              <FileText className="h-8 w-8 text-orange-600" />
              <div>
                <p className="font-semibold">Invoices</p>
                <p className="text-sm text-muted-foreground">Payment tracking</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md" onClick={() => window.location.href = "/retail/demand"}>
            <CardContent className="pt-6 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-600" />
              <div>
                <p className="font-semibold">Market Demand</p>
                <p className="text-sm text-muted-foreground">What stores need</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
