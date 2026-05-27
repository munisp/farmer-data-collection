/**
 * Sentiment Analysis Service
 * 
 * Analyzes review text for sentiment (positive, negative, neutral)
 * Uses simple keyword-based analysis with optional ML integration
 */

export interface SentimentResult {
  score: number; // -1 to 1 (negative to positive)
  magnitude: number; // 0 to 1 (strength of sentiment)
  label: 'positive' | 'negative' | 'neutral';
  confidence: number; // 0 to 1
  flags: string[]; // Potential issues (spam, profanity, etc.)
}

export interface ReviewAnalysis {
  sentiment: SentimentResult;
  keywords: string[];
  suggestedAction: 'approve' | 'review' | 'flag' | 'reject';
  reason?: string;
}

// Positive keywords
const POSITIVE_KEYWORDS = [
  'excellent', 'great', 'amazing', 'wonderful', 'fantastic', 'perfect',
  'love', 'best', 'awesome', 'outstanding', 'superb', 'brilliant',
  'delicious', 'fresh', 'quality', 'recommend', 'satisfied', 'happy',
  'good', 'nice', 'beautiful', 'tasty', 'clean', 'healthy',
];

// Negative keywords
const NEGATIVE_KEYWORDS = [
  'terrible', 'awful', 'horrible', 'worst', 'bad', 'poor',
  'disappointing', 'waste', 'rotten', 'spoiled', 'moldy', 'stale',
  'overpriced', 'expensive', 'scam', 'fake', 'fraud', 'dishonest',
  'never', 'avoid', 'refund', 'complaint', 'angry', 'disgusting',
];

// Spam indicators
const SPAM_INDICATORS = [
  'click here', 'visit', 'http://', 'https://', 'www.',
  'buy now', 'limited time', 'act now', 'call now',
  'free money', 'earn', 'prize', 'winner', 'congratulations',
];

// Profanity (basic list - extend as needed)
const PROFANITY = [
  'damn', 'hell', 'crap', 'shit', 'fuck', 'ass', 'bitch',
  // Add more as needed
];

/**
 * Analyze review text for sentiment
 */
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      magnitude: 0,
      label: 'neutral',
      confidence: 0,
      flags: [],
    };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  // Count positive and negative words
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of words) {
    if (POSITIVE_KEYWORDS.some(keyword => word.includes(keyword))) {
      positiveCount++;
    }
    if (NEGATIVE_KEYWORDS.some(keyword => word.includes(keyword))) {
      negativeCount++;
    }
  }
  
  // Calculate sentiment score (-1 to 1)
  const totalSentimentWords = positiveCount + negativeCount;
  let score = 0;
  if (totalSentimentWords > 0) {
    score = (positiveCount - negativeCount) / totalSentimentWords;
  }
  
  // Calculate magnitude (strength of sentiment)
  const magnitude = Math.min(totalSentimentWords / words.length, 1);
  
  // Determine label
  let label: 'positive' | 'negative' | 'neutral';
  if (score > 0.2) {
    label = 'positive';
  } else if (score < -0.2) {
    label = 'negative';
  } else {
    label = 'neutral';
  }
  
  // Calculate confidence based on magnitude
  const confidence = Math.min(magnitude * 2, 1);
  
  // Check for flags
  const flags: string[] = [];
  
  // Check for spam
  if (SPAM_INDICATORS.some(indicator => lowerText.includes(indicator))) {
    flags.push('spam');
  }
  
  // Check for profanity
  if (PROFANITY.some(word => lowerText.includes(word))) {
    flags.push('profanity');
  }
  
  // Check for excessive caps (shouting)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 20) {
    flags.push('excessive_caps');
  }
  
  // Check for repeated characters (e.g., "sooooo good")
  if (/(.)\1{3,}/.test(text)) {
    flags.push('repeated_chars');
  }
  
  // Check for very short review
  if (words.length < 3) {
    flags.push('too_short');
  }
  
  return {
    score,
    magnitude,
    label,
    confidence,
    flags,
  };
}

/**
 * Analyze complete review (text + title + rating)
 */
export async function analyzeReview(
  title: string,
  comment: string,
  rating: number
): Promise<ReviewAnalysis> {
  // Combine title and comment for analysis
  const fullText = `${title} ${comment}`;
  
  // Get sentiment
  const sentiment = await analyzeSentiment(fullText);
  
  // Extract keywords (simple approach - top words)
  const words = fullText.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !['this', 'that', 'with', 'from', 'have', 'been', 'were'].includes(word));
  
  const wordFreq: Record<string, number> = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  
  const keywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  
  // Determine suggested action
  let suggestedAction: 'approve' | 'review' | 'flag' | 'reject';
  let reason: string | undefined;
  
  // Check for immediate rejection
  if (sentiment.flags.includes('spam')) {
    suggestedAction = 'reject';
    reason = 'Detected spam indicators';
  } else if (sentiment.flags.includes('profanity')) {
    suggestedAction = 'flag';
    reason = 'Contains profanity';
  } else if (sentiment.flags.includes('too_short')) {
    suggestedAction = 'review';
    reason = 'Review is very short';
  } else if (sentiment.flags.includes('excessive_caps')) {
    suggestedAction = 'review';
    reason = 'Excessive capitalization';
  } else {
    // Check sentiment-rating mismatch
    const expectedSentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
    
    if (sentiment.label !== expectedSentiment && sentiment.confidence > 0.5) {
      suggestedAction = 'review';
      reason = `Sentiment (${sentiment.label}) doesn't match rating (${rating} stars)`;
    } else if (sentiment.label === 'negative' && rating >= 4) {
      suggestedAction = 'review';
      reason = 'Negative sentiment with high rating';
    } else if (sentiment.label === 'positive' && rating <= 2) {
      suggestedAction = 'review';
      reason = 'Positive sentiment with low rating';
    } else {
      suggestedAction = 'approve';
    }
  }
  
  return {
    sentiment,
    keywords,
    suggestedAction,
    reason,
  };
}

/**
 * Batch analyze multiple reviews
 */
export async function analyzeReviews(
  reviews: Array<{ title: string; comment: string; rating: number }>
): Promise<ReviewAnalysis[]> {
  return Promise.all(
    reviews.map(review => analyzeReview(review.title, review.comment, review.rating))
  );
}

/**
 * Get sentiment statistics for a set of reviews
 */
export function getSentimentStats(results: SentimentResult[]): {
  positive: number;
  negative: number;
  neutral: number;
  averageScore: number;
  averageMagnitude: number;
  flaggedCount: number;
} {
  const positive = results.filter(r => r.label === 'positive').length;
  const negative = results.filter(r => r.label === 'negative').length;
  const neutral = results.filter(r => r.label === 'neutral').length;
  
  const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const averageMagnitude = results.reduce((sum, r) => sum + r.magnitude, 0) / results.length;
  
  const flaggedCount = results.filter(r => r.flags.length > 0).length;
  
  return {
    positive,
    negative,
    neutral,
    averageScore,
    averageMagnitude,
    flaggedCount,
  };
}

/**
 * Check if review should be auto-flagged
 */
export function shouldAutoFlag(analysis: ReviewAnalysis): boolean {
  return (
    analysis.suggestedAction === 'flag' ||
    analysis.suggestedAction === 'reject' ||
    analysis.sentiment.flags.length > 0
  );
}

/**
 * Check if review should be auto-approved
 */
export function shouldAutoApprove(analysis: ReviewAnalysis): boolean {
  return (
    analysis.suggestedAction === 'approve' &&
    analysis.sentiment.flags.length === 0 &&
    analysis.sentiment.confidence > 0.3
  );
}
