import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Star, TrendingUp, Award, Search, Filter, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Model Library Page
 * 
 * Browse, search, and download AI/ML models for crop disease detection,
 * pest identification, yield prediction, and more.
 * 
 * Features:
 * - Model browsing with filters (type, variant, device)
 * - Search by crop name
 * - Popular models section
 * - Model packs (disease, pest, yield, essential)
 * - Download tracking
 * - Ratings and reviews
 */

export default function ModelLibrary() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedVariant, setSelectedVariant] = useState<string>("all");
  const [selectedDevice, setSelectedDevice] = useState<string>("all");

  // Fetch models with filters
  const { data: modelsData, isLoading: modelsLoading } = trpc.mlModels.listModels.useQuery({
    type: selectedType !== "all" ? selectedType as any : undefined,
    variant: selectedVariant !== "all" ? selectedVariant as any : undefined,
    targetDevice: selectedDevice !== "all" ? selectedDevice as any : undefined,
    cropName: searchQuery || undefined,
  });

  // Fetch popular models
  const { data: popularData } = trpc.mlModels.getPopularModels.useQuery({ limit: 6 });

  // Fetch model packs
  const { data: packsData } = trpc.mlModels.getModelPacks.useQuery();

  // Download mutation
  const downloadMutation = trpc.mlModels.downloadModel.useMutation({
    onSuccess: () => {
      toast.success("Model download started!");
    },
    onError: (error) => {
      toast.error(`Download failed: ${error.message}`);
    },
  });

  // Filter models by search query
  const filteredModels = useMemo(() => {
    if (!modelsData?.models) return [];
    if (!searchQuery) return modelsData.models;

    const query = searchQuery.toLowerCase();
    return modelsData.models.filter(
      (model) =>
        model.displayName.toLowerCase().includes(query) ||
        model.name.toLowerCase().includes(query) ||
        (model.supportedCrops as string[])?.some((crop) => crop.toLowerCase().includes(query))
    );
  }, [modelsData, searchQuery]);

  const handleDownload = (modelId: number) => {
    downloadMutation.mutate({
      modelId,
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        memory: (navigator as any).deviceMemory || "unknown",
      },
    });
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const formatAccuracy = (accuracy: number) => {
    return `${(accuracy / 100).toFixed(2)}%`;
  };

  const getDeviceBadgeColor = (device: string) => {
    switch (device) {
      case "high":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "medium":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "low":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "minimal":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "disease_detection":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "pest_identification":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
      case "yield_prediction":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "price_forecasting":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">AI Model Library</h1>
              <p className="text-muted-foreground mt-2">
                Download pre-trained models for crop disease detection, pest identification, and more
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {modelsData?.count || 0} Models
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        <Tabs defaultValue="all" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="all">All Models</TabsTrigger>
            <TabsTrigger value="popular">Popular</TabsTrigger>
            <TabsTrigger value="packs">Model Packs</TabsTrigger>
            <TabsTrigger value="community">Community</TabsTrigger>
          </TabsList>

          {/* All Models Tab */}
          <TabsContent value="all" className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  aria-label="Search" placeholder="Search models or crops (e.g., maize, cassava)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2">
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="disease_detection">Disease Detection</SelectItem>
                    <SelectItem value="pest_identification">Pest ID</SelectItem>
                    <SelectItem value="yield_prediction">Yield Prediction</SelectItem>
                    <SelectItem value="price_forecasting">Price Forecast</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Variants</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="quantized">Quantized</SelectItem>
                    <SelectItem value="pruned">Pruned</SelectItem>
                    <SelectItem value="compressed">Compressed</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Device" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Devices</SelectItem>
                    <SelectItem value="high">High-end</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low-end</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Models Grid */}
            {modelsLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                    <CardFooter>
                      <Skeleton className="h-10 w-full" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : filteredModels.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No models found</h3>
                  <p className="text-muted-foreground text-center">
                    Try adjusting your filters or search query
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredModels.map((model) => (
                  <Card key={model.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{model.displayName}</CardTitle>
                          <CardDescription className="mt-1">v{model.version}</CardDescription>
                        </div>
                        {model.isOfficial && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
                            <Award className="w-3 h-3 mr-1" />
                            Official
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge className={getTypeBadgeColor(model.type)}>
                          {model.type.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline">{model.variant}</Badge>
                        <Badge className={getDeviceBadgeColor(model.targetDevice)}>
                          {model.targetDevice}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Accuracy</span>
                          <span className="font-medium">{formatAccuracy((model as any).accuracy)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Size</span>
                          <span className="font-medium">{formatSize(model.modelSize)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Inference</span>
                          <span className="font-medium">{model.avgInferenceMs}ms</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Rating</span>
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">
                              {((model.rating || 0) / 100).toFixed(1)} ({model.ratingCount})
                            </span>
                          </div>
                        </div>
                      </div>

                      {model.supportedCrops && (model.supportedCrops as string[]).length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Supported Crops:</p>
                          <div className="flex flex-wrap gap-1">
                            {(model.supportedCrops as string[]).slice(0, 3).map((crop) => (
                              <Badge key={crop} variant="secondary" className="text-xs">
                                {crop}
                              </Badge>
                            ))}
                            {(model.supportedCrops as string[]).length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{(model.supportedCrops as string[]).length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => handleDownload(model.id)}
                        disabled={downloadMutation.isPending}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      <Button variant="outline" size="icon">
                        <Star className="w-4 h-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Popular Models Tab */}
          <TabsContent value="popular" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {popularData?.models.map((model) => (
                <Card key={model.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{model.displayName}</CardTitle>
                        <CardDescription className="mt-1">v{model.version}</CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Popular
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={getTypeBadgeColor(model.type)}>
                        {model.type.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline">{model.variant}</Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Downloads</span>
                        <span className="font-medium">{model.downloadCount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Accuracy</span>
                        <span className="font-medium">{formatAccuracy((model as any).accuracy)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Size</span>
                        <span className="font-medium">{formatSize(model.modelSize)}</span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter>
                    <Button
                      className="w-full"
                      onClick={() => handleDownload(model.id)}
                      disabled={downloadMutation.isPending}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Model Packs Tab */}
          <TabsContent value="packs" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {packsData?.packs?.map((pack: any) => (
                <Card key={pack.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-xl">{pack.name}</CardTitle>
                    <CardDescription>{pack.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Models Included</span>
                        <span className="font-medium">{pack.model_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total Size</span>
                        <span className="font-medium">{pack.total_size_mb} MB</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Download Time (3G)</span>
                        <span className="font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ~{pack.estimated_download_minutes_3g} min
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Included Models:</p>
                      <div className="space-y-1">
                        {pack.models.map((model: any) => (
                          <div key={model.id} className="flex items-center justify-between text-sm">
                            <span>{model.display_name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {formatAccuracy(model.accuracy)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter>
                    <Button className="w-full" variant="default" size="lg">
                      <Download className="w-4 h-4 mr-2" />
                      Download Pack ({pack.total_size_mb} MB)
                    </Button>
                  </CardFooter>
                </Card>
              )) || (
                <Card className="col-span-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <p className="text-muted-foreground">Loading model packs...</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Community Models Tab */}
          <TabsContent value="community" className="space-y-6">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <h3 className="text-lg font-semibold mb-2">Community Models Coming Soon</h3>
                <p className="text-muted-foreground text-center">
                  Share and download models created by the farming community
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
