import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileJson, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export function BulkBoundaryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const bulkImportMutation = trpc.spatial.bulkImportBoundaries.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.json') && !selectedFile.name.endsWith('.geojson')) {
        toast.error("Please select a GeoJSON file (.json or .geojson)");
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      // Read file content
      const fileContent = await file.text();
      const geojson = JSON.parse(fileContent);

      // Validate GeoJSON structure
      if (!geojson.type || geojson.type !== "FeatureCollection") {
        toast.error("Invalid GeoJSON: Must be a FeatureCollection");
        setUploading(false);
        return;
      }

      if (!geojson.features || !Array.isArray(geojson.features)) {
        toast.error("Invalid GeoJSON: No features array found");
        setUploading(false);
        return;
      }

      // Filter for Polygon features only
      const polygonFeatures = geojson.features.filter(
        (f: any) => f.geometry?.type === "Polygon"
      );

      if (polygonFeatures.length === 0) {
        toast.error("No Polygon features found in GeoJSON");
        setUploading(false);
        return;
      }

      // Call bulk import API
      const importResult = await bulkImportMutation.mutateAsync({
        features: polygonFeatures,
      });

      setResult(importResult);

      if (importResult.success > 0) {
        toast.success(`Successfully imported ${importResult.success} boundaries`);
      }

      if (importResult.failed > 0) {
        toast.warning(`Failed to import ${importResult.failed} boundaries`);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to import boundaries: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Bulk Boundary Import
        </CardTitle>
        <CardDescription>
          Import multiple farm boundaries from a GeoJSON file
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="geojson-file">GeoJSON File</Label>
          <Input
            id="geojson-file"
            type="file"
            accept=".json,.geojson"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <p className="text-sm text-muted-foreground">
            Upload a GeoJSON FeatureCollection with Polygon geometries. Each feature should have properties:
            <code className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">farm_id</code> or
            <code className="ml-1 text-xs bg-muted px-1 py-0.5 rounded">farm_name</code>
          </p>
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <FileJson className="w-4 h-4 mr-2" />
              Import Boundaries
            </>
          )}
        </Button>

        {/* Results */}
        {result && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-semibold">Import Results</h4>

            {/* Success Summary */}
            {result.success > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>
                  Successfully imported {result.success} farm boundaries
                </AlertDescription>
              </Alert>
            )}

            {/* Errors Summary */}
            {result.failed > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Errors</AlertTitle>
                <AlertDescription>
                  Failed to import {result.failed} boundaries
                </AlertDescription>
              </Alert>
            )}

            {/* Detailed Errors */}
            {result.errors && result.errors.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Error Details:</h5>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {result.errors.map((err: any, idx: number) => (
                    <div
                      key={idx}
                      className="text-sm p-2 bg-destructive/10 border border-destructive/20 rounded"
                    >
                      <p className="font-medium">{err.feature}</p>
                      <p className="text-muted-foreground text-xs">{err.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Imported List */}
            {result.imported && result.imported.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium">Successfully Imported:</h5>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {result.imported.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="text-sm p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span>{item.name || `Farm ID: ${item.farm_id}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Help Section */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>GeoJSON Format Example</AlertTitle>
          <AlertDescription>
            <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-x-auto">
{`{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[lng, lat], ...]]
      },
      "properties": {
        "farm_name": "My Farm",
        "name": "North Field",
        "description": "Main field"
      }
    }
  ]
}`}
            </pre>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
