import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, TrendingUp, DollarSign, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export default function LoanCalculator() {
  const [loanAmount, setLoanAmount] = useState<number>(100000);
  const [interestRate, setInterestRate] = useState<number>(24);
  const [termMonths, setTermMonths] = useState<number>(12);
  const [selectedLenderId, setSelectedLenderId] = useState<number | null>(null);

  // Fetch all lenders for comparison
  const { data: lenders } = trpc.microfinance.getAllLenders.useQuery();

  // Calculate monthly payment using amortization formula
  const monthlyPayment = useMemo(() => {
    const monthlyRate = interestRate / 100 / 12;
    if (monthlyRate === 0) return loanAmount / termMonths;
    
    const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                    (Math.pow(1 + monthlyRate, termMonths) - 1);
    return payment;
  }, [loanAmount, interestRate, termMonths]);

  const totalPayment = monthlyPayment * termMonths;
  const totalInterest = totalPayment - loanAmount;

  // Generate amortization schedule
  const amortizationSchedule = useMemo((): AmortizationRow[] => {
    const schedule: AmortizationRow[] = [];
    let balance = loanAmount;
    const monthlyRate = interestRate / 100 / 12;

    for (let month = 1; month <= termMonths; month++) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      balance -= principalPayment;

      schedule.push({
        month,
        payment: monthlyPayment,
        principal: principalPayment,
        interest: interestPayment,
        balance: Math.max(0, balance),
      });
    }

    return schedule;
  }, [loanAmount, interestRate, termMonths, monthlyPayment]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Loan Calculator</h1>
          <p className="text-muted-foreground">
            Calculate your monthly payments and compare lenders
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Calculator Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Loan Details
              </CardTitle>
              <CardDescription>Enter your loan requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Loan Amount (₦)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  min={10000}
                  step={10000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">Interest Rate (% per year)</Label>
                <Input
                  id="rate"
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  min={0}
                  max={100}
                  step={0.1}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="term">Loan Term (months)</Label>
                <Input
                  id="term"
                  type="number"
                  value={termMonths}
                  onChange={(e) => setTermMonths(Number(e.target.value))}
                  min={1}
                  max={60}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Monthly Payment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(monthlyPayment)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Total Interest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalInterest)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((totalInterest / loanAmount) * 100).toFixed(1)}% of principal
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Total Repayment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalPayment)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Over {termMonths} months
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Lender Comparison */}
        {lenders && lenders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Compare with Lenders</CardTitle>
              <CardDescription>
                See how your calculation compares with available lenders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lender</TableHead>
                    <TableHead>Interest Rate</TableHead>
                    <TableHead>Max Loan</TableHead>
                    <TableHead>Max Term</TableHead>
                    <TableHead>Est. Monthly Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lenders.map((lender) => {
                    // Parse interest rate range (e.g., "18-24%")
                    const rateMatch = lender.interestRateRange?.match(/(\d+\.?\d*)-(\d+\.?\d*)/);
                    const avgRate = rateMatch 
                      ? (parseFloat(rateMatch[1]) + parseFloat(rateMatch[2])) / 2 
                      : interestRate;
                    
                    const lenderMonthlyRate = avgRate / 100 / 12;
                    const lenderPayment = loanAmount * (lenderMonthlyRate * Math.pow(1 + lenderMonthlyRate, termMonths)) / 
                                         (Math.pow(1 + lenderMonthlyRate, termMonths) - 1);

                    return (
                      <TableRow key={lender.id}>
                        <TableCell className="font-medium">{lender.name}</TableCell>
                        <TableCell>{lender.interestRateRange || 'N/A'}</TableCell>
                        <TableCell>{lender.maxLoanAmount ? formatCurrency(lender.maxLoanAmount) : 'N/A'}</TableCell>
                        <TableCell>{lender.maxTermMonths ? `${lender.maxTermMonths} months` : 'N/A'}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(lenderPayment)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Amortization Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Amortization Schedule</CardTitle>
            <CardDescription>
              Detailed payment breakdown for each month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amortizationSchedule.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell>{formatCurrency(row.payment)}</TableCell>
                      <TableCell>{formatCurrency(row.principal)}</TableCell>
                      <TableCell>{formatCurrency(row.interest)}</TableCell>
                      <TableCell>{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
