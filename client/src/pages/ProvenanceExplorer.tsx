/**
 * Provenance Explorer — MobyDB Spacetime Provenance Dashboard
 *
 * Browse and verify provenance records anchored to H3 cells and GEP epochs.
 * Supply chain traceability with Merkle proof verification.
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Shield, Database, Hexagon, Clock, Key, CheckCircle,
  Link2, Search, Lock, Fingerprint, Globe, FileCheck,
  ArrowRight, Hash, Layers, Activity,
} from "lucide-react";

type ProvenanceTab = "overview" | "records" | "epochs" | "chains" | "verify";

export default function ProvenanceExplorer() {
  const [activeTab, setActiveTab] = useState<ProvenanceTab>("overview");
  const [searchCell, setSearchCell] = useState("");
  const [verifyCell, setVerifyCell] = useState("");
  const [verifyEpoch, setVerifyEpoch] = useState("");
  const [verifyPubkey, setVerifyPubkey] = useState("");

  const status = trpc.mobydb.status.useQuery();
  const stats = trpc.mobydb.dashboardStats.useQuery();
  const epochs = trpc.mobydb.getEpochs.useQuery({ limit: 20 });
  const myKeys = trpc.mobydb.getMyKeys.useQuery();

  const nearbyRecords = trpc.mobydb.nearbyRecords.useQuery(
    { h3Cell: searchCell, rings: 3, limit: 50 },
    { enabled: searchCell.length >= 4 },
  );

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: Database },
    { id: "records" as const, label: "Records", icon: Hexagon },
    { id: "epochs" as const, label: "Epochs", icon: Clock },
    { id: "chains" as const, label: "Supply Chains", icon: Link2 },
    { id: "verify" as const, label: "Verify", icon: Shield },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark rounded-xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Provenance Explorer</h1>
              <p className="text-white/80 text-sm">
                MobyDB Spacetime Provenance · Cryptographic Verification · Merkle Proofs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="text-white border-white/40">
              {status.data?.mobydbConnected ? "🟢 MobyDB Connected" : "🔴 MobyDB Offline — PostgreSQL Fallback"}
            </Badge>
            <Badge variant="outline" className="text-white border-white/40">
              GEP Genesis: {status.data?.genesisHash?.slice(0, 12)}...
            </Badge>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b pb-2 overflow-x-auto">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5"
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Total Records", value: stats.data?.totalRecords ?? 0, icon: Database, color: "text-primary" },
                { label: "Epochs", value: stats.data?.totalEpochs ?? 0, icon: Clock, color: "text-blue-600" },
                { label: "Sealed Epochs", value: stats.data?.sealedEpochs ?? 0, icon: Lock, color: "text-green-600" },
                { label: "Active Chains", value: stats.data?.activeChains ?? 0, icon: Link2, color: "text-purple-600" },
                { label: "Verified", value: stats.data?.verifiedRecords ?? 0, icon: CheckCircle, color: "text-emerald-600" },
                { label: "Current Epoch", value: status.data?.currentEpoch ?? 0, icon: Activity, color: "text-orange-600" },
              ].map((kpi, i) => (
                <Card key={i}>
                  <CardContent className="p-4 text-center">
                    <kpi.icon className={`w-6 h-6 mx-auto mb-2 ${kpi.color}`} />
                    <div className="text-2xl font-bold">{kpi.value.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{kpi.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* How it works */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-primary" />
                  Spacetime Address Model
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { label: "WHERE", desc: "H3 hexagonal cell (sub-km precision)", icon: Hexagon, example: "861e8050fffffff" },
                    { label: "WHEN", desc: "GEP Epoch (immutable time anchor)", icon: Clock, example: "Epoch 42" },
                    { label: "WHO", desc: "Ed25519 public key (cryptographic identity)", icon: Key, example: "a1b2c3d4..." },
                  ].map((dim, i) => (
                    <div key={i} className="p-4 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 mb-2">
                        <dim.icon className="w-5 h-5 text-primary" />
                        <span className="font-bold text-primary">{dim.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{dim.desc}</p>
                      <code className="text-xs bg-muted p-1 rounded">{dim.example}</code>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20 text-sm">
                  <strong>Composite Key:</strong> <code>[h3_cell: 8 bytes][epoch: 8 bytes][pubkey: 32 bytes]</code> = 48 bytes, lexicographically sortable. Near queries are integer range scans — no geometry calculation.
                </div>
              </CardContent>
            </Card>

            {/* Provenance Keys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-primary" />
                  My Provenance Keys
                </CardTitle>
              </CardHeader>
              <CardContent>
                {myKeys.data && myKeys.data.length > 0 ? (
                  <div className="space-y-2">
                    {myKeys.data.map((key) => (
                      <div key={key.id} className="flex items-center justify-between p-3 rounded border">
                        <div>
                          <code className="text-xs">{key.pubkeyHex}</code>
                          <p className="text-xs text-muted-foreground mt-1">{key.label} · {key.keyType}</p>
                        </div>
                        <Badge variant={key.active ? "default" : "secondary"}>
                          {key.active ? "Active" : "Revoked"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No provenance keys yet. Keys are auto-generated when you record your first observation.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Records Tab */}
        {activeTab === "records" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  Search by H3 Cell
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter H3 cell index (e.g., 861e8050fffffff)"
                    value={searchCell}
                    onChange={(e) => setSearchCell(e.target.value)}
                    className="font-mono"
                  />
                  <Button disabled={searchCell.length < 4}>
                    <Search className="w-4 h-4 mr-1" /> Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {nearbyRecords.data && nearbyRecords.data.records.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {nearbyRecords.data.total} Records Found
                    <Badge variant="outline" className="ml-2">
                      Source: {nearbyRecords.data.source}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {nearbyRecords.data.records.map((record, i) => (
                      <div key={i} className="p-3 rounded border flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-primary" />
                            <code className="text-xs">{record.h3Cell}</code>
                            <Badge variant="outline" className="text-xs">Epoch {record.epoch}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Key: {record.pubkey?.slice(0, 16)}... · {new Date(record.createdAt as string).toLocaleString()}
                          </div>
                        </div>
                        {"verified" in record && (
                          <Badge variant={record.verified ? "default" : "secondary"}>
                            {record.verified ? "✓ Verified" : "Unverified"}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Epochs Tab */}
        {activeTab === "epochs" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  GEP Epochs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {epochs.data && epochs.data.length > 0 ? (
                  <div className="space-y-2">
                    {epochs.data.map((epoch) => (
                      <div key={epoch.epoch} className="p-3 rounded border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{epoch.epoch}</span>
                          </div>
                          <div>
                            <span className="font-medium">Epoch {epoch.epoch}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              {epoch.recordCount} records
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {epoch.merkleRoot && (
                            <code className="text-xs text-muted-foreground">{epoch.merkleRoot.slice(0, 12)}...</code>
                          )}
                          <Badge variant={epoch.sealed ? "default" : "secondary"}>
                            {epoch.sealed ? "🔒 Sealed" : "Open"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No epochs recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Supply Chains Tab */}
        {activeTab === "chains" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-primary" />
                  Supply Chain Provenance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-6 text-center">
                  <Globe className="w-12 h-12 mx-auto text-primary/30 mb-3" />
                  <h3 className="font-semibold mb-1">Verifiable Supply Chain Tracking</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Every step from harvest → storage → transport → processing → delivery
                    is recorded as a cryptographically signed provenance record anchored to
                    a specific location (H3 cell) and time (GEP epoch).
                  </p>
                  <div className="flex justify-center gap-2 mt-4">
                    {["Harvest", "Storage", "Transport", "Processing", "Delivery"].map((step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">{i + 1}</span>
                        </div>
                        <span className="text-xs">{step}</span>
                        {i < 4 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Verify Tab */}
        {activeTab === "verify" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-primary" />
                  Verify Provenance Record
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium">H3 Cell</label>
                  <Input
                    placeholder="861e8050fffffff"
                    value={verifyCell}
                    onChange={(e) => setVerifyCell(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Epoch</label>
                  <Input
                    type="number"
                    placeholder="42"
                    value={verifyEpoch}
                    onChange={(e) => setVerifyEpoch(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Public Key (hex)</label>
                  <Input
                    placeholder="a1b2c3d4e5f6..."
                    value={verifyPubkey}
                    onChange={(e) => setVerifyPubkey(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!verifyCell || !verifyEpoch || !verifyPubkey}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Generate Merkle Proof
                </Button>
                <div className="p-3 bg-muted/50 rounded text-xs text-muted-foreground">
                  Enter the spacetime address (WHERE + WHEN + WHO) to generate a cryptographic
                  Merkle proof that this record exists in the sealed epoch chain.
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
