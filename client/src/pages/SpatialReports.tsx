import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { BoundaryOverlapAlerts } from "@/components/BoundaryOverlapAlerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, BarChart3, PieChart, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SpatialReports() {
  const { data: densityData, isLoading: densityLoading } = trpc.spatial.getFarmDensityByRegion.useQuery();
  const { data: areaData, isLoading: areaLoading } = trpc.spatial.getAreaByDistrict.useQuery();
  const { data: totalArea } = trpc.spatial.getTotalFarmArea.useQuery();

  const isLoading = densityLoading || areaLoading;

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Spatial Reports</h1>
          <p className="text-muted-foreground">
            Comprehensive geospatial analytics and insights
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Boundaries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold">
                  {Number(totalArea?.total_boundaries) || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Area
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                <span className="text-2xl font-bold">
                  {Number(totalArea?.total_area_hectares || 0).toFixed(2)} ha
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Area
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-blue-600" />
                <span className="text-2xl font-bold">
                  {Number(totalArea?.avg_area_hectares || 0).toFixed(2)} ha
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Largest Farm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <span className="text-2xl font-bold">
                  {Number(totalArea?.max_area_hectares || 0).toFixed(2)} ha
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Farm Density by Region */}
        <Card>
          <CardHeader>
            <CardTitle>Farm Density by Region</CardTitle>
            <CardDescription>
              Number of farms and total cultivated area by region
            </CardDescription>
          </CardHeader>
          <CardContent>
            {densityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !densityData || densityData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No regional data available. Add farmer regions to see analytics.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Farms</TableHead>
                    <TableHead className="text-right">Boundaries</TableHead>
                    <TableHead className="text-right">Total Area (ha)</TableHead>
                    <TableHead className="text-right">Avg Area (ha)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {densityData.map((row: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {row.region || "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">{row.farm_count}</TableCell>
                      <TableCell className="text-right">{row.boundary_count}</TableCell>
                      <TableCell className="text-right">
                        {row.total_area_hectares ? parseFloat(row.total_area_hectares).toFixed(2) : "0.00"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.avg_area_hectares ? parseFloat(row.avg_area_hectares).toFixed(2) : "0.00"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Total Area by District */}
        <Card>
          <CardHeader>
            <CardTitle>Total Area by District</CardTitle>
            <CardDescription>
              Cultivated land area distribution across districts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {areaLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !areaData || areaData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No district data available. Add farmer districts to see analytics.
              </p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>District</TableHead>
                      <TableHead className="text-right">Farms</TableHead>
                      <TableHead className="text-right">Total Area (ha)</TableHead>
                      <TableHead className="text-right">Avg (ha)</TableHead>
                      <TableHead className="text-right">Min (ha)</TableHead>
                      <TableHead className="text-right">Max (ha)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {areaData.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {row.district || "Unknown"}
                        </TableCell>
                        <TableCell className="text-right">{row.farm_count}</TableCell>
                        <TableCell className="text-right">
                          {row.total_area_hectares ? parseFloat(row.total_area_hectares).toFixed(2) : "0.00"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.avg_area_hectares ? parseFloat(row.avg_area_hectares).toFixed(2) : "0.00"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.min_area_hectares ? parseFloat(row.min_area_hectares).toFixed(2) : "0.00"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.max_area_hectares ? parseFloat(row.max_area_hectares).toFixed(2) : "0.00"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Visual Representation */}
                <div className="space-y-3">
                  <h4 className="font-semibold">Area Distribution</h4>
                  {areaData.map((row: any, idx: number) => {
                    const totalAreaSum = areaData.reduce(
                      (sum: number, r: any) => sum + (parseFloat(r.total_area_hectares) || 0),
                      0
                    );
                    const percentage = totalAreaSum > 0
                      ? ((parseFloat(row.total_area_hectares) || 0) / totalAreaSum) * 100
                      : 0;

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{row.district || "Unknown"}</span>
                          <span className="text-muted-foreground">
                            {percentage.toFixed(1)}% ({parseFloat(row.total_area_hectares || 0).toFixed(2)} ha)
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Boundary Overlap Alerts */}
        <BoundaryOverlapAlerts />

        {/* Insights Card */}
        <Card className="bg-blue-50 dark:bg-blue-950">
          <CardHeader>
            <CardTitle>Insights & Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {densityData && densityData.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                <div>
                  <p className="font-medium">Regional Concentration</p>
                  <p className="text-sm text-muted-foreground">
                    Most farms are concentrated in{" "}
                    <strong>{String(densityData[0]?.region || "Unknown")}</strong> region with{" "}
                    {Number(densityData[0]?.farm_count) || 0} farms.
                  </p>
                </div>
              </div>
            )}

            {areaData && areaData.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-600 rounded-full mt-2" />
                <div>
                  <p className="font-medium">Largest District</p>
                  <p className="text-sm text-muted-foreground">
                    <strong>{String(areaData[0]?.district || "Unknown")}</strong> district has the largest
                    cultivated area with{" "}
                    {Number(areaData[0]?.total_area_hectares || 0).toFixed(2)} hectares.
                  </p>
                </div>
              </div>
            )}

            {totalArea && Number(totalArea.total_boundaries) > 0 && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-purple-600 rounded-full mt-2" />
                <div>
                  <p className="font-medium">Farm Size Variation</p>
                  <p className="text-sm text-muted-foreground">
                    Farm sizes range from {Number(totalArea.min_area_hectares || 0).toFixed(2)} ha to{" "}
                    {Number(totalArea.max_area_hectares || 0).toFixed(2)} ha, with an average of{" "}
                    {Number(totalArea.avg_area_hectares || 0).toFixed(2)} ha.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
