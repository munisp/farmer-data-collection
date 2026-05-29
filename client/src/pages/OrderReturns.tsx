import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Package, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function OrderReturns() {
  const { toast } = useToast();
  const { formatCurrency } = useLocalization();
  const [tab, setTab] = useState<"buyer" | "seller">("buyer");
  const [showForm, setShowForm] = useState(false);
  const [returnForm, setReturnForm] = useState({
    orderId: 0, reason: "damaged" as const, description: "",
    returnMethod: "collection_point" as const,
  });

  const myReturns = trpc.orderFulfillment.getMyReturns.useQuery(undefined, { retry: false });
  const sellerReturns = trpc.orderFulfillment.getSellerReturns.useQuery(undefined, { retry: false });

  const requestReturn = trpc.orderFulfillment.requestReturn.useMutation({
    onSuccess: () => {
      toast({ title: "Return request submitted" });
      setShowForm(false);
      myReturns.refetch();
    },
  });

  const approveReturn = trpc.orderFulfillment.approveReturn.useMutation({
    onSuccess: () => {
      toast({ title: "Return approved" });
      sellerReturns.refetch();
    },
  });

  const statusColors: Record<string, string> = {
    requested: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    rejected: "bg-red-100 text-red-800",
    pickup_scheduled: "bg-purple-100 text-purple-800",
    received: "bg-indigo-100 text-indigo-800",
    refunded: "bg-green-100 text-green-800",
  };

  const statusIcons: Record<string, typeof Clock> = {
    requested: Clock,
    approved: CheckCircle,
    rejected: XCircle,
    refunded: CheckCircle,
  };

  const returns = tab === "buyer" ? (myReturns.data || []) : (sellerReturns.data || []);

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6" /> Returns & Refunds
          </h1>
          <div className="flex gap-2">
            <Button variant={tab === "buyer" ? "default" : "outline"} onClick={() => setTab("buyer")}>My Returns</Button>
            <Button variant={tab === "seller" ? "default" : "outline"} onClick={() => setTab("seller")}>Seller Returns</Button>
          </div>
        </div>

        {tab === "buyer" && (
          <Button onClick={() => setShowForm(true)}>
            <AlertTriangle className="h-4 w-4 mr-2" /> Request Return
          </Button>
        )}

        {showForm && (
          <Card>
            <CardHeader><CardTitle>Request a Return</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Order ID</Label>
                <Input type="number" value={returnForm.orderId || ""} onChange={e => setReturnForm(f => ({ ...f, orderId: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Reason</Label>
                <select className="w-full border rounded p-2" value={returnForm.reason}
                  onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value as typeof returnForm.reason }))}>
                  <option value="damaged">Damaged during delivery</option>
                  <option value="spoiled">Spoiled / Expired</option>
                  <option value="wrong_item">Wrong item received</option>
                  <option value="quality">Quality below expected</option>
                  <option value="not_as_described">Not as described</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={returnForm.description} onChange={e => setReturnForm(f => ({ ...f, description: e.target.value }))} placeholder="Explain the issue..." />
              </div>
              <div>
                <Label>Return Method</Label>
                <select className="w-full border rounded p-2" value={returnForm.returnMethod}
                  onChange={e => setReturnForm(f => ({ ...f, returnMethod: e.target.value as typeof returnForm.returnMethod }))}>
                  <option value="collection_point">Drop at Collection Point</option>
                  <option value="driver_pickup">Driver Pickup</option>
                  <option value="drop_off">Drop Off</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => requestReturn.mutate(returnForm)} disabled={requestReturn.isPending || !returnForm.orderId}>Submit</Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {returns.length === 0 ? (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">No returns found</CardContent></Card>
          ) : (
            returns.map((ret: { id: number; orderId: number; reason: string; description: string | null; status: string; refundAmount: number | null }) => {
              const Icon = statusIcons[ret.status] || Package;
              return (
                <Card key={ret.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" />
                        <div>
                          <p className="font-semibold">Order #{ret.orderId}</p>
                          <p className="text-sm text-muted-foreground capitalize">{ret.reason.replace("_", " ")}</p>
                          {ret.description && <p className="text-sm mt-1">{ret.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs capitalize ${statusColors[ret.status] || ""}`}>
                          {ret.status}
                        </span>
                        {ret.refundAmount && <span className="text-sm font-medium">{formatCurrency(ret.refundAmount)}</span>}
                      </div>
                    </div>
                    {tab === "seller" && ret.status === "requested" && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => approveReturn.mutate({ returnId: ret.id })}>Approve</Button>
                        <Button size="sm" variant="destructive">Reject</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
