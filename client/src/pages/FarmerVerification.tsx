import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { eq, or } from "drizzle-orm";
import { Loader2, CheckCircle, XCircle, Clock, User, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

interface FarmerForVerification {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string | null;
  nationalId: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
  region: string | null;
  photoUrl: string | null;
  registrationDate: Date;
  verificationStatus: string;
  verifiedAt: Date | null;
  verificationNotes: string | null;
}

export default function FarmerVerification() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [farmersList, setFarmersList] = useState<FarmerForVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerForVerification | null>(null);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "verified" | "rejected">("pending");

  useEffect(() => {
    if (!isInitialized) return;
    fetchFarmers();
  }, [isInitialized, db, filter]);

  const fetchFarmers = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      let query;
      if (filter === "all") {
        query = db.select().from(farmers).where(eq(farmers.userId, Number(user.id)));
      } else {
        query = db
          .select()
          .from(farmers)
          .where(
            eq(farmers.userId, Number(user.id))
          );
      }
      
      const result = await query;
      
      // Filter by verification status
      const filtered = filter === "all" 
        ? result 
        : result.filter((f: any) => (f.verificationStatus || 'pending') === filter);
      
      setFarmersList(filtered as FarmerForVerification[]);
    } catch (err) {
      console.error("Failed to fetch farmers:", err);
      toast.error("Failed to load farmers");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (farmerId: number, status: "verified" | "rejected") => {
    if (!user) return;
    
    try {
      setSubmitting(true);
      
      await db
        .update(farmers)
        .set({
          verificationStatus: status,
          verifiedBy: Number(user.id),
          verifiedAt: new Date(),
          verificationNotes: verificationNotes || null,
          updatedAt: new Date(),
        })
        .where(eq(farmers.id, farmerId));
      
      toast.success(`Farmer ${status === "verified" ? "verified" : "rejected"} successfully`);
      setSelectedFarmer(null);
      setVerificationNotes("");
      fetchFarmers();
    } catch (err) {
      console.error("Failed to update verification status:", err);
      toast.error("Failed to update verification status");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const pendingCount = farmersList.filter(f => (f.verificationStatus || 'pending') === 'pending').length;
  const verifiedCount = farmersList.filter(f => f.verificationStatus === 'verified').length;
  const rejectedCount = farmersList.filter(f => f.verificationStatus === 'rejected').length;

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
            <h1 className="text-3xl font-bold text-foreground">Farmer Verification</h1>
            <p className="text-muted-foreground mt-2">
              Review and verify farmer registrations
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card 
            className={`cursor-pointer transition-all ${filter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Farmers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{farmersList.length}</div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all ${filter === "pending" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("pending")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                Pending Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all ${filter === "verified" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("verified")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Verified
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{verifiedCount}</div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all ${filter === "rejected" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("rejected")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Farmers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Farmers List</CardTitle>
            <CardDescription>
              Click on a farmer to review and update verification status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {farmersList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No farmers found for this filter
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Registered</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {farmersList.map((farmer) => (
                      <TableRow key={farmer.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {farmer.photoUrl ? (
                              <img 
                                src={farmer.photoUrl} 
                                alt={`${farmer.firstName} ${farmer.lastName}`}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              {farmer.firstName} {farmer.lastName}
                              {farmer.nationalId && (
                                <div className="text-xs text-muted-foreground">
                                  ID: {farmer.nationalId}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            {farmer.phoneNumber && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {farmer.phoneNumber}
                              </div>
                            )}
                            {farmer.email && (
                              <div className="text-xs text-muted-foreground">{farmer.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-1 text-sm">
                            <MapPin className="w-3 h-3 mt-1 text-muted-foreground" />
                            <div>
                              {[farmer.village, farmer.district, farmer.region]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(farmer.registrationDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(farmer.verificationStatus || 'pending')}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedFarmer(farmer);
                              setVerificationNotes(farmer.verificationNotes || "");
                            }}
                          >
                            Review
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

      {/* Verification Dialog */}
      <Dialog open={!!selectedFarmer} onOpenChange={(open) => !open && setSelectedFarmer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Verify Farmer Registration</DialogTitle>
            <DialogDescription>
              Review farmer details and update verification status
            </DialogDescription>
          </DialogHeader>

          {selectedFarmer && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedFarmer.firstName} {selectedFarmer.lastName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">National ID</Label>
                  <p className="font-medium">{selectedFarmer.nationalId || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone Number</Label>
                  <p className="font-medium">{selectedFarmer.phoneNumber || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedFarmer.email || "-"}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Address</Label>
                  <p className="font-medium">
                    {[selectedFarmer.address, selectedFarmer.village, selectedFarmer.district, selectedFarmer.region]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </p>
                </div>
                {selectedFarmer.photoUrl && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Photo</Label>
                    <img 
                      src={selectedFarmer.photoUrl} 
                      alt="Farmer photo"
                      className="mt-2 w-32 h-32 object-cover rounded-lg border"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Verification Notes</Label>
                <Textarea
                  placeholder="Add notes about this verification (optional)"
                  value={verificationNotes}
                  onChange={(e) => setVerificationNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setSelectedFarmer(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleVerify(selectedFarmer.id, "rejected")}
                  disabled={submitting}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleVerify(selectedFarmer.id, "verified")}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Verify
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
