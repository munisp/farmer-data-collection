import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Store, ShieldCheck, Star, Phone, MapPin, Truck, Package,
  Syringe, Baby, Wheat
} from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: typeof Store; label: string; color: string }> = {
  feed: { icon: Wheat, label: "Animal Feed", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300" },
  vet_drugs: { icon: Syringe, label: "Vet Drugs", color: "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300" },
  breeding_services: { icon: Baby, label: "Breeding Services", color: "text-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-300" },
  equipment: { icon: Package, label: "Equipment", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300" },
};

function SupplierCard({ supplier }: { supplier: any }) {
  const config = TYPE_CONFIG[supplier.supplierType] ?? TYPE_CONFIG.equipment;
  const Icon = config.icon;

  return (
    <Card className="dairy-card hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">{supplier.businessName}</h3>
              <p className="text-xs text-muted-foreground capitalize">{config.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {supplier.verified && (
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1 text-xs">
                <ShieldCheck className="w-3 h-3" /> Verified
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {supplier.address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{supplier.address}</span>
            </div>
          )}
          {supplier.state && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{supplier.state}{supplier.lga ? `, ${supplier.lga}` : ""}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{supplier.phoneNumber}</span>
          </div>
          {supplier.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="font-medium text-foreground">{Number(supplier.rating).toFixed(1)}</span>
              <span className="text-xs">({supplier.reviewCount} reviews)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          {supplier.deliveryAvailable && (
            <Badge variant="outline" className="text-xs gap-1">
              <Truck className="w-3 h-3" /> Delivery
              {supplier.deliveryRadius ? ` (${supplier.deliveryRadius}km)` : ""}
            </Badge>
          )}
          {supplier.operatingHours && (
            <Badge variant="outline" className="text-xs">{supplier.operatingHours}</Badge>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="dairy-btn-primary flex-1">
            View Products
          </Button>
          <Button size="sm" variant="outline" className="flex-1">
            Contact
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DairySuppliers() {
  const [activeType, setActiveType] = useState<string>("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const suppliersQuery = trpc.dairy.getSuppliers.useQuery({
    type: (activeType || undefined) as any,
    verifiedOnly,
  }, { retry: false });

  const suppliers = suppliersQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <Store className="w-6 h-6 text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Supplier Marketplace</h1>
            <p className="text-sm text-muted-foreground">
              Verified providers of feed, vet drugs, and breeding services
            </p>
          </div>
        </div>

        {/* Category icons (SmartAlex style circular icons) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(TYPE_CONFIG).map(([key, { icon: CatIcon, label, color }]) => (
            <Card
              key={key}
              className={`dairy-card cursor-pointer transition-all ${activeType === key ? "ring-2 ring-teal-500 shadow-md" : "hover:shadow-sm"}`}
              onClick={() => setActiveType(activeType === key ? "" : key)}
            >
              <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${color}`}>
                  <CatIcon className="w-7 h-7" />
                </div>
                <span className="text-sm font-semibold text-foreground">{label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Button
            variant={verifiedOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            className={verifiedOnly ? "dairy-btn-primary gap-1" : "gap-1"}
          >
            <ShieldCheck className="w-4 h-4" /> Verified Only
          </Button>
          <span className="text-sm text-muted-foreground">
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} found
          </span>
        </div>

        {/* Supplier grid */}
        {suppliersQuery.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <Card className="dairy-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No suppliers found. Check back soon as more are verified.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map(s => <SupplierCard key={s.id} supplier={s} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
