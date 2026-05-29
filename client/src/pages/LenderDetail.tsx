import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Phone, Mail, MapPin, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function LenderDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const lenderId = parseInt(id || "0", 10);

  const { data: lender, isLoading, error } = trpc.microfinance.getLenderById.useQuery(
    { lenderId },
    { enabled: !!lenderId }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading lender details...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !lender) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-semibold">Lender not found</p>
            <p className="text-muted-foreground mt-2">The lender you're looking for doesn't exist.</p>
            <Button onClick={() => setLocation("/microfinance")} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Microfinance
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const stats = lender.statistics;

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation("/microfinance")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{lender.name}</h1>
              <p className="text-muted-foreground">Lender Details & Statistics</p>
            </div>
          </div>
          <Badge variant={lender.isActive ? "default" : "secondary"}>
            {lender.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Loans</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLoans}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeLoans} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Disbursed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalDisbursed / 100)}</div>
              <p className="text-xs text-muted-foreground">
                All-time disbursements
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Loans</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedLoans}</div>
              <p className="text-xs text-muted-foreground">
                Successfully repaid
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Default Rate</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.defaultRate}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.defaultedLoans} defaulted loans
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lender Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Lender Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Lender Type</label>
                <p className="text-base capitalize">{lender.type.replace(/_/g, " ")}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Contact Person</label>
                <p className="text-base">{lender.contactPerson || "N/A"}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Phone</label>
                  <p className="text-base">{lender.phoneNumber || "N/A"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-base">{lender.email || "N/A"}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Address</label>
                <p className="text-base">{lender.address || "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loan Products */}
        <Card>
          <CardHeader>
            <CardTitle>Loan Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Interest Rate</label>
                  <p className="text-2xl font-bold text-primary">
                    {lender.interestRateRange || "Contact for rates"}
                  </p>
                  <p className="text-xs text-muted-foreground">per annum</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Loan Range</label>
                  <p className="text-lg font-semibold">
                    {formatCurrency((lender.minLoanAmount || 0) / 100)} - {formatCurrency((lender.maxLoanAmount || 0) / 100)}
                  </p>
                  <p className="text-xs text-muted-foreground">minimum - maximum</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Repayment Terms</label>
                  <p className="text-lg font-semibold">
                    Flexible terms available
                  </p>
                  <p className="text-xs text-muted-foreground">Contact lender for details</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Application Requirements */}
        <Card>
          <CardHeader>
            <CardTitle>Application Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                To apply for a loan from {lender.name}, you'll need:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Valid identification (National ID, Voter's Card, or Driver's License)</li>
                <li>Proof of farm ownership or lease agreement</li>
                <li>Bank account details for disbursement</li>
                <li>Guarantor information (name and contact details)</li>
                <li>Detailed loan purpose and business plan</li>
                {lender.type === "bank" && (
                  <li>Credit history and financial statements</li>
                )}
                {lender.minLoanAmount && lender.minLoanAmount > 100000 && (
                  <li>Collateral documentation for loans above ₦1,000</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Apply Button */}
        <div className="flex justify-center">
          <Button size="lg" onClick={() => setLocation("/microfinance")}>
            Apply for Loan from {lender.name}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
