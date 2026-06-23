/**
 * Supply Chain Provenance — MobyDB-powered verifiable tracking
 *
 * End-to-end supply chain visibility with cryptographic proofs.
 * Each step is anchored to a spacetime address (H3 cell + epoch + signer key).
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Link2, ArrowRight, CheckCircle, Clock, Hexagon, Wheat,
  Warehouse, Truck, Factory, Package, Shield, Search,
  MapPin, Key, FileCheck, Leaf,
} from "lucide-react";

const STEP_CONFIG = {
  harvest: { icon: Wheat, color: "bg-green-100 text-green-700", label: "Harvest" },
  storage: { icon: Warehouse, color: "bg-amber-100 text-amber-700", label: "Storage" },
  transport: { icon: Truck, color: "bg-blue-100 text-blue-700", label: "Transport" },
  processing: { icon: Factory, color: "bg-purple-100 text-purple-700", label: "Processing" },
  delivery: { icon: Package, color: "bg-teal-100 text-teal-700", label: "Delivery" },
};

export default function SupplyChainProvenance() {
  const [searchChainId, setSearchChainId] = useState("");
  const [activeChainId, setActiveChainId] = useState("");

  const stats = trpc.mobydb.dashboardStats.useQuery();
  const chain = trpc.mobydb.getSupplyChain.useQuery(
    { chainId: activeChainId },
    { enabled: activeChainId.length > 0 },
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark rounded-xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Supply Chain Provenance</h1>
              <p className="text-white/80 text-sm">
                MobyDB Cryptographic Traceability · Merkle Proofs · Farm-to-Table Verification
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="text-white border-white/40">
              {stats.data?.activeChains ?? 0} Active Chains
            </Badge>
            <Badge variant="outline" className="text-white border-white/40">
              {stats.data?.verifiedRecords ?? 0} Verified Steps
            </Badge>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(STEP_CONFIG).map(([type, cfg]) => (
            <Card key={type}>
              <CardContent className="p-4 text-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${cfg.color}`}>
                  <cfg.icon className="w-5 h-5" />
                </div>
                <div className="text-sm font-medium">{cfg.label}</div>
                <div className="text-xs text-muted-foreground">Step {Object.keys(STEP_CONFIG).indexOf(type) + 1}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chain Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Track Supply Chain
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter chain ID (e.g., MAIZE-2026-001)"
                value={searchChainId}
                onChange={(e) => setSearchChainId(e.target.value)}
                className="font-mono"
              />
              <Button onClick={() => setActiveChainId(searchChainId)} disabled={!searchChainId}>
                <Search className="w-4 h-4 mr-1" /> Track
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Chain Timeline */}
        {chain.data && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-primary" />
                  Chain: {chain.data.chainId}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={chain.data.complete ? "default" : "secondary"}>
                    {chain.data.complete ? "✓ Complete" : "In Progress"}
                  </Badge>
                  <Badge variant="outline">{chain.data.totalSteps} steps</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chain.data.steps.length > 0 ? (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-primary/20" />

                  <div className="space-y-4">
                    {chain.data.steps.map((step, i) => {
                      const cfg = STEP_CONFIG[step.stepType as keyof typeof STEP_CONFIG] || STEP_CONFIG.harvest;
                      const StepIcon = cfg.icon;
                      return (
                        <div key={step.id} className="relative flex items-start gap-4 pl-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 shrink-0 ${cfg.color}`}>
                            <StepIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 p-3 rounded border bg-background">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{cfg.label}</span>
                                <Badge variant="outline" className="text-xs">Step {step.stepNumber}</Badge>
                              </div>
                              <Badge variant={step.verified ? "default" : "secondary"} className="text-xs">
                                {step.verified ? "✓ Verified" : "Pending"}
                              </Badge>
                            </div>
                            {step.actorName && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Key className="w-3 h-3" /> {step.actorName}
                              </div>
                            )}
                            {step.h3Cell && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Hexagon className="w-3 h-3" /> {step.h3Cell}
                              </div>
                            )}
                            {step.latitude && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {step.latitude.toFixed(4)}, {step.longitude?.toFixed(4)}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" /> {new Date(step.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No steps recorded for this chain.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              How Provenance Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Problem side */}
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-3">
                  Traditional Supply Chain
                </h3>
                <div className="space-y-2 text-sm">
                  {[
                    "Paper-based records easily forged",
                    "No way to verify farm of origin",
                    "Temperature breaks go undetected",
                    "Middlemen can substitute lower-quality produce",
                    "Buyers must trust, not verify",
                  ].map((problem, i) => (
                    <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span>{problem}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Solution side */}
              <div className="p-4 rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800">
                <h3 className="font-semibold text-teal-800 dark:text-teal-200 mb-3">
                  MobyDB Provenance
                </h3>
                <div className="space-y-2 text-sm">
                  {[
                    "Every record cryptographically signed (Ed25519)",
                    "H3 cell anchors prove exact farm location",
                    "Sealed epochs create immutable audit trail",
                    "Merkle proofs verify any record independently",
                    "Buyers verify: don't trust, verify",
                  ].map((solution, i) => (
                    <div key={i} className="flex items-start gap-2 text-teal-700 dark:text-teal-300">
                      <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{solution}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Flow diagram */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {Object.entries(STEP_CONFIG).map(([type, cfg], i) => {
                  const StepIcon = cfg.icon;
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cfg.color}`}>
                          <StepIcon className="w-4 h-4" />
                        </div>
                        <div className="text-xs">
                          <div className="font-medium">{cfg.label}</div>
                          <div className="text-muted-foreground">H3 + Epoch + Key</div>
                        </div>
                      </div>
                      {i < Object.keys(STEP_CONFIG).length - 1 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
