/**
 * Portfolio at Risk Dashboard
 * Risk analytics for loan portfolio management
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  PieChart,
  BarChart3,
  Download,
  Filter,
  Calendar,
  MapPin,
  Building2,
  Loader2,
} from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { trpc } from '@/lib/trpc';

export default function PortfolioAtRiskDashboard() {
  const { formatCurrency } = useLocalization();
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  // Fetch portfolio data from microfinance router
  const { data: portfolioStats, isLoading: statsLoading } = trpc.microfinance.getPortfolioStats.useQuery(
    { period: selectedPeriod },
    { enabled: true }
  );

  const { data: parByRegionData, isLoading: regionLoading } = trpc.microfinance.getParByRegion.useQuery({});

  const { data: parByCooperativeData, isLoading: coopLoading } = trpc.cooperative.getParByCooperative.useQuery({});

  const { data: atRiskLoansData, isLoading: loansLoading } = trpc.microfinance.getAtRiskLoans.useQuery({});

  const { data: agentPerformanceData, isLoading: agentLoading } = trpc.agentProductivity.getPerformanceMetrics.useQuery(
    { agentId: 0 }, // 0 = all agents
    { enabled: true }
  );

  // Default values if data not loaded
  const portfolioSummary = portfolioStats || {
    totalOutstanding: 0,
    totalBorrowers: 0,
    avgLoanSize: 0,
    par1: 0,
    par30: 0,
    par60: 0,
    par90: 0,
    writeOffRate: 0,
    collectionRate: 0,
    disbursementsThisMonth: 0,
    repaymentsThisMonth: 0,
  };

  const parByRegion = parByRegionData || [];
  const parByCooperative = parByCooperativeData || [];
  const atRiskLoans = atRiskLoansData || [];
  
  // Transform agent performance data to expected format (API returns array)
  const latestAgentMetrics = Array.isArray(agentPerformanceData) && agentPerformanceData.length > 0 ? agentPerformanceData[0] : null;
  const agentPerformance = latestAgentMetrics ? [{
    name: 'Agent Performance',
    disbursed: latestAgentMetrics.loansDisbursed || 0,
    collected: latestAgentMetrics.repaymentsCollected || 0,
    collectionRate: latestAgentMetrics.visitSuccessRate ? Number(latestAgentMetrics.visitSuccessRate) : 95,
    farmersManaged: latestAgentMetrics.farmersRegistered || 0,
    par30: 0,
  }] : [];

  const getParColor = (par: number) => {
    if (par < 3) return 'text-green-600';
    if (par < 5) return 'text-yellow-600';
    if (par < 10) return 'text-orange-600';
    return 'text-red-600';
  };

  const getParBadge = (par: number) => {
    if (par < 3) return <Badge className="bg-green-100 text-green-800">Low Risk</Badge>;
    if (par < 5) return <Badge className="bg-yellow-100 text-yellow-800">Moderate</Badge>;
    if (par < 10) return <Badge className="bg-orange-100 text-orange-800">High Risk</Badge>;
    return <Badge className="bg-red-100 text-red-800">Critical</Badge>;
  };

  const getOverdueBadge = (days: number) => {
    if (days < 30) return <Badge className="bg-yellow-100 text-yellow-800">1-29 days</Badge>;
    if (days < 60) return <Badge className="bg-orange-100 text-orange-800">30-59 days</Badge>;
    if (days < 90) return <Badge className="bg-red-100 text-red-800">60-89 days</Badge>;
    return <Badge className="bg-red-500 text-white">90+ days</Badge>;
  };

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Portfolio at Risk</h1>
          <p className="text-muted-foreground">Monitor loan portfolio health and risk metrics</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolioSummary.totalOutstanding / 100)}</div>
            <p className="text-xs text-muted-foreground">{portfolioSummary.totalBorrowers} active borrowers</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PAR 30</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getParColor(portfolioSummary.par30)}`}>
              {portfolioSummary.par30}%
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency((portfolioSummary.totalOutstanding * portfolioSummary.par30 / 100) / 100)} at risk
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PAR 90</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getParColor(portfolioSummary.par90)}`}>
              {portfolioSummary.par90}%
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency((portfolioSummary.totalOutstanding * portfolioSummary.par90 / 100) / 100)} severely delinquent
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{portfolioSummary.collectionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(portfolioSummary.repaymentsThisMonth / 100)} collected this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* PAR Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>PAR Aging Analysis</CardTitle>
          <CardDescription>Portfolio breakdown by days past due</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {(100 - portfolioSummary.par1).toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">Current</div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency((portfolioSummary.totalOutstanding * (100 - portfolioSummary.par1) / 100) / 100)}
              </div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{portfolioSummary.par1}%</div>
              <div className="text-sm text-muted-foreground">1-29 Days</div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency((portfolioSummary.totalOutstanding * portfolioSummary.par1 / 100) / 100)}
              </div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{portfolioSummary.par30}%</div>
              <div className="text-sm text-muted-foreground">30-59 Days</div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency((portfolioSummary.totalOutstanding * portfolioSummary.par30 / 100) / 100)}
              </div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{portfolioSummary.par60}%</div>
              <div className="text-sm text-muted-foreground">60-89 Days</div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency((portfolioSummary.totalOutstanding * portfolioSummary.par60 / 100) / 100)}
              </div>
            </div>
            <div className="text-center p-4 bg-red-100 rounded-lg">
              <div className="text-2xl font-bold text-red-700">{portfolioSummary.par90}%</div>
              <div className="text-sm text-muted-foreground">90+ Days</div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency((portfolioSummary.totalOutstanding * portfolioSummary.par90 / 100) / 100)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="region">
        <TabsList>
          <TabsTrigger value="region">By Region</TabsTrigger>
          <TabsTrigger value="cooperative">By Cooperative</TabsTrigger>
          <TabsTrigger value="at-risk">At-Risk Loans</TabsTrigger>
          <TabsTrigger value="agents">Agent Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="region" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    PAR by Region
                  </CardTitle>
                  <CardDescription>Portfolio risk breakdown by geographic region</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Borrowers</TableHead>
                    <TableHead className="text-right">PAR 30</TableHead>
                    <TableHead className="text-right">PAR 90</TableHead>
                    <TableHead>Risk Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parByRegion.map((region) => (
                    <TableRow key={region.region}>
                      <TableCell className="font-medium">{region.region}</TableCell>
                      <TableCell className="text-right">{formatCurrency(region.outstanding / 100)}</TableCell>
                      <TableCell className="text-right">{region.borrowers}</TableCell>
                      <TableCell className={`text-right font-medium ${getParColor(region.par30)}`}>
                        {region.par30}%
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getParColor(region.par90)}`}>
                        {region.par90}%
                      </TableCell>
                      <TableCell>{getParBadge(region.par30)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cooperative" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    PAR by Cooperative
                  </CardTitle>
                  <CardDescription>Portfolio risk breakdown by cooperative</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cooperative</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">PAR 30</TableHead>
                    <TableHead className="text-right">PAR 90</TableHead>
                    <TableHead>Risk Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parByCooperative.map((coop) => (
                    <TableRow key={coop.name}>
                      <TableCell className="font-medium">{coop.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(coop.outstanding / 100)}</TableCell>
                      <TableCell className="text-right">{coop.members}</TableCell>
                      <TableCell className={`text-right font-medium ${getParColor(coop.par30)}`}>
                        {coop.par30}%
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getParColor(coop.par90)}`}>
                        {coop.par90}%
                      </TableCell>
                      <TableCell>{getParBadge(coop.par30)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="at-risk" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    At-Risk Loans
                  </CardTitle>
                  <CardDescription>Loans requiring immediate attention</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Days Overdue</TableHead>
                    <TableHead className="text-right">Credit Score</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRiskLoans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">{loan.borrower}</TableCell>
                      <TableCell>{loan.region}</TableCell>
                      <TableCell className="text-right">{formatCurrency(loan.amount / 100)}</TableCell>
                      <TableCell>{getOverdueBadge(loan.daysOverdue)}</TableCell>
                      <TableCell className={`text-right ${loan.creditScore < 500 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {loan.creditScore}
                      </TableCell>
                      <TableCell>{loan.lastPayment}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">Contact</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Agent Performance
                  </CardTitle>
                  <CardDescription>Field agent collection and disbursement metrics</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Disbursed</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Collection Rate</TableHead>
                    <TableHead className="text-right">Farmers</TableHead>
                    <TableHead className="text-right">PAR 30</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentPerformance.map((agent) => (
                    <TableRow key={agent.name}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(agent.disbursed / 100)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(agent.collected / 100)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={agent.collectionRate} className="w-16" />
                          <span className={agent.collectionRate >= 95 ? 'text-green-600' : 'text-yellow-600'}>
                            {agent.collectionRate}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{agent.farmersManaged}</TableCell>
                      <TableCell className={`text-right font-medium ${getParColor(agent.par30)}`}>
                        {agent.par30}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
