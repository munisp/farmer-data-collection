/**
 * Agent Tasks Dashboard
 * Task management, route planning, and visit tracking for field agents
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  Navigation,
  Play,
  Pause,
  Plus,
  Phone,
  Camera,
  FileText,
  TrendingUp,
  Target,
  Route,
  Loader2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

export default function AgentTasksDashboard() {
  const { toast } = useToast();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showVisitDialog, setShowVisitDialog] = useState(false);
  const [routeStarted, setRouteStarted] = useState(false);
  const [agentId] = useState(1);

  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = trpc.agentProductivity.getTasks.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  const { data: todaysTasksData, isLoading: todaysTasksLoading } = trpc.agentProductivity.getTodaysTasks.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  const { data: visitsData, isLoading: visitsLoading } = trpc.agentProductivity.getVisits.useQuery(
    { agentId, limit: 10 },
    { enabled: !!agentId }
  );

  const { data: performanceData, isLoading: performanceLoading } = trpc.agentProductivity.getPerformanceMetrics.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  const { data: dashboardStats } = trpc.agentProductivity.getDashboardStats.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  const updateTaskStatusMutation = trpc.agentProductivity.updateTaskStatus.useMutation({
    onSuccess: () => {
      toast({ title: 'Task status updated' });
      refetchTasks();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createTaskMutation = trpc.agentProductivity.createTask.useMutation({
    onSuccess: () => {
      toast({ title: 'Task created successfully' });
      refetchTasks();
      setShowCreateTaskDialog(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startRouteMutation = trpc.agentProductivity.startRoute.useMutation({
    onSuccess: () => {
      toast({ title: 'Route started' });
      setRouteStarted(true);
    },
  });

  const endRouteMutation = trpc.agentProductivity.endRoute.useMutation({
    onSuccess: () => {
      toast({ title: 'Route ended' });
      setRouteStarted(false);
    },
  });

  const tasks = tasksData || [];
  const todaysTasks = todaysTasksData || [];
  const visits = visitsData || [];
  
  // Transform performance metrics array to expected format
  const latestMetrics = Array.isArray(performanceData) && performanceData.length > 0 ? performanceData[0] : null;
  const performance = {
    tasksCompleted: latestMetrics?.tasksCompleted || 0,
    tasksAssigned: latestMetrics?.tasksAssigned || 0,
    visitSuccessRate: latestMetrics?.visitSuccessRate ? Number(latestMetrics.visitSuccessRate) : 0,
    farmersRegistered: latestMetrics?.farmersRegistered || 0,
    loansAssessed: latestMetrics?.loansAssessed || 0,
    repaymentsCollected: latestMetrics?.repaymentsCollected || 0,
    totalDistance: latestMetrics?.totalDistanceTraveled ? Number(latestMetrics.totalDistanceTraveled) : 0,
    avgVisitDuration: latestMetrics?.averageVisitDuration ? Number(latestMetrics.averageVisitDuration) : 0,
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-gray-100 text-gray-800', label: 'Pending' },
      assigned: { color: 'bg-blue-100 text-blue-800', label: 'Assigned' },
      in_progress: { color: 'bg-yellow-100 text-yellow-800', label: 'In Progress' },
      completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
      cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
      overdue: { color: 'bg-red-100 text-red-800', label: 'Overdue' },
    };
    const config = statusConfig[status] || { color: 'bg-gray-100', label: status };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      urgent: 'bg-red-500 text-white',
      high: 'bg-orange-500 text-white',
      normal: 'bg-blue-500 text-white',
      low: 'bg-gray-500 text-white',
    };
    return <Badge className={colors[priority] || 'bg-gray-500'}>{priority}</Badge>;
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case 'farmer_registration':
        return <User className="w-4 h-4" />;
      case 'loan_assessment':
      case 'loan_disbursement':
        return <FileText className="w-4 h-4" />;
      case 'repayment_collection':
        return <Target className="w-4 h-4" />;
      case 'harvest_verification':
        return <CheckCircle className="w-4 h-4" />;
      case 'farm_visit':
        return <MapPin className="w-4 h-4" />;
      default:
        return <ClipboardList className="w-4 h-4" />;
    }
  };

  const getOutcomeBadge = (outcome: string) => {
    const config: Record<string, { color: string; label: string }> = {
      successful: { color: 'bg-green-100 text-green-800', label: 'Successful' },
      farmer_absent: { color: 'bg-yellow-100 text-yellow-800', label: 'Farmer Absent' },
      rescheduled: { color: 'bg-blue-100 text-blue-800', label: 'Rescheduled' },
      unsuccessful: { color: 'bg-red-100 text-red-800', label: 'Unsuccessful' },
    };
    const c = config[outcome] || { color: 'bg-gray-100', label: outcome };
    return <Badge className={c.color}>{c.label}</Badge>;
  };

    const completedToday = todaysTasks.filter((t) => t.status === 'completed').length;
    const completionRate = performance.tasksAssigned > 0 ? (performance.tasksCompleted / performance.tasksAssigned) * 100 : 0;

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Field Agent Dashboard</h1>
          <p className="text-muted-foreground">Manage tasks, visits, and routes</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
                <DialogDescription>Add a new task to your schedule</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Task Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="farmer_registration">Farmer Registration</SelectItem>
                      <SelectItem value="farm_visit">Farm Visit</SelectItem>
                      <SelectItem value="loan_assessment">Loan Assessment</SelectItem>
                      <SelectItem value="repayment_collection">Repayment Collection</SelectItem>
                      <SelectItem value="harvest_verification">Harvest Verification</SelectItem>
                      <SelectItem value="follow_up">Follow Up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input placeholder="Task title" />
                </div>
                <div>
                  <Label>Farmer (optional)</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select farmer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Adamu Bello</SelectItem>
                      <SelectItem value="2">Fatima Hassan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input type="date" />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" />
                  </div>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full">Create Task</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={() => setRouteStarted(!routeStarted)}>
            {routeStarted ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                End Route
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Route
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Tasks</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedToday}/{todaysTasks.length}</div>
            <Progress value={(completedToday / todaysTasks.length) * 100} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Visit Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.visitSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Farmers Registered</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.farmersRegistered}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Distance Traveled</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance.totalDistance} km</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Route Status Banner */}
      {routeStarted && (
        <Card className="bg-primary/5 border-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-full bg-primary/10">
                  <Navigation className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <div>
                  <h4 className="font-semibold">Route in Progress</h4>
                  <p className="text-sm text-muted-foreground">
                    {todaysTasks.length} stops planned | Est. 3.5 hours | 45 km total
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <MapPin className="w-4 h-4 mr-2" />
                  View Map
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRouteStarted(false)}>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today's Tasks</TabsTrigger>
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="visits">Recent Visits</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Today's Schedule</CardTitle>
              <CardDescription>Tasks scheduled for January 15, 2024</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {todaysTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`p-4 border rounded-lg ${
                      task.status === 'in_progress' ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`p-2 rounded-full ${
                          task.status === 'completed' ? 'bg-green-100' :
                          task.status === 'in_progress' ? 'bg-yellow-100' : 'bg-gray-100'
                        }`}>
                          {getTaskTypeIcon(task.taskType)}
                        </div>
                        {index < todaysTasks.length - 1 && (
                          <div className="w-0.5 h-8 bg-gray-200 my-2" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{task.title}</h4>
                              {getPriorityBadge(task.priority)}
                              {getStatusBadge(task.status)}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="w-4 h-4" />
                              {task.scheduledTime}
                            </div>
                            <p className="text-xs text-muted-foreground">~{task.estimatedDuration} min</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Farmer #{task.targetFarmerId || 'N/A'}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {task.locationName}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          {task.status === 'pending' && (
                            <Button size="sm">
                              <Play className="w-4 h-4 mr-2" />
                              Start
                            </Button>
                          )}
                          {task.status === 'in_progress' && (
                            <>
                              <Button size="sm" onClick={() => {
                                setSelectedTask(task);
                                setShowVisitDialog(true);
                              }}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Complete
                              </Button>
                              <Button size="sm" variant="outline">
                                <Navigation className="w-4 h-4 mr-2" />
                                Navigate
                              </Button>
                              <Button size="sm" variant="outline">
                                <Phone className="w-4 h-4 mr-2" />
                                Call
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>All Tasks</CardTitle>
                  <CardDescription>View and manage all assigned tasks</CardDescription>
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tasks.map((task: { id: number; taskType: string; title: string; scheduledDate: Date | null; scheduledTime: string | null; locationName: string | null; priority: string; status: string }) => (
                  <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gray-100">
                        {getTaskTypeIcon(task.taskType)}
                      </div>
                      <div>
                        <h4 className="font-medium">{task.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {task.scheduledDate ? new Date(task.scheduledDate).toLocaleDateString() : 'No date'} at {task.scheduledTime || 'TBD'} | {task.locationName || 'No location'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Visits</CardTitle>
              <CardDescription>History of completed visits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {visits.map((visit: { id: number; outcome: string | null; farmerId: number | null; notes: string | null; visitDate: Date }) => (
                  <div key={visit.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${
                        visit.outcome === 'successful' ? 'bg-green-100' : 'bg-yellow-100'
                      }`}>
                        {visit.outcome === 'successful' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium">Farmer #{visit.farmerId || 'N/A'}</h4>
                        <p className="text-sm text-muted-foreground">{visit.notes || 'No notes'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(visit.visitDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {getOutcomeBadge(visit.outcome || 'unknown')}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Performance</CardTitle>
                <CardDescription>January 2024</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Task Completion Rate</span>
                    <span>{completionRate.toFixed(0)}%</span>
                  </div>
                  <Progress value={completionRate} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Visit Success Rate</span>
                    <span>{performance.visitSuccessRate}%</span>
                  </div>
                  <Progress value={performance.visitSuccessRate} />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{performance.farmersRegistered}</div>
                    <div className="text-sm text-muted-foreground">Farmers Registered</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{performance.loansAssessed}</div>
                    <div className="text-sm text-muted-foreground">Loans Assessed</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{performance.repaymentsCollected}</div>
                    <div className="text-sm text-muted-foreground">Repayments Collected</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{performance.avgVisitDuration} min</div>
                    <div className="text-sm text-muted-foreground">Avg Visit Duration</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Territory Overview</CardTitle>
                <CardDescription>Your assigned area</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium">Kano Metropolitan</h4>
                    <p className="text-sm text-muted-foreground">Dala, Gwale, Nassarawa, Tarauni LGAs</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xl font-bold">156</div>
                      <div className="text-xs text-muted-foreground">Farmers</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">89</div>
                      <div className="text-xs text-muted-foreground">Farms</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">3</div>
                      <div className="text-xs text-muted-foreground">Cooperatives</div>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">
                    <MapPin className="w-4 h-4 mr-2" />
                    View Territory Map
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Visit Completion Dialog */}
      <Dialog open={showVisitDialog} onOpenChange={setShowVisitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Visit</DialogTitle>
            <DialogDescription>Record the outcome of your visit</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Outcome</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="successful">Successful</SelectItem>
                  <SelectItem value="farmer_absent">Farmer Absent</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="partial">Partial Completion</SelectItem>
                  <SelectItem value="unsuccessful">Unsuccessful</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input placeholder="Add notes about the visit..." />
            </div>
            <div>
              <Label>Photos (optional)</Label>
              <Button variant="outline" className="w-full">
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="followup" className="rounded" />
              <Label htmlFor="followup">Requires follow-up visit</Label>
            </div>
            <Button className="w-full">Submit Visit Report</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
