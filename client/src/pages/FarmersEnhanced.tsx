import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers, farms } from "@/db/schema";
import { Search, Download, MapPin, Filter, UserPlus, Loader2, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq, like, or, and, sql } from "drizzle-orm";
import { useLocation } from "wouter";
import { DataPagination } from "@/components/DataPagination";

interface FarmerWithFarm {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
  region: string | null;
  nationalId: string | null;
  registrationDate: Date;
  isActive: boolean;
  farmCount?: number;
}

export default function FarmersEnhanced() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [farmersList, setFarmersList] = useState<FarmerWithFarm[]>([]);
  const [filteredFarmers, setFilteredFarmers] = useState<FarmerWithFarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "date" | "location">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Get unique regions and districts for filters
  const regions = Array.from(new Set(farmersList.map(f => f.region).filter(Boolean)));
  const districts = Array.from(new Set(farmersList.map(f => f.district).filter(Boolean)));

  useEffect(() => {
    if (!isInitialized) return;
    fetchFarmers();
  }, [isInitialized, db]);

  useEffect(() => {
    applyFilters();
  }, [farmersList, searchTerm, regionFilter, districtFilter, sortBy, sortOrder]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, regionFilter, districtFilter, sortBy, sortOrder]);

  const fetchFarmers = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const result = await db.select().from(farmers).where(eq(farmers.userId, Number(user.id)));
      
      // Get farm counts for each farmer
      const farmersWithCounts = await Promise.all(
        result.map(async (farmer: any) => {
          const farmCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(farms)
            .where(eq(farms.farmerId, farmer.id));
          
          return {
            ...farmer,
            farmCount: Number(farmCount[0]?.count || 0),
          };
        })
      );
      
      setFarmersList(farmersWithCounts as FarmerWithFarm[]);
    } catch (err) {
      console.error("Failed to fetch farmers:", err);
      toast.error("Failed to load farmers");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...farmersList];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (farmer) =>
          farmer.firstName.toLowerCase().includes(term) ||
          farmer.lastName.toLowerCase().includes(term) ||
          farmer.phoneNumber?.toLowerCase().includes(term) ||
          farmer.email?.toLowerCase().includes(term) ||
          farmer.village?.toLowerCase().includes(term)
      );
    }

    // Region filter
    if (regionFilter !== "all") {
      filtered = filtered.filter((farmer) => farmer.region === regionFilter);
    }

    // District filter
    if (districtFilter !== "all") {
      filtered = filtered.filter((farmer) => farmer.district === districtFilter);
    }

    // Sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "name":
          comparison = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case "date":
          comparison = new Date(a.registrationDate).getTime() - new Date(b.registrationDate).getTime();
          break;
        case "location":
          comparison = (a.region || "").localeCompare(b.region || "");
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });

    setFilteredFarmers(filtered);
  };

  const exportToCSV = () => {
    if (filteredFarmers.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "First Name",
      "Last Name",
      "Phone Number",
      "Email",
      "Village",
      "District",
      "Region",
      "National ID",
      "Registration Date",
      "Number of Farms",
    ];

    const rows = filteredFarmers.map((farmer) => [
      farmer.firstName,
      farmer.lastName,
      farmer.phoneNumber || "",
      farmer.email || "",
      farmer.village || "",
      farmer.district || "",
      farmer.region || "",
      farmer.nationalId || "",
      new Date(farmer.registrationDate).toLocaleDateString(),
      farmer.farmCount || 0,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `farmers_export_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${filteredFarmers.length} farmers to CSV`);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setRegionFilter("all");
    setDistrictFilter("all");
    setSortBy("date");
    setSortOrder("desc");
  };

  const hasActiveFilters = searchTerm || regionFilter !== "all" || districtFilter !== "all";

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
            <h1 className="text-3xl font-bold text-foreground">Farmers Management</h1>
            <p className="text-muted-foreground mt-2">
              {filteredFarmers.length} of {farmersList.length} farmers
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={exportToCSV} disabled={filteredFarmers.length === 0}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => navigate("/quick-farmer-registration")}>
              <UserPlus className="w-4 h-4 mr-2" />
              Quick Add Farmer
            </Button>
          </div>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Search & Filter</CardTitle>
                <CardDescription>Find farmers by name, location, or contact</CardDescription>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Name, phone, email..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Region</label>
                <Select value={regionFilter} onValueChange={setRegionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Regions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    {regions.map((region) => (
                      <SelectItem key={region} value={region!}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">District</label>
                <Select value={districtFilter} onValueChange={setDistrictFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Districts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Districts</SelectItem>
                    {districts.map((district) => (
                      <SelectItem key={district} value={district!}>
                        {district}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Sort By</label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="location">Location</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  >
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Farmers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{farmersList.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Regions Covered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{regions.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Districts Covered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{districts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Filtered Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredFarmers.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Farmers Table */}
        {filteredFarmers.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>
                {farmersList.length === 0 ? "No Farmers Registered" : "No Results Found"}
              </CardTitle>
              <CardDescription>
                {farmersList.length === 0
                  ? "Get started by registering your first farmer"
                  : "Try adjusting your search or filter criteria"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {farmersList.length === 0 ? (
                <Button onClick={() => navigate("/quick-farmer-registration")}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Register First Farmer
                </Button>
              ) : (
                <Button variant="outline" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Clear All Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Farmers List</CardTitle>
              <CardDescription>
                Click on a farmer to view details and manage farms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Farms</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFarmers
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((farmer) => (
                      <TableRow
                        key={farmer.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/farmers/${farmer.id}`)}
                      >
                        <TableCell className="font-medium">
                          {farmer.firstName} {farmer.lastName}
                          {farmer.nationalId && (
                            <div className="text-xs text-muted-foreground">
                              ID: {farmer.nationalId}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {farmer.phoneNumber && (
                              <div className="text-sm">{farmer.phoneNumber}</div>
                            )}
                            {farmer.email && (
                              <div className="text-xs text-muted-foreground">{farmer.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-1">
                            <MapPin className="w-3 h-3 mt-1 text-muted-foreground" />
                            <div className="text-sm">
                              {[farmer.village, farmer.district, farmer.region]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{farmer.farmCount || 0}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(farmer.registrationDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={farmer.isActive ? "default" : "secondary"}>
                            {farmer.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DataPagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredFarmers.length / pageSize)}
                pageSize={pageSize}
                totalItems={filteredFarmers.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
