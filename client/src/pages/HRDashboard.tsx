import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Clock, DollarSign, Plus, Edit, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function HRDashboard() {
  const [activeTab, setActiveTab] = useState("employees");
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  const [isPayrollDialogOpen, setIsPayrollDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Queries
  const { data: stats, refetch: refetchStats } = trpc.hr.getHRStats.useQuery();
  const { data: employees, refetch: refetchEmployees } = trpc.hr.getEmployees.useQuery();
  const { data: timeEntries, refetch: refetchTimeEntries } = trpc.hr.getTimeEntries.useQuery({});
  const { data: payrollRecords, refetch: refetchPayroll } = trpc.hr.getPayrollRecords.useQuery({});

  // Mutations
  const createEmployee = trpc.hr.createEmployee.useMutation({
    onSuccess: () => {
      toast.success("Employee created successfully");
      refetchEmployees();
      refetchStats();
      setIsEmployeeDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateEmployee = trpc.hr.updateEmployee.useMutation({
    onSuccess: () => {
      toast.success("Employee updated successfully");
      refetchEmployees();
      refetchStats();
      setIsEmployeeDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteEmployee = trpc.hr.deleteEmployee.useMutation({
    onSuccess: () => {
      toast.success("Employee deleted successfully");
      refetchEmployees();
      refetchStats();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createTimeEntry = trpc.hr.createTimeEntry.useMutation({
    onSuccess: () => {
      toast.success("Time entry created successfully");
      refetchTimeEntries();
      setIsTimeEntryDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const calculatePayroll = trpc.hr.calculatePayroll.useMutation({
    onSuccess: () => {
      toast.success("Payroll calculated successfully");
      refetchPayroll();
      setIsPayrollDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const processPayroll = trpc.hr.processPayroll.useMutation({
    onSuccess: () => {
      toast.success("Payroll processed successfully");
      refetchPayroll();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Form handlers
  const handleEmployeeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      employeeNumber: formData.get("employeeNumber") as string,
      fullName: formData.get("fullName") as string,
      phoneNumber: formData.get("phoneNumber") as string,
      email: formData.get("email") as string || undefined,
      role: formData.get("role") as string,
      hourlyRate: parseFloat(formData.get("hourlyRate") as string) || undefined,
      hireDate: formData.get("hireDate") as string,
    };

    if (selectedEmployee) {
      updateEmployee.mutate({ id: selectedEmployee.id, ...data });
    } else {
      createEmployee.mutate(data);
    }
  };

  const handleTimeEntrySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      employeeId: parseInt(formData.get("employeeId") as string),
      clockIn: formData.get("clockIn") as string,
      clockOut: formData.get("clockOut") as string || undefined,
      workType: formData.get("workType") as string || undefined,
      notes: formData.get("notes") as string || undefined,
    };

    createTimeEntry.mutate(data);
  };

  const handlePayrollCalculate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Convert period dates to month/year format expected by API
    const periodStart = formData.get("periodStart") as string;
    const startDate = periodStart ? new Date(periodStart) : new Date();
    
    const data = {
      employeeId: parseInt(formData.get("employeeId") as string),
      month: startDate.getMonth() + 1, // 1-indexed month
      year: startDate.getFullYear(),
    };

    calculatePayroll.mutate(data);
  };

  const handlePayrollProcess = (payrollId: number) => {
    const paymentDate = new Date().toISOString().split('T')[0];
    processPayroll.mutate({
      id: payrollId,
      paymentDate,
      paymentMethod: "bank_transfer",
    });
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">HR & Payroll Management</h1>
          <p className="text-muted-foreground">Manage employees, track time, and process payroll</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEmployees || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeEmployees || 0} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(stats?.monthlyPayroll || 0).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Time Entries</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{timeEntries?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Total records</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="timetracking">Time Tracking</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
          </TabsList>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Employee List</h2>
              <Dialog open={isEmployeeDialogOpen} onOpenChange={setIsEmployeeDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setSelectedEmployee(null)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{selectedEmployee ? "Edit Employee" : "Add New Employee"}</DialogTitle>
                    <DialogDescription>
                      {selectedEmployee ? "Update employee information" : "Enter employee details"}
                    </DialogDescription>
                  </DialogHeader>
                  <form aria-label="Submit form" onSubmit={handleEmployeeSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="employeeNumber">Employee Number</Label>
                      <Input
                        id="employeeNumber"
                        name="employeeNumber"
                        defaultValue={selectedEmployee?.employeeNumber}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        name="fullName"
                        defaultValue={selectedEmployee?.fullName}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        name="phoneNumber"
                        defaultValue={selectedEmployee?.phoneNumber}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email (optional)</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={selectedEmployee?.email}
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Input
                        id="role"
                        name="role"
                        defaultValue={selectedEmployee?.role}
                        placeholder="e.g., Laborer, Supervisor, Driver"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                      <Input
                        id="hourlyRate"
                        name="hourlyRate"
                        type="number"
                        step="0.01"
                        defaultValue={selectedEmployee?.hourlyRate ? (selectedEmployee.hourlyRate / 100).toFixed(2) : ""}
                        placeholder="15.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="hireDate">Hire Date</Label>
                      <Input
                        id="hireDate"
                        name="hireDate"
                        type="date"
                        defaultValue={selectedEmployee?.hireDate ? format(new Date(selectedEmployee.hireDate), "yyyy-MM-dd") : ""}
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsEmployeeDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">
                        {selectedEmployee ? "Update" : "Create"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Hourly Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees?.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>{employee.employeeNumber}</TableCell>
                        <TableCell className="font-medium">{employee.fullName}</TableCell>
                        <TableCell>{employee.role}</TableCell>
                        <TableCell>{employee.phoneNumber}</TableCell>
                        <TableCell>
                          {employee.hourlyRate ? `$${(employee.hourlyRate / 100).toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={employee.isActive ? "default" : "secondary"}>
                            {employee.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedEmployee(employee);
                                setIsEmployeeDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this employee?")) {
                                  deleteEmployee.mutate({ id: employee.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!employees || employees.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No employees found. Add your first employee to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Time Tracking Tab */}
          <TabsContent value="timetracking" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Time Entries</h2>
              <Dialog open={isTimeEntryDialogOpen} onOpenChange={setIsTimeEntryDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Time Entry
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Time Entry</DialogTitle>
                    <DialogDescription>Record employee work hours</DialogDescription>
                  </DialogHeader>
                  <form aria-label="Submit form" onSubmit={handleTimeEntrySubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="employeeId">Employee</Label>
                      <Select name="employeeId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees?.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {emp.fullName} - {emp.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="clockIn">Clock In</Label>
                      <Input
                        id="clockIn"
                        name="clockIn"
                        type="datetime-local"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="clockOut">Clock Out (optional)</Label>
                      <Input
                        id="clockOut"
                        name="clockOut"
                        type="datetime-local"
                      />
                    </div>
                    <div>
                      <Label htmlFor="workType">Work Type</Label>
                      <Select name="workType">
                        <SelectTrigger>
                          <SelectValue placeholder="Select work type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">Regular</SelectItem>
                          <SelectItem value="overtime">Overtime</SelectItem>
                          <SelectItem value="weekend">Weekend</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Input
                        id="notes"
                        name="notes"
                        placeholder="Additional notes"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsTimeEntryDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">Create</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Work Type</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeEntries?.map((entry) => (
                      <TableRow key={entry.timeEntry.id}>
                        <TableCell className="font-medium">{entry.employee.fullName}</TableCell>
                        <TableCell>
                          {format(new Date(entry.timeEntry.clockIn), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          {entry.timeEntry.clockOut
                            ? format(new Date(entry.timeEntry.clockOut), "MMM dd, yyyy HH:mm")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {entry.timeEntry.hoursWorked
                            ? `${parseFloat(entry.timeEntry.hoursWorked).toFixed(2)}h`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.timeEntry.workType || "Regular"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {entry.timeEntry.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!timeEntries || timeEntries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No time entries found. Add time entries to track employee hours.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payroll Tab */}
          <TabsContent value="payroll" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Payroll Records</h2>
              <Dialog open={isPayrollDialogOpen} onOpenChange={setIsPayrollDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Calendar className="mr-2 h-4 w-4" />
                    Calculate Payroll
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Calculate Payroll</DialogTitle>
                    <DialogDescription>
                      Calculate payroll for an employee based on time entries
                    </DialogDescription>
                  </DialogHeader>
                  <form aria-label="Submit form" onSubmit={handlePayrollCalculate} className="space-y-4">
                    <div>
                      <Label htmlFor="employeeId">Employee</Label>
                      <Select name="employeeId" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees?.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {emp.fullName} - {emp.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="periodStart">Period Start</Label>
                      <Input
                        id="periodStart"
                        name="periodStart"
                        type="date"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="periodEnd">Period End</Label>
                      <Input
                        id="periodEnd"
                        name="periodEnd"
                        type="date"
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsPayrollDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">Calculate</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Gross Pay</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollRecords?.map((record) => (
                      <TableRow key={record.payroll.id}>
                        <TableCell className="font-medium">{record.employee.fullName}</TableCell>
                        <TableCell>
                          {format(new Date(record.payroll.periodStart), "MMM dd")} -{" "}
                          {format(new Date(record.payroll.periodEnd), "MMM dd, yyyy")}
                        </TableCell>
                        <TableCell>
                          {parseFloat(record.payroll.hoursWorked).toFixed(2)}h
                        </TableCell>
                        <TableCell>${(record.payroll.grossPay / 100).toFixed(2)}</TableCell>
                        <TableCell>${((record.payroll.deductions || 0) / 100).toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">
                          ${(record.payroll.netPay / 100).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              record.payroll.status === "paid"
                                ? "default"
                                : record.payroll.status === "pending"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {record.payroll.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.payroll.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => handlePayrollProcess(record.payroll.id)}
                            >
                              Process Payment
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!payrollRecords || payrollRecords.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No payroll records found. Calculate payroll to get started.
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
    </DashboardLayout>
  );
}
