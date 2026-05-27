import { describe, it, expect } from 'vitest';
import { predictHelpfulness, getFeatureImportance } from '../services/review-helpfulness-ml.js';

describe('Review Helpfulness ML', () => {
  it('should predict high helpfulness for detailed verified review', async () => {
    const prediction = await predictHelpfulness(
      'Excellent fresh tomatoes',
      'Perfect quality',
      5,
      true,
      true,
      0.8,
      0.7,
      10,
      0.85
    );

    expect(prediction.score).toBeGreaterThan(0.5);
    expect(prediction.features.verifiedPurchase).toBe(true);
  });

  it('should get feature importance', () => {
    const importance = getFeatureImportance();
    expect(importance).toHaveProperty('verifiedPurchase');
    expect(importance.verifiedPurchase).toBe(0.20);
  });
});
