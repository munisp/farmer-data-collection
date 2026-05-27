import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

export default function AdminAuditLogs() {
  const [page, setPage] = useState(1);

  const { data: logsData, isLoading } = trpc.admin.getAuditLogs.useQuery({
    page,
    pageSize: 50,
  });

  const handleExportCSV = () => {
    if (!logsData?.logs) return;

    const headers = ["Timestamp", "User ID", "Event Type", "Entity Type", "Entity ID", "Details"];
    const rows = logsData.logs.map((log) => [
      new Date(log.timestamp).toLocaleString(),
      log.userId?.toString() || "",
      log.eventType,
      log.entityType || "",
      log.entityId?.toString() || "",
      JSON.stringify(log.data || {}),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = logsData ? Math.ceil(logsData.total / logsData.pageSize) : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Audit Logs</h1>
            <p className="text-muted-foreground mt-1">View system activity and user actions</p>
          </div>
          <Button onClick={handleExportCSV} disabled={!logsData?.logs.length}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : !logsData?.logs.length ? (
              <div className="text-center py-8 text-muted-foreground">No audit logs found</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Entity ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsData.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>{log.userId || "N/A"}</TableCell>
                        <TableCell>
                          <Badge>{log.eventType}</Badge>
                        </TableCell>
                        <TableCell>{log.entityType || "N/A"}</TableCell>
                        <TableCell>{log.entityId || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * logsData.pageSize + 1} to{" "}
                    {Math.min(page * logsData.pageSize, logsData.total)} of {logsData.total}{" "}
                    logs
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
