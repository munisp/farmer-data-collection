/**
 * Traceability Dashboard
 * Track agricultural products from farm to buyer with QR codes
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  QrCode,
  Package,
  Truck,
  Warehouse,
  MapPin,
  Search,
  Plus,
  Eye,
  Download,
  CheckCircle,
  Clock,
  ArrowRight,
  Leaf,
  Thermometer,
  Droplets,
  FileText,
  Loader2,
} from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { Scissors, Link2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function TraceabilityDashboard() {
  const { formatCurrency, formatWeight } = useLocalization();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [showCreateBatchDialog, setShowCreateBatchDialog] = useState(false);
  const [showBatchDetailDialog, setShowBatchDetailDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [qrBatchCode, setQrBatchCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [splitParts, setSplitParts] = useState('2');
  const [splitQuantities, setSplitQuantities] = useState<string[]>([]);

  const { data: batchesData, isLoading: batchesLoading, refetch: refetchBatches } = trpc.traceability.listBatches.useQuery({});

  const { data: collectionCentersData, isLoading: centersLoading } = trpc.traceability.listCollectionCenters.useQuery({});

  const { data: warehousesData, isLoading: warehousesLoading } = trpc.traceability.listWarehouses.useQuery({});

  const { data: statsData } = trpc.traceability.getStats.useQuery();

  const generateQRMutation = trpc.traceabilityEnhancements.generateQRCode.useMutation({
    onSuccess: (data) => {
      setQrBatchCode(JSON.stringify(data, null, 2));
      setShowQRDialog(true);
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const verifyBatchQuery = trpc.traceabilityEnhancements.verifyBatch.useQuery(
    { batchCode: verifyCode },
    {
      enabled: false,
      retry: false,
    }
  );

  const splitBatchMutation = trpc.traceabilityEnhancements.splitBatch.useMutation({
    onSuccess: (data) => {
      toast({ title: `Batch split into ${data.newBatches.length} parts` });
      setShowSplitDialog(false);
      refetchBatches();
    },
    onError: (err: any) => toast({ title: 'Split failed', description: err.message, variant: 'destructive' }),
  });

  const createBatchMutation = trpc.traceability.createBatch.useMutation({
    onSuccess: () => {
      toast({ title: 'Batch created successfully' });
      refetchBatches();
      setShowCreateBatchDialog(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const batches = batchesData || [];
  const collectionCenters = collectionCentersData || [];
  const warehouses = warehousesData || [];
  
  // Transform stats data to expected format
  const defaultStats = { batches: { total: 0, active: 0, totalQuantity: 0 }, collectionCenters: { total: 0, active: 0 }, warehouses: { total: 0, active: 0 }, receipts: { total: 0, active: 0, pledged: 0 } };
  const rawStats = statsData || defaultStats;
  const stats = {
    totalBatches: rawStats.batches?.total || 0,
    inTransit: rawStats.batches?.active || 0,
    collectionCenters: rawStats.collectionCenters?.total || 0,
    warehouses: rawStats.warehouses?.total || 0,
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      created: { color: 'bg-gray-100 text-gray-800', label: 'Created' },
      at_farm: { color: 'bg-green-100 text-green-800', label: 'At Farm' },
      in_transit: { color: 'bg-blue-100 text-blue-800', label: 'In Transit' },
      at_collection_center: { color: 'bg-yellow-100 text-yellow-800', label: 'At Collection' },
      at_warehouse: { color: 'bg-purple-100 text-purple-800', label: 'At Warehouse' },
      ready_for_sale: { color: 'bg-emerald-100 text-emerald-800', label: 'Ready for Sale' },
      sold: { color: 'bg-indigo-100 text-indigo-800', label: 'Sold' },
      delivered: { color: 'bg-teal-100 text-teal-800', label: 'Delivered' },
    };
    const config = statusConfig[status] || { color: 'bg-gray-100', label: status };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const getGradeBadge = (grade: string) => {
    const gradeConfig: Record<string, { color: string; label: string }> = {
      premium: { color: 'bg-amber-100 text-amber-800', label: 'Premium' },
      grade_a: { color: 'bg-green-100 text-green-800', label: 'Grade A' },
      grade_b: { color: 'bg-blue-100 text-blue-800', label: 'Grade B' },
      grade_c: { color: 'bg-gray-100 text-gray-800', label: 'Grade C' },
    };
    const config = gradeConfig[grade] || { color: 'bg-gray-100', label: grade };
    return <Badge variant="outline" className={config.color}>{config.label}</Badge>;
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'harvest':
        return <Leaf className="w-4 h-4" />;
      case 'quality_check':
        return <CheckCircle className="w-4 h-4" />;
      case 'collection':
        return <Package className="w-4 h-4" />;
      case 'transport_start':
      case 'transport_end':
        return <Truck className="w-4 h-4" />;
      case 'warehouse_receipt':
        return <Warehouse className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const viewBatchDetails = (batch: any) => {
    setSelectedBatch(batch);
    setShowBatchDetailDialog(true);
  };

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Supply Chain Traceability</h1>
          <p className="text-muted-foreground">Track products from farm to buyer with full transparency</p>
        </div>
        <Dialog open={showCreateBatchDialog} onOpenChange={setShowCreateBatchDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Batch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Product Batch</DialogTitle>
              <DialogDescription>Register a new batch from harvest</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Crop Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select crop" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maize">Maize</SelectItem>
                    <SelectItem value="rice">Rice</SelectItem>
                    <SelectItem value="cassava">Cassava</SelectItem>
                    <SelectItem value="yam">Yam</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Variety</Label>
                <Input placeholder="e.g., SAMMAZ 15" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" placeholder="0" />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilograms</SelectItem>
                      <SelectItem value="tonnes">Tonnes</SelectItem>
                      <SelectItem value="bags">Bags (50kg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Quality Grade</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="grade_a">Grade A</SelectItem>
                    <SelectItem value="grade_b">Grade B</SelectItem>
                    <SelectItem value="grade_c">Grade C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Harvest Date</Label>
                <Input type="date" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="organic" className="rounded" />
                <Label htmlFor="organic">Organic Certified</Label>
              </div>
              <Button className="w-full">Create Batch</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Batches</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBatches}</div>
            <p className="text-xs text-muted-foreground">Active in supply chain</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
                        <div className="text-2xl font-bold">{stats.inTransit}</div>
                        <p className="text-xs text-muted-foreground">Being transported</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Collection Centers</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.collectionCenters}</div>
            <p className="text-xs text-muted-foreground">Active centers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Warehouses</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.warehouses}</div>
            <p className="text-xs text-muted-foreground">Storage facilities</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="batches">
        <TabsList>
          <TabsTrigger value="batches">Product Batches</TabsTrigger>
          <TabsTrigger value="scan">Scan QR Code</TabsTrigger>
          <TabsTrigger value="centers">Collection Centers</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Product Batches</CardTitle>
                  <CardDescription>Track all registered product batches</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Search" placeholder="Search by batch code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Code</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                                <TableBody>
                                  {batchesLoading ? (
                                    <TableRow>
                                      <TableCell colSpan={7} className="text-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                      </TableCell>
                                    </TableRow>
                                  ) : batches.map((batch: any) => (
                                    <TableRow key={batch.id}>
                                      <TableCell className="font-mono">{batch.batchCode}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          {batch.cropType}
                                          {batch.isOrganic && (
                                            <Badge variant="outline" className="bg-green-50 text-green-700">
                                              <Leaf className="w-3 h-3 mr-1" />
                                              Organic
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>{formatWeight(Number(batch.quantity))} kg</TableCell>
                                      <TableCell>{getGradeBadge(batch.qualityGrade)}</TableCell>
                                      <TableCell>{batch.originVillage}, {batch.originRegion}</TableCell>
                                      <TableCell>{getStatusBadge(batch.status)}</TableCell>
                                      <TableCell>
                                        <div className="flex gap-2">
                                          <Button variant="ghost" size="sm" onClick={() => viewBatchDetails(batch)}>
                                            <Eye className="w-4 h-4" />
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => generateQRMutation.mutate({ batchId: batch.id })}>
                                            <QrCode className="w-4 h-4" />
                                          </Button>
                                          <Button variant="ghost" size="sm" onClick={() => { setSelectedBatch(batch); setSplitParts('2'); setSplitQuantities([]); setShowSplitDialog(true); }}>
                                            <Scissors className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Scan QR Code
              </CardTitle>
              <CardDescription>Scan a product QR code to view its traceability information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-64 h-64 border-2 border-dashed border-muted-foreground/50 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <QrCode className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Camera preview will appear here</p>
                  </div>
                </div>
                <Button>
                  <QrCode className="w-4 h-4 mr-2" />
                  Start Scanning
                </Button>
                <p className="text-sm text-muted-foreground">Enter batch code to verify:</p>
                <div className="flex gap-2 w-full max-w-md">
                  <Input placeholder="BATCH-2024-001" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
                  <Button variant="outline" onClick={() => { if (verifyCode) verifyBatchQuery.refetch().then(r => { if (r.data) setVerifyResult(r.data); }); }} disabled={!verifyCode || verifyBatchQuery.isFetching}>
                    {verifyBatchQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    Verify
                  </Button>
                </div>

                {/* Verification Result */}
                {verifyResult && (
                  <Card className="w-full max-w-md mt-4">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        Batch Verified
                      </CardTitle>
                      <CardDescription>{verifyResult.batch.batchCode}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Crop:</span> {verifyResult.batch.cropType}</div>
                        <div><span className="text-muted-foreground">Grade:</span> {getGradeBadge(verifyResult.batch.qualityGrade)}</div>
                        <div><span className="text-muted-foreground">Origin:</span> {verifyResult.batch.originRegion}</div>
                        <div><span className="text-muted-foreground">Status:</span> {getStatusBadge(verifyResult.batch.status)}</div>
                        <div><span className="text-muted-foreground">Organic:</span> {verifyResult.batch.isOrganic ? 'Yes' : 'No'}</div>
                        <div><span className="text-muted-foreground">Events:</span> {verifyResult.totalEvents} recorded</div>
                      </div>
                      {verifyResult.journey && verifyResult.journey.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                          <h5 className="text-sm font-semibold mb-2">Journey Timeline</h5>
                          {verifyResult.journey.map((ev: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs py-1">
                              {getEventIcon(ev.eventType)}
                              <span className="capitalize">{ev.eventType.replace('_', ' ')}</span>
                              <span className="text-muted-foreground">{ev.location || ''}</span>
                              {ev.isVerified && <CheckCircle className="w-3 h-3 text-green-500" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Collection Centers</CardTitle>
              <CardDescription>Manage collection points for aggregating produce</CardDescription>
            </CardHeader>
            <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {centersLoading ? (
                                <div className="col-span-3 flex justify-center py-8">
                                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                </div>
                              ) : collectionCenters.map((center: any) => (
                                <Card key={center.id}>
                                  <CardContent className="p-4">
                                    <h4 className="font-semibold">{center.name}</h4>
                                    <p className="text-sm text-muted-foreground">{center.region}</p>
                                    <div className="mt-4 space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Capacity:</span>
                                        <span>{center.currentStock}/{center.capacity} tonnes</span>
                                      </div>
                                      <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                          className="bg-primary h-2 rounded-full"
                                          style={{ width: `${(center.currentStock / center.capacity) * 100}%` }}
                                        />
                                      </div>
                                      <div className="flex gap-2 mt-2">
                                        {center.hasWeighingScale && (
                                          <Badge variant="outline" className="text-xs">
                                            <Thermometer className="w-3 h-3 mr-1" />
                                            Scale
                                          </Badge>
                                        )}
                                        {center.hasMoistureReader && (
                                          <Badge variant="outline" className="text-xs">
                                            <Droplets className="w-3 h-3 mr-1" />
                                            Moisture
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Warehouses</CardTitle>
              <CardDescription>Storage facilities for agricultural products</CardDescription>
            </CardHeader>
            <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {warehousesLoading ? (
                                <div className="col-span-2 flex justify-center py-8">
                                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                </div>
                              ) : warehouses.map((warehouse: any) => (
                                <Card key={warehouse.id}>
                                  <CardContent className="p-4">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h4 className="font-semibold">{warehouse.name}</h4>
                                        <p className="text-sm text-muted-foreground">{warehouse.region}</p>
                                      </div>
                                      <Button variant="outline" size="sm">
                                        <FileText className="w-4 h-4 mr-2" />
                                        Receipts
                                      </Button>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Available Capacity:</span>
                                        <span>{warehouse.availableCapacity}/{warehouse.totalCapacity} tonnes</span>
                                      </div>
                                      <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                          className="bg-green-500 h-2 rounded-full"
                                          style={{ width: `${(warehouse.availableCapacity / warehouse.totalCapacity) * 100}%` }}
                                        />
                                      </div>
                                      <div className="flex gap-2 mt-2">
                                        {(warehouse.certifications || []).map((cert: string) => (
                                          <Badge key={cert} variant="outline" className="text-xs">
                                            {cert}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Batch Detail Dialog */}
      <Dialog open={showBatchDetailDialog} onOpenChange={setShowBatchDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Batch Details</DialogTitle>
            <DialogDescription>
              {selectedBatch?.batchCode} - Full traceability information
            </DialogDescription>
          </DialogHeader>
          {selectedBatch && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Crop</Label>
                  <p className="font-medium">{selectedBatch.cropType} ({selectedBatch.variety})</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Quantity</Label>
                  <p className="font-medium">{formatWeight(Number(selectedBatch.quantity))} kg</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Quality Grade</Label>
                  <p>{getGradeBadge(selectedBatch.qualityGrade)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p>{getStatusBadge(selectedBatch.status)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Origin</Label>
                  <p className="font-medium">{selectedBatch.originVillage}, {selectedBatch.originRegion}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Harvest Date</Label>
                  <p className="font-medium">{selectedBatch.harvestDate}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Journey Timeline</h4>
                <div className="space-y-4">
                  {(selectedBatch.events || []).map((event: { id: number; eventType: string; isVerified?: boolean; location?: string; eventTimestamp?: Date; performedBy?: number }, index: number) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`p-2 rounded-full ${event.isVerified ? 'bg-green-100' : 'bg-gray-100'}`}>
                          {getEventIcon(event.eventType)}
                        </div>
                        {index < (selectedBatch.events || []).length - 1 && (
                          <div className="w-0.5 h-full bg-gray-200 my-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{event.eventType.replace('_', ' ')}</span>
                          {event.isVerified && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{event.location || 'Unknown location'}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.eventTimestamp ? new Date(event.eventTimestamp).toLocaleString() : 'N/A'} by Agent #{event.performedBy || 'N/A'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => generateQRMutation.mutate({ batchId: selectedBatch.id })} disabled={generateQRMutation.isPending}>
                  {generateQRMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                  Generate QR Code
                </Button>
                <Button variant="outline" onClick={() => { setSelectedBatch(selectedBatch); setSplitParts('2'); setShowSplitDialog(true); }}>
                  <Scissors className="w-4 h-4 mr-2" />
                  Split Batch
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5" /> QR Code Data</DialogTitle>
            <DialogDescription>Scan this data with any QR code generator to produce a scannable label</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <pre className="text-xs whitespace-pre-wrap font-mono">{qrBatchCode}</pre>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => { navigator.clipboard.writeText(qrBatchCode); toast({ title: 'Copied to clipboard' }); }}>
                <Link2 className="w-4 h-4 mr-2" />Copy Data
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Split Batch Dialog */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5" /> Split Batch</DialogTitle>
            <DialogDescription>Divide {selectedBatch?.batchCode} into sub-batches</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">Original quantity: <strong>{selectedBatch?.quantity} kg</strong></div>
            <div className="space-y-2">
              <Label>Number of parts</Label>
              <Select value={splitParts} onValueChange={(v) => { setSplitParts(v); setSplitQuantities(Array(parseInt(v)).fill('')); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['2', '3', '4', '5'].map(n => <SelectItem key={n} value={n}>{n} parts</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {splitQuantities.map((q, i) => (
              <div key={i} className="space-y-1">
                <Label>Part {i + 1} quantity (kg)</Label>
                <Input type="number" value={q} onChange={(e) => { const nq = [...splitQuantities]; nq[i] = e.target.value; setSplitQuantities(nq); }} />
              </div>
            ))}
            <Button className="w-full" disabled={splitBatchMutation.isPending || !selectedBatch} onClick={() => {
              if (!selectedBatch) return;
              const quantities = splitQuantities.map(Number).filter(n => n > 0);
              if (quantities.length < 2) { toast({ title: 'Enter at least 2 valid quantities' }); return; }
              splitBatchMutation.mutate({ batchId: selectedBatch.id, splits: quantities.map((q: number) => ({ quantity: q })) });
            }}>
              {splitBatchMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Splitting...</> : 'Split Batch'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
