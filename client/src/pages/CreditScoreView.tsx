/**
 * Credit Score View
 * Transparent, explainable credit scoring for farmers
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Info,
  RefreshCw,
  History,
  Target,
  Lightbulb,
  Shield,
  DollarSign,
  Calendar,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

const bandInfo = [
  { band: 'A', label: 'Excellent', minScore: 800, maxScore: 1000, color: 'bg-green-500', textColor: 'text-green-700' },
  { band: 'B', label: 'Good', minScore: 650, maxScore: 799, color: 'bg-blue-500', textColor: 'text-blue-700' },
  { band: 'C', label: 'Fair', minScore: 500, maxScore: 649, color: 'bg-yellow-500', textColor: 'text-yellow-700' },
  { band: 'D', label: 'Poor', minScore: 350, maxScore: 499, color: 'bg-orange-500', textColor: 'text-orange-700' },
  { band: 'E', label: 'Very Poor', minScore: 0, maxScore: 349, color: 'bg-red-500', textColor: 'text-red-700' },
];

export default function CreditScoreView() {
  const { formatCurrency } = useLocalization();
  const { toast } = useToast();
  const [userId] = useState(1);

  const { data: creditScore, isLoading: scoreLoading, refetch: refetchScore } = trpc.creditScoring.getScore.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const { data: scoreHistory, isLoading: historyLoading } = trpc.creditScoring.getHistory.useQuery(
    { userId, limit: 10 },
    { enabled: !!userId }
  );

  const { data: bandInfoData } = trpc.creditScoring.getBandInfo.useQuery();

  const calculateMutation = trpc.creditScoring.calculateScore.useMutation({
    onSuccess: () => {
      toast({ title: 'Score recalculated', description: 'Your credit score has been updated.' });
      refetchScore();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const isCalculating = calculateMutation.isPending;

    // Map tRPC response to UI expected shape
    const currentScore: any = creditScore ? {
      ...creditScore,
      lastCalculated: creditScore.calculatedAt || new Date().toISOString(),
      change: 0, // previousScore not available in current schema
      recommendedLoanLimit: creditScore.recommendedLoanLimit || 0,
      probabilityOfDefault: creditScore.probabilityOfDefault || 0,
    } : {
      score: 0,
      band: 'E',
      previousScore: 0,
      change: 0,
      lastCalculated: new Date().toISOString(),
      dataCompleteness: 0,
      confidenceLevel: 'low',
      recommendedLoanLimit: 0,
      recommendedTermMonths: 0,
      recommendedInterestRate: 0,
      probabilityOfDefault: 0,
      factors: [],
    };

  const currentBandInfo = bandInfo.find(b => b.band === currentScore.band) || bandInfo[4];
  const scorePercentage = (currentScore.score / 1000) * 100;

  const handleRecalculate = () => {
    calculateMutation.mutate({ userId });
  };

  if (scoreLoading) {
    return (
      <div role="main" aria-label="Page content" className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'positive':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'negative':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Info className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'positive':
        return 'border-green-200 bg-green-50';
      case 'negative':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-yellow-200 bg-yellow-50';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Credit Score</h1>
          <p className="text-muted-foreground">Your transparent, explainable credit assessment</p>
        </div>
        <Button onClick={handleRecalculate} disabled={isCalculating}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
          {isCalculating ? 'Calculating...' : 'Recalculate Score'}
        </Button>
      </div>

      {/* Main Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your Credit Score</CardTitle>
            <CardDescription>Last calculated on {currentScore.lastCalculated ? new Date(currentScore.lastCalculated).toLocaleDateString() : 'N/A'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              {/* Score Circle */}
              <div className="relative w-48 h-48">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${scorePercentage * 5.53} 553`}
                    className={currentBandInfo.textColor}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-5xl font-bold">{currentScore.score}</span>
                                    <Badge className={`${currentBandInfo.color} text-white mt-2`}>
                                      Band {currentScore.band} - {currentBandInfo.label}
                                    </Badge>
                </div>
              </div>

              {/* Score Details */}
              <div className="flex-1 space-y-4">
                                <div className="flex items-center gap-2">
                                  {currentScore.change > 0 ? (
                                    <ArrowUp className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <ArrowDown className="w-5 h-5 text-red-500" />
                                  )}
                                  <span className={currentScore.change > 0 ? 'text-green-600' : 'text-red-600'}>
                                    {currentScore.change > 0 ? '+' : ''}{currentScore.change} points
                                  </span>
                                  <span className="text-muted-foreground">from previous score</span>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span>Data Completeness</span>
                                    <span>{currentScore.dataCompleteness}%</span>
                                  </div>
                                  <Progress value={currentScore.dataCompleteness} />
                                </div>

                                <div className="flex items-center gap-2">
                                  <Shield className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">
                                    Confidence Level: <span className="font-medium capitalize">{currentScore.confidenceLevel}</span>
                                  </span>
                                </div>

                                {/* Band Scale */}
                                <div className="pt-4">
                                  <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                                    {bandInfo.map((band) => (
                                      <div
                                        key={band.band}
                                        className={`flex-1 ${band.color} ${currentScore.band === band.band ? 'ring-2 ring-offset-2 ring-black' : ''}`}
                                        title={`${band.label}: ${band.minScore}-${band.maxScore}`}
                                      />
                                    ))}
                                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0</span>
                    <span>350</span>
                    <span>500</span>
                    <span>650</span>
                    <span>800</span>
                    <span>1000</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loan Eligibility Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Loan Eligibility
            </CardTitle>
            <CardDescription>Based on your current score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
                        <div className="p-4 bg-primary/5 rounded-lg">
                          <div className="text-sm text-muted-foreground">Maximum Loan Amount</div>
                          <div className="text-2xl font-bold text-primary">
                            {formatCurrency(currentScore.recommendedLoanLimit / 100)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-muted-foreground">Max Term</div>
                            <div className="font-semibold">{currentScore.recommendedTermMonths} months</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Interest Rate</div>
                            <div className="font-semibold">{currentScore.recommendedInterestRate}% p.a.</div>
                          </div>
                        </div>
                        <div className="pt-2">
                          <div className="text-sm text-muted-foreground">Default Probability</div>
                          <div className="flex items-center gap-2">
                            <Progress value={currentScore.probabilityOfDefault * 100} className="flex-1" />
                            <span className="text-sm font-medium">{(currentScore.probabilityOfDefault * 100).toFixed(1)}%</span>
                          </div>
                        </div>
            <Button className="w-full">
              <DollarSign className="w-4 h-4 mr-2" />
              Apply for Loan
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Factors and History */}
      <Tabs defaultValue="factors">
        <TabsList>
          <TabsTrigger value="factors">Score Factors</TabsTrigger>
          <TabsTrigger value="history">Score History</TabsTrigger>
          <TabsTrigger value="improve">How to Improve</TabsTrigger>
        </TabsList>

        <TabsContent value="factors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>What Affects Your Score</CardTitle>
              <CardDescription>
                Your score is calculated from these factors. Each factor contributes to your total score based on its weight.
              </CardDescription>
            </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {(currentScore.factors || []).map((factor: any, index: number) => (
                              <div
                                key={index}
                                className={`p-4 rounded-lg border ${getImpactColor(factor.impact)}`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-2">
                                    {getImpactIcon(factor.impact)}
                                    <span className="font-semibold">{factor.name}</span>
                                    <Badge variant="outline">{factor.weight}% weight</Badge>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold">{factor.score}/100</div>
                                    <div className="text-sm text-muted-foreground">+{factor.contribution} pts</div>
                                  </div>
                                </div>
                                <div className="mt-2">
                                  <Progress value={factor.score} className="h-2" />
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{factor.explanation}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Score History
              </CardTitle>
              <CardDescription>Track how your score has changed over time</CardDescription>
            </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {historyLoading ? (
                              <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                              </div>
                            ) : (scoreHistory || []).map((entry: any, index: number) => (
                              <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                                  <Calendar className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{entry.score}</span>
                                    <Badge variant="outline">Band {entry.band}</Badge>
                                    {entry.change !== 0 && (
                                      <span className={entry.change > 0 ? 'text-green-600' : 'text-red-600'}>
                                        {entry.change > 0 ? '+' : ''}{entry.change}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{entry.event}</p>
                                </div>
                                <div className="text-sm text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="improve" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                How to Improve Your Score
              </CardTitle>
              <CardDescription>Actionable recommendations to boost your credit score</CardDescription>
            </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {(currentScore.factors || [])
                              .filter((f: any) => f.impact !== 'positive')
                              .map((factor: any, index: number) => (
                                <div key={index} className="p-4 border rounded-lg">
                                  <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-4 h-4 text-primary" />
                                    <span className="font-semibold">{factor.name}</span>
                                    <Badge variant="outline">Current: {factor.score}/100</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{factor.recommendation}</p>
                                  <div className="mt-2 text-sm">
                                    <span className="text-primary font-medium">
                                      Potential impact: +{Math.round((100 - factor.score) * factor.weight / 100)} points
                                    </span>
                                  </div>
                                </div>
                              ))}

                <div className="p-4 bg-primary/5 rounded-lg">
                  <h4 className="font-semibold mb-2">Quick Tips</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      Make all loan repayments on time - this has the highest impact on your score
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      Record all your harvest sales and income in the app
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      Join and stay active in a farmer cooperative
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      Register your farm assets and equipment
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      Start regular savings contributions
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
