import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus, Loader2, UserPlus, Search } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq } from "drizzle-orm";

interface Farmer {
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
}

export default function Farmers() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [farmersList, setFarmersList] = useState<Farmer[]>([]);
  const [filteredFarmers, setFilteredFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    address: "",
    village: "",
    district: "",
    region: "",
    nationalId: "",
  });

  useEffect(() => {
    if (!isInitialized) return;
    fetchFarmers();
  }, [isInitialized, db]);

  // Filter farmers based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFarmers(farmersList);
      setCurrentPage(1);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = farmersList.filter((farmer) => {
      return (
        farmer.firstName.toLowerCase().includes(query) ||
        farmer.lastName.toLowerCase().includes(query) ||
        farmer.phoneNumber?.toLowerCase().includes(query) ||
        farmer.email?.toLowerCase().includes(query) ||
        farmer.village?.toLowerCase().includes(query) ||
        farmer.district?.toLowerCase().includes(query) ||
        farmer.region?.toLowerCase().includes(query) ||
        farmer.nationalId?.toLowerCase().includes(query)
      );
    });

    setFilteredFarmers(filtered);
    setCurrentPage(1);
  }, [searchQuery, farmersList]);

  const fetchFarmers = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const result = await db.select().from(farmers).where(eq(farmers.userId, Number(user.id)));
      setFarmersList(result as Farmer[]);
      setFilteredFarmers(result as Farmer[]);
    } catch (err) {
      console.error("Failed to fetch farmers:", err);
      toast.error("Failed to load farmers");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName) {
      toast.error("First name and last name are required");
      return;
    }

    try {
      setSubmitting(true);
      if (!user) {
        toast.error("User not authenticated");
        return;
      }
      await db.insert(farmers).values({
        userId: user.id,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber || null,
        email: formData.email || null,
        address: formData.address || null,
        village: formData.village || null,
        district: formData.district || null,
        region: formData.region || null,
        nationalId: formData.nationalId || null,
      });

      toast.success("Farmer registered successfully");
      setOpen(false);
      setFormData({
        firstName: "",
        lastName: "",
        phoneNumber: "",
        email: "",
        address: "",
        village: "",
        district: "",
        region: "",
        nationalId: "",
      });
      fetchFarmers();
    } catch (err) {
      console.error("Failed to register farmer:", err);
      toast.error("Failed to register farmer");
    } finally {
      setSubmitting(false);
    }
  };

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
            <h1 className="text-3xl font-bold text-foreground">Farmers</h1>
            <p className="text-muted-foreground mt-2">Manage farmer profiles and registrations</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Register Farmer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Register New Farmer</DialogTitle>
                <DialogDescription>
                  Enter the farmer's information to create a new profile
                </DialogDescription>
              </DialogHeader>
              <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="village">Village</Label>
                    <Input
                      id="village"
                      value={formData.village}
                      onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="district">District</Label>
                    <Input
                      id="district"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationalId">National ID</Label>
                  <Input
                    id="nationalId"
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Register Farmer
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search Bar */}
        {farmersList.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search" placeholder="Search farmers by name, phone, email, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {farmersList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farmers Registered</CardTitle>
              <CardDescription>
                Get started by registering your first farmer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Click the "Register Farmer" button above to add a new farmer profile to the system.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                Registered Farmers ({filteredFarmers.length}
                {searchQuery && ` of ${farmersList.length}`})
              </CardTitle>
              <CardDescription>View and manage all registered farmers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Registration Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFarmers
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((farmer) => (
                    <TableRow key={farmer.id}>
                      <TableCell className="font-medium">
                        {farmer.firstName} {farmer.lastName}
                      </TableCell>
                      <TableCell>{farmer.phoneNumber || "-"}</TableCell>
                      <TableCell>{farmer.email || "-"}</TableCell>
                      <TableCell>
                        {[farmer.village, farmer.district, farmer.region]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </TableCell>
                      <TableCell>
                        {new Date(farmer.registrationDate).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredFarmers.length / itemsPerPage)}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredFarmers.length}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
