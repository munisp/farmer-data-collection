import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { loans } from "../../drizzle/financial-schema";
import { users } from "../../drizzle/schema";
import { eq, and, sql, or } from "drizzle-orm";

export const microfinanceActiveLoansRouter = router({
  /**
   * Get active loans for the current user (for payment reminders)
   */
  getActiveLoans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const activeLoans = await db
      .select({
        id: loans.id,
        loanNumber: loans.loanNumber,
        amount: loans.principalAmount,
        monthlyPayment: loans.monthlyPayment,
        nextPaymentDate: loans.nextPaymentDue,
        borrowerName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        borrowerPhone: users.phoneNumber
      })
      .from(loans)
      .innerJoin(users, eq(loans.userId, users.id))
      .where(
        and(
          eq(loans.userId, ctx.user.id),
          or(
            eq(loans.status, "active"),
            eq(loans.status, "disbursed")
          )
        )
      );

    return activeLoans;
  })
});
