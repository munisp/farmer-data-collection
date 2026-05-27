import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, RefreshCw, Settings, Activity, Database } from "lucide-react";

/**
 * ERPNext Integration Admin Page
 * 
 * Allows administrators to configure ERPNext connection, manage sync settings,
 * monitor sync status, and view sync history.
 */

export default function ERPNextIntegration() {
  const [erpnextUrl, setErpnextUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const { data: config, refetch: refetchConfig } = trpc.erpnext.getConfig.useQuery();
  const { data: syncStatus } = trpc.erpnext.getSyncStatus.useQuery();
  const { data: syncConfig } = trpc.erpnext.getSyncConfig.useQuery();
  const { data: syncStats } = trpc.erpnext.getSyncStats.useQuery();
  const { data: syncHistory } = trpc.erpnext.getSyncHistory.useQuery({ limit: 50 });

  const saveConfigMutation = trpc.erpnext.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("ERPNext configuration saved successfully");
      refetchConfig();
    },
    onError: (error) => {
      toast.error(`Failed to save configuration: ${error.message}`);
    },
  });

  const testConnectionMutation = trpc.erpnext.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Connection successful!");
      } else {
        toast.error(`Connection failed: ${data.message}`);
      }
      setIsTesting(false);
    },
    onError: (error) => {
      toast.error(`Connection test failed: ${error.message}`);
      setIsTesting(false);
    },
  });

  const configureSyncEntityMutation = trpc.erpnext.configureSyncEntity.useMutation({
    onSuccess: () => {
      toast.success("Sync configuration updated");
    },
    onError: (error) => {
      toast.error(`Failed to update sync configuration: ${error.message}`);
    },
  });

  const triggerSyncMutation = trpc.erpnext.triggerSync.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });

  const handleSaveConfig = () => {
    if (!erpnextUrl || !apiKey || !apiSecret) {
      toast.error("Please fill in all fields");
      return;
    }

    saveConfigMutation.mutate({
      erpnextUrl,
      apiKey,
      apiSecret,
    });
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    testConnectionMutation.mutate();
  };

  const handleToggleSync = (entityType: any, enabled: boolean) => {
    configureSyncEntityMutation.mutate({
      entityType,
      syncEnabled: enabled,
    });
  };

  const handleTriggerSync = (entityType: any, direction: any) => {
    triggerSyncMutation.mutate({
      entityType,
      direction,
    });
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">ERPNext Integration</h1>
        <p className="text-muted-foreground mt-2">
          Connect and synchronize data with your ERPNext instance
        </p>
      </div>

      <Tabs defaultValue="configuration" className="space-y-6">
        <TabsList>
          <TabsTrigger value="configuration">
            <Settings className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="sync">
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Control
          </TabsTrigger>
          <TabsTrigger value="monitoring">
            <Activity className="w-4 h-4 mr-2" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="history">
            <Database className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connection Settings</CardTitle>
              <CardDescription>
                Configure your ERPNext instance connection details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="erpnext-url">ERPNext URL</Label>
                <Input
                  id="erpnext-url"
                  placeholder="https://your-instance.erpnext.com"
                  value={erpnextUrl || config?.erpnextUrl || ""}
                  onChange={(e) => setErpnextUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Enter API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {config && (
                  <p className="text-sm text-muted-foreground">
                    Current: {config.apiKey}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-secret">API Secret</Label>
                <Input
                  id="api-secret"
                  type="password"
                  placeholder="Enter API secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveConfig}
                  disabled={saveConfigMutation.isPending}
                >
                  {saveConfigMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Save Configuration
                </Button>

                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={!config || isTesting}
                >
                  {isTesting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Test Connection
                </Button>
              </div>

              {config && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Connection Status:</span>
                    <Badge variant={config.syncEnabled ? "default" : "secondary"}>
                      {config.syncEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  {config.lastSyncAt && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Last synced: {new Date(config.lastSyncAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sync Control Tab */}
        <TabsContent value="sync" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Entity Sync Configuration</CardTitle>
              <CardDescription>
                Enable or disable synchronization for each entity type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { type: "customer", label: "Customers" },
                  { type: "supplier", label: "Suppliers" },
                  { type: "item", label: "Inventory Items" },
                  { type: "invoice", label: "Sales Invoices" },
                  { type: "payment", label: "Payments" },
                  { type: "journal", label: "Journal Entries" },
                ].map((entity) => {
                  const entityConfig = syncConfig?.find(
                    (c) => c.entityType === entity.type
                  );
                  const isEnabled = entityConfig?.syncEnabled ?? false;

                  return (
                    <div
                      key={entity.type}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{entity.label}</h4>
                        <p className="text-sm text-muted-foreground">
                          Sync {entity.label.toLowerCase()} with ERPNext
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) =>
                            handleToggleSync(entity.type, checked)
                          }
                        />

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTriggerSync(entity.type, "both")}
                          disabled={!isEnabled || triggerSyncMutation.isPending}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sync Now
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Synced</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{syncStatus?.totalSynced || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{syncStatus?.pendingSync || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {syncStatus?.errorCount || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  {syncStatus?.lastSyncAt
                    ? new Date(syncStatus.lastSyncAt).toLocaleString()
                    : "Never"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sync Statistics by Entity</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Success</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">Success Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncStats &&
                    Object.entries(syncStats).map(([entityType, stats]) => {
                      const successRate =
                        stats.total > 0
                          ? ((stats.success / stats.total) * 100).toFixed(1)
                          : "0.0";

                      return (
                        <TableRow key={entityType}>
                          <TableCell className="font-medium capitalize">
                            {entityType}
                          </TableCell>
                          <TableCell className="text-right">{stats.total}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {stats.success}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {stats.error}
                          </TableCell>
                          <TableCell className="text-right">{successRate}%</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>Recent synchronization operations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncHistory && syncHistory.length > 0 ? (
                    syncHistory.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="capitalize">{log.entityType}</TableCell>
                        <TableCell className="capitalize">{log.operation}</TableCell>
                        <TableCell>
                          {log.status === "success" ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="w-3 h-3" />
                              Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.duration ? `${log.duration}ms` : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {log.errorMessage || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No sync history available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
