import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Calendar, Clock, Send, XCircle, CheckCircle, AlertCircle, Trash2, Users } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BulkSmsScheduler from "@/components/BulkSmsScheduler";

export default function SmsScheduling() {
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isBulkScheduleOpen, setIsBulkScheduleOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<"pending" | "sent" | "failed" | "cancelled" | "all">("pending");
  
  // Form state
  const [formData, setFormData] = useState({
    templateId: 0,
    recipientPhone: "",
    recipientName: "",
    message: "",
    scheduledFor: "",
    metadata: {} as Record<string, any>,
  });

  // Queries
  const { data: templates = [] } = trpc.smsTemplates.list.useQuery({ isActive: true });
  
  const { data: scheduledMessages = [], refetch } = trpc.smsTemplates.listScheduled.useQuery(
    selectedStatus === "all" ? undefined : { status: selectedStatus }
  );

  // Mutations
  const scheduleMutation = trpc.smsTemplates.scheduleMessage.useMutation({
    onSuccess: () => {
      toast.success("Message scheduled successfully");
      setIsScheduleDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to schedule message");
    },
  });

  const cancelMutation = trpc.smsTemplates.cancelScheduled.useMutation({
    onSuccess: () => {
      toast.success("Scheduled message cancelled");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel message");
    },
  });

  // Handlers
  const resetForm = () => {
    setFormData({
      templateId: 0,
      recipientPhone: "",
      recipientName: "",
      message: "",
      scheduledFor: "",
      metadata: {},
    });
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === parseInt(templateId));
    if (template) {
      setFormData({
        ...formData,
        templateId: template.id,
        message: template.body,
      });
    }
  };

  const handleSchedule = () => {
    if (!formData.recipientPhone || !formData.message || !formData.scheduledFor) {
      toast.error("Please fill in all required fields");
      return;
    }

    scheduleMutation.mutate({
      templateId: formData.templateId || undefined,
      recipientPhone: formData.recipientPhone,
      recipientName: formData.recipientName || undefined,
      message: formData.message,
      scheduledFor: formData.scheduledFor,
      metadata: formData.metadata,
    } as Parameters<typeof scheduleMutation.mutate>[0]);
  };

  const handleCancel = (id: number) => {
    if (confirm("Are you sure you want to cancel this scheduled message?")) {
      cancelMutation.mutate({ id });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case "sent":
        return <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />Sent</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Failed</Badge>;
      case "cancelled":
        return <Badge variant="outline"><XCircle className="mr-1 h-3 w-3" />Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getDeliveryStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "delivered":
        return <Badge variant="default" className="text-xs">Delivered</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">SMS Scheduling</h1>
          <p className="text-muted-foreground">
            Schedule SMS messages for future delivery
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsBulkScheduleOpen(true)}>
            <Users className="mr-2 h-4 w-4" />
            Bulk Schedule
          </Button>
          <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule Message
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Schedule SMS Message</DialogTitle>
              <DialogDescription>
                Schedule a message to be sent at a specific date and time
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template">Template (Optional)</Label>
                <Select onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recipientPhone">Recipient Phone *</Label>
                  <Input
                    id="recipientPhone"
                    value={formData.recipientPhone}
                    onChange={(e) => setFormData({ ...formData, recipientPhone: e.target.value })}
                    placeholder="+234XXXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipientName">Recipient Name</Label>
                  <Input
                    id="recipientName"
                    value={formData.recipientName}
                    onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Enter your message..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.message.length} characters • {Math.ceil(formData.message.length / 160)} SMS segments
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduledFor">Schedule For *</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={formData.scheduledFor}
                  onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSchedule} disabled={scheduleMutation.isPending}>
                {scheduleMutation.isPending ? "Scheduling..." : "Schedule Message"}
              </Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Tabs value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as 'all' | 'pending' | 'sent' | 'failed')}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedStatus} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Messages</CardTitle>
              <CardDescription>
                {scheduledMessages.length} message(s) found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scheduledMessages.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No scheduled messages found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Scheduled For</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledMessages.map((message) => (
                      <TableRow key={message.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{message.recipientName || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">{message.recipientPhone}</div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={message.message}>
                            {message.message}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(message.scheduledFor), "MMM dd, yyyy")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm">
                              {format(new Date(message.scheduledFor), "HH:mm")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(message.status)}</TableCell>
                        <TableCell>{getDeliveryStatusBadge(message.deliveryStatus)}</TableCell>
                        <TableCell>
                          {message.cost ? `₦${(message.cost / 100).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>
                          {message.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancel(message.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {message.status === "failed" && message.errorMessage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toast.error(message.errorMessage)}
                            >
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Scheduling Dialog */}
      <BulkSmsScheduler
        open={isBulkScheduleOpen}
        onOpenChange={setIsBulkScheduleOpen}
      />
    </div>
  );
}
