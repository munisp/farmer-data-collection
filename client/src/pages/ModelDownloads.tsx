import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, CheckCircle2, Clock, Trash2, Play, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

/**
 * Model Downloads Manager
 * 
 * Track and manage downloaded AI/ML models:
 * - View all downloaded models
 * - Track installation status
 * - Monitor usage statistics
 * - Manage local model storage
 */

export default function ModelDownloads() {
  // Fetch user's downloads
  const { data: downloadsData, isLoading, refetch } = trpc.mlModels.getUserDownloads.useQuery();

  // Mark as installed mutation
  const markInstalledMutation = trpc.mlModels.markAsInstalled.useMutation({
    onSuccess: () => {
      toast.success("Model marked as installed!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const formatAccuracy = (accuracy: number) => {
    return `${(accuracy / 100).toFixed(2)}%`;
  };

  const getStatusBadge = (download: any) => {
    if (download.download.installed) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Installed
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
          <Clock className="w-3 h-3 mr-1" />
          Downloaded
        </Badge>
      );
    }
  };

  const handleMarkInstalled = (downloadId: number) => {
    markInstalledMutation.mutate({ downloadId });
  };

  // Calculate total storage used
  const totalStorage = downloadsData?.downloads.reduce((acc, d) => acc + d.model.modelSize, 0) || 0;
  const installedCount = downloadsData?.downloads.filter((d) => d.download.installed).length || 0;

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">My Model Downloads</h1>
              <p className="text-muted-foreground mt-2">
                Manage your downloaded AI models and track usage
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Storage</p>
                <p className="text-2xl font-bold">{formatSize(totalStorage)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Installed</p>
                <p className="text-2xl font-bold">{installedCount} / {downloadsData?.downloads.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Downloads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{downloadsData?.downloads.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Models downloaded
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {downloadsData?.downloads.reduce((acc, d) => acc + d.download.usageCount, 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Inference runs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Storage Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatSize(totalStorage)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {downloadsData?.downloads.length || 0} models
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Downloads List */}
        {isLoading ? (
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
        ) : downloadsData?.downloads.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Download className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No models downloaded yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Visit the Model Library to download AI models for your farm
              </p>
              <Button onClick={() => window.location.href = "/models"}>
                Browse Models
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {downloadsData?.downloads.map((item) => (
              <Card key={item.download.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl">{item.model.displayName}</CardTitle>
                      <CardDescription className="mt-1">
                        v{item.model.version} • {item.model.type.replace(/_/g, " ")}
                      </CardDescription>
                    </div>
                    {getStatusBadge(item)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Model Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Accuracy</p>
                      <p className="text-sm font-medium">{formatAccuracy((item.model as any).accuracy)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Size</p>
                      <p className="text-sm font-medium">{formatSize(item.model.modelSize)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Usage Count</p>
                      <p className="text-sm font-medium">{item.download.usageCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Inference Time</p>
                      <p className="text-sm font-medium">{item.model.avgInferenceMs}ms</p>
                    </div>
                  </div>

                  {/* Download Info */}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Download className="w-4 h-4" />
                      Downloaded {formatDistanceToNow(new Date(item.download.downloadedAt), { addSuffix: true })}
                    </div>
                    {item.download.installed && item.download.installedAt && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        Installed {formatDistanceToNow(new Date(item.download.installedAt), { addSuffix: true })}
                      </div>
                    )}
                    {item.download.lastUsedAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Last used {formatDistanceToNow(new Date(item.download.lastUsedAt), { addSuffix: true })}
                      </div>
                    )}
                  </div>

                  {/* Installation Progress */}
                  {!item.download.installed && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Installation Status</span>
                        <span className="font-medium">Pending</span>
                      </div>
                      <Progress value={75} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        Model downloaded but not yet installed. Click "Mark as Installed" once setup is complete.
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {!item.download.installed ? (
                      <Button
                        onClick={() => handleMarkInstalled(item.download.id)}
                        disabled={markInstalledMutation.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark as Installed
                      </Button>
                    ) : (
                      <Button variant="default">
                        <Play className="w-4 h-4 mr-2" />
                        Run Inference
                      </Button>
                    )}
                    <Button variant="outline">
                      View Details
                    </Button>
                    <Button variant="outline" size="icon" className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Warning for unused models */}
                  {item.download.installed && item.download.usageCount === 0 && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                          Model not used yet
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                          This model has been installed but hasn't been used for inference. Try running a prediction to test it.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
