/**
 * Notification Center
 * Manage notifications, alerts, and notification preferences
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  TrendingUp,
  Cloud,
  DollarSign,
  AlertTriangle,
  Info,
  Package,
  Users,
  Plus,
  Clock,
  Loader2,
} from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

export default function NotificationCenter() {
  const { formatCurrency } = useLocalization();
  const { toast } = useToast();
  const [showCreateAlertDialog, setShowCreateAlertDialog] = useState(false);
  const [userId] = useState(1);

  const { data: notificationsData, isLoading: notificationsLoading, refetch: refetchNotifications } = trpc.notification.list.useQuery(
    { userId, limit: 50 },
    { enabled: !!userId }
  );

  const { data: unreadCountData } = trpc.notification.getUnreadCount.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const { data: preferencesData, refetch: refetchPreferences } = trpc.notification.getPreferences.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const { data: priceAlertsData, isLoading: priceAlertsLoading, refetch: refetchPriceAlerts } = trpc.notification.getPriceAlerts.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const { data: weatherAlertsData, isLoading: weatherAlertsLoading } = trpc.notification.getWeatherAlerts.useQuery(
    { region: 'all' }
  );

  const markAsReadMutation = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      refetchNotifications();
    },
  });

  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      toast({ title: 'All notifications marked as read' });
      refetchNotifications();
    },
  });

  const updatePreferencesMutation = trpc.notification.updatePreferences.useMutation({
    onSuccess: () => {
      toast({ title: 'Preferences updated' });
      refetchPreferences();
    },
  });

  const createPriceAlertMutation = trpc.notification.createPriceAlert.useMutation({
    onSuccess: () => {
      toast({ title: 'Price alert created' });
      refetchPriceAlerts();
      setShowCreateAlertDialog(false);
    },
  });

  const deletePriceAlertMutation = trpc.notification.deletePriceAlert.useMutation({
    onSuccess: () => {
      toast({ title: 'Price alert deleted' });
      refetchPriceAlerts();
    },
  });

  const acknowledgeWeatherAlertMutation = trpc.notification.acknowledgeWeatherAlert.useMutation({
    onSuccess: () => {
      toast({ title: 'Weather alert acknowledged' });
    },
  });

  const notifications = notificationsData || [];
  const unreadCount = typeof unreadCountData === 'number' ? unreadCountData : 0;
  const [localPreferences, setLocalPreferences] = useState({
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: false,
    whatsappEnabled: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
  });
  
  // Sync local preferences with server data
  const preferences = preferencesData ? {
    ...localPreferences,
    pushEnabled: preferencesData.pushEnabled ?? true,
    emailEnabled: preferencesData.emailEnabled ?? true,
    smsEnabled: preferencesData.smsEnabled ?? false,
    whatsappEnabled: preferencesData.whatsappEnabled ?? false,
    quietHoursEnabled: preferencesData.quietHoursEnabled ?? false,
  } : localPreferences;
  
  const priceAlerts = priceAlertsData || [];
  const weatherAlerts = weatherAlertsData || [];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'price_alert':
        return <TrendingUp className="w-4 h-4" />;
      case 'weather_alert':
        return <Cloud className="w-4 h-4" />;
      case 'payment_reminder':
      case 'loan_status':
        return <DollarSign className="w-4 h-4" />;
      case 'order_update':
        return <Package className="w-4 h-4" />;
      case 'cooperative':
        return <Users className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'normal':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      emergency: 'bg-red-500 text-white',
      warning: 'bg-orange-500 text-white',
      watch: 'bg-yellow-500 text-black',
      advisory: 'bg-blue-500 text-white',
    };
    return <Badge className={colors[severity] || 'bg-gray-500'}>{severity}</Badge>;
  };

    const markAsRead = (id: number) => {
      markAsReadMutation.mutate({ id });
    };

    const markAllAsRead = () => {
      markAllAsReadMutation.mutate({ userId });
    };

    const deleteNotification = (id: number) => {
      // Note: Delete functionality would need a separate mutation
      console.warn('Delete notification:', id);
    };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all" className="relative">
            All
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-primary text-primary-foreground">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="price-alerts">Price Alerts</TabsTrigger>
          <TabsTrigger value="weather-alerts">Weather Alerts</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <BellOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No notifications</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => {
                    const isUnread = !notification.readAt;
                    return (
                    <div
                      key={notification.id}
                      className={`p-4 flex gap-4 hover:bg-muted/50 transition-colors ${
                        isUnread ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className={`p-2 rounded-full ${getPriorityColor(notification.priority)}`}>
                        {getCategoryIcon(notification.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className={`font-medium ${isUnread ? 'text-primary' : ''}`}>
                              {notification.title}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {notification.body}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {formatTime(notification.createdAt instanceof Date ? notification.createdAt.toISOString() : String(notification.createdAt))}
                            </span>
                            {isUnread && (
                              <div className="w-2 h-2 rounded-full bg-primary" />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {notification.category.replace('_', ' ')}
                          </Badge>
                          {isUnread && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Mark read
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );})}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="price-alerts" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Your Price Alerts</h3>
            <Dialog open={showCreateAlertDialog} onOpenChange={setShowCreateAlertDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Alert
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Price Alert</DialogTitle>
                  <DialogDescription>Get notified when prices reach your target</DialogDescription>
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
                        <SelectItem value="soybean">Soybean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alert Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="above">Price goes above</SelectItem>
                        <SelectItem value="below">Price goes below</SelectItem>
                        <SelectItem value="change">Price changes by %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Threshold Price ({formatCurrency(0).charAt(0)})</Label>
                    <Input type="number" placeholder="0" />
                  </div>
                  <div>
                    <Label>Region (optional)</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="All regions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Regions</SelectItem>
                        <SelectItem value="kano">Kano</SelectItem>
                        <SelectItem value="lagos">Lagos</SelectItem>
                        <SelectItem value="oyo">Oyo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full">Create Alert</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

                    <div className="grid gap-4">
                      {priceAlertsLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                      ) : priceAlerts.map((alert: any) => (
              <Card key={alert.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-full bg-primary/10">
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{alert.cropType}</h4>
                        <p className="text-sm text-muted-foreground">
                          {alert.alertType === 'above' && `Alert when price goes above ${formatCurrency(alert.thresholdPrice / 100)}`}
                          {alert.alertType === 'below' && `Alert when price goes below ${formatCurrency(alert.thresholdPrice / 100)}`}
                          {alert.alertType === 'change' && `Alert when price changes by ${alert.percentageChange}%`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Region: {alert.region} | Last triggered: {alert.lastTriggered || 'Never'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Switch checked={alert.isActive} />
                      <Button variant="ghost" size="icon">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

                <TabsContent value="weather-alerts" className="mt-4 space-y-4">
                  <h3 className="text-lg font-semibold">Active Weather Alerts</h3>
                  <div className="grid gap-4">
                    {weatherAlertsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : weatherAlerts.map((alert: any) => (
                      <Card key={alert.id} className={alert.severity === 'warning' ? 'border-orange-300' : ''}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-full ${
                              alert.severity === 'warning' ? 'bg-orange-100' : 'bg-blue-100'
                            }`}>
                              {alert.alertType === 'rain' ? (
                                <Cloud className={`w-5 h-5 ${alert.severity === 'warning' ? 'text-orange-600' : 'text-blue-600'}`} />
                              ) : (
                                <AlertTriangle className={`w-5 h-5 ${alert.severity === 'warning' ? 'text-orange-600' : 'text-blue-600'}`} />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{alert.title}</h4>
                                {getSeverityBadge(alert.severity)}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                Region: {alert.region}
                              </p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                Valid from {alert.validFrom} to {alert.validUntil}
                              </div>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => acknowledgeWeatherAlertMutation.mutate({ id: alert.id })}
                            >
                              Acknowledge
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Control how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Notification Channels</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications on your device</p>
                    </div>
                    <Switch
                      checked={preferences.pushEnabled}
                      onCheckedChange={(checked) => setLocalPreferences({ ...localPreferences, pushEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={preferences.emailEnabled}
                      onCheckedChange={(checked) => setLocalPreferences({ ...localPreferences, emailEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>SMS Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via SMS</p>
                    </div>
                    <Switch
                      checked={preferences.smsEnabled}
                      onCheckedChange={(checked) => setLocalPreferences({ ...localPreferences, smsEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>WhatsApp Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via WhatsApp</p>
                    </div>
                    <Switch
                      checked={preferences.whatsappEnabled}
                      onCheckedChange={(checked) => setLocalPreferences({ ...localPreferences, whatsappEnabled: checked })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Quiet Hours</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Quiet Hours</Label>
                    <p className="text-sm text-muted-foreground">Pause notifications during specific hours</p>
                  </div>
                  <Switch
                    checked={preferences.quietHoursEnabled}
                    onCheckedChange={(checked) => setLocalPreferences({ ...localPreferences, quietHoursEnabled: checked })}
                  />
                </div>
                {preferences.quietHoursEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={localPreferences.quietHoursStart}
                        onChange={(e) => setLocalPreferences({ ...localPreferences, quietHoursStart: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={localPreferences.quietHoursEnd}
                        onChange={(e) => setLocalPreferences({ ...localPreferences, quietHoursEnd: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <Button>Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
