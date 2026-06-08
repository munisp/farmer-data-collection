/**
 * P2P Lending & Savings Router — DB-backed
 * Peer-to-peer farm loans, savings circles, portfolio management.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { p2pLoans, savingsCircles } from "../../drizzle/platform-extensions-schema.js";

export const p2pLendingRouter = router({
  listLoans: protectedProcedure
    .input(z.object({
      borrowerId: z.number().optional(), lenderId: z.number().optional(),
      status: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.borrowerId) conds.push(eq(p2pLoans.borrowerId, input.borrowerId));
      if (input?.lenderId) conds.push(eq(p2pLoans.lenderId, input.lenderId));
      if (input?.status) conds.push(eq(p2pLoans.status, input.status));
      const rows = await db.select().from(p2pLoans)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(p2pLoans.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(r => ({ ...r, amount: Number(r.amount), interestRate: Number(r.interestRate), monthlyPayment: Number(r.monthlyPayment), totalRepaid: Number(r.totalRepaid), collateralValue: Number(r.collateralValue) }));
    }),

  getLoan: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(p2pLoans).where(eq(p2pLoans.id, input.loanId));
      if (!row) return null;
      const amt = Number(row.amount);
      const rate = Number(row.interestRate);
      const totalInterest = amt * (rate / 100) * (row.termMonths / 12);
      return { ...row, amount: amt, interestRate: rate, monthlyPayment: Number(row.monthlyPayment), totalRepaid: Number(row.totalRepaid), collateralValue: Number(row.collateralValue), totalInterest, totalDue: amt + totalInterest, remainingBalance: amt + totalInterest - Number(row.totalRepaid) };
    }),

  requestLoan: protectedProcedure
    .input(z.object({
      borrowerId: z.number(), amount: z.number().min(1000), interestRate: z.number().min(0).max(50),
      termMonths: z.number().min(1).max(60), purpose: z.string().min(10),
      collateralType: z.string().optional(), collateralValue: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const code = `P2P-${Date.now().toString(36).toUpperCase()}`;
      const monthlyRate = input.interestRate / 100 / 12;
      const monthlyPayment = monthlyRate > 0
        ? (input.amount * monthlyRate * Math.pow(1 + monthlyRate, input.termMonths)) / (Math.pow(1 + monthlyRate, input.termMonths) - 1)
        : input.amount / input.termMonths;
      const [created] = await db.insert(p2pLoans).values({
        loanCode: code, borrowerId: input.borrowerId, amount: String(input.amount),
        interestRate: String(input.interestRate), termMonths: input.termMonths, purpose: input.purpose,
        collateralType: input.collateralType, collateralValue: input.collateralValue ? String(input.collateralValue) : undefined,
        monthlyPayment: String(Math.round(monthlyPayment)),
      }).returning();
      logger.info("[P2PLending] Loan requested", { id: created.id, code, borrowerId: input.borrowerId, amount: input.amount });
      return { success: true, loan: created };
    }),

  fundLoan: protectedProcedure
    .input(z.object({ loanId: z.number(), lenderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [loan] = await db.select().from(p2pLoans).where(eq(p2pLoans.id, input.loanId));
      if (!loan) return { success: false, error: "Loan not found" };
      if (loan.status !== "pending") return { success: false, error: `Loan is ${loan.status}, cannot fund` };
      await db.update(p2pLoans).set({ lenderId: input.lenderId, status: "active", disbursedAt: new Date(), updatedAt: new Date() }).where(eq(p2pLoans.id, input.loanId));
      logger.info("[P2PLending] Loan funded", { loanId: input.loanId, lenderId: input.lenderId });
      return { success: true, loanId: input.loanId };
    }),

  makeRepayment: protectedProcedure
    .input(z.object({ loanId: z.number(), amount: z.number().min(1) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [loan] = await db.select().from(p2pLoans).where(eq(p2pLoans.id, input.loanId));
      if (!loan) return { success: false, error: "Loan not found" };
      const newTotal = Number(loan.totalRepaid) + input.amount;
      const totalDue = Number(loan.amount) * (1 + Number(loan.interestRate) / 100 * loan.termMonths / 12);
      const isFullyRepaid = newTotal >= totalDue;
      await db.update(p2pLoans).set({
        totalRepaid: String(newTotal), status: isFullyRepaid ? "repaid" : "active",
        repaidAt: isFullyRepaid ? new Date() : undefined, updatedAt: new Date(),
      }).where(eq(p2pLoans.id, input.loanId));
      return { success: true, amountPaid: input.amount, totalRepaid: newTotal, remainingBalance: Math.max(0, totalDue - newTotal), isFullyRepaid };
    }),

  listSavingsCircles: publicProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      return (await db.select().from(savingsCircles).where(eq(savingsCircles.isActive, true)).limit(input?.limit ?? 50))
        .map(s => ({ ...s, contributionAmount: Number(s.contributionAmount), totalPooled: Number(s.totalPooled) }));
    }),

  getPortfolioStats: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const asLender = await db.select().from(p2pLoans).where(eq(p2pLoans.lenderId, input.userId));
      const asBorrower = await db.select().from(p2pLoans).where(eq(p2pLoans.borrowerId, input.userId));
      const lentOut = asLender.reduce((s, l) => s + Number(l.amount), 0);
      const borrowed = asBorrower.reduce((s, l) => s + Number(l.amount), 0);
      const interestEarned = asLender.filter(l => l.status === "repaid").reduce((s, l) => s + Number(l.totalRepaid) - Number(l.amount), 0);
      return { lentOut, borrowed, interestEarned, activeLoansAsLender: asLender.filter(l => l.status === "active").length, activeLoansAsBorrower: asBorrower.filter(l => l.status === "active").length };
    }),
});
