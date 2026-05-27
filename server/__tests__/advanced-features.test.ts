import { describe, it, expect } from 'vitest';
import { transformToCDN, getResponsiveImageUrls, getCDNConfig } from '../services/cdn-service.js';
import { analyzeSentiment, analyzeReview } from '../services/sentiment-analysis-service.js';
import { moderateReview, DEFAULT_MODERATION_RULES } from '../services/auto-moderation-service.js';

/**
 * Test suite for advanced features:
 * - CDN integration
 * - Sentiment analysis
 * - Automated moderation
 */

describe('Advanced Features', () => {
  describe('CDN Service', () => {
    it('should return original URL when CDN is disabled', () => {
      const s3Url = 'https://bucket.s3.amazonaws.com/path/to/image.jpg';
      const result = transformToCDN(s3Url);
      
      // CDN is disabled by default in test environment
      expect(result).toBe(s3Url);
    });

    it('should generate responsive image URLs', () => {
      const s3Url = 'https://bucket.s3.amazonaws.com/path/to/image.jpg';
      const responsive = getResponsiveImageUrls(s3Url);
      
      expect(responsive).toHaveProperty('thumbnail');
      expect(responsive).toHaveProperty('small');
      expect(responsive).toHaveProperty('medium');
      expect(responsive).toHaveProperty('large');
      expect(responsive).toHaveProperty('original');
    });

    it('should get CDN configuration', () => {
      const config = getCDNConfig();
      
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('provider');
      expect(config).toHaveProperty('domain');
      expect(typeof config.enabled).toBe('boolean');
    });
  });

  describe('Sentiment Analysis', () => {
    it('should detect positive sentiment', async () => {
      const text = 'This product is excellent! Great quality and very fresh. Highly recommend!';
      const result = await analyzeSentiment(text);
      
      expect(result.label).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', async () => {
      const text = 'Terrible product. Waste of money. Very disappointing and poor quality.';
      const result = await analyzeSentiment(text);
      
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(0);
    });

    it('should detect neutral sentiment', async () => {
      const text = 'The product arrived on time.';
      const result = await analyzeSentiment(text);
      
      expect(result.label).toBe('neutral');
      expect(Math.abs(result.score)).toBeLessThan(0.3);
    });

    it('should flag spam content', async () => {
      const text = 'Click here to visit our website and buy now! Limited time offer!';
      const result = await analyzeSentiment(text);
      
      expect(result.flags).toContain('spam');
    });

    it('should flag profanity', async () => {
      const text = 'This damn product is shit';
      const result = await analyzeSentiment(text);
      
      expect(result.flags).toContain('profanity');
    });

    it('should flag excessive caps', async () => {
      const text = 'THIS IS ABSOLUTELY TERRIBLE AND UNACCEPTABLE!!!';
      const result = await analyzeSentiment(text);
      
      expect(result.flags).toContain('excessive_caps');
    });

    it('should flag very short reviews', async () => {
      const text = 'Bad';
      const result = await analyzeSentiment(text);
      
      expect(result.flags).toContain('too_short');
    });

    it('should analyze complete review', async () => {
      const analysis = await analyzeReview(
        'Great product',
        'Very satisfied with the quality and freshness. Would buy again!',
        5
      );
      
      expect(analysis.sentiment).toBeDefined();
      expect(analysis.keywords).toBeDefined();
      expect(analysis.suggestedAction).toBeDefined();
      expect(Array.isArray(analysis.keywords)).toBe(true);
    });

    it('should detect sentiment-rating mismatch', async () => {
      const analysis = await analyzeReview(
        'Terrible',
        'Very disappointing and poor quality',
        5 // High rating with negative text
      );
      
      expect(analysis.suggestedAction).toBe('review');
      expect(analysis.reason).toContain('match');
    });
  });

  describe('Automated Moderation', () => {
    it('should have default moderation rules', () => {
      expect(DEFAULT_MODERATION_RULES).toBeDefined();
      expect(Array.isArray(DEFAULT_MODERATION_RULES)).toBe(true);
      expect(DEFAULT_MODERATION_RULES.length).toBeGreaterThan(0);
    });

    it('should reject spam reviews', async () => {
      const decision = await moderateReview(
        'Amazing offer',
        'Click here to visit our website! Buy now for limited time!',
        5,
        {
          userId: 1,
          listingId: 1,
          rating: 5,
          verifiedPurchase: false,
        }
      );
      
      expect(decision.action).toBe('reject');
      expect(decision.ruleId).toBe('reject_spam');
    });

    it('should flag profanity', async () => {
      const decision = await moderateReview(
        'Bad product',
        'This damn thing is shit',
        1,
        {
          userId: 1,
          listingId: 1,
          rating: 1,
          verifiedPurchase: true,
        }
      );
      
      expect(decision.action).toBe('flag');
      expect(decision.ruleId).toBe('flag_profanity');
    });

    it('should auto-approve verified positive reviews', async () => {
      const decision = await moderateReview(
        'Excellent product',
        'Very fresh and high quality. Great seller. Highly recommend!',
        5,
        {
          userId: 1,
          listingId: 1,
          rating: 5,
          verifiedPurchase: true,
        }
      );
      
      expect(decision.action).toBe('approve');
      expect(decision.confidence).toBeGreaterThan(0.4);
    });

    it('should flag unverified negative reviews', async () => {
      const decision = await moderateReview(
        'Poor quality',
        'Very disappointing. Waste of money.',
        1,
        {
          userId: 1,
          listingId: 1,
          rating: 1,
          verifiedPurchase: false,
        }
      );
      
      expect(decision.action).toBe('flag');
      expect(decision.ruleId).toBe('flag_unverified_negative');
    });

    it('should flag sentiment-rating mismatch', async () => {
      const decision = await moderateReview(
        'Terrible',
        'Very bad quality and disappointing',
        5, // High rating with negative text
        {
          userId: 1,
          listingId: 1,
          rating: 5,
          verifiedPurchase: true,
        }
      );
      
      expect(decision.action).toBe('flag');
      expect(decision.ruleId).toBe('flag_sentiment_mismatch');
    });

    it('should flag short reviews', async () => {
      const decision = await moderateReview(
        'OK',
        'Good',
        3,
        {
          userId: 1,
          listingId: 1,
          rating: 3,
          verifiedPurchase: false,
        }
      );
      
      expect(decision.action).toBe('flag');
      expect(decision.ruleId).toBe('flag_too_short');
    });

    it('should provide moderation decision with confidence', async () => {
      const decision = await moderateReview(
        'Great product',
        'Excellent quality and fast delivery',
        5,
        {
          userId: 1,
          listingId: 1,
          rating: 5,
          verifiedPurchase: true,
        }
      );
      
      expect(decision).toHaveProperty('action');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('ruleId');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('requiresHumanReview');
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });

    it('should apply rules in priority order', async () => {
      // Spam should be rejected (priority 1) even if other conditions match
      const decision = await moderateReview(
        'Great offer',
        'Excellent product! Click here to buy more at our website!',
        5,
        {
          userId: 1,
          listingId: 1,
          rating: 5,
          verifiedPurchase: true,
        }
      );
      
      expect(decision.action).toBe('reject');
      expect(decision.ruleId).toBe('reject_spam');
    });
  });

  describe('Integration: Full Review Flow', () => {
    it('should process review through complete workflow', async () => {
      const title = 'Great tomatoes';
      const comment = 'Very fresh and delicious. Perfect for salads. Will buy again!';
      const rating = 5;
      
      // Step 1: Analyze sentiment
      const sentiment = await analyzeSentiment(`${title} ${comment}`);
      expect(sentiment.label).toBe('positive');
      
      // Step 2: Analyze review
      const analysis = await analyzeReview(title, comment, rating);
      expect(analysis.suggestedAction).toBe('approve');
      
      // Step 3: Apply moderation
      const decision = await moderateReview(title, comment, rating, {
        userId: 1,
        listingId: 1,
        rating,
        verifiedPurchase: true,
      });
      
      expect(decision.action).toBe('approve');
      expect(decision.requiresHumanReview).toBe(false);
    });

    it('should flag suspicious review through complete workflow', async () => {
      const title = 'TERRIBLE';
      const comment = 'WORST PRODUCT EVER!!!';
      const rating = 5; // Mismatch
      
      // Step 1: Analyze sentiment
      const sentiment = await analyzeSentiment(`${title} ${comment}`);
      expect(sentiment.flags.length).toBeGreaterThan(0);
      
      // Step 2: Apply moderation
      const decision = await moderateReview(title, comment, rating, {
        userId: 1,
        listingId: 1,
        rating,
        verifiedPurchase: false,
      });
      
      expect(decision.action).toBe('flag');
      expect(decision.requiresHumanReview).toBe(true);
    });
  });
});
