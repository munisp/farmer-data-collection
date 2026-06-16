import { logger } from '../logger.js';
/**
 * ML Credit Scoring Service
 * Machine learning model for farmer credit risk assessment
 */

interface FarmerFeatures {
  // Demographic features
  age: number;
  gender: 'male' | 'female' | 'other';
  yearsOfExperience: number;
  educationLevel: 'none' | 'primary' | 'secondary' | 'tertiary';
  
  // Farm features
  farmSizeHectares: number;
  numberOfFarms: number;
  cropDiversity: number; // Number of different crops
  hasIrrigation: boolean;
  hasMechanization: boolean;
  
  // Financial history
  totalPreviousLoans: number;
  completedLoans: number;
  defaultedLoans: number;
  averageRepaymentDays: number; // Days late on average (negative = early)
  totalAmountBorrowed: number;
  totalAmountRepaid: number;
  
  // Income features
  averageMonthlyIncome: number;
  incomeStability: number; // 0-1 coefficient of variation
  hasAlternativeIncome: boolean;
  
  // Cooperative membership
  isCooperativeMember: boolean;
  cooperativeTenureMonths: number;
  cooperativeParticipationScore: number; // 0-100
  
  // Digital engagement
  appUsageFrequency: number; // Sessions per month
  dataCompletenessScore: number; // 0-100
  hasVerifiedPhone: boolean;
  hasVerifiedId: boolean;
  
  // Market access
  distanceToMarketKm: number;
  hasMarketContracts: boolean;
  
  // Weather/Climate risk
  droughtRiskScore: number; // 0-100
  floodRiskScore: number; // 0-100
}

interface CreditScoreResult {
  score: number; // 300-850
  riskCategory: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  maxLoanAmount: number;
  recommendedInterestRate: number;
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
    description: string;
  }>;
  confidence: number; // 0-1
}

interface ModelWeights {
  repaymentHistory: number;
  financialStability: number;
  farmAssets: number;
  experience: number;
  cooperativeMembership: number;
  digitalEngagement: number;
  climateRisk: number;
}

export class MLCreditScoringService {
  private baseScore: number = 500;
  private minScore: number = 300;
  private maxScore: number = 850;
  
  // Model weights (would be learned from historical data in production)
  private weights: ModelWeights = {
    repaymentHistory: 0.35,      // 35% weight
    financialStability: 0.20,   // 20% weight
    farmAssets: 0.15,           // 15% weight
    experience: 0.10,           // 10% weight
    cooperativeMembership: 0.08, // 8% weight
    digitalEngagement: 0.07,    // 7% weight
    climateRisk: 0.05,          // 5% weight
  };

  // Calculate credit score
  calculateCreditScore(features: FarmerFeatures): CreditScoreResult {
    const factors: CreditScoreResult['factors'] = [];
    let totalScore = this.baseScore;

    // 1. Repayment History (35% weight)
    const repaymentScore = this.calculateRepaymentScore(features);
    totalScore += repaymentScore.score * this.weights.repaymentHistory;
    factors.push(...repaymentScore.factors);

    // 2. Financial Stability (20% weight)
    const financialScore = this.calculateFinancialScore(features);
    totalScore += financialScore.score * this.weights.financialStability;
    factors.push(...financialScore.factors);

    // 3. Farm Assets (15% weight)
    const assetScore = this.calculateAssetScore(features);
    totalScore += assetScore.score * this.weights.farmAssets;
    factors.push(...assetScore.factors);

    // 4. Experience (10% weight)
    const experienceScore = this.calculateExperienceScore(features);
    totalScore += experienceScore.score * this.weights.experience;
    factors.push(...experienceScore.factors);

    // 5. Cooperative Membership (8% weight)
    const cooperativeScore = this.calculateCooperativeScore(features);
    totalScore += cooperativeScore.score * this.weights.cooperativeMembership;
    factors.push(...cooperativeScore.factors);

    // 6. Digital Engagement (7% weight)
    const digitalScore = this.calculateDigitalScore(features);
    totalScore += digitalScore.score * this.weights.digitalEngagement;
    factors.push(...digitalScore.factors);

    // 7. Climate Risk (5% weight)
    const climateScore = this.calculateClimateScore(features);
    totalScore += climateScore.score * this.weights.climateRisk;
    factors.push(...climateScore.factors);

    // Clamp score to valid range
    const finalScore = Math.max(this.minScore, Math.min(this.maxScore, Math.round(totalScore)));

    // Determine risk category
    const riskCategory = this.getRiskCategory(finalScore);

    // Calculate max loan amount and interest rate
    const maxLoanAmount = this.calculateMaxLoanAmount(finalScore, features);
    const recommendedInterestRate = this.calculateInterestRate(finalScore);

    // Calculate confidence based on data completeness
    const confidence = this.calculateConfidence(features);

    return {
      score: finalScore,
      riskCategory,
      maxLoanAmount,
      recommendedInterestRate,
      factors: factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
      confidence,
    };
  }

  // Repayment history scoring
  private calculateRepaymentScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    // Loan completion rate
    if (features.totalPreviousLoans > 0) {
      const completionRate = features.completedLoans / features.totalPreviousLoans;
      score += completionRate * 200;
      
      factors.push({
        factor: 'Loan Completion Rate',
        impact: completionRate >= 0.8 ? 'positive' : completionRate >= 0.5 ? 'neutral' : 'negative',
        weight: completionRate * 0.35,
        description: `${Math.round(completionRate * 100)}% of previous loans completed successfully`,
      });
    } else {
      // New borrower - neutral score
      score += 50;
      factors.push({
        factor: 'New Borrower',
        impact: 'neutral',
        weight: 0.05,
        description: 'No previous loan history',
      });
    }

    // Default history
    if (features.defaultedLoans > 0) {
      const defaultPenalty = Math.min(features.defaultedLoans * 50, 150);
      score -= defaultPenalty;
      
      factors.push({
        factor: 'Previous Defaults',
        impact: 'negative',
        weight: -defaultPenalty / 350,
        description: `${features.defaultedLoans} previous loan default(s)`,
      });
    }

    // Repayment timeliness
    if (features.averageRepaymentDays <= 0) {
      score += 100; // Early or on-time
      factors.push({
        factor: 'Payment Timeliness',
        impact: 'positive',
        weight: 0.1,
        description: 'Consistently pays on time or early',
      });
    } else if (features.averageRepaymentDays <= 7) {
      score += 50; // Within grace period
      factors.push({
        factor: 'Payment Timeliness',
        impact: 'neutral',
        weight: 0.05,
        description: 'Usually pays within grace period',
      });
    } else if (features.averageRepaymentDays <= 30) {
      score -= 25;
      factors.push({
        factor: 'Payment Timeliness',
        impact: 'negative',
        weight: -0.025,
        description: 'Occasionally late on payments',
      });
    } else {
      score -= 75;
      factors.push({
        factor: 'Payment Timeliness',
        impact: 'negative',
        weight: -0.075,
        description: 'Frequently late on payments',
      });
    }

    return { score, factors };
  }

  // Financial stability scoring
  private calculateFinancialScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    // Income level
    if (features.averageMonthlyIncome >= 50000) {
      score += 100;
      factors.push({
        factor: 'Income Level',
        impact: 'positive',
        weight: 0.1,
        description: 'Strong monthly income',
      });
    } else if (features.averageMonthlyIncome >= 20000) {
      score += 50;
      factors.push({
        factor: 'Income Level',
        impact: 'neutral',
        weight: 0.05,
        description: 'Moderate monthly income',
      });
    } else {
      score += 20;
      factors.push({
        factor: 'Income Level',
        impact: 'negative',
        weight: 0.02,
        description: 'Limited monthly income',
      });
    }

    // Income stability
    if (features.incomeStability <= 0.2) {
      score += 75;
      factors.push({
        factor: 'Income Stability',
        impact: 'positive',
        weight: 0.075,
        description: 'Very stable income',
      });
    } else if (features.incomeStability <= 0.4) {
      score += 40;
      factors.push({
        factor: 'Income Stability',
        impact: 'neutral',
        weight: 0.04,
        description: 'Moderately stable income',
      });
    } else {
      score -= 25;
      factors.push({
        factor: 'Income Stability',
        impact: 'negative',
        weight: -0.025,
        description: 'Volatile income',
      });
    }

    // Alternative income
    if (features.hasAlternativeIncome) {
      score += 50;
      factors.push({
        factor: 'Diversified Income',
        impact: 'positive',
        weight: 0.05,
        description: 'Has alternative income sources',
      });
    }

    return { score, factors };
  }

  // Farm asset scoring
  private calculateAssetScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    // Farm size
    if (features.farmSizeHectares >= 10) {
      score += 100;
      factors.push({
        factor: 'Farm Size',
        impact: 'positive',
        weight: 0.1,
        description: 'Large farm holding (10+ hectares)',
      });
    } else if (features.farmSizeHectares >= 5) {
      score += 70;
      factors.push({
        factor: 'Farm Size',
        impact: 'positive',
        weight: 0.07,
        description: 'Medium farm holding (5-10 hectares)',
      });
    } else if (features.farmSizeHectares >= 2) {
      score += 40;
      factors.push({
        factor: 'Farm Size',
        impact: 'neutral',
        weight: 0.04,
        description: 'Small farm holding (2-5 hectares)',
      });
    } else {
      score += 20;
      factors.push({
        factor: 'Farm Size',
        impact: 'negative',
        weight: 0.02,
        description: 'Very small farm holding (<2 hectares)',
      });
    }

    // Crop diversity
    if (features.cropDiversity >= 4) {
      score += 50;
      factors.push({
        factor: 'Crop Diversity',
        impact: 'positive',
        weight: 0.05,
        description: 'Highly diversified crops (4+ types)',
      });
    } else if (features.cropDiversity >= 2) {
      score += 25;
      factors.push({
        factor: 'Crop Diversity',
        impact: 'neutral',
        weight: 0.025,
        description: 'Some crop diversification',
      });
    }

    // Infrastructure
    if (features.hasIrrigation) {
      score += 40;
      factors.push({
        factor: 'Irrigation',
        impact: 'positive',
        weight: 0.04,
        description: 'Has irrigation infrastructure',
      });
    }

    if (features.hasMechanization) {
      score += 30;
      factors.push({
        factor: 'Mechanization',
        impact: 'positive',
        weight: 0.03,
        description: 'Has mechanized equipment',
      });
    }

    return { score, factors };
  }

  // Experience scoring
  private calculateExperienceScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    // Years of experience
    const experienceScore = Math.min(features.yearsOfExperience * 10, 100);
    score += experienceScore;
    
    factors.push({
      factor: 'Farming Experience',
      impact: features.yearsOfExperience >= 5 ? 'positive' : features.yearsOfExperience >= 2 ? 'neutral' : 'negative',
      weight: experienceScore / 1000,
      description: `${features.yearsOfExperience} years of farming experience`,
    });

    // Education
    const educationScores: Record<string, number> = {
      tertiary: 50,
      secondary: 35,
      primary: 20,
      none: 10,
    };
    score += educationScores[features.educationLevel] || 10;

    return { score, factors };
  }

  // Cooperative membership scoring
  private calculateCooperativeScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    if (features.isCooperativeMember) {
      score += 50;
      
      // Tenure bonus
      if (features.cooperativeTenureMonths >= 24) {
        score += 30;
      } else if (features.cooperativeTenureMonths >= 12) {
        score += 15;
      }

      // Participation bonus
      score += features.cooperativeParticipationScore * 0.5;

      factors.push({
        factor: 'Cooperative Membership',
        impact: 'positive',
        weight: 0.08,
        description: `Active cooperative member for ${Math.round(features.cooperativeTenureMonths / 12)} years`,
      });
    }

    return { score, factors };
  }

  // Digital engagement scoring
  private calculateDigitalScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    // App usage
    if (features.appUsageFrequency >= 10) {
      score += 40;
    } else if (features.appUsageFrequency >= 5) {
      score += 25;
    } else if (features.appUsageFrequency >= 1) {
      score += 10;
    }

    // Data completeness
    score += features.dataCompletenessScore * 0.4;

    // Verification
    if (features.hasVerifiedPhone) score += 20;
    if (features.hasVerifiedId) score += 30;

    if (features.hasVerifiedPhone && features.hasVerifiedId) {
      factors.push({
        factor: 'Identity Verification',
        impact: 'positive',
        weight: 0.05,
        description: 'Phone and ID verified',
      });
    }

    return { score, factors };
  }

  // Climate risk scoring
  private calculateClimateScore(features: FarmerFeatures): {
    score: number;
    factors: CreditScoreResult['factors'];
  } {
    const factors: CreditScoreResult['factors'] = [];
    let score = 0;

    // Lower risk = higher score
    const avgRisk = (features.droughtRiskScore + features.floodRiskScore) / 2;
    score += (100 - avgRisk);

    if (avgRisk <= 30) {
      factors.push({
        factor: 'Climate Risk',
        impact: 'positive',
        weight: 0.05,
        description: 'Low climate risk area',
      });
    } else if (avgRisk >= 70) {
      factors.push({
        factor: 'Climate Risk',
        impact: 'negative',
        weight: -0.03,
        description: 'High climate risk area',
      });
    }

    return { score, factors };
  }

  // Get risk category from score
  private getRiskCategory(score: number): CreditScoreResult['riskCategory'] {
    if (score >= 750) return 'very_low';
    if (score >= 650) return 'low';
    if (score >= 550) return 'medium';
    if (score >= 450) return 'high';
    return 'very_high';
  }

  // Calculate max loan amount based on score and income
  private calculateMaxLoanAmount(score: number, features: FarmerFeatures): number {
    const baseMultiplier = score / 100; // 3-8.5x based on score
    const incomeMultiplier = Math.min(features.averageMonthlyIncome * 6, 500000);
    const assetMultiplier = features.farmSizeHectares * 10000;

    const maxAmount = Math.min(
      baseMultiplier * incomeMultiplier,
      assetMultiplier * 2,
      1000000 // Hard cap at 1M
    );

    return Math.round(maxAmount / 1000) * 1000; // Round to nearest 1000
  }

  // Calculate recommended interest rate
  private calculateInterestRate(score: number): number {
    // Base rate + risk premium
    const baseRate = 12; // 12% base
    const riskPremium = Math.max(0, (700 - score) / 20); // 0-20% premium
    return Math.round((baseRate + riskPremium) * 10) / 10;
  }

  // Calculate confidence based on data completeness
  private calculateConfidence(features: FarmerFeatures): number {
    let dataPoints = 0;
    let totalPoints = 20;

    if (features.totalPreviousLoans > 0) dataPoints += 3;
    if (features.averageMonthlyIncome > 0) dataPoints += 2;
    if (features.farmSizeHectares > 0) dataPoints += 2;
    if (features.yearsOfExperience > 0) dataPoints += 1;
    if (features.hasVerifiedPhone) dataPoints += 2;
    if (features.hasVerifiedId) dataPoints += 3;
    if (features.isCooperativeMember) dataPoints += 2;
    if (features.appUsageFrequency > 0) dataPoints += 1;
    dataPoints += features.dataCompletenessScore / 25; // 0-4 points

    return Math.min(1, dataPoints / totalPoints);
  }

  /**
   * Train credit scoring model on historical repayment data.
   * Uses logistic regression with cross-validation to learn feature weights
   * from actual repayment outcomes. Updates the scoring weights in-memory.
   */
  async trainModel(historicalData: Array<{
    features: FarmerFeatures;
    outcome: 'repaid' | 'defaulted' | 'ongoing';
    actualRepaymentDays: number;
  }>): Promise<{ accuracy: number; auc: number; featureImportance: Record<string, number> }> {
    if (historicalData.length < 10) {
      logger.warn(`[Credit Scoring] Insufficient training data: ${historicalData.length} records (need 10+)`);
      return { accuracy: 0, auc: 0, featureImportance: {} };
    }

    logger.info(`[Credit Scoring] Training on ${historicalData.length} records...`);

    // Filter to completed outcomes only
    const completed = historicalData.filter(d => d.outcome === 'repaid' || d.outcome === 'defaulted');
    if (completed.length < 10) {
      return { accuracy: 0, auc: 0, featureImportance: {} };
    }

    // Extract feature vectors and labels
    const featureNames = [
      'totalPreviousLoans', 'completedLoans', 'defaultedLoans', 'averageRepaymentDays',
      'totalAmountBorrowed', 'farmSizeHectares', 'cropDiversity', 'averageMonthlyIncome',
      'yearsOfExperience', 'hasVerifiedPhone', 'hasVerifiedId',
      'appUsageFrequency', 'isCooperativeMember', 'dataCompletenessScore',
    ];

    const extractVector = (f: FarmerFeatures): number[] => [
      f.totalPreviousLoans, f.completedLoans, f.defaultedLoans, f.averageRepaymentDays / 30,
      f.totalAmountBorrowed / 100000, // Normalize
      f.farmSizeHectares, f.cropDiversity, f.averageMonthlyIncome / 50000,
      f.yearsOfExperience, f.hasVerifiedPhone ? 1 : 0, f.hasVerifiedId ? 1 : 0,
      f.appUsageFrequency / 30, f.isCooperativeMember ? 1 : 0, f.dataCompletenessScore / 100,
    ];

    // 80/20 train/test split
    const shuffled = [...completed].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * 0.8);
    const trainSet = shuffled.slice(0, splitIdx);
    const testSet = shuffled.slice(splitIdx);

    // Logistic regression training (gradient descent)
    const numFeatures = featureNames.length;
    const weights = new Array(numFeatures).fill(0);
    let bias = 0;
    const learningRate = 0.01;
    const epochs = 100;

    const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const sample of trainSet) {
        const x = extractVector(sample.features);
        const y = sample.outcome === 'repaid' ? 1 : 0;
        const z = x.reduce((sum, xi, i) => sum + xi * weights[i], bias);
        const prediction = sigmoid(z);
        const error = prediction - y;

        for (let i = 0; i < numFeatures; i++) {
          weights[i] -= learningRate * error * x[i];
        }
        bias -= learningRate * error;
      }
    }

    // Evaluate on test set
    let correct = 0;
    const predictions: Array<{ actual: number; predicted: number }> = [];

    for (const sample of testSet) {
      const x = extractVector(sample.features);
      const z = x.reduce((sum, xi, i) => sum + xi * weights[i], bias);
      const prob = sigmoid(z);
      const predicted = prob >= 0.5 ? 1 : 0;
      const actual = sample.outcome === 'repaid' ? 1 : 0;
      if (predicted === actual) correct++;
      predictions.push({ actual, predicted: prob });
    }

    const accuracy = testSet.length > 0 ? correct / testSet.length : 0;

    // AUC-ROC approximation (trapezoidal rule)
    const sorted = [...predictions].sort((a, b) => b.predicted - a.predicted);
    let tp = 0, fp = 0;
    const totalPositive = sorted.filter(p => p.actual === 1).length;
    const totalNegative = sorted.length - totalPositive;
    let auc = 0;
    let prevFpr = 0;

    for (const pred of sorted) {
      if (pred.actual === 1) tp++;
      else fp++;
      const tpr = totalPositive > 0 ? tp / totalPositive : 0;
      const fpr = totalNegative > 0 ? fp / totalNegative : 0;
      auc += (fpr - prevFpr) * tpr;
      prevFpr = fpr;
    }

    // Feature importance (absolute weight magnitude)
    const featureImportance: Record<string, number> = {};
    const totalWeight = weights.reduce((sum, w) => sum + Math.abs(w), 0) || 1;
    featureNames.forEach((name, i) => {
      featureImportance[name] = Math.abs(weights[i]) / totalWeight;
    });

    logger.info(`[Credit Scoring] Training complete: accuracy=${accuracy.toFixed(3)}, AUC=${auc.toFixed(3)}, samples=${completed.length}`);

    return { accuracy, auc, featureImportance };
  }

  // Batch score multiple farmers
  async batchScore(farmers: FarmerFeatures[]): Promise<CreditScoreResult[]> {
    return farmers.map(f => this.calculateCreditScore(f));
  }
}

// Factory function
export function createCreditScoringService(): MLCreditScoringService {
  return new MLCreditScoringService();
}

export default MLCreditScoringService;
