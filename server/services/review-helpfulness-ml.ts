/**
 * Review Helpfulness ML Service
 * 
 * Predicts which reviews will be marked as helpful by users
 * Uses feature-based scoring with optional ML model integration
 */

export interface HelpfulnessFeatures {
  // Review characteristics
  reviewLength: number;
  hasPhotos: boolean;
  verifiedPurchase: boolean;
  rating: number;
  
  // Sentiment features
  sentimentScore: number;
  sentimentMagnitude: number;
  
  // Text quality features
  hasDetails: boolean;
  hasComparison: boolean;
  hasRecommendation: boolean;
  
  // User features
  userReviewCount: number;
  userHelpfulRate: number;
}

export interface HelpfulnessPrediction {
  score: number; // 0 to 1 (probability of being marked helpful)
  confidence: number; // 0 to 1
  features: HelpfulnessFeatures;
  reasoning: string[];
}

/**
 * Extract features from review text
 */
function extractTextFeatures(text: string): {
  hasDetails: boolean;
  hasComparison: boolean;
  hasRecommendation: boolean;
} {
  const lowerText = text.toLowerCase();
  
  // Check for detailed descriptions
  const detailKeywords = [
    'because', 'specifically', 'particularly', 'especially',
    'for example', 'such as', 'like', 'including',
    'size', 'color', 'texture', 'taste', 'smell', 'quality',
  ];
  const hasDetails = detailKeywords.some(keyword => lowerText.includes(keyword));
  
  // Check for comparisons
  const comparisonKeywords = [
    'better than', 'worse than', 'compared to', 'similar to',
    'unlike', 'different from', 'same as', 'as good as',
    'previous', 'other', 'alternative',
  ];
  const hasComparison = comparisonKeywords.some(keyword => lowerText.includes(keyword));
  
  // Check for recommendations
  const recommendationKeywords = [
    'recommend', 'suggest', 'would buy', 'will buy',
    'should buy', 'worth', 'try', 'avoid',
    'perfect for', 'ideal for', 'great for',
  ];
  const hasRecommendation = recommendationKeywords.some(keyword => lowerText.includes(keyword));
  
  return {
    hasDetails,
    hasComparison,
    hasRecommendation,
  };
}

/**
 * Calculate helpfulness score using feature-based model
 */
function calculateHelpfulnessScore(features: HelpfulnessFeatures): number {
  let score = 0;
  
  // Review length (optimal: 50-300 words)
  const wordCount = features.reviewLength / 5; // Rough estimate: 5 chars per word
  if (wordCount >= 50 && wordCount <= 300) {
    score += 0.20;
  } else if (wordCount >= 30 && wordCount <= 500) {
    score += 0.10;
  } else if (wordCount < 10) {
    score -= 0.10; // Penalty for very short reviews
  }
  
  // Photos add credibility
  if (features.hasPhotos) {
    score += 0.15;
  }
  
  // Verified purchase is highly valued
  if (features.verifiedPurchase) {
    score += 0.20;
  }
  
  // Moderate ratings (2-4 stars) tend to be more helpful than extremes
  if (features.rating >= 2 && features.rating <= 4) {
    score += 0.10;
  } else if (features.rating === 5) {
    score += 0.05; // 5-star reviews can be helpful but often lack detail
  }
  
  // Sentiment features
  if (Math.abs(features.sentimentScore) > 0.3) {
    score += 0.05; // Clear sentiment is good
  }
  if (features.sentimentMagnitude > 0.5) {
    score += 0.05; // Strong sentiment indicates engagement
  }
  
  // Text quality features
  if (features.hasDetails) {
    score += 0.15; // Detailed reviews are very helpful
  }
  if (features.hasComparison) {
    score += 0.10; // Comparisons provide context
  }
  if (features.hasRecommendation) {
    score += 0.10; // Recommendations are actionable
  }
  
  // User reputation
  if (features.userReviewCount >= 5) {
    score += 0.05; // Experienced reviewers
  }
  if (features.userHelpfulRate > 0.7) {
    score += 0.10; // Consistently helpful reviewer
  }
  
  // Normalize to 0-1 range
  return Math.max(0, Math.min(1, score));
}

/**
 * Generate reasoning for the prediction
 */
function generateReasoning(features: HelpfulnessFeatures, score: number): string[] {
  const reasoning: string[] = [];
  
  const wordCount = features.reviewLength / 5;
  
  if (score > 0.7) {
    reasoning.push('High probability of being helpful');
  } else if (score > 0.5) {
    reasoning.push('Moderate probability of being helpful');
  } else {
    reasoning.push('Low probability of being helpful');
  }
  
  if (features.verifiedPurchase) {
    reasoning.push('✓ Verified purchase adds credibility');
  }
  
  if (features.hasPhotos) {
    reasoning.push('✓ Includes photos for visual reference');
  }
  
  if (features.hasDetails) {
    reasoning.push('✓ Contains detailed descriptions');
  }
  
  if (features.hasComparison) {
    reasoning.push('✓ Provides comparisons for context');
  }
  
  if (features.hasRecommendation) {
    reasoning.push('✓ Includes actionable recommendations');
  }
  
  if (wordCount >= 50 && wordCount <= 300) {
    reasoning.push('✓ Optimal review length');
  } else if (wordCount < 10) {
    reasoning.push('✗ Review is very short');
  } else if (wordCount > 500) {
    reasoning.push('⚠ Review is quite long');
  }
  
  if (features.rating >= 2 && features.rating <= 4) {
    reasoning.push('✓ Moderate rating (often more detailed)');
  }
  
  if (features.userHelpfulRate > 0.7 && features.userReviewCount >= 5) {
    reasoning.push('✓ Consistently helpful reviewer');
  }
  
  return reasoning;
}

/**
 * Predict review helpfulness
 */
export async function predictHelpfulness(
  reviewText: string,
  title: string,
  rating: number,
  hasPhotos: boolean,
  verifiedPurchase: boolean,
  sentimentScore: number,
  sentimentMagnitude: number,
  userReviewCount: number = 0,
  userHelpfulRate: number = 0
): Promise<HelpfulnessPrediction> {
  // Combine title and review text
  const fullText = `${title} ${reviewText}`;
  
  // Extract text features
  const textFeatures = extractTextFeatures(fullText);
  
  // Build feature vector
  const features: HelpfulnessFeatures = {
    reviewLength: fullText.length,
    hasPhotos,
    verifiedPurchase,
    rating,
    sentimentScore,
    sentimentMagnitude,
    hasDetails: textFeatures.hasDetails,
    hasComparison: textFeatures.hasComparison,
    hasRecommendation: textFeatures.hasRecommendation,
    userReviewCount,
    userHelpfulRate,
  };
  
  // Calculate score
  const score = calculateHelpfulnessScore(features);
  
  // Calculate confidence based on feature completeness
  let confidence = 0.5; // Base confidence
  
  if (verifiedPurchase) confidence += 0.15;
  if (hasPhotos) confidence += 0.10;
  if (textFeatures.hasDetails) confidence += 0.10;
  if (userReviewCount >= 5) confidence += 0.10;
  if (fullText.length > 50) confidence += 0.05;
  
  confidence = Math.min(1, confidence);
  
  // Generate reasoning
  const reasoning = generateReasoning(features, score);
  
  return {
    score,
    confidence,
    features,
    reasoning,
  };
}

/**
 * Batch predict helpfulness for multiple reviews
 */
export async function batchPredictHelpfulness(
  reviews: Array<{
    reviewText: string;
    title: string;
    rating: number;
    hasPhotos: boolean;
    verifiedPurchase: boolean;
    sentimentScore: number;
    sentimentMagnitude: number;
    userReviewCount?: number;
    userHelpfulRate?: number;
  }>
): Promise<HelpfulnessPrediction[]> {
  return Promise.all(
    reviews.map(review =>
      predictHelpfulness(
        review.reviewText,
        review.title,
        review.rating,
        review.hasPhotos,
        review.verifiedPurchase,
        review.sentimentScore,
        review.sentimentMagnitude,
        review.userReviewCount,
        review.userHelpfulRate
      )
    )
  );
}

/**
 * Get feature importance weights
 */
export function getFeatureImportance(): Record<string, number> {
  return {
    verifiedPurchase: 0.20,
    reviewLength: 0.20,
    hasDetails: 0.15,
    hasPhotos: 0.15,
    hasComparison: 0.10,
    hasRecommendation: 0.10,
    userHelpfulRate: 0.10,
    rating: 0.10,
    sentimentMagnitude: 0.05,
    sentimentScore: 0.05,
    userReviewCount: 0.05,
  };
}

/**
 * Rank reviews by predicted helpfulness
 */
export function rankByHelpfulness(
  predictions: Array<HelpfulnessPrediction & { reviewId: number }>
): Array<{ reviewId: number; score: number; rank: number }> {
  const sorted = [...predictions].sort((a, b) => b.score - a.score);
  
  return sorted.map((pred, index) => ({
    reviewId: pred.reviewId,
    score: pred.score,
    rank: index + 1,
  }));
}

/**
 * Get helpfulness statistics
 */
export function getHelpfulnessStats(predictions: HelpfulnessPrediction[]): {
  averageScore: number;
  highHelpfulness: number; // score > 0.7
  moderateHelpfulness: number; // 0.5 < score <= 0.7
  lowHelpfulness: number; // score <= 0.5
  averageConfidence: number;
} {
  const averageScore = predictions.reduce((sum, p) => sum + p.score, 0) / predictions.length;
  const averageConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
  
  const highHelpfulness = predictions.filter(p => p.score > 0.7).length;
  const moderateHelpfulness = predictions.filter(p => p.score > 0.5 && p.score <= 0.7).length;
  const lowHelpfulness = predictions.filter(p => p.score <= 0.5).length;
  
  return {
    averageScore,
    highHelpfulness,
    moderateHelpfulness,
    lowHelpfulness,
    averageConfidence,
  };
}

/**
 * Suggest improvements for low-helpfulness reviews
 */
export function suggestImprovements(features: HelpfulnessFeatures): string[] {
  const suggestions: string[] = [];
  
  const wordCount = features.reviewLength / 5;
  
  if (wordCount < 30) {
    suggestions.push('Add more details about your experience');
  }
  
  if (!features.hasPhotos) {
    suggestions.push('Include photos of the product');
  }
  
  if (!features.hasDetails) {
    suggestions.push('Describe specific aspects (quality, freshness, taste, etc.)');
  }
  
  if (!features.hasComparison) {
    suggestions.push('Compare with similar products or previous purchases');
  }
  
  if (!features.hasRecommendation) {
    suggestions.push('Mention who would benefit from this product');
  }
  
  if (!features.verifiedPurchase) {
    suggestions.push('Purchase the product to add "Verified Purchase" badge');
  }
  
  return suggestions;
}
