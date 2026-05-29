/**
 * Input vs Yield Analytics
 * Analyze farming inputs against harvest yields
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Leaf,
  Droplets,
  Sprout,
  BarChart3,
  Download,
  Filter,
  MapPin,
  Calendar,
  DollarSign,
  Scale,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
} from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { trpc } from '@/lib/trpc';

export default function InputYieldAnalytics() {
  const { formatCurrency, formatWeight } = useLocalization();
  const [selectedCrop, setSelectedCrop] = useState('all');
  const [selectedSeason, setSelectedSeason] = useState('2024-wet');

  // Fetch analytics data from tRPC
  const { data: overviewData, isLoading: overviewLoading } = trpc.analytics.getInputYieldOverview.useQuery(
    { crop: selectedCrop, season: selectedSeason },
    { enabled: true }
  );

  const { data: cropPerformanceData, isLoading: cropLoading } = trpc.analytics.getCropPerformance.useQuery(
    { season: selectedSeason },
    { enabled: true }
  );

  const { data: inputBreakdownData, isLoading: inputLoading } = trpc.analytics.getInputBreakdown.useQuery(
    { crop: selectedCrop, season: selectedSeason },
    { enabled: true }
  );

  const { data: regionalPerformanceData, isLoading: regionalLoading } = trpc.analytics.getRegionalPerformance.useQuery(
    { crop: selectedCrop, season: selectedSeason },
    { enabled: true }
  );

  const { data: outliersData, isLoading: outliersLoading } = trpc.analytics.getOutliers.useQuery(
    { crop: selectedCrop, season: selectedSeason },
    { enabled: true }
  );

  const { data: seasonalData, isLoading: seasonalLoading } = trpc.analytics.getSeasonalTrends.useQuery({});

  // Default values if data not loaded
  const overview = overviewData || {
    totalFarms: 0,
    totalHectares: 0,
    avgYieldPerHa: 0,
    avgInputCostPerHa: 0,
    avgRevenuePerHa: 0,
    avgProfitMargin: 0,
    topPerformingCrop: '-',
    lowestPerformingCrop: '-',
  };

  const cropPerformance = cropPerformanceData || [];
  const inputBreakdown = inputBreakdownData || [];
  const regionalPerformance = regionalPerformanceData || [];
  const outliers = outliersData || [];
  const seasonal = seasonalData || [];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <span className="w-4 h-4 text-gray-400">—</span>;
    }
  };

  const getOutlierBadge = (type: string) => {
    switch (type) {
      case 'high_performer':
        return <Badge className="bg-green-100 text-green-800">High Performer</Badge>;
      case 'high_cost':
        return <Badge className="bg-orange-100 text-orange-800">High Cost</Badge>;
      case 'low_yield':
        return <Badge className="bg-red-100 text-red-800">Low Yield</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getInsightBadge = (insight: string) => {
    if (insight.includes('Top') || insight.includes('High performer')) {
      return <Badge className="bg-green-100 text-green-800">{insight}</Badge>;
    }
    if (insight.includes('Needs') || insight.includes('Low')) {
      return <Badge className="bg-red-100 text-red-800">{insight}</Badge>;
    }
    if (insight.includes('High input') || insight.includes('cost')) {
      return <Badge className="bg-orange-100 text-orange-800">{insight}</Badge>;
    }
    return <Badge variant="outline">{insight}</Badge>;
  };

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Input vs Yield Analytics</h1>
          <p className="text-muted-foreground">Analyze farming inputs against harvest yields</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedCrop} onValueChange={setSelectedCrop}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Crop" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Crops</SelectItem>
              <SelectItem value="maize">Maize</SelectItem>
              <SelectItem value="rice">Rice</SelectItem>
              <SelectItem value="cassava">Cassava</SelectItem>
              <SelectItem value="yam">Yam</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024-wet">2024 Wet Season</SelectItem>
              <SelectItem value="2023-dry">2023 Dry Season</SelectItem>
              <SelectItem value="2023-wet">2023 Wet Season</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Yield/Ha</CardTitle>
            <Sprout className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.avgYieldPerHa} tonnes</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              +8% from last season
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Input Cost/Ha</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview.avgInputCostPerHa / 100)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-red-500" />
              +12% from last season
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue/Ha</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview.avgRevenuePerHa / 100)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              +15% from last season
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Profit Margin</CardTitle>
            <Scale className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overview.avgProfitMargin}%</div>
            <p className="text-xs text-muted-foreground">
              Top: {overview.topPerformingCrop} | Low: {overview.lowestPerformingCrop}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Input Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Input Cost Breakdown</CardTitle>
          <CardDescription>Average input costs per hectare by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {inputBreakdown.map((input: { category: string; avgCost: number; percentage: number; trend: string }) => (
              <div key={input.category} className="flex items-center gap-4">
                <div className="w-24 font-medium">{input.category}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-primary h-4 rounded-full"
                        style={{ width: `${input.percentage}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm">{input.percentage}%</span>
                  </div>
                </div>
                <div className="w-24 text-right">{formatCurrency(input.avgCost / 100)}</div>
                <div className="w-8">{getTrendIcon(input.trend)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="crops">
        <TabsList>
          <TabsTrigger value="crops">By Crop</TabsTrigger>
          <TabsTrigger value="regions">By Region</TabsTrigger>
          <TabsTrigger value="outliers">Outliers</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="crops" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Leaf className="w-5 h-5" />
                    Performance by Crop
                  </CardTitle>
                  <CardDescription>Input costs and yields by crop type</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crop</TableHead>
                    <TableHead className="text-right">Farms</TableHead>
                    <TableHead className="text-right">Avg Yield (t/ha)</TableHead>
                    <TableHead className="text-right">Avg Input Cost</TableHead>
                    <TableHead className="text-right">Avg Revenue</TableHead>
                    <TableHead className="text-right">Profit Margin</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cropPerformance.map((crop: { crop: string; farms: number; avgYield: number; avgInputCost: number; avgRevenue: number; profitMargin: number; trend: string }) => (
                    <TableRow key={crop.crop}>
                      <TableCell className="font-medium">{crop.crop}</TableCell>
                      <TableCell className="text-right">{crop.farms}</TableCell>
                      <TableCell className="text-right">{crop.avgYield}</TableCell>
                      <TableCell className="text-right">{formatCurrency(crop.avgInputCost / 100)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(crop.avgRevenue / 100)}</TableCell>
                      <TableCell className={`text-right font-medium ${crop.profitMargin >= 50 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {crop.profitMargin}%
                      </TableCell>
                      <TableCell>{getTrendIcon(crop.trend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regions" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Performance by Region
                  </CardTitle>
                  <CardDescription>Regional comparison of input efficiency</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Farms</TableHead>
                    <TableHead className="text-right">Avg Yield (t/ha)</TableHead>
                    <TableHead className="text-right">Avg Input Cost</TableHead>
                    <TableHead className="text-right">Profit Margin</TableHead>
                    <TableHead>Insight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regionalPerformance.map((region: { region: string; farms: number; avgYield: number; avgInputCost: number; profitMargin: number; insight: string }) => (
                    <TableRow key={region.region}>
                      <TableCell className="font-medium">{region.region}</TableCell>
                      <TableCell className="text-right">{region.farms}</TableCell>
                      <TableCell className="text-right">{region.avgYield}</TableCell>
                      <TableCell className="text-right">{formatCurrency(region.avgInputCost / 100)}</TableCell>
                      <TableCell className={`text-right font-medium ${region.profitMargin >= 55 ? 'text-green-600' : region.profitMargin >= 45 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {region.profitMargin}%
                      </TableCell>
                      <TableCell>{getInsightBadge(region.insight)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outliers" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Outliers Analysis
                  </CardTitle>
                  <CardDescription>Farmers with exceptional or concerning performance</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {outliers.map((outlier: { farmer: string; crop: string; yield: number; inputCost: number; profitMargin: number; type: string }, index: number) => (
                  <div key={index} className={`p-4 border rounded-lg ${
                    outlier.type === 'high_performer' ? 'border-green-200 bg-green-50' :
                    outlier.type === 'low_yield' ? 'border-red-200 bg-red-50' :
                    'border-orange-200 bg-orange-50'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{outlier.farmer}</h4>
                          {getOutlierBadge(outlier.type)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Crop: {outlier.crop}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">View Details</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Yield</div>
                        <div className="font-semibold">{outlier.yield} t/ha</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Input Cost</div>
                        <div className="font-semibold">{formatCurrency(outlier.inputCost / 100)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Profit Margin</div>
                        <div className={`font-semibold ${outlier.profitMargin >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                          {outlier.profitMargin}%
                        </div>
                      </div>
                    </div>
                    {outlier.type === 'high_performer' && (
                      <div className="mt-3 p-2 bg-green-100 rounded text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>Best practices from this farmer could be shared with others</span>
                      </div>
                    )}
                    {outlier.type === 'low_yield' && (
                      <div className="mt-3 p-2 bg-red-100 rounded text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span>Consider agronomic support or soil testing</span>
                      </div>
                    )}
                    {outlier.type === 'high_cost' && (
                      <div className="mt-3 p-2 bg-orange-100 rounded text-sm flex items-center gap-2">
                        <Info className="w-4 h-4 text-orange-600" />
                        <span>Review input sourcing and application efficiency</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seasonal" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Seasonal Trends
                  </CardTitle>
                  <CardDescription>Performance comparison across seasons</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Season</TableHead>
                    <TableHead className="text-right">Avg Yield (t/ha)</TableHead>
                    <TableHead className="text-right">Avg Input Cost</TableHead>
                    <TableHead className="text-right">Avg Revenue</TableHead>
                    <TableHead className="text-right">Profit Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasonal.map((season: { season: string; avgYield: number; avgInputCost: number; avgRevenue: number; profitMargin: number }) => (
                    <TableRow key={season.season}>
                      <TableCell className="font-medium">{season.season}</TableCell>
                      <TableCell className="text-right">{season.avgYield}</TableCell>
                      <TableCell className="text-right">{formatCurrency(season.avgInputCost / 100)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(season.avgRevenue / 100)}</TableCell>
                      <TableCell className={`text-right font-medium ${season.profitMargin >= 50 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {season.profitMargin}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">Key Insights</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500 mt-0.5" />
                    Wet season yields are consistently 50-60% higher than dry season
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-red-500 mt-0.5" />
                    Input costs have increased 12% year-over-year, mainly due to fertilizer prices
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                    Profit margins have improved despite cost increases due to better yields
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
