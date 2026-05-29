import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Plus, CreditCard, Send, QrCode, History } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function BankingDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("accounts");
  
  // Bank Account Form State
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "checking" | "mobile_money">("savings");
  
  // Mojaloop Transfer Form State
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [toPartyId, setToPartyId] = useState("");
  const [toPartyIdType, setToPartyIdType] = useState<"MSISDN" | "ACCOUNT_ID" | "EMAIL">("MSISDN");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  
  // Payment Request Form State
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");

  // Queries
  const { data: accounts, isLoading: accountsLoading, refetch: refetchAccounts } = 
    trpc.banking.getBankAccounts.useQuery();
  
  const { data: transactions, isLoading: transactionsLoading } = 
    trpc.banking.getBankTransactions.useQuery({ limit: 20 });
  
  const { data: mojaloopTxs, isLoading: mojaloopLoading } = 
    trpc.banking.getMojaloopTransactions.useQuery({ limit: 20 });
  
  const { data: paymentRequests, isLoading: paymentsLoading } = 
    trpc.banking.getPaymentRequests.useQuery({ limit: 20 });

  // Mutations
  const createAccount = trpc.banking.createBankAccount.useMutation({
    onSuccess: () => {
      toast.success("Bank account added successfully");
      setAccountName("");
      setAccountNumber("");
      setBankName("");
      setAccountType("savings");
      refetchAccounts();
    },
    onError: (error) => {
      toast.error(`Failed to add account: ${error.message}`);
    },
  });

  const initiateMojaloopTransfer = trpc.banking.initiateMojaloopTransfer.useMutation({
    onSuccess: () => {
      toast.success("Mojaloop transfer initiated successfully");
      setToPartyId("");
      setTransferAmount("");
      setTransferDescription("");
    },
    onError: (error) => {
      toast.error(`Transfer failed: ${error.message}`);
    },
  });

  const createPaymentRequest = trpc.banking.createPaymentRequest.useMutation({
    onSuccess: () => {
      toast.success("Payment request created successfully");
      setPaymentAmount("");
      setPaymentDescription("");
    },
    onError: (error) => {
      toast.error(`Failed to create payment request: ${error.message}`);
    },
  });

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName || !accountNumber || !bankName) {
      toast.error("Please fill all required fields");
      return;
    }
    createAccount.mutate({
      accountName,
      accountNumber,
      bankName,
      accountType,
    });
  };

  const handleInitiateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !toPartyId || !transferAmount) {
      toast.error("Please fill all required fields");
      return;
    }
    initiateMojaloopTransfer.mutate({
      fromAccountId: selectedAccountId,
      toPartyId,
      toPartyIdType,
      amount: parseFloat(transferAmount),
      currency: "NGN",
      description: transferDescription,
    });
  };

  const handleCreatePaymentRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAccountId || !paymentAmount || !paymentDescription) {
      toast.error("Please fill all required fields");
      return;
    }
    createPaymentRequest.mutate({
      accountId: paymentAccountId,
      amount: parseFloat(paymentAmount),
      currency: "NGN",
      description: paymentDescription,
    });
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p>Please log in to access banking features.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Banking & Payments</h1>
          <p className="text-muted-foreground">
            Manage your bank accounts and Mojaloop payments
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="accounts">
              <CreditCard className="w-4 h-4 mr-2" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="transfer">
              <Send className="w-4 h-4 mr-2" />
              Transfer
            </TabsTrigger>
            <TabsTrigger value="payment-request">
              <QrCode className="w-4 h-4 mr-2" />
              Payment Request
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <History className="w-4 h-4 mr-2" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="mojaloop">
              <History className="w-4 h-4 mr-2" />
              Mojaloop
            </TabsTrigger>
          </TabsList>

          {/* Bank Accounts Tab */}
          <TabsContent value="accounts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Bank Account</CardTitle>
                <CardDescription>Link a new bank account or mobile money account</CardDescription>
              </CardHeader>
              <CardContent>
                <form aria-label="Submit form" onSubmit={handleCreateAccount} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accountName">Account Name *</Label>
                      <Input
                        id="accountName"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="My Savings Account"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountNumber">Account Number *</Label>
                      <Input
                        id="accountNumber"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="1234567890"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bankName">Bank Name *</Label>
                      <Input
                        id="bankName"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="First Bank"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accountType">Account Type</Label>
                      <Select value={accountType} onValueChange={(value: any) => setAccountType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="savings">Savings</SelectItem>
                          <SelectItem value="checking">Checking</SelectItem>
                          <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" disabled={createAccount.isPending}>
                    {createAccount.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Account
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My Bank Accounts</CardTitle>
                <CardDescription>View and manage your linked accounts</CardDescription>
              </CardHeader>
              <CardContent>
                {accountsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : accounts && accounts.length > 0 ? (
                  <div className="space-y-4">
                    {accounts.map((account) => (
                      <div key={account.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold">{account.accountName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {account.bankName} • {account.accountNumber}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Type: {account.accountType}
                            </p>
                          </div>
                          <div className="text-right">
                            {account.isVerified ? (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                Verified
                              </span>
                            ) : (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No bank accounts added yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mojaloop Transfer Tab */}
          <TabsContent value="transfer" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Send Money via Mojaloop</CardTitle>
                <CardDescription>Transfer money to any Mojaloop participant</CardDescription>
              </CardHeader>
              <CardContent>
                <form aria-label="Submit form" onSubmit={handleInitiateTransfer} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromAccount">From Account *</Label>
                    <Select 
                      value={selectedAccountId?.toString() || ""} 
                      onValueChange={(value) => setSelectedAccountId(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts?.map((account) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.accountName} - {account.accountNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="toPartyIdType">Recipient ID Type</Label>
                      <Select value={toPartyIdType} onValueChange={(value: any) => setToPartyIdType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MSISDN">Phone Number</SelectItem>
                          <SelectItem value="ACCOUNT_ID">Account ID</SelectItem>
                          <SelectItem value="EMAIL">Email</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="toPartyId">Recipient ID *</Label>
                      <Input
                        id="toPartyId"
                        value={toPartyId}
                        onChange={(e) => setToPartyId(e.target.value)}
                        placeholder="+2348012345678"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transferAmount">Amount (NGN) *</Label>
                    <Input
                      id="transferAmount"
                      type="number"
                      step="0.01"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="1000.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transferDescription">Description</Label>
                    <Input
                      id="transferDescription"
                      value={transferDescription}
                      onChange={(e) => setTransferDescription(e.target.value)}
                      placeholder="Payment for..."
                    />
                  </div>
                  <Button type="submit" disabled={initiateMojaloopTransfer.isPending}>
                    {initiateMojaloopTransfer.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Money
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Request Tab */}
          <TabsContent value="payment-request" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Payment Request</CardTitle>
                <CardDescription>Generate a payment request with QR code</CardDescription>
              </CardHeader>
              <CardContent>
                <form aria-label="Submit form" onSubmit={handleCreatePaymentRequest} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="paymentAccount">Receiving Account *</Label>
                    <Select 
                      value={paymentAccountId?.toString() || ""} 
                      onValueChange={(value) => setPaymentAccountId(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts?.map((account) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.accountName} - {account.accountNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">Amount (NGN) *</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="1000.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDescription">Description *</Label>
                    <Input
                      id="paymentDescription"
                      value={paymentDescription}
                      onChange={(e) => setPaymentDescription(e.target.value)}
                      placeholder="Payment for..."
                    />
                  </div>
                  <Button type="submit" disabled={createPaymentRequest.isPending}>
                    {createPaymentRequest.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4 mr-2" />
                        Create Request
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Requests</CardTitle>
                <CardDescription>View your payment requests</CardDescription>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : paymentRequests && paymentRequests.length > 0 ? (
                  <div className="space-y-4">
                    {paymentRequests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">
                              ₦{(request.amount / 100).toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.description}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(request.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            request.status === 'paid' 
                              ? 'bg-green-100 text-green-800'
                              : request.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {request.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No payment requests yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>View all your bank transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {transactionsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : transactions && transactions.length > 0 ? (
                  <div className="space-y-4">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">
                              {tx.transactionType === 'transfer_in' || tx.transactionType === 'refund' ? '+' : '-'}
                              ₦{(tx.amount / 100).toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {tx.description || tx.transactionType}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(tx.transactionDate).toLocaleString()}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            tx.status === 'completed' 
                              ? 'bg-green-100 text-green-800'
                              : tx.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No transactions yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mojaloop Transactions Tab */}
          <TabsContent value="mojaloop" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Mojaloop Transactions</CardTitle>
                <CardDescription>View your Mojaloop transfer history</CardDescription>
              </CardHeader>
              <CardContent>
                {mojaloopLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : mojaloopTxs && mojaloopTxs.length > 0 ? (
                  <div className="space-y-4">
                    {mojaloopTxs.map((tx) => (
                      <div key={tx.mojaloop?.id || tx.bank?.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">
                              ₦{((tx.bank?.amount || 0) / 100).toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {tx.mojaloop?.payeePartyId || 'N/A'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Transfer ID: {tx.mojaloop?.transferId || 'N/A'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tx.bank?.createdAt ? new Date(tx.bank.createdAt).toLocaleString() : 'N/A'}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            tx.mojaloop?.status === 'completed' 
                              ? 'bg-green-100 text-green-800'
                              : tx.mojaloop?.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {tx.mojaloop?.status || 'unknown'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No Mojaloop transactions yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
