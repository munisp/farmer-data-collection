import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bell, Phone, Save, BookOpen, HelpCircle } from "lucide-react";
import { useTutorial } from "@/contexts/TutorialContext";
import { Separator } from "@/components/ui/separator";

export default function UserSettings() {
  const { user } = useAuth();
  const { startTutorial } = useTutorial();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [reminderDaysBefore, setReminderDaysBefore] = useState(3);

  // Fetch current preferences
  const { data: preferences, isLoading, refetch } = trpc.sms.getNotificationPreferences.useQuery(
    undefined,
    {
      enabled: !!user,
    }
  );

  // Update preferences mutation
  const updatePreferences = trpc.sms.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error.message}`);
    },
  });

  // Local state for toggles
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(true);
  const [loanApprovals, setLoanApprovals] = useState(true);
  const [disbursements, setDisbursements] = useState(true);
  const [overdueNotifications, setOverdueNotifications] = useState(true);
  const [marketingMessages, setMarketingMessages] = useState(false);

  // Update local state when preferences are loaded
  useEffect(() => {
    if (preferences) {
      setSmsEnabled(preferences.smsEnabled);
      setPaymentReminders(preferences.paymentReminders);
      setLoanApprovals(preferences.loanApprovalNotifications);
      setDisbursements(preferences.loanDisbursementNotifications);
      setOverdueNotifications(preferences.overdueNotifications);
      setMarketingMessages(preferences.marketingMessages);
      setReminderDaysBefore(preferences.reminderDaysBefore);
      // Phone number is stored in users table, not preferences
    }
  }, [preferences]);

  const handleSave = () => {
    updatePreferences.mutate({
      smsEnabled,
      paymentReminders,
      loanApprovals: loanApprovals,
      disbursements: disbursements,
      overdueNotifications: overdueNotifications,
      marketingMessages,
      reminderDaysBefore,
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading settings...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your notification preferences and contact information
          </p>
        </div>

        {/* Phone Number */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contact Information
            </CardTitle>
            <CardDescription>
              Update your phone number for SMS notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="+234XXXXXXXXXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Include country code (e.g., +234 for Nigeria)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SMS Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              SMS Notifications
            </CardTitle>
            <CardDescription>
              Control which SMS notifications you receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="smsEnabled" className="text-base font-semibold">
                  Enable SMS Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Master switch for all SMS notifications
                </p>
              </div>
              <Switch
                id="smsEnabled"
                checked={smsEnabled}
                onCheckedChange={setSmsEnabled}
              />
            </div>

            {/* Individual Notification Types */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="paymentReminders">Payment Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Reminders before loan payment due dates
                  </p>
                </div>
                <Switch
                  id="paymentReminders"
                  checked={paymentReminders}
                  onCheckedChange={setPaymentReminders}
                  disabled={!smsEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="loanApprovals">Loan Approvals</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications when your loan is approved or rejected
                  </p>
                </div>
                <Switch
                  id="loanApprovals"
                  checked={loanApprovals}
                  onCheckedChange={setLoanApprovals}
                  disabled={!smsEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="disbursements">Disbursements</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications when loan funds are disbursed
                  </p>
                </div>
                <Switch
                  id="disbursements"
                  checked={disbursements}
                  onCheckedChange={setDisbursements}
                  disabled={!smsEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="overdueAlerts">Overdue Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Alerts for missed or overdue payments
                  </p>
                </div>
                <Switch
                  id="overdueAlerts"
                  checked={overdueNotifications}
                  onCheckedChange={setOverdueNotifications}
                  disabled={!smsEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="marketingMessages">Marketing Messages</Label>
                  <p className="text-sm text-muted-foreground">
                    Promotional offers and updates
                  </p>
                </div>
                <Switch
                  id="marketingMessages"
                  checked={marketingMessages}
                  onCheckedChange={setMarketingMessages}
                  disabled={!smsEnabled}
                />
              </div>
            </div>

            {/* Reminder Timing */}
            <div className="space-y-2 pt-4 border-t">
              <Label htmlFor="reminderDaysBefore">Reminder Timing</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="reminderDaysBefore"
                  type="number"
                  min={1}
                  max={7}
                  value={reminderDaysBefore}
                  onChange={(e) => setReminderDaysBefore(parseInt(e.target.value) || 3)}
                  className="w-24"
                  disabled={!smsEnabled || !paymentReminders}
                />
                <span className="text-sm text-muted-foreground">
                  days before payment due date
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose how many days before your payment is due you want to receive a reminder (1-7 days)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Help & Support */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Help & Support
            </CardTitle>
            <CardDescription>
              Get help and learn how to use the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <Label>Onboarding Tutorial</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Replay the interactive tutorial to learn about key features
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem("farmer-app-tutorial-completed");
                  toast.success("Tutorial will restart on next page load");
                  startTutorial();
                }}
              >
                Restart Tutorial
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updatePreferences.isPending}
            size="lg"
          >
            <Save className="h-4 w-4 mr-2" />
            {updatePreferences.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
