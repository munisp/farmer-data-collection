/**
 * Notification Preferences Page
 * 
 * Allows users to configure notification settings:
 * - Enable/disable SMS, email, and in-app notifications
 * - Set category-specific preferences
 * - Configure custom thresholds
 */

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Bell, Mail, MessageSquare, Save } from 'lucide-react';
import { trpc } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

interface NotificationPreferences {
  smsEnabled: boolean;
  emailEnabled: boolean;
  webEnabled: boolean;
  categories: {
    yield: boolean;
    expense: boolean;
    price: boolean;
    weather: boolean;
    pest: boolean;
  };
  thresholds: {
    expenseAmount: number;
    yieldPercentage: number;
  };
}

// ============================================================================
// Notification Preferences Page
// ============================================================================

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    smsEnabled: false,
    emailEnabled: false,
    webEnabled: true,
    categories: {
      yield: true,
      expense: true,
      price: true,
      weather: true,
      pest: true,
    },
    thresholds: {
      expenseAmount: 1000,
      yieldPercentage: 20,
    },
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setLoading(true);
    try {
      // Try to load from API first
      const response = await fetch('/api/trpc/notification.getPreferences');
      if (response.ok) {
        const data = await response.json();
        if (data.result?.data) {
          setPreferences(data.result.data);
          return;
        }
      }
      // Fallback to localStorage if API unavailable
      const saved = localStorage.getItem('notificationPreferences');
      if (saved) {
        setPreferences(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
      // Fallback to localStorage
      const saved = localStorage.getItem('notificationPreferences');
      if (saved) {
        setPreferences(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      // Try to save to API first
      const response = await fetch('/api/trpc/notification.updatePreferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: preferences }),
      });
      
      // Always save to localStorage as backup
      localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
      
      if (response.ok) {
        toast.success('Preferences saved successfully');
      } else {
        toast.success('Preferences saved locally');
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      // Save to localStorage as fallback
      localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
      toast.success('Preferences saved locally');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const updateCategory = (category: keyof NotificationPreferences['categories'], value: boolean) => {
    setPreferences(prev => ({
      ...prev,
      categories: { ...prev.categories, [category]: value },
    }));
  };

  const updateThreshold = (threshold: keyof NotificationPreferences['thresholds'], value: number) => {
    setPreferences(prev => ({
      ...prev,
      thresholds: { ...prev.thresholds, [threshold]: value },
    }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading preferences...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container mx-auto py-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Notification Preferences</h1>
          <p className="text-muted-foreground">
            Configure how and when you receive notifications
          </p>
        </div>

        {/* Notification Channels */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Channels</CardTitle>
            <CardDescription>
              Choose how you want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* SMS Notifications */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  <Label htmlFor="sms">SMS Notifications</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Receive alerts via text message
                </p>
              </div>
              <Switch
                id="sms"
                checked={preferences.smsEnabled}
                onCheckedChange={(checked) => updatePreference('smsEnabled', checked)}
              />
            </div>

            <Separator />

            {/* Email Notifications */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <Label htmlFor="email">Email Notifications</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Receive alerts via email
                </p>
              </div>
              <Switch
                id="email"
                checked={preferences.emailEnabled}
                onCheckedChange={(checked) => updatePreference('emailEnabled', checked)}
              />
            </div>

            <Separator />

            {/* In-App Notifications */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  <Label htmlFor="web">In-App Notifications</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Receive real-time alerts in the application
                </p>
              </div>
              <Switch
                id="web"
                checked={preferences.webEnabled}
                onCheckedChange={(checked) => updatePreference('webEnabled', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Categories</CardTitle>
            <CardDescription>
              Choose which types of alerts you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(preferences.categories).map(([category, enabled]) => (
              <div key={category} className="flex items-center justify-between">
                <Label htmlFor={category} className="capitalize">
                  {category} Alerts
                </Label>
                <Switch
                  id={category}
                  checked={enabled}
                  onCheckedChange={(checked) => 
                    updateCategory(category as keyof NotificationPreferences['categories'], checked)
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Custom Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>Alert Thresholds</CardTitle>
            <CardDescription>
              Configure when you want to be alerted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Expense Threshold */}
            <div className="space-y-2">
              <Label htmlFor="expenseThreshold">
                High Expense Alert Threshold ($)
              </Label>
              <Input
                id="expenseThreshold"
                type="number"
                value={preferences.thresholds.expenseAmount}
                onChange={(e) => updateThreshold('expenseAmount', parseFloat(e.target.value))}
                placeholder="1000"
              />
              <p className="text-sm text-muted-foreground">
                Alert me when a single expense exceeds this amount
              </p>
            </div>

            <Separator />

            {/* Yield Threshold */}
            <div className="space-y-2">
              <Label htmlFor="yieldThreshold">
                Low Yield Alert Threshold (%)
              </Label>
              <Input
                id="yieldThreshold"
                type="number"
                value={preferences.thresholds.yieldPercentage}
                onChange={(e) => updateThreshold('yieldPercentage', parseFloat(e.target.value))}
                placeholder="20"
                min="0"
                max="100"
              />
              <p className="text-sm text-muted-foreground">
                Alert me when harvest yield is below expected by this percentage
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={savePreferences} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
