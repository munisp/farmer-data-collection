/**
 * Cooperative Dashboard
 * Manage cooperatives, members, accounts, and transactions
 * Wired to live tRPC data
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Building2,
  Wallet,
  TrendingUp,
  Plus,
  Search,
  Calendar,
  DollarSign,
  UserPlus,
  FileText,
  PiggyBank,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

type CooperativeType = 'farmer_cooperative' | 'savings_group' | 'producer_organization' | 'marketing_cooperative' | 'credit_union' | 'women_group' | 'youth_group' | 'other';
type MemberRole = 'chairperson' | 'vice_chairperson' | 'secretary' | 'treasurer' | 'member' | 'field_officer' | 'advisor';
type TransactionType = 'contribution' | 'withdrawal' | 'loan_disbursement' | 'loan_repayment' | 'fee' | 'dividend';

export default function CooperativeDashboard() {
  const { formatCurrency } = useLocalization();
  const [selectedCooperativeId, setSelectedCooperativeId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CooperativeType | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [showContributionDialog, setShowContributionDialog] = useState(false);

  // Form state for creating cooperative
  const [newCoopName, setNewCoopName] = useState('');
  const [newCoopType, setNewCoopType] = useState<CooperativeType>('farmer_cooperative');
  const [newCoopRegion, setNewCoopRegion] = useState('');
  const [newCoopDistrict, setNewCoopDistrict] = useState('');
  const [newCoopShareValue, setNewCoopShareValue] = useState('');
  const [newCoopMinShares, setNewCoopMinShares] = useState('');

  // Form state for adding member
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<MemberRole>('member');
  const [newMemberShares, setNewMemberShares] = useState('');

  // Form state for contribution
  const [contributionMemberId, setContributionMemberId] = useState('');
  const [contributionType, setContributionType] = useState<TransactionType>('contribution');
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionMethod, setContributionMethod] = useState('cash');

  // Fetch cooperatives list
  const { data: cooperatives, isLoading: loadingCoops, error: coopsError, refetch: refetchCoops } = trpc.cooperative.list.useQuery({
    limit: 100,
    type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  // Fetch selected cooperative details
  const { data: selectedCooperative } = trpc.cooperative.getById.useQuery(
    { id: selectedCooperativeId! },
    { enabled: !!selectedCooperativeId }
  );

  // Fetch members for selected cooperative
  const { data: members, isLoading: loadingMembers, refetch: refetchMembers } = trpc.cooperative.getMembers.useQuery(
    { cooperativeId: selectedCooperativeId! },
    { enabled: !!selectedCooperativeId }
  );

  // Fetch transactions for selected cooperative
  const { data: transactions, isLoading: loadingTransactions, refetch: refetchTransactions } = trpc.cooperative.getTransactions.useQuery(
    { cooperativeId: selectedCooperativeId!, limit: 50 },
    { enabled: !!selectedCooperativeId }
  );

  // Fetch loans for selected cooperative
  const { data: loans, isLoading: loadingLoans } = trpc.cooperative.getLoans.useQuery(
    { cooperativeId: selectedCooperativeId! },
    { enabled: !!selectedCooperativeId }
  );

  // Fetch meetings for selected cooperative
  const { data: meetings, isLoading: loadingMeetings } = trpc.cooperative.getMeetings.useQuery(
    { cooperativeId: selectedCooperativeId! },
    { enabled: !!selectedCooperativeId }
  );

  // Fetch dashboard stats for selected cooperative
  const { data: stats } = trpc.cooperative.getDashboardStats.useQuery(
    { cooperativeId: selectedCooperativeId! },
    { enabled: !!selectedCooperativeId }
  );

  // Mutations
  const createCoopMutation = trpc.cooperative.create.useMutation({
    onSuccess: () => {
      toast.success('Cooperative created successfully');
      setShowCreateDialog(false);
      refetchCoops();
      setNewCoopName('');
      setNewCoopType('farmer_cooperative');
      setNewCoopRegion('');
      setNewCoopDistrict('');
      setNewCoopShareValue('');
      setNewCoopMinShares('');
    },
    onError: (error) => {
      toast.error(`Failed to create cooperative: ${error.message}`);
    },
  });

  const addMemberMutation = trpc.cooperative.addMember.useMutation({
    onSuccess: () => {
      toast.success('Member added successfully');
      setShowAddMemberDialog(false);
      refetchMembers();
      setNewMemberUserId('');
      setNewMemberRole('member');
      setNewMemberShares('');
    },
    onError: (error) => {
      toast.error(`Failed to add member: ${error.message}`);
    },
  });

  const recordTransactionMutation = trpc.cooperative.recordTransaction.useMutation({
    onSuccess: () => {
      toast.success('Transaction recorded successfully');
      setShowContributionDialog(false);
      refetchTransactions();
      refetchMembers();
      setContributionMemberId('');
      setContributionType('contribution');
      setContributionAmount('');
      setContributionMethod('cash');
    },
    onError: (error) => {
      toast.error(`Failed to record transaction: ${error.message}`);
    },
  });

  const handleCreateCooperative = () => {
    if (!newCoopName) {
      toast.error('Please enter a cooperative name');
      return;
    }
    createCoopMutation.mutate({
      name: newCoopName,
      type: newCoopType,
      region: newCoopRegion || undefined,
      district: newCoopDistrict || undefined,
      shareValue: newCoopShareValue ? parseInt(newCoopShareValue) : undefined,
      minimumShares: newCoopMinShares ? parseInt(newCoopMinShares) : undefined,
    });
  };

  const handleAddMember = () => {
    if (!selectedCooperativeId || !newMemberUserId) {
      toast.error('Please select a user');
      return;
    }
    addMemberMutation.mutate({
      cooperativeId: selectedCooperativeId,
      userId: parseInt(newMemberUserId),
      role: newMemberRole,
      sharesOwned: newMemberShares ? parseInt(newMemberShares) : 0,
    });
  };

  const handleRecordTransaction = () => {
    if (!selectedCooperativeId || !contributionAmount) {
      toast.error('Please enter an amount');
      return;
    }
    recordTransactionMutation.mutate({
      cooperativeId: selectedCooperativeId,
      memberId: contributionMemberId ? parseInt(contributionMemberId) : undefined,
      transactionType: contributionType,
      amount: parseInt(contributionAmount) * 100,
      paymentMethod: contributionMethod,
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      dissolved: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[status] || 'bg-gray-100'}>{status}</Badge>;
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      chairperson: 'bg-purple-100 text-purple-800',
      vice_chairperson: 'bg-purple-100 text-purple-800',
      treasurer: 'bg-blue-100 text-blue-800',
      secretary: 'bg-indigo-100 text-indigo-800',
      member: 'bg-gray-100 text-gray-800',
      field_officer: 'bg-green-100 text-green-800',
      advisor: 'bg-orange-100 text-orange-800',
    };
    return <Badge className={colors[role] || 'bg-gray-100'}>{role.replace('_', ' ')}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      farmer_cooperative: 'Farmer Coop',
      savings_group: 'Savings Group',
      producer_organization: 'Producer Org',
      marketing_cooperative: 'Marketing Coop',
      credit_union: 'Credit Union',
      women_group: 'Women Group',
      youth_group: 'Youth Group',
      other: 'Other',
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  const filteredCooperatives = cooperatives?.filter(coop =>
    coop.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const totalMembers = cooperatives?.reduce((sum, c) => sum + ((c as any).memberCount || 0), 0) || 0;
  const totalBalance = cooperatives?.reduce((sum, c) => sum + ((c as any).totalBalance || 0), 0) || 0;

  if (coopsError) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <h3 className="font-semibold">Error Loading Cooperatives</h3>
              <p className="text-muted-foreground">{coopsError.message}</p>
              <Button variant="outline" className="mt-2" onClick={() => refetchCoops()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Cooperative Management</h1>
          <p className="text-muted-foreground">Manage cooperatives, members, and group finances</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Cooperative
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Cooperative</DialogTitle>
              <DialogDescription>Set up a new cooperative or savings group</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Cooperative Name</Label>
                <Input
                  placeholder="Enter cooperative name"
                  value={newCoopName}
                  onChange={(e) => setNewCoopName(e.target.value)}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newCoopType} onValueChange={(v) => setNewCoopType(v as CooperativeType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="farmer_cooperative">Farmer Cooperative</SelectItem>
                    <SelectItem value="savings_group">Savings Group</SelectItem>
                    <SelectItem value="producer_organization">Producer Organization</SelectItem>
                    <SelectItem value="women_group">Women Group</SelectItem>
                    <SelectItem value="youth_group">Youth Group</SelectItem>
                    <SelectItem value="credit_union">Credit Union</SelectItem>
                    <SelectItem value="marketing_cooperative">Marketing Cooperative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Region</Label>
                  <Input
                    placeholder="Region"
                    value={newCoopRegion}
                    onChange={(e) => setNewCoopRegion(e.target.value)}
                  />
                </div>
                <div>
                  <Label>District</Label>
                  <Input
                    placeholder="District"
                    value={newCoopDistrict}
                    onChange={(e) => setNewCoopDistrict(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Share Value</Label>
                  <Input
                    type="number"
                    placeholder="1000"
                    value={newCoopShareValue}
                    onChange={(e) => setNewCoopShareValue(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Min. Shares</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={newCoopMinShares}
                    onChange={(e) => setNewCoopMinShares(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleCreateCooperative}
                disabled={createCoopMutation.isPending}
              >
                {createCoopMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Cooperative
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cooperatives</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingCoops ? <Loader2 className="h-6 w-6 animate-spin" /> : cooperatives?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {cooperatives?.filter(c => c.status === 'active').length || 0} active groups
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingCoops ? <Loader2 className="h-6 w-6 animate-spin" /> : totalMembers}
            </div>
            <p className="text-xs text-muted-foreground">Across all cooperatives</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingCoops ? <Loader2 className="h-6 w-6 animate-spin" /> : formatCurrency(totalBalance / 100)}
            </div>
            <p className="text-xs text-muted-foreground">Combined balance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.loans?.active || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency((stats?.loans?.totalDisbursed || 0) / 100)} outstanding
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cooperative List */}
      <Card>
        <CardHeader>
          <CardTitle>Cooperatives</CardTitle>
          <CardDescription>Select a cooperative to view details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cooperatives..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CooperativeType | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="farmer_cooperative">Farmer Cooperative</SelectItem>
                <SelectItem value="savings_group">Savings Group</SelectItem>
                <SelectItem value="producer_organization">Producer Org</SelectItem>
                <SelectItem value="women_group">Women Group</SelectItem>
                <SelectItem value="youth_group">Youth Group</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingCoops ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCooperatives.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No cooperatives found</p>
              <p className="text-sm">Create your first cooperative to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {filteredCooperatives.map((coop) => (
                <Card
                  key={coop.id}
                  className={`cursor-pointer transition-all ${
                    selectedCooperativeId === coop.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
                  }`}
                  onClick={() => setSelectedCooperativeId(coop.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{coop.name}</h3>
                      {getStatusBadge(coop.status)}
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Type:</span>
                        {getTypeBadge(coop.type)}
                      </div>
                      <div className="flex justify-between">
                        <span>Members:</span>
                        <span className="font-medium">{(coop as any).memberCount || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Balance:</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(((coop as any).totalBalance || 0) / 100)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Location:</span>
                        <span>{coop.district || '-'}, {coop.region || '-'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Cooperative Details */}
      {selectedCooperativeId && selectedCooperative && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{selectedCooperative.name}</CardTitle>
                <CardDescription>
                  {selectedCooperative.district || '-'}, {selectedCooperative.region || '-'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Member</DialogTitle>
                      <DialogDescription>Add a farmer to this cooperative</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>User ID</Label>
                        <Input
                          type="number"
                          placeholder="Enter user ID"
                          value={newMemberUserId}
                          onChange={(e) => setNewMemberUserId(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Role</Label>
                        <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as MemberRole)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="secretary">Secretary</SelectItem>
                            <SelectItem value="treasurer">Treasurer</SelectItem>
                            <SelectItem value="chairperson">Chairperson</SelectItem>
                            <SelectItem value="vice_chairperson">Vice Chairperson</SelectItem>
                            <SelectItem value="field_officer">Field Officer</SelectItem>
                            <SelectItem value="advisor">Advisor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Initial Shares</Label>
                        <Input
                          type="number"
                          placeholder="1"
                          value={newMemberShares}
                          onChange={(e) => setNewMemberShares(e.target.value)}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleAddMember}
                        disabled={addMemberMutation.isPending}
                      >
                        {addMemberMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Add Member
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={showContributionDialog} onOpenChange={setShowContributionDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Record Transaction
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Transaction</DialogTitle>
                      <DialogDescription>Record a member contribution or payment</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Member (Optional)</Label>
                        <Select value={contributionMemberId} onValueChange={setContributionMemberId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select member" />
                          </SelectTrigger>
                          <SelectContent>
                            {members?.map((m) => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                Member #{m.id} - {m.role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Transaction Type</Label>
                        <Select value={contributionType} onValueChange={(v) => setContributionType(v as TransactionType)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contribution">Contribution</SelectItem>
                            <SelectItem value="loan_repayment">Loan Repayment</SelectItem>
                            <SelectItem value="fee">Fee</SelectItem>
                            <SelectItem value="withdrawal">Withdrawal</SelectItem>
                            <SelectItem value="loan_disbursement">Loan Disbursement</SelectItem>
                            <SelectItem value="dividend">Dividend</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={contributionAmount}
                          onChange={(e) => setContributionAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Payment Method</Label>
                        <Select value={contributionMethod} onValueChange={setContributionMethod}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleRecordTransaction}
                        disabled={recordTransactionMutation.isPending}
                      >
                        {recordTransactionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Record Transaction
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="members">
              <TabsList>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="loans">Loans</TabsTrigger>
                <TabsTrigger value="meetings">Meetings</TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="mt-4">
                {loadingMembers ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : members?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No members yet</p>
                    <p className="text-sm">Add members to this cooperative</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Contributions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members?.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">#{member.id}</TableCell>
                          <TableCell>{getRoleBadge(member.role)}</TableCell>
                          <TableCell>{getStatusBadge(member.status)}</TableCell>
                          <TableCell className="text-right">{member.sharesOwned || 0}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency((member.totalContributions || 0) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="transactions" className="mt-4">
                {loadingTransactions ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : transactions?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No transactions yet</p>
                    <p className="text-sm">Record contributions and payments</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions?.map((txn) => (
                        <TableRow key={txn.id}>
                          <TableCell>
                            {txn.transactionDate ? new Date(txn.transactionDate).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{txn.transactionType?.replace('_', ' ')}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{txn.referenceNumber || '-'}</TableCell>
                          <TableCell className={`text-right font-medium ${
                            ['contribution', 'loan_repayment', 'fee'].includes(txn.transactionType || '')
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            {['contribution', 'loan_repayment', 'fee'].includes(txn.transactionType || '') ? '+' : '-'}
                            {formatCurrency((txn.amount || 0) / 100)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency((txn.balanceAfter || 0) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="loans" className="mt-4">
                {loadingLoans ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : loans?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No loans yet</p>
                    <p className="text-sm">Cooperative loans will appear here</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Disbursed</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loans?.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell>{loan.loanType}</TableCell>
                          <TableCell>{getStatusBadge(loan.status || 'pending')}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency((loan.principalAmount || 0) / 100)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency((loan.disbursedAmount || 0) / 100)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency((loan.outstandingBalance || 0) / 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4">
                {loadingMeetings ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : meetings?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No meetings scheduled</p>
                    <p className="text-sm">Schedule meetings for the cooperative</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Venue</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {meetings?.map((meeting) => (
                        <TableRow key={meeting.id}>
                          <TableCell>
                            {meeting.scheduledDate ? new Date(meeting.scheduledDate).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="font-medium">{meeting.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{meeting.meetingType}</Badge>
                          </TableCell>
                          <TableCell>{meeting.venue || (meeting.isVirtual ? 'Virtual' : '-')}</TableCell>
                          <TableCell>{getStatusBadge(meeting.status || 'scheduled')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
