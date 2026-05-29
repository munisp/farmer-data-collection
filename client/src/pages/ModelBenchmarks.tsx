import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Award, Target, Zap, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

/**
 * Model Benchmarking Dashboard
 * 
 * Compare AI model accuracy against competitors (Plantix, FieldView, etc.):
 * - View benchmark history
 * - Compare accuracy metrics
 * - Track performance improvements
 * - Transparent metrics (accuracy, precision, recall, F1 score)
 */

export default function ModelBenchmarks() {
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);

  // Fetch all models for selection
  const { data: modelsData } = trpc.mlModels.listModels.useQuery({});

  // Fetch benchmark history for selected model
  const { data: benchmarksData, isLoading } = trpc.mlModels.getBenchmarkHistory.useQuery(
    { modelId: selectedModelId! },
    { enabled: !!selectedModelId }
  );

  const formatAccuracy = (accuracy: number) => {
    return `${(accuracy / 10000).toFixed(2)}%`;
  };

  const formatDelta = (delta: number) => {
    const value = delta / 10000;
    const formatted = `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
    return formatted;
  };

  const getDeltaBadge = (delta: number | null) => {
    if (!delta) return null;

    if (delta > 0) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
          <TrendingUp className="w-3 h-3 mr-1" />
          {formatDelta(delta)} Better
        </Badge>
      );
    } else if (delta < 0) {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400">
          <TrendingDown className="w-3 h-3 mr-1" />
          {formatDelta(delta)} Worse
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-400">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Equal
        </Badge>
      );
    }
  };

  // Calculate average metrics
  const avgMetrics = benchmarksData?.benchmarks.length
    ? {
        accuracy:
          benchmarksData.benchmarks.reduce((acc, b) => acc + b.accuracy, 0) / benchmarksData.benchmarks.length,
        precision:
          benchmarksData.benchmarks.reduce((acc, b) => acc + (b.precision || 0), 0) /
          benchmarksData.benchmarks.length,
        recall:
          benchmarksData.benchmarks.reduce((acc, b) => acc + (b.recall || 0), 0) / benchmarksData.benchmarks.length,
        f1Score:
          benchmarksData.benchmarks.reduce((acc, b) => acc + (b.f1Score || 0), 0) / benchmarksData.benchmarks.length,
      }
    : null;

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Model Benchmarks</h1>
              <p className="text-muted-foreground mt-2">
                Compare model accuracy against industry standards (Plantix, FieldView, etc.)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm">
                <Award className="w-3 h-3 mr-1" />
                Transparent Metrics
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Model Selection */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Select Model to View Benchmarks</CardTitle>
            <CardDescription>
              Choose a model to see its accuracy benchmarks and comparisons with competitors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedModelId?.toString()}
              onValueChange={(value) => setSelectedModelId(parseInt(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {modelsData?.models.map((model) => (
                  <SelectItem key={model.id} value={model.id.toString()}>
                    {model.displayName} v{model.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Average Metrics Summary */}
        {selectedModelId && avgMetrics && (
          <div className="grid gap-4 md:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Avg Accuracy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAccuracy(avgMetrics.accuracy)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {benchmarksData?.benchmarks.length} tests
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Precision</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAccuracy(avgMetrics.precision)}</div>
                <p className="text-xs text-muted-foreground mt-1">True positive rate</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Recall</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAccuracy(avgMetrics.recall)}</div>
                <p className="text-xs text-muted-foreground mt-1">Sensitivity rate</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg F1 Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatAccuracy(avgMetrics.f1Score)}</div>
                <p className="text-xs text-muted-foreground mt-1">Harmonic mean</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Benchmarks List */}
        {!selectedModelId ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Target className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select a model to view benchmarks</h3>
              <p className="text-muted-foreground text-center">
                Choose a model from the dropdown above to see its accuracy benchmarks
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : benchmarksData?.benchmarks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Target className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No benchmarks available</h3>
              <p className="text-muted-foreground text-center mb-4">
                This model hasn't been benchmarked yet
              </p>
              <Button>Run Benchmark</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {benchmarksData?.benchmarks.map((benchmark) => (
              <Card key={benchmark.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{benchmark.benchmarkName}</CardTitle>
                      <CardDescription className="mt-1">
                        Dataset: {benchmark.datasetName} ({benchmark.datasetSize.toLocaleString()} samples)
                      </CardDescription>
                    </div>
                    {benchmark.comparisonTarget && getDeltaBadge(benchmark.accuracyDelta)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Main Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Accuracy</p>
                      <p className="text-2xl font-bold">{formatAccuracy(benchmark.accuracy)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Precision</p>
                      <p className="text-2xl font-bold">
                        {benchmark.precision ? formatAccuracy(benchmark.precision) : "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Recall</p>
                      <p className="text-2xl font-bold">
                        {benchmark.recall ? formatAccuracy(benchmark.recall) : "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">F1 Score</p>
                      <p className="text-2xl font-bold">
                        {benchmark.f1Score ? formatAccuracy(benchmark.f1Score) : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Performance */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-muted-foreground">Inference Time:</span>
                      <span className="font-medium">{benchmark.avgInferenceMs}ms</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-500" />
                      <span className="text-muted-foreground">Dataset Size:</span>
                      <span className="font-medium">{benchmark.datasetSize.toLocaleString()} samples</span>
                    </div>
                  </div>

                  {/* Comparison */}
                  {benchmark.comparisonTarget && benchmark.comparisonAccuracy && (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                      <h4 className="font-semibold text-sm">Comparison vs {benchmark.comparisonTarget}</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Our Model</p>
                          <p className="text-lg font-bold text-green-600 dark:text-green-400">
                            {formatAccuracy(benchmark.accuracy)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{benchmark.comparisonTarget}</p>
                          <p className="text-lg font-bold">{formatAccuracy(benchmark.comparisonAccuracy)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Difference</p>
                          <p
                            className={`text-lg font-bold ${
                              (benchmark.accuracyDelta || 0) > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {benchmark.accuracyDelta ? formatDelta(benchmark.accuracyDelta) : "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>
                      Conducted {formatDistanceToNow(new Date(benchmark.createdAt), { addSuffix: true })}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      Benchmark #{benchmark.id}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Competitive Advantage Section */}
        {selectedModelId && benchmarksData && benchmarksData.benchmarks.length > 0 && (
          <Card className="mt-8 border-2 border-green-500/20 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-green-600 dark:text-green-400" />
                Competitive Advantage
              </CardTitle>
              <CardDescription>How our models compare to industry leaders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Key Strengths</h4>
                  <ul className="space-y-1 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
                      <span>
                        <strong>Higher Accuracy:</strong> Average {formatAccuracy(avgMetrics!.accuracy)} vs
                        competitors
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
                      <span>
                        <strong>Transparent Metrics:</strong> Public benchmarks with full methodology
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
                      <span>
                        <strong>Field-Tested:</strong> Validated with real Nigerian, Kenyan, and Ghanaian farmers
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Performance Highlights</h4>
                  <ul className="space-y-1 text-sm">
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">Avg Inference Time</span>
                      <span className="font-medium">
                        {Math.round(
                          benchmarksData.benchmarks.reduce((acc, b) => acc + b.avgInferenceMs, 0) /
                            benchmarksData.benchmarks.length
                        )}
                        ms
                      </span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Tests Conducted</span>
                      <span className="font-medium">{benchmarksData.benchmarks.length}</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Samples Tested</span>
                      <span className="font-medium">
                        {benchmarksData.benchmarks
                          .reduce((acc, b) => acc + b.datasetSize, 0)
                          .toLocaleString()}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
