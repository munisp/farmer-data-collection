/**
 * Field Collection Tool
 *
 * GPS/map-tap capture for farm boundaries, crop observations, warehouse inspections.
 * Stores offline in IndexedDB and syncs to server.
 */
import { useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  MapPin, Navigation, Plus, Upload, Save, Trash2,
  CheckCircle2, AlertCircle, Crosshair, Layers, PenTool, Download,
} from "lucide-react";
import {
  FARM_FORM_SCHEMAS,
  capturePointFromGPS,
  capturePointFromMapTap,
  buildPolygonFromPoints,
  saveCollection,
  loadCollections,
  exportAsGeoJSON,
  getUnsyncedCount,
  type CollectedFeature,
  type FieldCollection,
  type FieldFormSchema,
} from "@/lib/geolibre/field-collection";

type CollectionMode = "idle" | "point-gps" | "point-tap" | "polygon";

export default function SpatialFieldCollection() {
  const [activeSchema, setActiveSchema] = useState<FieldFormSchema>(FARM_FORM_SCHEMAS[0]);
  const [mode, setMode] = useState<CollectionMode>("idle");
  const [features, setFeatures] = useState<CollectedFeature[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<Array<[number, number]>>([]);
  const [collectionName, setCollectionName] = useState("My Collection");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>("");
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  const syncMutation = trpc.spatialAnalysis.syncFieldCollection.useMutation();

  // Load unsynced count on mount
  useState(() => {
    getUnsyncedCount().then(setUnsyncedCount).catch(() => {});
  });

  const handleCaptureGPS = useCallback(async () => {
    setStatus("Acquiring GPS position...");
    try {
      const feature = await capturePointFromGPS(activeSchema.id, "current-user", formData);
      setFeatures(prev => [...prev, feature]);
      setStatus(`Point captured at ${(feature.geometry.coordinates as number[]).map(c => c.toFixed(4)).join(", ")} (accuracy: ${feature.metadata.accuracy?.toFixed(0)}m)`);
      setFormData({});
    } catch (e) {
      setStatus(`GPS error: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }, [activeSchema, formData]);

  const handleAddTapPoint = useCallback((lng: number, lat: number) => {
    if (mode === "point-tap") {
      const feature = capturePointFromMapTap(lng, lat, activeSchema.id, "current-user", formData);
      setFeatures(prev => [...prev, feature]);
      setStatus(`Point placed at ${lng.toFixed(4)}, ${lat.toFixed(4)}`);
      setFormData({});
    } else if (mode === "polygon") {
      setPolygonPoints(prev => [...prev, [lng, lat]]);
      setStatus(`Polygon vertex ${polygonPoints.length + 1} added`);
    }
  }, [mode, activeSchema, formData, polygonPoints.length]);

  const handleFinishPolygon = useCallback(() => {
    if (polygonPoints.length < 3) {
      setStatus("Need at least 3 points for a polygon");
      return;
    }
    const feature = buildPolygonFromPoints(polygonPoints, activeSchema.id, "current-user", formData);
    setFeatures(prev => [...prev, feature]);
    setPolygonPoints([]);
    setMode("idle");
    setStatus(`Polygon captured with ${polygonPoints.length} vertices`);
    setFormData({});
  }, [polygonPoints, activeSchema, formData]);

  const handleSaveLocally = useCallback(async () => {
    const collection: FieldCollection = {
      id: `col-${Date.now()}`,
      name: collectionName,
      formSchema: activeSchema,
      features,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCollection(collection);
    setStatus(`Saved "${collectionName}" locally (${features.length} features)`);
    const count = await getUnsyncedCount();
    setUnsyncedCount(count);
  }, [collectionName, activeSchema, features]);

  const handleSyncToServer = useCallback(async () => {
    setStatus("Syncing to server...");
    try {
      const collections = await loadCollections();
      for (const col of collections) {
        const unsynced = col.features.filter(f => !f.metadata.synced);
        if (unsynced.length === 0) continue;

        await syncMutation.mutateAsync({
          collectionId: col.id,
          collectionName: col.name,
          features: unsynced.map(f => ({
            id: f.id,
            geometryType: f.geometry.type,
            coordinates: f.geometry.coordinates,
            properties: f.properties as Record<string, string>,
            collectedAt: f.metadata.collectedAt,
            accuracy: f.metadata.accuracy,
            altitude: f.metadata.altitude,
            photos: f.metadata.photos,
          })),
        });

        // Mark as synced
        col.features.forEach(f => { f.metadata.synced = true; });
        await saveCollection(col);
      }
      setStatus("All collections synced successfully!");
      setUnsyncedCount(0);
    } catch (e) {
      setStatus(`Sync error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }, [syncMutation]);

  const handleExport = useCallback(() => {
    const collection: FieldCollection = {
      id: `export-${Date.now()}`,
      name: collectionName,
      formSchema: activeSchema,
      features,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const geojson = exportAsGeoJSON(collection);
    const blob = new Blob([geojson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${collectionName.replace(/\s/g, "_")}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("GeoJSON exported");
  }, [collectionName, activeSchema, features]);

  return (
    <DashboardLayout>
      <div className="p-4 space-y-4 dark:bg-gray-900 min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold dark:text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-teal-600" />
              Field Collection
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Capture farm boundaries, crop observations, and warehouse data via GPS or map tap
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unsyncedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {unsyncedCount} unsynced
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={handleSyncToServer} disabled={syncMutation.isPending}>
              <Upload className="h-4 w-4 mr-1" />
              Sync
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Form Schema Selection */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">Collection Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={collectionName}
                onChange={e => setCollectionName(e.target.value)}
                placeholder="Collection name"
                className="mb-3 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              {FARM_FORM_SCHEMAS.map(schema => (
                <button
                  key={schema.id}
                  onClick={() => setActiveSchema(schema)}
                  className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                    activeSchema.id === schema.id
                      ? "bg-teal-50 border border-teal-200 text-teal-700 dark:bg-teal-900 dark:border-teal-700 dark:text-teal-300"
                      : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                  }`}
                >
                  <div className="font-medium">{schema.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{schema.fields.length} fields</div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Form Fields */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">
                <Layers className="h-4 w-4 inline mr-1" />
                {activeSchema.name} Fields
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeSchema.fields.filter(f => f.type !== "photo").map(field => (
                <div key={field.name}>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {field.type === "choice" ? (
                    <select
                      value={formData[field.name] || ""}
                      onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                      className="w-full mt-1 border rounded px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="">Select...</option>
                      {field.choices?.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <Input
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      value={formData[field.name] || ""}
                      onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder={field.label}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Capture Controls */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">Capture Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full gap-2"
                variant={mode === "point-gps" ? "default" : "outline"}
                onClick={() => { setMode("point-gps"); handleCaptureGPS(); }}
              >
                <Navigation className="h-4 w-4" />
                Capture GPS Point
              </Button>
              <Button
                className="w-full gap-2"
                variant={mode === "point-tap" ? "default" : "outline"}
                onClick={() => setMode(mode === "point-tap" ? "idle" : "point-tap")}
              >
                <Crosshair className="h-4 w-4" />
                {mode === "point-tap" ? "Stop Tap Mode" : "Tap on Map"}
              </Button>
              <Button
                className="w-full gap-2"
                variant={mode === "polygon" ? "default" : "outline"}
                onClick={() => setMode(mode === "polygon" ? "idle" : "polygon")}
              >
                <PenTool className="h-4 w-4" />
                {mode === "polygon" ? `Drawing (${polygonPoints.length} pts)` : "Draw Polygon"}
              </Button>
              {mode === "polygon" && polygonPoints.length >= 3 && (
                <Button className="w-full gap-2" onClick={handleFinishPolygon}>
                  <CheckCircle2 className="h-4 w-4" />
                  Finish Polygon ({polygonPoints.length} points)
                </Button>
              )}

              <div className="border-t pt-3 space-y-2 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Collected: {features.length} features
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={handleSaveLocally}>
                    <Save className="h-3 w-3" /> Save
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={handleExport} disabled={features.length === 0}>
                    <Download className="h-3 w-3" /> Export
                  </Button>
                </div>
                {features.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-red-600 hover:text-red-700 gap-1"
                    onClick={() => { setFeatures([]); setStatus("Features cleared"); }}
                  >
                    <Trash2 className="h-3 w-3" /> Clear All
                  </Button>
                )}
              </div>

              {status && (
                <div className={`text-xs p-2 rounded ${
                  status.includes("error") || status.includes("Error")
                    ? "bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300"
                    : "bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300"
                }`}>
                  {status}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Collected Features List */}
        {features.length > 0 && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">Collected Features ({features.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Type</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Coordinates</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Accuracy</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Time</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {features.map(f => (
                      <tr key={f.id} className="border-b dark:border-gray-700">
                        <td className="py-1.5 px-2">
                          <Badge variant="outline" className="text-xs">{f.geometry.type}</Badge>
                        </td>
                        <td className="py-1.5 px-2 font-mono dark:text-gray-300">
                          {f.geometry.type === "Point"
                            ? (f.geometry.coordinates as number[]).map(c => c.toFixed(4)).join(", ")
                            : `${(f.geometry.coordinates as number[][][]).length} rings`}
                        </td>
                        <td className="py-1.5 px-2 dark:text-gray-300">
                          {f.metadata.accuracy ? `${f.metadata.accuracy.toFixed(0)}m` : "—"}
                        </td>
                        <td className="py-1.5 px-2 dark:text-gray-300">
                          {new Date(f.metadata.collectedAt).toLocaleTimeString()}
                        </td>
                        <td className="py-1.5 px-2 dark:text-gray-300">
                          {Object.entries(f.properties).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
