import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Loader2, AlertTriangle, CheckCircle2, AlertCircle, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { calculateFarmerCompleteness, getCompletenessBadgeVariant, getCompletenessLabel } from "@/lib/validation";

interface FarmerQuality {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string | null;
  nationalId: string | null;
  completeness: number;
  missingFields: string[];
}

export default function DataQualityDashboard() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [farmerQuality, setFarmerQuality] = useState<FarmerQuality[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isInitialized) return;
    fetchDataQuality();
  }, [isInitialized, db]);

  const fetchDataQuality = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const result = await db.select().from(farmers).where(eq(farmers.userId, Number(user.id)));

      const qualityData = result.map((farmer: any) => {
        const completeness = calculateFarmerCompleteness(farmer);
        const missingFields: string[] = [];

        if (!farmer.phoneNumber) missingFields.push('Phone Number');
        if (!farmer.email) missingFields.push('Email');
        if (!farmer.nationalId) missingFields.push('National ID');
        if (!farmer.address) missingFields.push('Address');
        if (!farmer.village) missingFields.push('Village');
        if (!farmer.district) missingFields.push('District');
        if (!farmer.region) missingFields.push('Region');

        return {
          id: farmer.id,
          firstName: farmer.firstName,
          lastName: farmer.lastName,
          phoneNumber: farmer.phoneNumber,
          email: farmer.email,
          nationalId: farmer.nationalId,
          completeness,
          missingFields,
        };
      });

      setFarmerQuality(qualityData);
    } catch (err) {
      console.error("Failed to fetch data quality:", err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const totalFarmers = farmerQuality.length;
  const completeFarmers = farmerQuality.filter(f => f.completeness >= 80).length;
  const partialFarmers = farmerQuality.filter(f => f.completeness >= 50 && f.completeness < 80).length;
  const incompleteFarmers = farmerQuality.filter(f => f.completeness < 50).length;
  const averageCompleteness = totalFarmers > 0
    ? Math.round(farmerQuality.reduce((sum, f) => sum + f.completeness, 0) / totalFarmers)
    : 0;

  // Sort by completeness (lowest first to show issues)
  const sortedFarmers = [...farmerQuality].sort((a, b) => a.completeness - b.completeness);

  if (!isInitialized || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Data Quality Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Monitor and improve the completeness of farmer records
            </p>
          </div>
          <Button onClick={() => navigate("/farmers-enhanced")}>
            <Users className="w-4 h-4 mr-2" />
            View All Farmers
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Farmers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalFarmers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Complete (≥80%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completeFarmers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalFarmers > 0 ? Math.round((completeFarmers / totalFarmers) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                Partial (50-79%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{partialFarmers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalFarmers > 0 ? Math.round((partialFarmers / totalFarmers) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Incomplete (&lt;50%)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{incompleteFarmers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalFarmers > 0 ? Math.round((incompleteFarmers / totalFarmers) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Average Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageCompleteness}%</div>
              <Progress value={averageCompleteness} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Farmers Quality Table */}
        <Card>
          <CardHeader>
            <CardTitle>Farmer Data Completeness</CardTitle>
            <CardDescription>
              Review and update incomplete farmer records to improve data quality
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sortedFarmers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No farmer records found
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Farmer Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Completeness</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Missing Fields</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFarmers.map((farmer) => (
                      <TableRow key={farmer.id}>
                        <TableCell className="font-medium">
                          {farmer.firstName} {farmer.lastName}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            {farmer.phoneNumber ? (
                              <div>{farmer.phoneNumber}</div>
                            ) : (
                              <div className="text-muted-foreground italic">No phone</div>
                            )}
                            {farmer.email ? (
                              <div className="text-xs text-muted-foreground">{farmer.email}</div>
                            ) : (
                              <div className="text-xs text-muted-foreground italic">No email</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <div className="text-sm font-medium">{farmer.completeness}%</div>
                            <Progress value={farmer.completeness} className="w-24" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getCompletenessBadgeVariant(farmer.completeness)}>
                            {getCompletenessLabel(farmer.completeness)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {farmer.missingFields.length > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              {farmer.missingFields.slice(0, 3).join(', ')}
                              {farmer.missingFields.length > 3 && ` +${farmer.missingFields.length - 3} more`}
                            </div>
                          ) : (
                            <div className="text-xs text-green-600">All fields complete</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/farmers/${farmer.id}`)}
                          >
                            Update
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
