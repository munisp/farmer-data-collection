import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Truck, Warehouse, Handshake, DollarSign, Package, Users, BarChart3, Plus } from "lucide-react";

export default function DistributorNetwork() {
  const [activeTab, setActiveTab] = useState("partnerships");

  const partnerships = trpc.distributorNetwork.getMyPartnerships.useQuery({});
  const consignments = trpc.distributorNetwork.getMyConsignments.useQuery({});
  const earnings = trpc.distributorNetwork.getEarningsDashboard.useQuery({});
  const distributors = trpc.distributorNetwork.listDistributors.useQuery({});

  const activePartnerships = partnerships.data?.filter(p => p.status === "active") || [];
  const pendingPartnerships = partnerships.data?.filter(p => p.status === "proposed") || [];

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold dark:text-white">Distributor Network</h1>
            <p className="text-muted-foreground dark:text-gray-400">
              Partner with distributors to reach more buyers. All payments flow through the platform.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Find Distributors
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Handshake className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold dark:text-white">{activePartnerships.length}</p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Active Partnerships</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold dark:text-white">
                    {consignments.data?.filter(c => ["received", "stored", "partially_sold"].includes(c.status)).length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Active Consignments</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="text-2xl font-bold dark:text-white">
                    ₦{((earnings.data?.totalEarnings || 0) / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Total Earnings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold dark:text-white">{earnings.data?.totalSales || 0}</p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Total Sales</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="partnerships">Partnerships</TabsTrigger>
            <TabsTrigger value="consignments">Consignments</TabsTrigger>
            <TabsTrigger value="earnings">Earnings & Splits</TabsTrigger>
            <TabsTrigger value="distributors">Browse Distributors</TabsTrigger>
          </TabsList>

          {/* Partnerships Tab */}
          <TabsContent value="partnerships" className="space-y-4">
            {pendingPartnerships.length > 0 && (
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">Pending Proposals</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Distributor</TableHead>
                        <TableHead>Farmer Share</TableHead>
                        <TableHead>Distributor Share</TableHead>
                        <TableHead>Platform Fee</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingPartnerships.map(p => (
                        <TableRow key={p.id}>
                          <TableCell>#{p.distributorId}</TableCell>
                          <TableCell>{p.farmerSharePercent}%</TableCell>
                          <TableCell>{p.distributorSharePercent}%</TableCell>
                          <TableCell>{p.platformFeePercent}%</TableCell>
                          <TableCell><Badge variant="secondary">Proposed</Badge></TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline">Accept</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="dark:text-white">Active Partnerships</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Your profit-sharing agreements with distributors
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activePartnerships.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
                    <Handshake className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No active partnerships yet.</p>
                    <p className="text-sm">Browse distributors to propose a partnership.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Distributor</TableHead>
                        <TableHead>Commodities</TableHead>
                        <TableHead>Farmer Share</TableHead>
                        <TableHead>Distributor Share</TableHead>
                        <TableHead>Platform Fee</TableHead>
                        <TableHead>Since</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activePartnerships.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">#{p.distributorId}</TableCell>
                          <TableCell>
                            {(p.commodities as string[] | null)?.map(c => (
                              <Badge key={c} variant="outline" className="mr-1">{c}</Badge>
                            ))}
                          </TableCell>
                          <TableCell className="text-green-600">{p.farmerSharePercent}%</TableCell>
                          <TableCell>{p.distributorSharePercent}%</TableCell>
                          <TableCell className="text-muted-foreground">{p.platformFeePercent}%</TableCell>
                          <TableCell>{p.acceptedAt ? new Date(p.acceptedAt).toLocaleDateString() : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consignments Tab */}
          <TabsContent value="consignments" className="space-y-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="dark:text-white">Consignments</CardTitle>
                  <CardDescription className="dark:text-gray-400">Produce shipped to distributors</CardDescription>
                </div>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Consignment
                </Button>
              </CardHeader>
              <CardContent>
                {!consignments.data?.length ? (
                  <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
                    <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No consignments yet. Ship produce to a distributor to get started.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Commodity</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Price/kg</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consignments.data.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-sm">{c.trackingReference}</TableCell>
                          <TableCell className="font-medium">{c.commodity}</TableCell>
                          <TableCell>{Number(c.quantityKg).toLocaleString()} kg</TableCell>
                          <TableCell>{Number(c.remainingKg).toLocaleString()} kg</TableCell>
                          <TableCell>₦{Number(c.pricePerKg).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={
                              c.status === "sold_out" ? "default" :
                              c.status === "partially_sold" ? "secondary" :
                              c.status === "received" || c.status === "stored" ? "outline" :
                              "destructive"
                            }>
                              {c.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Earnings Tab */}
          <TabsContent value="earnings" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-green-600">
                    ₦{((earnings.data?.totalEarnings || 0) / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Total Earned</p>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-orange-500">
                    ₦{((earnings.data?.pendingDisbursement || 0) / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Pending Disbursement</p>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold dark:text-white">{earnings.data?.totalSales || 0}</p>
                  <p className="text-sm text-muted-foreground dark:text-gray-400">Completed Sales</p>
                </CardContent>
              </Card>
            </div>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="dark:text-white">Recent Profit Splits</CardTitle>
              </CardHeader>
              <CardContent>
                {!earnings.data?.splits?.length ? (
                  <p className="text-center py-4 text-muted-foreground dark:text-gray-400">No sales recorded yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Total Sale</TableHead>
                        <TableHead>Your Share</TableHead>
                        <TableHead>Partner Share</TableHead>
                        <TableHead>Platform Fee</TableHead>
                        <TableHead>Disbursed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {earnings.data.splits.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell>{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">₦{(Number(s.totalSaleAmount) / 100).toLocaleString()}</TableCell>
                          <TableCell className="text-green-600">
                            ₦{(Number(earnings.data?.role === "farmer" ? s.farmerAmount : s.distributorAmount) / 100).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            ₦{(Number(earnings.data?.role === "farmer" ? s.distributorAmount : s.farmerAmount) / 100).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">₦{(Number(s.platformAmount) / 100).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={
                              (earnings.data?.role === "farmer" ? s.farmerDisbursed : s.distributorDisbursed) ? "default" : "secondary"
                            }>
                              {(earnings.data?.role === "farmer" ? s.farmerDisbursed : s.distributorDisbursed) ? "Paid" : "Pending"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Browse Distributors Tab */}
          <TabsContent value="distributors" className="space-y-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="dark:text-white">Verified Distributors</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Browse approved distributors and propose partnerships
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!distributors.data?.length ? (
                  <div className="text-center py-8 text-muted-foreground dark:text-gray-400">
                    <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No verified distributors yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {distributors.data.map(d => (
                      <Card key={d.id} className="dark:bg-gray-700 dark:border-gray-600">
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold dark:text-white">{d.businessName}</h3>
                              {d.averageRating && (
                                <Badge variant="outline">★ {Number(d.averageRating).toFixed(1)}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground dark:text-gray-400">{d.warehouseAddress}</p>
                            <div className="flex flex-wrap gap-1">
                              {(d.coverageRegions as string[] | null)?.map(r => (
                                <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                              ))}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground dark:text-gray-400">
                                {d.warehouseCapacityKg ? `${Number(d.warehouseCapacityKg).toLocaleString()} kg capacity` : "—"}
                              </span>
                              <span className="text-muted-foreground dark:text-gray-400">
                                {d.totalSalesCount || 0} sales
                              </span>
                            </div>
                            <Button size="sm" className="w-full gap-1">
                              <Handshake className="h-4 w-4" />
                              Propose Partnership
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
