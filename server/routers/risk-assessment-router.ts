import { router, protectedProcedure } from '../_core/trpc-base';
import { z } from 'zod';
import { assessBorrowerRisk, getAllBorrowerRiskProfiles } from '../services/risk-assessment.service';

export const riskAssessmentRouter = router({
  /**
   * Get risk profile for current user
   */
  getMyRiskProfile: protectedProcedure
    .query(async ({ ctx }) => {
      return await assessBorrowerRisk(ctx.user.id);
    }),

  /**
   * Get risk profile for specific user (admin only)
   */
  getUserRiskProfile: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ input }) => {
      return await assessBorrowerRisk(input.userId);
    }),

  /**
   * Get all borrower risk profiles (admin only)
   */
  getAllRiskProfiles: protectedProcedure
    .query(async () => {
      return await getAllBorrowerRiskProfiles();
    }),
});
