import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const LoanStatus = z.enum(["open", "funded", "active", "repaying", "completed", "defaulted"]);
const SavingsType = z.enum(["fixed_deposit", "goal_based", "flexible", "chama_pool"]);

interface P2PLoan {
  id: string; borrowerId: number; lenderId: number | null; amount: number; interestRate: number;
  durationMonths: number; purpose: string; status: string; fundedAt: string | null;
  repaidAmount: number; nextPaymentDate: string; creditScore: number; collateralType: string;
}

interface SavingsAccount {
  id: string; userId: number; type: string; balance: number; targetAmount: number | null;
  interestRate: number; goalName: string | null; maturityDate: string | null;
  deposits: { date: string; amount: number }[];
}

const loans: P2PLoan[] = [
  { id: "P2P-001", borrowerId: 1001, lenderId: 2001, amount: 200000, interestRate: 12, durationMonths: 6, purpose: "Farm expansion - 2 additional acres", status: "active", fundedAt: "2026-03-01T00:00:00Z", repaidAmount: 75000, nextPaymentDate: "2026-06-01", creditScore: 720, collateralType: "warehouse_receipt" },
  { id: "P2P-002", borrowerId: 1002, lenderId: null, amount: 150000, interestRate: 15, durationMonths: 4, purpose: "Purchase drip irrigation system", status: "open", fundedAt: null, repaidAmount: 0, nextPaymentDate: "", creditScore: 680, collateralType: "equipment" },
  { id: "P2P-003", borrowerId: 1003, lenderId: 2002, amount: 500000, interestRate: 10, durationMonths: 12, purpose: "Cold storage unit installation", status: "repaying", fundedAt: "2026-01-15T00:00:00Z", repaidAmount: 220000, nextPaymentDate: "2026-06-15", creditScore: 750, collateralType: "land_title" },
  { id: "P2P-004", borrowerId: 1004, lenderId: null, amount: 80000, interestRate: 18, durationMonths: 3, purpose: "Seed and fertilizer for planting season", status: "open", fundedAt: null, repaidAmount: 0, nextPaymentDate: "", creditScore: 620, collateralType: "none" },
];

const savings: SavingsAccount[] = [
  { id: "SAV-001", userId: 1001, type: "goal_based", balance: 150000, targetAmount: 500000, interestRate: 8, goalName: "New Tractor", maturityDate: "2026-12-31", deposits: [{ date: "2026-03-01", amount: 50000 }, { date: "2026-04-01", amount: 50000 }, { date: "2026-05-01", amount: 50000 }] },
  { id: "SAV-002", userId: 1002, type: "fixed_deposit", balance: 300000, targetAmount: null, interestRate: 12, goalName: null, maturityDate: "2026-09-01", deposits: [{ date: "2026-03-01", amount: 300000 }] },
  { id: "SAV-003", userId: 2001, type: "flexible", balance: 850000, targetAmount: null, interestRate: 5, goalName: null, maturityDate: null, deposits: [{ date: "2026-01-15", amount: 500000 }, { date: "2026-03-01", amount: 200000 }, { date: "2026-05-01", amount: 150000 }] },
];

function calculateMonthlyPayment(amount: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) return Math.round(amount / months);
  return Math.round(amount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1));
}

function assessRisk(creditScore: number, amount: number, collateral: string): { riskLevel: string; suggestedRate: number; maxAmount: number } {
  const collateralDiscount: Record<string, number> = { land_title: 0.7, warehouse_receipt: 0.8, equipment: 0.85, crop_forward: 0.9, none: 1.0 };
  const riskMultiplier = collateralDiscount[collateral] || 1.0;
  const baseRate = creditScore >= 750 ? 8 : creditScore >= 700 ? 12 : creditScore >= 650 ? 15 : creditScore >= 600 ? 18 : 24;
  const adjustedRate = Math.round(baseRate * riskMultiplier * 10) / 10;
  const maxAmount = creditScore >= 750 ? 2000000 : creditScore >= 700 ? 1000000 : creditScore >= 650 ? 500000 : 200000;
  const riskLevel = adjustedRate <= 10 ? "low" : adjustedRate <= 15 ? "medium" : adjustedRate <= 20 ? "high" : "very_high";
  return { riskLevel, suggestedRate: adjustedRate, maxAmount };
}

export const p2pLendingRouter = router({
  listOpenLoans: publicProcedure
    .input(z.object({ minCreditScore: z.number().optional(), maxAmount: z.number().optional(), collateralRequired: z.boolean().optional() }).optional())
    .query(({ input }) => {
      let open = loans.filter(l => l.status === "open");
      if (input?.minCreditScore) open = open.filter(l => l.creditScore >= input.minCreditScore!);
      if (input?.maxAmount) open = open.filter(l => l.amount <= input.maxAmount!);
      if (input?.collateralRequired) open = open.filter(l => l.collateralType !== "none");
      return open.map(l => ({
        ...l, monthlyPayment: calculateMonthlyPayment(l.amount, l.interestRate, l.durationMonths),
        totalReturn: Math.round(l.amount * (1 + l.interestRate / 100 * l.durationMonths / 12)),
        risk: assessRisk(l.creditScore, l.amount, l.collateralType),
      }));
    }),

  requestLoan: protectedProcedure
    .input(z.object({ borrowerId: z.number(), amount: z.number().min(10000), interestRate: z.number().min(5).max(30), durationMonths: z.number().min(1).max(24), purpose: z.string(), collateralType: z.string().default("none"), creditScore: z.number() }))
    .mutation(({ input }) => {
      const risk = assessRisk(input.creditScore, input.amount, input.collateralType);
      if (input.amount > risk.maxAmount) return { success: false, error: `Amount exceeds maximum ₦${risk.maxAmount.toLocaleString()} for your credit profile` };

      const loan: P2PLoan = {
        id: `P2P-${String(loans.length + 1).padStart(3, "0")}`, borrowerId: input.borrowerId, lenderId: null,
        amount: input.amount, interestRate: Math.max(input.interestRate, risk.suggestedRate),
        durationMonths: input.durationMonths, purpose: input.purpose, status: "open",
        fundedAt: null, repaidAmount: 0, nextPaymentDate: "", creditScore: input.creditScore, collateralType: input.collateralType,
      };
      loans.push(loan);
      logger.info("[P2PLending] Loan request created", { loanId: loan.id, amount: input.amount, borrowerId: input.borrowerId });
      return { success: true, loan, risk, monthlyPayment: calculateMonthlyPayment(loan.amount, loan.interestRate, loan.durationMonths) };
    }),

  fundLoan: protectedProcedure
    .input(z.object({ loanId: z.string(), lenderId: z.number() }))
    .mutation(({ input }) => {
      const loan = loans.find(l => l.id === input.loanId);
      if (!loan) return { success: false, error: "Loan not found" };
      if (loan.status !== "open") return { success: false, error: "Loan already funded" };

      loan.lenderId = input.lenderId;
      loan.status = "active";
      loan.fundedAt = new Date().toISOString();
      const firstPayment = new Date(Date.now() + 30 * 86400000);
      loan.nextPaymentDate = firstPayment.toISOString().split("T")[0];

      logger.info("[P2PLending] Loan funded", { loanId: input.loanId, lenderId: input.lenderId, amount: loan.amount });
      return { success: true, loan, expectedReturn: Math.round(loan.amount * (1 + loan.interestRate / 100 * loan.durationMonths / 12)) };
    }),

  makePayment: protectedProcedure
    .input(z.object({ loanId: z.string(), amount: z.number().min(1) }))
    .mutation(({ input }) => {
      const loan = loans.find(l => l.id === input.loanId);
      if (!loan) return { success: false, error: "Loan not found" };
      loan.repaidAmount += input.amount;
      const totalDue = Math.round(loan.amount * (1 + loan.interestRate / 100 * loan.durationMonths / 12));
      if (loan.repaidAmount >= totalDue) { loan.status = "completed"; }
      else { loan.status = "repaying"; loan.nextPaymentDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]; }
      return { success: true, paid: input.amount, remaining: totalDue - loan.repaidAmount, status: loan.status };
    }),

  createSavingsAccount: protectedProcedure
    .input(z.object({ userId: z.number(), type: SavingsType, initialDeposit: z.number().min(1000), goalName: z.string().optional(), targetAmount: z.number().optional(), durationMonths: z.number().optional() }))
    .mutation(({ input }) => {
      const rates: Record<string, number> = { fixed_deposit: 12, goal_based: 8, flexible: 5, chama_pool: 10 };
      const account: SavingsAccount = {
        id: `SAV-${String(savings.length + 1).padStart(3, "0")}`, userId: input.userId, type: input.type,
        balance: input.initialDeposit, targetAmount: input.targetAmount || null, interestRate: rates[input.type],
        goalName: input.goalName || null,
        maturityDate: input.durationMonths ? new Date(Date.now() + input.durationMonths * 30 * 86400000).toISOString().split("T")[0] : null,
        deposits: [{ date: new Date().toISOString().split("T")[0], amount: input.initialDeposit }],
      };
      savings.push(account);
      logger.info("[P2PLending] Savings account created", { accountId: account.id, type: input.type, userId: input.userId });
      return { success: true, account };
    }),

  getSavingsPortfolio: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => {
      const userSavings = savings.filter(s => s.userId === input.userId);
      const totalBalance = userSavings.reduce((sum, s) => sum + s.balance, 0);
      const projectedInterest = userSavings.reduce((sum, s) => sum + Math.round(s.balance * s.interestRate / 100), 0);
      return { accounts: userSavings, totalBalance, projectedAnnualInterest: projectedInterest, accountCount: userSavings.length };
    }),

  getLendingPortfolio: protectedProcedure
    .input(z.object({ lenderId: z.number() }))
    .query(({ input }) => {
      const funded = loans.filter(l => l.lenderId === input.lenderId);
      const totalLent = funded.reduce((s, l) => s + l.amount, 0);
      const totalReturned = funded.reduce((s, l) => s + l.repaidAmount, 0);
      const active = funded.filter(l => l.status === "active" || l.status === "repaying");
      const defaulted = funded.filter(l => l.status === "defaulted");
      return { totalLoans: funded.length, totalLent, totalReturned, activeLoans: active.length, defaultedLoans: defaulted.length, defaultRate: funded.length > 0 ? Math.round((defaulted.length / funded.length) * 100) : 0, projectedReturns: funded.reduce((s, l) => s + Math.round(l.amount * (l.interestRate / 100 * l.durationMonths / 12)), 0) };
    }),
});
