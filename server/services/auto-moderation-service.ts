/**
 * Automated Review Moderation Service
 * 
 * Implements workflow rules for automatic review moderation
 * Handles flagging, approval, and rejection based on configurable rules
 */

import { getDb } from '../db.js';
import { productReviews, users } from '../../drizzle/schema.js';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { analyzeReview, ReviewAnalysis } from './sentiment-analysis-service.js';
import { logger } from '../logger.js';

export interface ModerationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // Lower number = higher priority
  condition: (analysis: ReviewAnalysis, context: ReviewContext) => boolean;
  action: 'approve' | 'flag' | 'reject' | 'hide';
  reason: string;
}

export interface ReviewContext {
  userId: number;
  listingId: number;
  rating: number;
  verifiedPurchase: boolean;
  userReviewCount?: number;
  userFlaggedCount?: number;
  userApprovedRate?: number;
}

export interface ModerationDecision {
  action: 'approve' | 'flag' | 'reject' | 'hide';
  reason: string;
  ruleId: string;
  confidence: number;
  requiresHumanReview: boolean;
}

/**
 * Default moderation rules
 */
export const DEFAULT_MODERATION_RULES: ModerationRule[] = [
  // Rule 1: Auto-reject spam
  {
    id: 'reject_spam',
    name: 'Reject Spam',
    description: 'Automatically reject reviews detected as spam',
    enabled: true,
    priority: 1,
    condition: (analysis) => analysis.sentiment.flags.includes('spam'),
    action: 'reject',
    reason: 'Detected spam indicators (links, promotional content)',
  },
  
  // Rule 2: Flag profanity
  {
    id: 'flag_profanity',
    name: 'Flag Profanity',
    description: 'Flag reviews containing profanity for manual review',
    enabled: true,
    priority: 2,
    condition: (analysis) => analysis.sentiment.flags.includes('profanity'),
    action: 'flag',
    reason: 'Contains profanity or inappropriate language',
  },
  
  // Rule 3: Flag very short reviews (higher priority than sentiment mismatch)
  {
    id: 'flag_too_short',
    name: 'Flag Short Reviews',
    description: 'Flag reviews that are too short to be meaningful',
    enabled: true,
    priority: 3,
    condition: (analysis) => analysis.sentiment.flags.includes('too_short'),
    action: 'flag',
    reason: 'Review is too short (less than 3 words)',
  },
  
  // Rule 4: Flag sentiment-rating mismatch
  {
    id: 'flag_sentiment_mismatch',
    name: 'Flag Sentiment-Rating Mismatch',
    description: 'Flag reviews where sentiment doesn\'t match rating',
    enabled: true,
    priority: 4,
    condition: (analysis, context) => {
      const expectedSentiment = context.rating >= 4 ? 'positive' : context.rating <= 2 ? 'negative' : 'neutral';
      return analysis.sentiment.label !== expectedSentiment && analysis.sentiment.confidence > 0.5;
    },
    action: 'flag',
    reason: 'Sentiment analysis doesn\'t match star rating',
  },
  
  // Rule 5: Flag excessive caps
  {
    id: 'flag_excessive_caps',
    name: 'Flag Excessive Capitalization',
    description: 'Flag reviews with excessive capitalization (shouting)',
    enabled: true,
    priority: 5,
    condition: (analysis) => analysis.sentiment.flags.includes('excessive_caps'),
    action: 'flag',
    reason: 'Excessive capitalization detected',
  },
  
  // Rule 6: Auto-approve verified purchases with positive sentiment
  {
    id: 'approve_verified_positive',
    name: 'Auto-Approve Verified Positive',
    description: 'Automatically approve verified purchases with positive sentiment',
    enabled: true,
    priority: 6,
    condition: (analysis, context) => {
      return (
        context.verifiedPurchase &&
        analysis.sentiment.label === 'positive' &&
        analysis.sentiment.confidence > 0.4 &&
        analysis.sentiment.flags.length === 0
      );
    },
    action: 'approve',
    reason: 'Verified purchase with positive sentiment',
  },
  
  // Rule 7: Flag unverified negative reviews
  {
    id: 'flag_unverified_negative',
    name: 'Flag Unverified Negative',
    description: 'Flag negative reviews from unverified purchases',
    enabled: true,
    priority: 7,
    condition: (analysis, context) => {
      return (
        !context.verifiedPurchase &&
        analysis.sentiment.label === 'negative' &&
        context.rating <= 2
      );
    },
    action: 'flag',
    reason: 'Negative review without verified purchase',
  },
  
  // Rule 8: Flag users with high flag rate
  {
    id: 'flag_suspicious_user',
    name: 'Flag Suspicious Users',
    description: 'Flag reviews from users with high flagged review rate',
    enabled: true,
    priority: 8,
    condition: (analysis, context) => {
      if (!context.userReviewCount || context.userReviewCount < 3) return false;
      const flagRate = (context.userFlaggedCount || 0) / context.userReviewCount;
      return flagRate > 0.5; // More than 50% of reviews flagged
    },
    action: 'flag',
    reason: 'User has high rate of flagged reviews',
  },
  
  // Rule 9: Auto-approve trusted users
  {
    id: 'approve_trusted_user',
    name: 'Auto-Approve Trusted Users',
    description: 'Automatically approve reviews from trusted users',
    enabled: true,
    priority: 9,
    condition: (analysis, context) => {
      if (!context.userReviewCount || context.userReviewCount < 5) return false;
      const approvedRate = context.userApprovedRate || 0;
      return (
        approvedRate > 0.9 && // 90%+ approval rate
        analysis.sentiment.flags.length === 0
      );
    },
    action: 'approve',
    reason: 'Trusted user with high approval rate',
  },
  
  // Rule 10: Default approve (if no other rules matched)
  {
    id: 'default_approve',
    name: 'Default Approve',
    description: 'Default action: approve if no issues detected',
    enabled: true,
    priority: 100,
    condition: (analysis) => analysis.sentiment.flags.length === 0,
    action: 'approve',
    reason: 'No issues detected',
  },
];

/**
 * Get user review statistics for moderation context
 */
async function getUserReviewStats(userId: number): Promise<{
  reviewCount: number;
  flaggedCount: number;
  approvedRate: number;
}> {
  const db = await getDb();
  if (!db) {
    return { reviewCount: 0, flaggedCount: 0, approvedRate: 0 };
  }
  
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      flagged: sql<number>`sum(case when ${productReviews.status} = 'flagged' then 1 else 0 end)`,
      published: sql<number>`sum(case when ${productReviews.status} = 'published' then 1 else 0 end)`,
    })
    .from(productReviews)
    .where(eq(productReviews.userId, userId));
  
  const reviewCount = stats.total || 0;
  const flaggedCount = stats.flagged || 0;
  const publishedCount = stats.published || 0;
  const approvedRate = reviewCount > 0 ? publishedCount / reviewCount : 0;
  
  return {
    reviewCount,
    flaggedCount,
    approvedRate,
  };
}

/**
 * Apply moderation rules to a review
 */
export async function moderateReview(
  title: string,
  comment: string,
  rating: number,
  context: ReviewContext,
  customRules?: ModerationRule[]
): Promise<ModerationDecision> {
  // Analyze sentiment
  const analysis = await analyzeReview(title, comment, rating);
  
  // Get user stats
  const userStats = await getUserReviewStats(context.userId);
  const enrichedContext: ReviewContext = {
    ...context,
    userReviewCount: userStats.reviewCount,
    userFlaggedCount: userStats.flaggedCount,
    userApprovedRate: userStats.approvedRate,
  };
  
  // Use custom rules or default rules
  const rules = customRules || DEFAULT_MODERATION_RULES;
  
  // Sort rules by priority
  const sortedRules = rules
    .filter(rule => rule.enabled)
    .sort((a, b) => a.priority - b.priority);
  
  // Apply rules in order until one matches
  for (const rule of sortedRules) {
    if (rule.condition(analysis, enrichedContext)) {
      // Calculate confidence based on sentiment confidence and rule priority
      const priorityFactor = 1 - (rule.priority / 100);
      const confidence = (analysis.sentiment.confidence + priorityFactor) / 2;
      
      // Determine if human review is required
      const requiresHumanReview = 
        rule.action === 'flag' ||
        confidence < 0.6 ||
        analysis.sentiment.flags.length > 1;
      
      return {
        action: rule.action,
        reason: rule.reason,
        ruleId: rule.id,
        confidence,
        requiresHumanReview,
      };
    }
  }
  
  // Fallback: approve with low confidence
  return {
    action: 'approve',
    reason: 'No matching rules, default approval',
    ruleId: 'fallback',
    confidence: 0.5,
    requiresHumanReview: true,
  };
}

/**
 * Batch moderate multiple reviews
 */
export async function moderateReviews(
  reviews: Array<{
    title: string;
    comment: string;
    rating: number;
    context: ReviewContext;
  }>,
  customRules?: ModerationRule[]
): Promise<ModerationDecision[]> {
  return Promise.all(
    reviews.map(review =>
      moderateReview(
        review.title,
        review.comment,
        review.rating,
        review.context,
        customRules
      )
    )
  );
}

/**
 * Get moderation statistics
 */
export async function getModerationStats(
  startDate?: Date,
  endDate?: Date
): Promise<{
  total: number;
  approved: number;
  flagged: number;
  rejected: number;
  hidden: number;
  autoModerated: number;
  humanReviewed: number;
  averageConfidence: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      total: 0,
      approved: 0,
      flagged: 0,
      rejected: 0,
      hidden: 0,
      autoModerated: 0,
      humanReviewed: 0,
      averageConfidence: 0,
    };
  }
  
  const conditions = [];
  if (startDate) {
    conditions.push(gte(productReviews.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(productReviews.createdAt, endDate));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      published: sql<number>`sum(case when ${productReviews.status} = 'published' then 1 else 0 end)`,
      flagged: sql<number>`sum(case when ${productReviews.status} = 'flagged' then 1 else 0 end)`,
      hidden: sql<number>`sum(case when ${productReviews.status} = 'hidden' then 1 else 0 end)`,
    })
    .from(productReviews)
    .where(whereClause);
  
  const total = stats.total || 0;
  const approved = stats.published || 0;
  const flagged = stats.flagged || 0;
  const hidden = stats.hidden || 0;
  
  // Note: We don't have a 'rejected' status in schema, so it's 0
  // Auto-moderated vs human-reviewed would require additional tracking
  
  return {
    total,
    approved,
    flagged,
    rejected: 0,
    hidden,
    autoModerated: flagged + hidden, // Auto-moderated = system-flagged + system-hidden
    humanReviewed: approved, // Human-reviewed = manually approved/published
    averageConfidence: total > 0 ? (approved + hidden) / total : 0, // Confidence based on actioned vs total
  };
}

/**
 * Get rule effectiveness statistics
 */
export function getRuleStats(
  decisions: ModerationDecision[]
): Record<string, { count: number; confidence: number }> {
  const ruleStats: Record<string, { count: number; totalConfidence: number }> = {};
  
  decisions.forEach(decision => {
    if (!ruleStats[decision.ruleId]) {
      ruleStats[decision.ruleId] = { count: 0, totalConfidence: 0 };
    }
    ruleStats[decision.ruleId].count++;
    ruleStats[decision.ruleId].totalConfidence += decision.confidence;
  });
  
  return Object.fromEntries(
    Object.entries(ruleStats).map(([ruleId, stats]) => [
      ruleId,
      {
        count: stats.count,
        confidence: stats.totalConfidence / stats.count,
      },
    ])
  );
}

/**
 * Export moderation rules as JSON
 */
export function exportRules(rules: ModerationRule[]): string {
  return JSON.stringify(
    rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      priority: rule.priority,
      action: rule.action,
      reason: rule.reason,
    })),
    null,
    2
  );
}

/**
 * Import moderation rules from JSON
 * Note: Conditions cannot be serialized, so they must be mapped to existing rules
 */
export function importRules(json: string): Partial<ModerationRule>[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid rules format');
    }
    return parsed;
  } catch (error) {
    logger.error('[AutoModeration] Failed to import rules:', error);
    throw new Error('Failed to parse rules JSON');
  }
}
