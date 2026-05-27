import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";

export function BoundaryOverlapAlerts() {
  const { data: overlaps, isLoading } = trpc.spatial.detectOverlappingBoundaries.useQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Boundary Overlap Detection
        </CardTitle>
        <CardDescription>
          Automatically detect overlapping farm boundaries to prevent land disputes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !overlaps || overlaps.length === 0 ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle>No Overlaps Detected</AlertTitle>
            <AlertDescription>
              All farm boundaries are properly separated with no overlapping areas.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Overlapping Boundaries Found</AlertTitle>
              <AlertDescription>
                {overlaps.length} boundary overlap{overlaps.length > 1 ? "s" : ""} detected.
                Please review and resolve these conflicts.
              </AlertDescription>
            </Alert>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farm 1</TableHead>
                  <TableHead>Farm 2</TableHead>
                  <TableHead className="text-right">Overlap Area</TableHead>
                  <TableHead className="text-right">Overlap %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overlaps.map((overlap: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Link href={`/farms/${overlap.farm1_id}`} className="text-primary hover:underline">
                        {overlap.farm1_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/farms/${overlap.farm2_id}`} className="text-primary hover:underline">
                        {overlap.farm2_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(overlap.overlap_area_hectares).toFixed(2)} ha
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          overlap.overlap_percentage > 50
                            ? "text-red-600 font-semibold"
                            : overlap.overlap_percentage > 20
                            ? "text-orange-600 font-semibold"
                            : "text-yellow-600"
                        }
                      >
                        {parseFloat(overlap.overlap_percentage).toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Recommended Actions:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Review the overlapping boundaries on the map</li>
                <li>Contact farmers to verify actual land ownership</li>
                <li>Edit boundaries to remove overlaps</li>
                <li>Consider adding buffer zones between adjacent farms</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
