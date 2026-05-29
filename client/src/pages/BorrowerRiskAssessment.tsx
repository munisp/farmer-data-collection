import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingDown, TrendingUp, Shield, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type RiskCategory = 'low' | 'medium' | 'high' | 'critical';

const getRiskColor = (category: RiskCategory) => {
  switch (category) {
    case 'low':
      return 'text-green-600 bg-green-100';
    case 'medium':
      return 'text-blue-600 bg-blue-100';
    case 'high':
      return 'text-orange-600 bg-orange-100';
    case 'critical':
      return 'text-red-600 bg-red-100';
  }
};

const getRiskIcon = (category: RiskCategory) => {
  switch (category) {
    case 'low':
      return <Shield className="h-4 w-4" />;
    case 'medium':
      return <TrendingUp className="h-4 w-4" />;
    case 'high':
      return <AlertCircle className="h-4 w-4" />;
    case 'critical':
      return <AlertTriangle className="h-4 w-4" />;
  }
};

const COLORS = {
  low: '#10b981',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

export default function BorrowerRiskAssessment() {
  const [selectedBorrower, setSelectedBorrower] = useState<number | null>(null);

  const { data: allProfiles, isLoading } = trpc.riskAssessment.getAllRiskProfiles.useQuery();

  // Calculate distribution
  const distribution = allProfiles?.reduce((acc, profile) => {
    acc[profile.riskCategory] = (acc[profile.riskCategory] || 0) + 1;
    return acc;
  }, {} as Record<RiskCategory, number>);

  const distributionData = distribution
    ? Object.entries(distribution).map(([category, count]) => ({
        category: category.charAt(0).toUpperCase() + category.slice(1),
        count,
      }))
    : [];

  const selectedProfile = selectedBorrower
    ? allProfiles?.find(p => p.userId === selectedBorrower)
    : null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading risk assessments...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Borrower Risk Assessment</h1>
          <p className="text-muted-foreground">
            Monitor and analyze borrower credit risk profiles
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Borrowers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allProfiles?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                Low Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {distribution?.low || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                High Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {distribution?.high || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Critical Risk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {distribution?.critical || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>Breakdown of borrowers by risk category</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, count }) => `${category}: ${count}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.category.toLowerCase() as RiskCategory]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Borrower List */}
        <Card>
          <CardHeader>
            <CardTitle>All Borrowers</CardTitle>
            <CardDescription>Click on a borrower to view detailed risk profile</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Risk Category</TableHead>
                  <TableHead>Payment History</TableHead>
                  <TableHead>Debt-to-Income</TableHead>
                  <TableHead>Last Assessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allProfiles?.map((profile) => (
                  <TableRow
                    key={profile.userId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedBorrower(profile.userId)}
                  >
                    <TableCell className="font-medium">{profile.borrowerName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={profile.riskScore} className="w-20" />
                        <span className="text-sm">{profile.riskScore}/100</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getRiskColor(profile.riskCategory)}>
                        <span className="flex items-center gap-1">
                          {getRiskIcon(profile.riskCategory)}
                          {profile.riskCategory.toUpperCase()}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>{profile.factors.paymentHistory.score}/100</TableCell>
                    <TableCell>{(profile.factors.debtToIncome.ratio * 100).toFixed(1)}%</TableCell>
                    <TableCell>
                      {new Date(profile.lastAssessment).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detailed Profile View */}
        {selectedProfile && (
          <Card>
            <CardHeader>
              <CardTitle>Detailed Risk Profile: {selectedProfile.borrowerName}</CardTitle>
              <CardDescription>{selectedProfile.borrowerEmail}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Overall Score */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Overall Risk Score</h3>
                  <Badge className={getRiskColor(selectedProfile.riskCategory)}>
                    {selectedProfile.riskCategory.toUpperCase()}
                  </Badge>
                </div>
                <Progress value={selectedProfile.riskScore} className="h-4" />
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedProfile.riskScore}/100 (Lower is better)
                </p>
              </div>

              {/* Factor Breakdown */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Payment History</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Score:</span>
                      <span className="font-semibold">{selectedProfile.factors.paymentHistory.score}/100</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>On-time Payments:</span>
                      <span className="text-green-600">{selectedProfile.factors.paymentHistory.onTimePayments}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Late Payments:</span>
                      <span className="text-orange-600">{selectedProfile.factors.paymentHistory.latePayments}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Missed Payments:</span>
                      <span className="text-red-600">{selectedProfile.factors.paymentHistory.missedPayments}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Avg Days Late:</span>
                      <span>{selectedProfile.factors.paymentHistory.averageDaysLate.toFixed(1)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Debt-to-Income Ratio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Score:</span>
                      <span className="font-semibold">{selectedProfile.factors.debtToIncome.score}/100</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Debt:</span>
                      <span>{formatCurrency(selectedProfile.factors.debtToIncome.totalDebt)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Est. Income:</span>
                      <span>{formatCurrency(selectedProfile.factors.debtToIncome.estimatedIncome)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>DTI Ratio:</span>
                      <span className="font-semibold">{(selectedProfile.factors.debtToIncome.ratio * 100).toFixed(1)}%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Credit Utilization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Score:</span>
                      <span className="font-semibold">{selectedProfile.factors.creditUtilization.score}/100</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Borrowed:</span>
                      <span>{formatCurrency(selectedProfile.factors.creditUtilization.totalBorrowed)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Repaid:</span>
                      <span className="text-green-600">{formatCurrency(selectedProfile.factors.creditUtilization.totalRepaid)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Outstanding:</span>
                      <span className="text-orange-600">{formatCurrency(selectedProfile.factors.creditUtilization.outstandingBalance)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Loan History</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Score:</span>
                      <span className="font-semibold">{selectedProfile.factors.loanHistory.score}/100</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Loans:</span>
                      <span>{selectedProfile.factors.loanHistory.totalLoans}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Active Loans:</span>
                      <span className="text-blue-600">{selectedProfile.factors.loanHistory.activeLoans}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Paid Off:</span>
                      <span className="text-green-600">{selectedProfile.factors.loanHistory.paidOffLoans}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Defaulted:</span>
                      <span className="text-red-600">{selectedProfile.factors.loanHistory.defaultedLoans}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              <div>
                <h3 className="font-semibold mb-3">Recommendations</h3>
                <ul className="space-y-2">
                  {selectedProfile.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
