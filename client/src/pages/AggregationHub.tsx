import { useState, useRef, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalization } from "@/contexts/LocalizationContext";
import { trpc } from "@/lib/trpc";
import {
  Warehouse, Package, Scale, Camera, CheckCircle, AlertTriangle,
  FileText, Phone, Printer, TrendingUp, Thermometer, Droplets,
  ClipboardCheck, Truck, ArrowRight, BarChart3, Users,
  Brain, Eye, ScanText, Loader2, Sparkles, Upload, Image as ImageIcon,
  ShieldCheck, Zap,
} from "lucide-react";
import { type AIInspectionResult, runAIInspection, checkAIHealth, fileToBase64, type AIHealthStatus } from "@/lib/ai-inspection";

type GradeType = "A" | "B" | "C" | "D" | "reject";
type TabType = "intake" | "grading" | "receipts" | "reports";

interface IntakeBatch {
  id: string;
  farmerId: number;
  farmerName: string;
  farmerPhone: string;
  cropType: string;
  quantityKg: number;
  grade: GradeType | null;
  moistureContent: number | null;
  foreignMatter: number | null;
  status: "pending" | "graded" | "receipted";
  arrivalTime: string;
  hubId: number;
}

interface WarehouseReceipt {
  id: string;
  receiptNumber: string;
  farmerName: string;
  cropType: string;
  quantityKg: number;
  grade: GradeType;
  unitPrice: number;
  totalValue: number;
  issuedAt: string;
  smsSent: boolean;
}

const GRADE_SPECS: Record<GradeType, { label: string; color: string; priceMultiplier: number; description: string }> = {
  A: { label: "Grade A (Premium)", color: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400", priceMultiplier: 1.2, description: "Moisture <12%, Foreign matter <1%, No broken grains" },
  B: { label: "Grade B (Standard)", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400", priceMultiplier: 1.0, description: "Moisture 12-14%, Foreign matter 1-3%, Minimal defects" },
  C: { label: "Grade C (Fair)", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400", priceMultiplier: 0.8, description: "Moisture 14-16%, Foreign matter 3-5%, Some defects" },
  D: { label: "Grade D (Low)", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400", priceMultiplier: 0.6, description: "Moisture >16%, Foreign matter >5%, Significant defects" },
  reject: { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400", priceMultiplier: 0, description: "Contaminated, infested, or unfit for trade" },
};

const CROP_BASE_PRICES: Record<string, number> = {
  Cassava: 45000,
  Rice: 75000,
  Cocoa: 280000,
  Yam: 80000,
  Groundnut: 55000,
  Plantain: 35000,
  Maize: 42000,
  Millet: 38000,
  Sorghum: 36000,
  Tomato: 25000,
  Pepper: 35000,
  "Oil Palm": 120000,
};

// Seeded demo data for aggregation hub
const DEMO_BATCHES: IntakeBatch[] = [
  { id: "BATCH-001", farmerId: 1, farmerName: "Adewale Ogundimu", farmerPhone: "+2348012345001", cropType: "Cassava", quantityKg: 5000, grade: "A", moistureContent: 11.2, foreignMatter: 0.5, status: "graded", arrivalTime: "2026-05-27T06:30:00Z", hubId: 1 },
  { id: "BATCH-002", farmerId: 2, farmerName: "Chidinma Okafor", farmerPhone: "+2348012345002", cropType: "Rice", quantityKg: 3000, grade: "B", moistureContent: 13.1, foreignMatter: 2.1, status: "graded", arrivalTime: "2026-05-27T07:15:00Z", hubId: 1 },
  { id: "BATCH-003", farmerId: 3, farmerName: "Musa Abdullahi", farmerPhone: "+2348012345003", cropType: "Groundnut", quantityKg: 2000, grade: null, moistureContent: null, foreignMatter: null, status: "pending", arrivalTime: "2026-05-27T08:00:00Z", hubId: 1 },
  { id: "BATCH-004", farmerId: 4, farmerName: "Ngozi Eze", farmerPhone: "+2348012345004", cropType: "Cocoa", quantityKg: 800, grade: null, moistureContent: null, foreignMatter: null, status: "pending", arrivalTime: "2026-05-27T08:45:00Z", hubId: 1 },
  { id: "BATCH-005", farmerId: 5, farmerName: "Ibrahim Bello", farmerPhone: "+2348012345005", cropType: "Maize", quantityKg: 4000, grade: "A", moistureContent: 10.8, foreignMatter: 0.3, status: "receipted", arrivalTime: "2026-05-27T05:00:00Z", hubId: 1 },
  { id: "BATCH-006", farmerId: 6, farmerName: "Funke Adeyemi", farmerPhone: "+2348012345006", cropType: "Yam", quantityKg: 6000, grade: "C", moistureContent: 15.2, foreignMatter: 4.1, status: "graded", arrivalTime: "2026-05-27T06:00:00Z", hubId: 1 },
];

const DEMO_RECEIPTS: WarehouseReceipt[] = [
  { id: "WR-001", receiptNumber: "WR-20260527-A1B2C3", farmerName: "Ibrahim Bello", cropType: "Maize", quantityKg: 4000, grade: "A", unitPrice: 50400, totalValue: 201600000, issuedAt: "2026-05-27T05:30:00Z", smsSent: true },
  { id: "WR-002", receiptNumber: "WR-20260526-D4E5F6", farmerName: "Fatima Yusuf", cropType: "Rice", quantityKg: 2500, grade: "A", unitPrice: 90000, totalValue: 225000000, issuedAt: "2026-05-26T14:00:00Z", smsSent: true },
  { id: "WR-003", receiptNumber: "WR-20260526-G7H8I9", farmerName: "Emeka Nwankwo", cropType: "Cassava", quantityKg: 8000, grade: "B", unitPrice: 45000, totalValue: 360000000, issuedAt: "2026-05-26T11:00:00Z", smsSent: true },
];

export default function AggregationHub() {
  const { formatCurrency } = useLocalization();
  const [activeTab, setActiveTab] = useState<TabType>("intake");
  const [batches, setBatches] = useState<IntakeBatch[]>(DEMO_BATCHES);
  const [receipts, setReceipts] = useState<WarehouseReceipt[]>(DEMO_RECEIPTS);
  const [gradingBatch, setGradingBatch] = useState<IntakeBatch | null>(null);
  const [gradeForm, setGradeForm] = useState<{ grade: GradeType; moisture: string; foreign: string; notes: string }>({ grade: "B", moisture: "", foreign: "", notes: "" });

  // AI Inspection state
  const [aiResult, setAiResult] = useState<AIInspectionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AIHealthStatus | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingBatches = batches.filter(b => b.status === "pending");
  const gradedBatches = batches.filter(b => b.status === "graded");
  const receiptedBatches = batches.filter(b => b.status === "receipted");
  const totalIntakeKg = batches.reduce((sum, b) => sum + b.quantityKg, 0);
  const gradeDistribution = batches.filter(b => b.grade).reduce((acc, b) => {
    acc[b.grade!] = (acc[b.grade!] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Check AI service health on mount
  useEffect(() => {
    checkAIHealth().then(h => setAiHealth(h));
  }, []);

  function handleGrade(batch: IntakeBatch) {
    setGradingBatch(batch);
    setGradeForm({ grade: "B", moisture: "", foreign: "", notes: "" });
    setAiResult(null);
    setAiError(null);
    setCapturedImage(null);
    setImagePreview(null);
  }

  const handleImageCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setCapturedImage(b64);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      console.warn('[Inspection] Image processing failed:', String(err));
      setAiError("Failed to process image");
    }
  }, []);

  async function runInspection() {
    if (!gradingBatch) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const moisture = gradeForm.moisture ? parseFloat(gradeForm.moisture) : undefined;
      const foreign = gradeForm.foreign ? parseFloat(gradeForm.foreign) : undefined;
      const result = await runAIInspection({
        batch_id: gradingBatch.id,
        crop_type: gradingBatch.cropType,
        quantity_kg: gradingBatch.quantityKg,
        farmer_name: gradingBatch.farmerName,
        image_base64: capturedImage || undefined,
        moisture_reading: moisture,
        foreign_matter_reading: foreign,
      });
      setAiResult(result);
      // Auto-fill form from AI recommendation
      if (result.recommended_grade) {
        setGradeForm(prev => ({
          ...prev,
          grade: result.recommended_grade as GradeType,
          notes: `AI Inspection ${result.inspection_id}: ${result.grade_reasoning}`,
        }));
      }
      if (result.moisture_content != null && !gradeForm.moisture) {
        setGradeForm(prev => ({ ...prev, moisture: String(result.moisture_content) }));
      }
      if (result.foreign_matter != null && !gradeForm.foreign) {
        setGradeForm(prev => ({ ...prev, foreign: String(result.foreign_matter) }));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI inspection failed");
    } finally {
      setAiLoading(false);
    }
  }

  function submitGrade() {
    if (!gradingBatch) return;
    const moisture = parseFloat(gradeForm.moisture) || 0;
    const foreign = parseFloat(gradeForm.foreign) || 0;

    setBatches(prev => prev.map(b =>
      b.id === gradingBatch.id
        ? { ...b, grade: gradeForm.grade, moistureContent: moisture, foreignMatter: foreign, status: "graded" as const }
        : b
    ));
    setGradingBatch(null);
  }

  function issueReceipt(batch: IntakeBatch) {
    if (!batch.grade || batch.grade === "reject") return;
    const basePrice = CROP_BASE_PRICES[batch.cropType] || 40000;
    const unitPrice = Math.round(basePrice * GRADE_SPECS[batch.grade].priceMultiplier);
    const totalValue = unitPrice * batch.quantityKg;
    const receiptNumber = `WR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const newReceipt: WarehouseReceipt = {
      id: `WR-${Date.now()}`,
      receiptNumber,
      farmerName: batch.farmerName,
      cropType: batch.cropType,
      quantityKg: batch.quantityKg,
      grade: batch.grade,
      unitPrice,
      totalValue,
      issuedAt: new Date().toISOString(),
      smsSent: true,
    };

    setReceipts(prev => [newReceipt, ...prev]);
    setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, status: "receipted" as const } : b));
  }

  function autoListOnExchange(receipt: WarehouseReceipt) {
    alert(`Listing ${receipt.quantityKg}kg ${receipt.cropType} (Grade ${receipt.grade}) on Commodity Exchange at ${formatCurrency(receipt.unitPrice)}/kg.\n\nSymbol: ${receipt.cropType.toUpperCase()}-${receipt.grade}-HUB-${receipt.quantityKg}KG\nSettlement: T+2 physical delivery`);
  }

  const tabs: { id: TabType; label: string; icon: typeof Warehouse }[] = [
    { id: "intake", label: "Produce Intake", icon: Package },
    { id: "grading", label: "Inspection & Grading", icon: ClipboardCheck },
    { id: "receipts", label: "Warehouse Receipts", icon: FileText },
    { id: "reports", label: "Hub Reports", icon: BarChart3 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" role="main" aria-label="Aggregation Hub">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Warehouse className="h-7 w-7 text-orange-600" />
            Aggregation Hub — Oyo State Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Produce intake, quality inspection, grading, warehouse receipts, and exchange listing
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-900">
            <CardContent className="pt-4 text-center">
              <Package className="h-6 w-6 mx-auto text-blue-600 mb-1" />
              <div className="text-2xl font-bold">{batches.length}</div>
              <div className="text-xs text-muted-foreground">Total Batches Today</div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-900">
            <CardContent className="pt-4 text-center">
              <Scale className="h-6 w-6 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold">{(totalIntakeKg / 1000).toFixed(1)}t</div>
              <div className="text-xs text-muted-foreground">Total Intake</div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-900">
            <CardContent className="pt-4 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto text-yellow-600 mb-1" />
              <div className="text-2xl font-bold">{pendingBatches.length}</div>
              <div className="text-xs text-muted-foreground">Pending Grading</div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-900">
            <CardContent className="pt-4 text-center">
              <FileText className="h-6 w-6 mx-auto text-purple-600 mb-1" />
              <div className="text-2xl font-bold">{receipts.length}</div>
              <div className="text-xs text-muted-foreground">Receipts Issued</div>
            </CardContent>
          </Card>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-2 border-b pb-2" role="tablist" aria-label="Hub sections">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Produce Intake Tab */}
        {activeTab === "intake" && (
          <div className="space-y-4" role="tabpanel" aria-label="Produce intake">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">Today&apos;s Produce Arrivals</h2>
              <Badge variant="outline">{batches.length} batches</Badge>
            </div>
            <div className="overflow-x-auto">
              <table role="table" aria-label="Produce intake batches" className="w-full text-sm">
                <thead role="rowgroup">
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Batch ID</th>
                    <th className="text-left py-3 px-2 font-medium">Farmer</th>
                    <th className="text-left py-3 px-2 font-medium">Crop</th>
                    <th className="text-right py-3 px-2 font-medium">Quantity</th>
                    <th className="text-center py-3 px-2 font-medium">Grade</th>
                    <th className="text-center py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium">Arrival</th>
                    <th className="text-right py-3 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {batches.map(batch => (
                    <tr key={batch.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2 font-mono text-xs">{batch.id}</td>
                      <td className="py-3 px-2">
                        <div>{batch.farmerName}</div>
                        <div className="text-xs text-muted-foreground">{batch.farmerPhone}</div>
                      </td>
                      <td className="py-3 px-2">{batch.cropType}</td>
                      <td className="py-3 px-2 text-right font-medium">{batch.quantityKg.toLocaleString()} kg</td>
                      <td className="py-3 px-2 text-center">
                        {batch.grade ? (
                          <Badge className={GRADE_SPECS[batch.grade].color}>{batch.grade}</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge variant={batch.status === "receipted" ? "default" : batch.status === "graded" ? "secondary" : "outline"}>
                          {batch.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-xs">
                        {new Date(batch.arrivalTime).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {batch.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => handleGrade(batch)}>
                            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Grade
                          </Button>
                        )}
                        {batch.status === "graded" && batch.grade !== "reject" && (
                          <Button size="sm" onClick={() => issueReceipt(batch)}>
                            <FileText className="h-3.5 w-3.5 mr-1" /> Issue Receipt
                          </Button>
                        )}
                        {batch.status === "receipted" && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400">
                            <CheckCircle className="h-3 w-3 mr-1" /> Complete
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grading Modal / Tab */}
        {activeTab === "grading" && (
          <div className="space-y-4" role="tabpanel" aria-label="Inspection and grading">
            <h2 className="text-lg font-semibold dark:text-white">Inspection & Quality Grading</h2>

            {/* Pending grading queue */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingBatches.length > 0 ? pendingBatches.map(batch => (
                <Card key={batch.id} className="dark:bg-gray-900 border-yellow-200 dark:border-yellow-900">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{batch.cropType} — {batch.farmerName}</span>
                      <Badge variant="outline" className="text-yellow-700">Pending</Badge>
                    </CardTitle>
                    <CardDescription>{batch.quantityKg.toLocaleString()} kg | Batch {batch.id}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={() => handleGrade(batch)}>
                      <ClipboardCheck className="h-4 w-4 mr-2" /> Start Inspection
                    </Button>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-2 text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-30" />
                  <p>All batches graded — no pending inspections</p>
                </div>
              )}
            </div>

            {/* Grading form */}
            {gradingBatch && (
              <Card className="dark:bg-gray-900 border-2 border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                    Grading: {gradingBatch.cropType} from {gradingBatch.farmerName}
                  </CardTitle>
                  <CardDescription>
                    Batch {gradingBatch.id} — {gradingBatch.quantityKg.toLocaleString()} kg
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI Inspection Banner */}
                  <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-indigo-500/10 border border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-600" />
                        <div>
                          <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">AI-Powered Inspection</span>
                          <p className="text-xs text-muted-foreground">PaddleOCR + VLM + Docling + Ollama-Qwen</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {aiHealth ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-xs">
                            <Zap className="h-3 w-3 mr-1" /> AI Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">AI Offline — Fallback Mode</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sensor Readings + Photo Capture */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="moisture">Moisture Content (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Droplets className="h-4 w-4 text-blue-500" />
                        <Input
                          id="moisture"
                          type="number"
                          step="0.1"
                          placeholder="e.g. 12.5"
                          value={gradeForm.moisture}
                          onChange={e => setGradeForm(prev => ({ ...prev, moisture: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="foreign">Foreign Matter (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <Input
                          id="foreign"
                          type="number"
                          step="0.1"
                          placeholder="e.g. 1.5"
                          value={gradeForm.foreign}
                          onChange={e => setGradeForm(prev => ({ ...prev, foreign: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Capture / Upload Photo</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleImageCapture}
                      />
                      <div className="flex gap-2 mt-1">
                        <Button variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()}>
                          <Camera className="h-4 w-4 mr-1" />
                          {capturedImage ? "Retake" : "Photo"}
                        </Button>
                        {capturedImage && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 self-center">
                            <ImageIcon className="h-3 w-3 mr-1" /> Captured
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Image Preview */}
                  {imagePreview && (
                    <div className="flex items-start gap-3">
                      <img src={imagePreview} alt="Captured produce" className="w-32 h-24 object-cover rounded-lg border" />
                      <div className="text-xs text-muted-foreground">
                        <p>Image ready for AI analysis</p>
                        <p>PaddleOCR will extract labels, VLM will assess visual quality</p>
                      </div>
                    </div>
                  )}

                  {/* AI Inspection Button */}
                  <div className="flex gap-3">
                    <Button
                      onClick={runInspection}
                      disabled={aiLoading}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                    >
                      {aiLoading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing with AI...</>
                      ) : (
                        <><Brain className="h-4 w-4 mr-2" /> Run AI Inspection</>
                      )}
                    </Button>
                  </div>

                  {/* AI Error */}
                  {aiError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      {aiError}
                    </div>
                  )}

                  {/* AI Inspection Results */}
                  {aiResult && (
                    <div className="space-y-3 p-4 rounded-lg bg-gradient-to-br from-purple-50/50 via-blue-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:via-blue-950/20 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-600" />
                          AI Analysis Results
                          <Badge variant="outline" className="text-xs font-mono">{aiResult.inspection_id}</Badge>
                        </h4>
                        <span className="text-xs text-muted-foreground">{aiResult.processing_time_ms}ms</span>
                      </div>

                      {/* Models used */}
                      <div className="flex flex-wrap gap-1">
                        {aiResult.models_used.map((model, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{model}</Badge>
                        ))}
                      </div>

                      {/* Grade Recommendation */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Card className="dark:bg-gray-900/50">
                          <CardContent className="pt-3 pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">AI Recommended Grade</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className={GRADE_SPECS[aiResult.recommended_grade as GradeType]?.color || "bg-gray-100"}>
                                    {aiResult.recommended_grade}
                                  </Badge>
                                  <span className="text-sm font-medium">{(aiResult.grade_confidence * 100).toFixed(0)}% confidence</span>
                                </div>
                              </div>
                              <ShieldCheck className="h-8 w-8 text-purple-500/30" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">{aiResult.grade_reasoning}</p>
                          </CardContent>
                        </Card>

                        {/* Visual Quality */}
                        {aiResult.visual_quality.overall_score != null && (
                          <Card className="dark:bg-gray-900/50">
                            <CardContent className="pt-3 pb-3">
                              <p className="text-xs text-muted-foreground mb-2">Visual Quality Score</p>
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>Overall</span>
                                  <span className="font-medium">{aiResult.visual_quality.overall_score}/100</span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                                    style={{ width: `${aiResult.visual_quality.overall_score}%` }}
                                  />
                                </div>
                                {aiResult.visual_quality.freshness != null && (
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Freshness: {aiResult.visual_quality.freshness}</span>
                                    <span>Cleanliness: {aiResult.visual_quality.cleanliness}</span>
                                    <span>Uniformity: {aiResult.visual_quality.uniformity}</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>

                      {/* OCR Labels */}
                      {aiResult.ocr_labels.length > 0 && (
                        <div>
                          <p className="text-xs font-medium flex items-center gap-1 mb-1">
                            <ScanText className="h-3 w-3" /> PaddleOCR — Detected Labels
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {aiResult.ocr_labels.map((label, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {label.field}: {label.value}
                                {label.confidence != null && (
                                  <span className="ml-1 opacity-60">({(label.confidence * 100).toFixed(0)}%)</span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Defects */}
                      {aiResult.defects_detected.length > 0 && (
                        <div>
                          <p className="text-xs font-medium flex items-center gap-1 mb-1">
                            <Eye className="h-3 w-3" /> VLM — Defects Detected
                          </p>
                          <div className="space-y-1">
                            {aiResult.defects_detected.map((defect, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <Badge variant={defect.severity === "severe" ? "destructive" : defect.severity === "moderate" ? "default" : "outline"} className="text-xs">
                                  {defect.severity}
                                </Badge>
                                <span>{defect.type}: {defect.description} ({defect.affected_percentage}%)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Color Analysis */}
                      {aiResult.color_analysis.dominant_color && (
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">Color: <strong>{aiResult.color_analysis.dominant_color}</strong></span>
                          <span className="text-muted-foreground">Match: {aiResult.color_analysis.expected_color_match}%</span>
                          <span className="text-muted-foreground">Abnormal: {aiResult.color_analysis.abnormal_areas}</span>
                        </div>
                      )}

                      {/* CV Pipeline Results (YOLOv8 + SAM2 + DINOv2) */}
                      {(aiResult.cv_detections?.length > 0 || aiResult.cv_grade_classification?.predicted_grade) && (
                        <Card className="dark:bg-gray-900/50 border-blue-200 dark:border-blue-800">
                          <CardContent className="pt-3 pb-3 space-y-2">
                            <p className="text-xs font-medium flex items-center gap-1">
                              <Zap className="h-3 w-3 text-blue-500" /> Computer Vision Pipeline
                            </p>

                            {/* CV Detection summary */}
                            {aiResult.cv_summary && (
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="text-center p-1 bg-blue-50 dark:bg-blue-900/20 rounded">
                                  <div className="font-bold text-blue-600">{aiResult.cv_summary.items_detected ?? 0}</div>
                                  <div className="text-muted-foreground">Items Detected</div>
                                </div>
                                <div className="text-center p-1 bg-orange-50 dark:bg-orange-900/20 rounded">
                                  <div className="font-bold text-orange-600">{aiResult.cv_summary.defects_found ?? 0}</div>
                                  <div className="text-muted-foreground">Defects Found</div>
                                </div>
                                <div className="text-center p-1 bg-red-50 dark:bg-red-900/20 rounded">
                                  <div className="font-bold text-red-600">{aiResult.cv_summary.defect_area_percentage ?? 0}%</div>
                                  <div className="text-muted-foreground">Defect Area</div>
                                </div>
                              </div>
                            )}

                            {/* DINOv2 Grade Classification */}
                            {aiResult.cv_grade_classification?.predicted_grade && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">DINOv2 Grade:</span>
                                <Badge variant="outline" className="text-xs font-mono">
                                  {aiResult.cv_grade_classification.predicted_grade}
                                </Badge>
                                <span className="text-muted-foreground">
                                  ({((aiResult.cv_grade_classification.confidence ?? 0) * 100).toFixed(0)}% conf)
                                </span>
                                {aiResult.cv_grade_classification.model && (
                                  <span className="text-muted-foreground opacity-60">via {aiResult.cv_grade_classification.model}</span>
                                )}
                              </div>
                            )}

                            {/* YOLOv8 Detections */}
                            {aiResult.cv_detections?.length > 0 && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-blue-600 hover:underline">
                                  YOLOv8 Detections ({aiResult.cv_detections.length})
                                </summary>
                                <div className="mt-1 space-y-1">
                                  {aiResult.cv_detections.map((det, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <Badge variant="outline" className="text-xs">{det.class}</Badge>
                                      <span>{(det.confidence * 100).toFixed(0)}%</span>
                                      <span className="text-muted-foreground font-mono">
                                        [{det.bbox.map(v => Math.round(v)).join(", ")}]
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}

                            {/* SAM2 Segmentation */}
                            {aiResult.cv_segmentation?.segments && aiResult.cv_segmentation.segments.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                SAM2: {aiResult.cv_segmentation.segments.length} segments,{" "}
                                total area {aiResult.cv_segmentation.total_mask_area?.toFixed(1)}%
                                <span className="ml-2 opacity-60">({aiResult.cv_segmentation.model})</span>
                              </div>
                            )}

                            {/* Grade Probabilities */}
                            {aiResult.cv_grade_classification?.grade_probabilities && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-blue-600 hover:underline">Grade probability distribution</summary>
                                <div className="mt-1 space-y-1">
                                  {Object.entries(aiResult.cv_grade_classification.grade_probabilities).map(([grade, prob]) => (
                                    <div key={grade} className="flex items-center gap-2">
                                      <span className="w-16 font-medium">{grade}</span>
                                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-blue-500 rounded-full"
                                          style={{ width: `${(prob as number) * 100}%` }}
                                        />
                                      </div>
                                      <span className="w-12 text-right">{((prob as number) * 100).toFixed(1)}%</span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {/* Grade Factors */}
                      {aiResult.grade_factors.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary hover:underline">View grading factors ({aiResult.grade_factors.length})</summary>
                          <div className="mt-2 space-y-1">
                            {aiResult.grade_factors.map((factor, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                  factor.impact === "positive" ? "bg-green-500" :
                                  factor.impact === "negative" ? "bg-red-500" : "bg-yellow-500"
                                }`} />
                                <span className="font-medium">{factor.factor}:</span>
                                <span>{factor.value}</span>
                                <span className="text-muted-foreground">(weight: {factor.weight})</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Manual Grade Selection */}
                  <div>
                    <Label className="flex items-center gap-2">
                      Assign Grade
                      {aiResult && (
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-normal">
                          (AI suggests: {aiResult.recommended_grade})
                        </span>
                      )}
                    </Label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                      {(Object.entries(GRADE_SPECS) as [GradeType, typeof GRADE_SPECS["A"]][]).map(([key, spec]) => (
                        <button
                          key={key}
                          onClick={() => setGradeForm(prev => ({ ...prev, grade: key }))}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            gradeForm.grade === key ? "border-primary ring-2 ring-primary/30" : "border-muted hover:border-muted-foreground/30"
                          } ${aiResult?.recommended_grade === key ? "ring-2 ring-purple-400/50" : ""}`}
                        >
                          <Badge className={spec.color}>{spec.label.split(" ")[0]} {spec.label.split(" ")[1]}</Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">{spec.description}</p>
                          {aiResult?.recommended_grade === key && (
                            <p className="text-[9px] text-purple-600 dark:text-purple-400 mt-0.5 flex items-center justify-center gap-0.5">
                              <Brain className="h-2.5 w-2.5" /> AI recommended
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">Inspector Notes</Label>
                    <Input
                      id="notes"
                      placeholder="Any additional observations..."
                      value={gradeForm.notes}
                      onChange={e => setGradeForm(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button onClick={submitGrade} className="flex-1">
                      <CheckCircle className="h-4 w-4 mr-2" /> Submit Grade
                    </Button>
                    <Button variant="outline" onClick={() => setGradingBatch(null)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Grade distribution */}
            <Card className="dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-base">Grade Distribution Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3">
                  {(["A", "B", "C", "D", "reject"] as GradeType[]).map(g => (
                    <div key={g} className="text-center">
                      <div className="text-2xl font-bold">{gradeDistribution[g] || 0}</div>
                      <Badge className={GRADE_SPECS[g].color}>{g === "reject" ? "Rej" : g}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Warehouse Receipts Tab */}
        {activeTab === "receipts" && (
          <div className="space-y-4" role="tabpanel" aria-label="Warehouse receipts">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold dark:text-white">Warehouse Receipts</h2>
              <Badge variant="outline">{receipts.length} issued</Badge>
            </div>

            {receipts.map(receipt => (
              <Card key={receipt.id} className="dark:bg-gray-900">
                <CardContent className="pt-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Receipt details */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-5 w-5 text-purple-600" />
                        <span className="font-mono font-bold text-sm">{receipt.receiptNumber}</span>
                        <Badge className={GRADE_SPECS[receipt.grade].color}>{receipt.grade}</Badge>
                        {receipt.smsSent && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-xs">
                            <Phone className="h-3 w-3 mr-1" /> SMS Sent
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Farmer:</span>{" "}
                          <span className="font-medium">{receipt.farmerName}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Crop:</span>{" "}
                          <span className="font-medium">{receipt.cropType}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Quantity:</span>{" "}
                          <span className="font-medium">{receipt.quantityKg.toLocaleString()} kg</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Value:</span>{" "}
                          <span className="font-medium">{formatCurrency(receipt.totalValue / 100)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Issued: {new Date(receipt.issuedAt).toLocaleString("en-NG")}
                        {" "}| Unit Price: {formatCurrency(receipt.unitPrice / 100)}/kg
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline">
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => autoListOnExchange(receipt)}>
                        <BarChart3 className="h-3.5 w-3.5 mr-1" /> List on Exchange
                      </Button>
                    </div>
                  </div>

                  {/* Receipt card (printable) */}
                  <details className="mt-3">
                    <summary className="text-xs text-primary cursor-pointer hover:underline">View Printable Receipt</summary>
                    <div className="mt-2 p-4 border-2 border-dashed rounded-lg bg-white dark:bg-gray-950">
                      <div className="text-center mb-3">
                        <h3 className="font-bold text-lg">FARMCONNECT WAREHOUSE RECEIPT</h3>
                        <p className="text-xs text-muted-foreground">Oyo State Aggregation Hub</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                        <div><strong>Receipt #:</strong> {receipt.receiptNumber}</div>
                        <div><strong>Date:</strong> {new Date(receipt.issuedAt).toLocaleDateString("en-NG")}</div>
                        <div><strong>Farmer:</strong> {receipt.farmerName}</div>
                        <div><strong>Crop:</strong> {receipt.cropType}</div>
                        <div><strong>Quantity:</strong> {receipt.quantityKg.toLocaleString()} kg</div>
                        <div><strong>Grade:</strong> {receipt.grade} ({GRADE_SPECS[receipt.grade].label})</div>
                        <div><strong>Unit Price:</strong> {formatCurrency(receipt.unitPrice / 100)}/kg</div>
                        <div><strong>Total Value:</strong> {formatCurrency(receipt.totalValue / 100)}</div>
                      </div>
                      <div className="border-t mt-3 pt-2 text-xs text-muted-foreground text-center">
                        This receipt can be used as collateral for warehouse receipt financing (up to 70% of commodity value).
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}

            {/* Receipt-backed loan info */}
            <Card className="dark:bg-gray-900 border-indigo-200 dark:border-indigo-900">
              <CardContent className="pt-4 flex items-center gap-4">
                <div className="p-3 rounded-full bg-indigo-100 dark:bg-indigo-950">
                  <TrendingUp className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Warehouse Receipt Financing</h3>
                  <p className="text-sm text-muted-foreground">
                    Farmers can borrow up to 70% of the commodity value against their warehouse receipts.
                    Apply for loans via the Financial Services section.
                  </p>
                </div>
                <a href="/mobile-money">
                  <Button variant="outline" size="sm">
                    Apply <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Hub Reports Tab */}
        {activeTab === "reports" && (
          <div className="space-y-4" role="tabpanel" aria-label="Hub reports">
            <h2 className="text-lg font-semibold dark:text-white">Hub Performance Reports</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Daily intake report */}
              <Card className="dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600" />
                    Daily Intake Volume
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{(totalIntakeKg / 1000).toFixed(1)} tons</div>
                  <p className="text-sm text-muted-foreground">{batches.length} batches from {new Set(batches.map(b => b.farmerId)).size} farmers</p>
                  <div className="mt-3 space-y-2">
                    {Object.entries(batches.reduce((acc, b) => {
                      acc[b.cropType] = (acc[b.cropType] || 0) + b.quantityKg;
                      return acc;
                    }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([crop, kg]) => (
                      <div key={crop} className="flex items-center justify-between text-sm">
                        <span>{crop}</span>
                        <span className="font-medium">{(kg / 1000).toFixed(1)}t</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Capacity utilization */}
              <Card className="dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Warehouse className="h-4 w-4 text-orange-600" />
                    Capacity Utilization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Cold Storage</span>
                        <span>65%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-2 bg-cyan-500 rounded-full" style={{ width: "65%" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Dry Storage</span>
                        <span>42%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-2 bg-orange-500 rounded-full" style={{ width: "42%" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Processing Area</span>
                        <span>30%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full">
                        <div className="h-2 bg-green-500 rounded-full" style={{ width: "30%" }} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Grade distribution report */}
              <Card className="dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Quality Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {(["A", "B", "C", "D", "reject"] as GradeType[]).map(g => (
                      <div key={g}>
                        <div className="text-xl font-bold">{gradeDistribution[g] || 0}</div>
                        <Badge className={`text-xs ${GRADE_SPECS[g].color}`}>{g === "reject" ? "Rej" : g}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                    Premium rate (A+B): {Math.round(((gradeDistribution["A"] || 0) + (gradeDistribution["B"] || 0)) / Math.max(batches.filter(b => b.grade).length, 1) * 100)}%
                  </div>
                </CardContent>
              </Card>

              {/* Farmer activity */}
              <Card className="dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    Farmer Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from(new Set(batches.map(b => b.farmerName))).map(name => {
                      const farmerBatches = batches.filter(b => b.farmerName === name);
                      const totalKg = farmerBatches.reduce((s, b) => s + b.quantityKg, 0);
                      return (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span>{name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{farmerBatches.length} batch</Badge>
                            <span className="font-medium">{(totalKg / 1000).toFixed(1)}t</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
