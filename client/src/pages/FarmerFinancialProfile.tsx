import { Link, useParams } from "wouter";
import { trpc } from "../lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Landmark,
  ShoppingCart,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Package,
  Loader2,
} from "lucide-react";

type FinancialSummary = {
  creditScore: number;
  riskCategory: string;
  totalIncome: number;
  totalDebt: number;
  availableCredit: number;
  debtToIncomeRatio: number;
  onTimePayments: number;
  latePayments: number;
  totalLoans: number;
  activeLoans: number;
  totalRepaid: number;
  marketplaceSales: number;
  marketplacePurchases: number;
  exchangeVolume: number;
  collateralValue: number;
  totalExpenses: number;
};

type FinancialProfileResponse = {
  farmer: {
    id: number;
    userId: number;
    firstName: string;
    lastName: string;
    verificationStatus?: string | null;
    region?: string | null;
    district?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
    role?: string | null;
  };
  summary: FinancialSummary;
  loans: Array<{
    id: number;
    loanNumber?: string | null;
    amount: number;
    interestRate: number;
    status: string;
    dueDate?: string | Date | null;
    remainingBalance: number;
    purpose?: string | null;
    applicationDate?: string | Date | null;
  }>;
  marketplaceActivity: {
    totalSales: number;
    totalSalesCount: number;
    totalPurchases: number;
    totalPurchaseCount: number;
  };
  exchangeActivity: {
    openPositions: number;
    totalTrades: number;
    volume: number;
  };
  creditHistory: Array<{
    score: number;
    calculatedAt: string | Date;
    rating?: string | null;
  }>;
};

const currency = (amount?: number | null) => `₦${((amount || 0) / 100).toLocaleString()}`;
const formatDate = (value?: string | Date | null) => (value ? new Date(value).toLocaleDateString() : "-");

const getCreditScoreColor = (score: number) => {
  if (score >= 750) return "text-green-600";
  if (score >= 650) return "text-yellow-600";
  return "text-red-600";
};

const getCreditScoreLabel = (score: number) => {
  if (score >= 750) return "Excellent";
  if (score >= 700) return "Good";
  if (score >= 650) return "Fair";
  if (score >= 600) return "Poor";
  return "Very Poor";
};

const getRiskBadgeVariant = (riskCategory: string): "default" | "secondary" | "destructive" => {
  if (riskCategory === "low") return "default";
  if (riskCategory === "medium") return "secondary";
  return "destructive";
};

export default function FarmerFinancialProfile() {
  const { farmerId } = useParams<{ farmerId: string }>();
  const numericFarmerId = Number(farmerId || 0);

  const { data, isLoading, error } = trpc.microfinance.getFarmerFinancialProfile.useQuery(
    { farmerId: numericFarmerId },
    { enabled: Number.isFinite(numericFarmerId) && numericFarmerId > 0 }
  );

  const profile = data as FinancialProfileResponse | undefined;
  const summary = profile?.summary;
  const loans = profile?.loans ?? [];
  const marketplaceActivity = profile?.marketplaceActivity;
  const exchangeActivity = profile?.exchangeActivity;
  const farmer = profile?.farmer;
  const repaymentRate = summary && summary.onTimePayments + summary.latePayments > 0
    ? Math.round((summary.onTimePayments / (summary.onTimePayments + summary.latePayments)) * 100)
    : 0;

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="container mx-auto p-4">
        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading financial profile...
        </div>
      </div>
    );
  }

  if (error || !profile || !summary || !farmer) {
    return (
      <div className="container mx-auto p-4 space-y-4">
        <Link href="/farmers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Farmers
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Financial Profile Unavailable</CardTitle>
            <CardDescription>
              The live financial profile could not be loaded for this farmer.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {error?.message || "No live financial data was returned."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/farmers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Financial Profile</h1>
            <p className="text-muted-foreground">
              {farmer.firstName} {farmer.lastName} · Live financial overview across credit, marketplace, and exchange activity
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant={getRiskBadgeVariant(summary.riskCategory)}>
            {summary.riskCategory.toUpperCase()} RISK
          </Badge>
          <Badge variant="outline">{farmer.verificationStatus || "pending"}</Badge>
          <Link href={`/microfinance/borrower/${farmerId}`}>
            <Button variant="outline">Loan History</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Credit Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className={`text-5xl font-bold ${getCreditScoreColor(summary.creditScore)}`}>
                {summary.creditScore}
              </div>
              <Badge variant="outline" className="mt-2">
                {getCreditScoreLabel(summary.creditScore)}
              </Badge>
              <div className="w-full mt-4">
                <Progress value={(summary.creditScore / 850) * 100} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>300</span>
                  <span>850</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Financial Health Indicators</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{summary.onTimePayments}</div>
                <div className="text-xs text-muted-foreground">On-Time Payments</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{summary.latePayments}</div>
                <div className="text-xs text-muted-foreground">Late Payments</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{summary.debtToIncomeRatio}%</div>
                <div className="text-xs text-muted-foreground">Debt-to-Income</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{summary.totalLoans}</div>
                <div className="text-xs text-muted-foreground">Total Loans</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{currency(summary.totalIncome)}</div>
            <div className="text-xs text-muted-foreground">Marketplace-linked realized revenue</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Total Debt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{currency(summary.totalDebt)}</div>
            <div className="text-xs text-muted-foreground">Outstanding microfinance balance</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Available Credit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{currency(summary.availableCredit)}</div>
            <div className="text-xs text-muted-foreground">Derived live pre-approval capacity</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Collateral Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currency(summary.collateralValue)}</div>
            <div className="text-xs text-muted-foreground">Livestock and activity-backed coverage</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="loans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="loans"><Landmark className="h-4 w-4 mr-2" />Loans</TabsTrigger>
          <TabsTrigger value="marketplace"><ShoppingCart className="h-4 w-4 mr-2" />Marketplace</TabsTrigger>
          <TabsTrigger value="exchange"><BarChart3 className="h-4 w-4 mr-2" />Exchange</TabsTrigger>
          <TabsTrigger value="transactions"><Wallet className="h-4 w-4 mr-2" />Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="loans">
          <Card>
            <CardHeader>
              <CardTitle>Loan History</CardTitle>
              <CardDescription>Live microfinance loan and repayment indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Active Loans</div>
                  <div className="text-2xl font-bold">{summary.activeLoans}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Repaid</div>
                  <div className="text-2xl font-bold text-green-600">{currency(summary.totalRepaid)}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Repayment Rate</div>
                  <div className="text-2xl font-bold">{repaymentRate}%</div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan Number</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">No loan history</TableCell>
                    </TableRow>
                  ) : (
                    loans.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-mono">{loan.loanNumber || `#${loan.id}`}</TableCell>
                        <TableCell>{currency(loan.amount)}</TableCell>
                        <TableCell>{loan.interestRate.toFixed(2)}%</TableCell>
                        <TableCell>
                          <Badge variant={loan.status === "active" ? "default" : loan.status === "paid_off" ? "outline" : "secondary"}>
                            {loan.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(loan.dueDate)}</TableCell>
                        <TableCell>{currency(loan.remainingBalance)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace">
          <Card>
            <CardHeader>
              <CardTitle>Marketplace Activity</CardTitle>
              <CardDescription>Live seller and buyer totals derived from marketplace orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Sales</div>
                  <div className="text-2xl font-bold text-green-600">{currency(marketplaceActivity?.totalSales)}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Sales Orders</div>
                  <div className="text-2xl font-bold">{marketplaceActivity?.totalSalesCount || 0}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Purchases</div>
                  <div className="text-2xl font-bold text-blue-600">{currency(marketplaceActivity?.totalPurchases)}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Purchase Orders</div>
                  <div className="text-2xl font-bold">{marketplaceActivity?.totalPurchaseCount || 0}</div>
                </div>
              </div>
              <div className="text-center py-4 text-muted-foreground">
                <p>This marketplace summary is now backed by live order aggregates instead of placeholder analytics.</p>
                <Link href="/marketplace/my-sales">
                  <Button variant="outline" className="mt-2">View Sales History</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exchange">
          <Card>
            <CardHeader>
              <CardTitle>Exchange Activity</CardTitle>
              <CardDescription>Real commodity trading participation for this farmer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Trading Volume</div>
                  <div className="text-2xl font-bold">{currency(exchangeActivity?.volume)}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Open Positions</div>
                  <div className="text-2xl font-bold">{exchangeActivity?.openPositions || 0}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                  <div className="text-2xl font-bold">{exchangeActivity?.totalTrades || 0}</div>
                </div>
              </div>
              <div className="text-center py-4 text-muted-foreground">
                <p>The exchange section now reflects persisted trader orders and executed trade volume.</p>
                <Link href="/exchange/my-trades">
                  <Button variant="outline" className="mt-2">View Trade History</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Unified financial movement context using live income, debt, and expense totals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Income</div>
                  <div className="text-2xl font-bold text-green-600">{currency(summary.totalIncome)}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Expenses</div>
                  <div className="text-2xl font-bold text-red-600">{currency(summary.totalExpenses)}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Net Position</div>
                  <div className="text-2xl font-bold">{currency(summary.totalIncome - summary.totalExpenses - summary.totalDebt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk Assessment
          </CardTitle>
          <CardDescription>Automated live risk indicators based on the current financial profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {summary.debtToIncomeRatio < 30 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />}
              <div>
                <div className="font-medium">Debt-to-Income</div>
                <div className="text-sm text-muted-foreground">{summary.debtToIncomeRatio < 30 ? "Healthy" : "Monitor"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {summary.latePayments === 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />}
              <div>
                <div className="font-medium">Payment History</div>
                <div className="text-sm text-muted-foreground">{summary.latePayments === 0 ? "Excellent" : `${summary.latePayments} late`}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {summary.collateralValue > Math.max(summary.totalDebt, 1) * 1.5 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />}
              <div>
                <div className="font-medium">Collateral Coverage</div>
                <div className="text-sm text-muted-foreground">{summary.totalDebt > 0 ? `${Math.round((summary.collateralValue / summary.totalDebt) * 100)}%` : "N/A"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {summary.creditScore >= 650 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
              <div>
                <div className="font-medium">Credit Standing</div>
                <div className="text-sm text-muted-foreground">{getCreditScoreLabel(summary.creditScore)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
