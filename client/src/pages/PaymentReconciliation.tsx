import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { CreditCard, ArrowRightLeft, CheckCircle, AlertCircle, Clock, Wallet } from "lucide-react";

export default function PaymentReconciliation() {
  const { formatCurrency } = useLocalization();
  const [activeTab, setActiveTab] = useState("overview");

  const summary = {
    totalTransactions: 1_247,
    reconciled: 1_198,
    pending: 34,
    mismatched: 15,
    totalVolume: 45_890_000,
    stripeVolume: 18_250_000,
    mpesaVolume: 22_340_000,
    bankVolume: 5_300_000,
  };

  const recentTransactions = [
    { id: "TXN-001", order: "ORD-1001", amount: 85000, rail: "M-Pesa", status: "reconciled", date: "2025-05-27" },
    { id: "TXN-002", order: "ORD-1002", amount: 120000, rail: "Stripe", status: "reconciled", date: "2025-05-27" },
    { id: "TXN-003", order: "ORD-1003", amount: 45000, rail: "Bank Transfer", status: "pending", date: "2025-05-26" },
    { id: "TXN-004", order: "ORD-1004", amount: 950000, rail: "M-Pesa", status: "mismatched", date: "2025-05-26" },
    { id: "TXN-005", order: "ORD-1005", amount: 67500, rail: "Stripe", status: "reconciled", date: "2025-05-25" },
    { id: "TXN-006", order: "ORD-1006", amount: 230000, rail: "M-Pesa", status: "reconciled", date: "2025-05-25" },
    { id: "TXN-007", order: "ORD-1007", amount: 180000, rail: "Bank Transfer", status: "pending", date: "2025-05-24" },
    { id: "TXN-008", order: "ORD-1008", amount: 55000, rail: "Stripe", status: "reconciled", date: "2025-05-24" },
  ];

  const payouts = [
    { seller: "Adebayo Farming Co", amount: 425000, status: "completed", method: "Bank", date: "2025-05-27" },
    { seller: "Okonkwo Yam Farms", amount: 180000, status: "processing", method: "M-Pesa", date: "2025-05-26" },
    { seller: "Bello Rice Mill", amount: 890000, status: "completed", method: "Bank", date: "2025-05-25" },
    { seller: "Nnamdi Cocoa Estate", amount: 1_250_000, status: "pending", method: "Bank", date: "2025-05-24" },
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case "reconciled": case "completed": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />{status}</Badge>;
      case "pending": case "processing": return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="h-3 w-3 mr-1" aria-hidden="true" />{status}</Badge>;
      case "mismatched": return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><AlertCircle className="h-3 w-3 mr-1" aria-hidden="true" />{status}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 dark:bg-slate-900 min-h-screen" role="main" aria-label="Payment Reconciliation">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payment Reconciliation</h1>
          <p className="text-gray-500 dark:text-gray-400">TigerBeetle-powered multi-rail payment matching</p>
        </div>
        <Button variant="outline" className="mt-2 md:mt-0 dark:border-slate-600 dark:text-white" aria-label="Run reconciliation">
          <ArrowRightLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Run Reconciliation
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Reconciliation summary">
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Volume</p>
            <p className="text-2xl font-bold dark:text-white">{formatCurrency(summary.totalVolume)}</p>
            <p className="text-xs text-gray-400">{summary.totalTransactions} transactions</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Reconciled</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.reconciled}</p>
            <p className="text-xs text-gray-400">{((summary.reconciled / summary.totalTransactions) * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary.pending}</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Mismatched</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.mismatched}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Rails Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="region" aria-label="Payment rails">
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-purple-500" aria-hidden="true" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Stripe</p>
              <p className="text-xl font-bold dark:text-white">{formatCurrency(summary.stripeVolume)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-8 w-8 text-green-500" aria-hidden="true" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">M-Pesa</p>
              <p className="text-xl font-bold dark:text-white">{formatCurrency(summary.mpesaVolume)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowRightLeft className="h-8 w-8 text-blue-500" aria-hidden="true" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Bank Transfer</p>
              <p className="text-xl font-bold dark:text-white">{formatCurrency(summary.bankVolume)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="dark:bg-slate-800" aria-label="Transaction views">
          <TabsTrigger value="overview">Transactions</TabsTrigger>
          <TabsTrigger value="payouts">Seller Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table role="table" aria-label="Recent transactions" className="w-full">
                  <thead role="rowgroup">
                    <tr className="border-b dark:border-slate-600">
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">ID</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Order</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Amount</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Rail</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {recentTransactions.map((txn) => (
                      <tr key={txn.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="p-3 font-mono text-sm dark:text-gray-300">{txn.id}</td>
                        <td className="p-3 dark:text-gray-300">{txn.order}</td>
                        <td className="p-3 text-right font-medium dark:text-white">{formatCurrency(txn.amount)}</td>
                        <td className="p-3 dark:text-gray-300">{txn.rail}</td>
                        <td className="p-3">{statusBadge(txn.status)}</td>
                        <td className="p-3 text-sm dark:text-gray-400">{txn.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table role="table" aria-label="Seller payouts" className="w-full">
                  <thead role="rowgroup">
                    <tr className="border-b dark:border-slate-600">
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Seller</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Amount</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Method</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {payouts.map((p, i) => (
                      <tr key={i} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="p-3 font-medium dark:text-white">{p.seller}</td>
                        <td className="p-3 text-right font-bold dark:text-white">{formatCurrency(p.amount)}</td>
                        <td className="p-3 dark:text-gray-300">{p.method}</td>
                        <td className="p-3">{statusBadge(p.status)}</td>
                        <td className="p-3 text-sm dark:text-gray-400">{p.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
