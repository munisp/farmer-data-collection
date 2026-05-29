import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Smartphone, CreditCard, ArrowUpRight, ArrowDownLeft, History, Shield } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function MobileMoneyDashboard() {
  const { getCurrencySymbol } = useLocalization();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const accounts = trpc.mobileMoney.getAccounts.useQuery();
  const transactions = trpc.mobileMoney.getTransactions.useQuery({ limit: 20, offset: 0 });
  const stkPush = trpc.mobileMoney.initiateSTKPush.useMutation();

  const handleSTKPush = () => {
    if (!phoneNumber || !amount) return;
    stkPush.mutate({
      phoneNumber,
      amount: parseInt(amount),
      description: "Farm Platform Payment",
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Mobile Money</h1>
          <p className="text-muted-foreground">M-Pesa, MTN MoMo, Airtel Money payments</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Smartphone className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{accounts.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Linked Accounts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ArrowUpRight className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {transactions.data?.filter((t: Record<string, unknown>) => t.transactionType === "stk_push").length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Payments Made</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ArrowDownLeft className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {transactions.data?.filter((t: Record<string, unknown>) => t.transactionType === "disbursement").length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Disbursements</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pay">
          <TabsList>
            <TabsTrigger value="pay">Send Payment</TabsTrigger>
            <TabsTrigger value="accounts">My Accounts</TabsTrigger>
            <TabsTrigger value="history">Transaction History</TabsTrigger>
          </TabsList>

          <TabsContent value="pay">
            <Card>
              <CardHeader>
                <CardTitle>M-Pesa STK Push</CardTitle>
                <CardDescription>Send payment request to a phone number via Lipa Na M-Pesa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Phone Number</label>
                  <Input placeholder="254712345678" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Amount ({getCurrencySymbol()})</label>
                  <Input type="number" placeholder="1000" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <Button onClick={handleSTKPush} disabled={stkPush.isPending}>
                  {stkPush.isPending ? "Processing..." : "Send STK Push"}
                </Button>
                {stkPush.data && (
                  <div role="main" aria-label="Page content" className="p-3 bg-green-50 rounded-lg">
                    <p className="text-green-700">Payment initiated! Check your phone.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts">
            <Card>
              <CardHeader>
                <CardTitle>Linked Mobile Money Accounts</CardTitle>
              </CardHeader>
              <CardContent>
                {accounts.data && accounts.data.length > 0 ? (
                  <div className="space-y-3">
                    {accounts.data.map((acc: Record<string, unknown>) => (
                      <div key={acc.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Smartphone className="h-5 w-5" />
                          <div>
                            <p className="font-medium">{acc.phoneNumber as string}</p>
                            <p className="text-sm text-muted-foreground capitalize">{(acc.provider as string).replace("_", " ")}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {acc.isDefault === true && <Badge>Default</Badge>}
                          <Badge variant={acc.verified ? "default" : "secondary"}>
                            {acc.verified ? "Verified" : "Unverified"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No accounts linked yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                {transactions.data && transactions.data.length > 0 ? (
                  <div className="space-y-2">
                    {transactions.data.map((tx: Record<string, unknown>) => (
                      <div key={tx.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium capitalize">{(tx.transactionType as string).replace("_", " ")}</p>
                          <p className="text-sm text-muted-foreground">{tx.phoneNumber as string} — {tx.provider as string}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{tx.currency as string} {tx.amount as number}</p>
                          <Badge variant={tx.status === "completed" ? "default" : tx.status === "failed" ? "destructive" : "secondary"}>
                            {tx.status as string}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No transactions yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
