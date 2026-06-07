import { trpc } from "@/lib/trpc";
/**
 * Offline Conflict Resolution UI
 * Allows users to view and resolve sync conflicts between local and server data
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  RefreshCw, 
  Check, 
  X, 
  ArrowRight, 
  ArrowLeft,
  Clock,
  Cloud,
  Smartphone,
  GitMerge,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';

// Types
interface ConflictField {
  fieldName: string;
  localValue: unknown;
  serverValue: unknown;
  localTimestamp: string;
  serverTimestamp: string;
}

interface SyncConflict {
  id: string;
  entityType: 'farmer' | 'farm' | 'harvest' | 'expense' | 'loan' | 'order';
  entityId: string;
  entityName: string;
  conflictType: 'update' | 'delete' | 'create';
  fields: ConflictField[];
  localVersion: number;
  serverVersion: number;
  createdAt: string;
  status: 'pending' | 'resolved' | 'skipped';
  resolution?: 'local' | 'server' | 'merged';
}

interface ResolutionStrategy {
  id: 'local' | 'server' | 'merged' | 'manual';
  name: string;
  description: string;
  icon: React.ReactNode;
}

// Resolution strategies
const resolutionStrategies: ResolutionStrategy[] = [
  {
    id: 'local',
    name: 'Keep Local',
    description: 'Use your local changes and overwrite server data',
    icon: <Smartphone className="h-5 w-5" />,
  },
  {
    id: 'server',
    name: 'Keep Server',
    description: 'Discard local changes and use server data',
    icon: <Cloud className="h-5 w-5" />,
  },
  {
    id: 'merged',
    name: 'Smart Merge',
    description: 'Automatically merge changes (keeps newest for each field)',
    icon: <GitMerge className="h-5 w-5" />,
  },
  {
    id: 'manual',
    name: 'Manual',
    description: 'Choose which value to keep for each field',
    icon: <Check className="h-5 w-5" />,
  },
];

// Mock conflicts data
const mockConflicts: SyncConflict[] = [
  {
    id: 'c1',
    entityType: 'farmer',
    entityId: 'F001',
    entityName: 'John Kamau',
    conflictType: 'update',
    fields: [
      {
        fieldName: 'phone',
        localValue: '0712345678',
        serverValue: '0723456789',
        localTimestamp: '2024-01-15T10:30:00Z',
        serverTimestamp: '2024-01-15T10:25:00Z',
      },
      {
        fieldName: 'email',
        localValue: 'john.new@email.com',
        serverValue: 'john.old@email.com',
        localTimestamp: '2024-01-15T10:30:00Z',
        serverTimestamp: '2024-01-15T09:00:00Z',
      },
    ],
    localVersion: 5,
    serverVersion: 4,
    createdAt: '2024-01-15T10:35:00Z',
    status: 'pending',
  },
  {
    id: 'c2',
    entityType: 'harvest',
    entityId: 'H001',
    entityName: 'Maize Harvest - Jan 2024',
    conflictType: 'update',
    fields: [
      {
        fieldName: 'quantity',
        localValue: 150,
        serverValue: 145,
        localTimestamp: '2024-01-14T15:00:00Z',
        serverTimestamp: '2024-01-14T14:30:00Z',
      },
      {
        fieldName: 'qualityGrade',
        localValue: 'A',
        serverValue: 'B',
        localTimestamp: '2024-01-14T15:00:00Z',
        serverTimestamp: '2024-01-14T14:30:00Z',
      },
    ],
    localVersion: 3,
    serverVersion: 3,
    createdAt: '2024-01-14T15:05:00Z',
    status: 'pending',
  },
  {
    id: 'c3',
    entityType: 'expense',
    entityId: 'E001',
    entityName: 'Fertilizer Purchase',
    conflictType: 'delete',
    fields: [
      {
        fieldName: 'deleted',
        localValue: true,
        serverValue: false,
        localTimestamp: '2024-01-13T09:00:00Z',
        serverTimestamp: '2024-01-13T08:00:00Z',
      },
    ],
    localVersion: 2,
    serverVersion: 2,
    createdAt: '2024-01-13T09:05:00Z',
    status: 'pending',
  },
];

// Field value display component
function FieldValue({ value, type }: { value: unknown; type: 'local' | 'server' }) {
  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const bgColor = type === 'local' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200';
  const textColor = type === 'local' ? 'text-blue-700' : 'text-green-700';
  
  return (
    <div className={`p-2 rounded border ${bgColor}`}>
      <span className={`font-mono text-sm ${textColor}`}>{displayValue}</span>
    </div>
  );
}

// Conflict card component
function ConflictCard({
  conflict,
  onResolve,
  isExpanded,
  onToggleExpand,
}: {
  conflict: SyncConflict;
  onResolve: (conflictId: string, resolution: 'local' | 'server' | 'merged', fieldResolutions?: Record<string, 'local' | 'server'>) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const [selectedStrategy, setSelectedStrategy] = useState<'local' | 'server' | 'merged' | 'manual'>('merged');
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, 'local' | 'server'>>({});
  const [isResolving, setIsResolving] = useState(false);

  // Initialize field resolutions for manual mode
  useEffect(() => {
    const initial: Record<string, 'local' | 'server'> = {};
    conflict.fields.forEach(field => {
      // Default to newer value
      const localNewer = new Date(field.localTimestamp) > new Date(field.serverTimestamp);
      initial[field.fieldName] = localNewer ? 'local' : 'server';
    });
    setFieldResolutions(initial);
  }, [conflict.fields]);

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      if (selectedStrategy === 'manual') {
        await onResolve(conflict.id, 'merged', fieldResolutions);
      } else {
        await onResolve(conflict.id, selectedStrategy === 'merged' ? 'merged' : selectedStrategy);
      }
    } finally {
      setIsResolving(false);
    }
  };

  const getEntityIcon = () => {
    switch (conflict.entityType) {
      case 'farmer': return '👤';
      case 'farm': return '🌾';
      case 'harvest': return '📦';
      case 'expense': return '💰';
      case 'loan': return '🏦';
      case 'order': return '🛒';
      default: return '📄';
    }
  };

  const getConflictTypeBadge = () => {
    switch (conflict.conflictType) {
      case 'update':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Update Conflict</Badge>;
      case 'delete':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Delete Conflict</Badge>;
      case 'create':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Create Conflict</Badge>;
    }
  };

  return (
    <Card className={`transition-all ${isExpanded ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getEntityIcon()}</span>
            <div>
              <CardTitle className="text-lg">{conflict.entityName}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <span className="capitalize">{conflict.entityType}</span>
                <span>•</span>
                <span>{conflict.fields.length} field(s) in conflict</span>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getConflictTypeBadge()}
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Version info */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              <span>Local Version: {conflict.localVersion}</span>
            </div>
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              <span>Server Version: {conflict.serverVersion}</span>
            </div>
          </div>

          <Separator />

          {/* Field conflicts */}
          <div className="space-y-4">
            <h4 className="font-medium">Conflicting Fields</h4>
            
            {conflict.fields.map((field) => (
              <div key={field.fieldName} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{field.fieldName.replace(/([A-Z])/g, ' $1').trim()}</span>
                  {selectedStrategy === 'manual' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={fieldResolutions[field.fieldName] === 'local' ? 'default' : 'outline'}
                        onClick={() => setFieldResolutions(prev => ({ ...prev, [field.fieldName]: 'local' }))}
                      >
                        <Smartphone className="h-3 w-3 mr-1" />
                        Local
                      </Button>
                      <Button
                        size="sm"
                        variant={fieldResolutions[field.fieldName] === 'server' ? 'default' : 'outline'}
                        onClick={() => setFieldResolutions(prev => ({ ...prev, [field.fieldName]: 'server' }))}
                      >
                        <Cloud className="h-3 w-3 mr-1" />
                        Server
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Smartphone className="h-3 w-3" />
                      <span>Local</span>
                      <Clock className="h-3 w-3 ml-2" />
                      <span>{new Date(field.localTimestamp).toLocaleString()}</span>
                    </div>
                    <FieldValue value={field.localValue} type="local" />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Cloud className="h-3 w-3" />
                      <span>Server</span>
                      <Clock className="h-3 w-3 ml-2" />
                      <span>{new Date(field.serverTimestamp).toLocaleString()}</span>
                    </div>
                    <FieldValue value={field.serverValue} type="server" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Resolution strategy */}
          <div className="space-y-4">
            <h4 className="font-medium">Resolution Strategy</h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {resolutionStrategies.map((strategy) => (
                <button
                  key={strategy.id}
                  onClick={() => setSelectedStrategy(strategy.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedStrategy === strategy.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {strategy.icon}
                    <span className="font-medium text-sm">{strategy.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{strategy.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onToggleExpand}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={isResolving}>
              {isResolving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Resolve Conflict
                </>
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Main component
export default function OfflineConflictResolution() {
  const [conflicts, setConflicts] = useState<SyncConflict[]>(mockConflicts);
  const [expandedConflict, setExpandedConflict] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');

  const pendingConflicts = conflicts.filter(c => c.status === 'pending');
  const resolvedConflicts = conflicts.filter(c => c.status === 'resolved');

  // Refresh conflicts
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // In production, this would fetch from the sync service
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Simulate refresh
    } finally {
      setIsRefreshing(false);
    }
  };

  // Resolve conflict
  const handleResolve = async (
    conflictId: string,
    resolution: 'local' | 'server' | 'merged',
    fieldResolutions?: Record<string, 'local' | 'server'>
  ) => {
    // In production, this would call the sync service
    await new Promise(resolve => setTimeout(resolve, 500));

    setConflicts(prev =>
      prev.map(c =>
        c.id === conflictId
          ? { ...c, status: 'resolved' as const, resolution }
          : c
      )
    );
    setResolvedCount(prev => prev + 1);
    setExpandedConflict(null);
  };

  // Resolve all with strategy
  const handleResolveAll = async (strategy: 'local' | 'server' | 'merged') => {
    setIsRefreshing(true);
    try {
      for (const conflict of pendingConflicts) {
        await handleResolve(conflict.id, strategy);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitMerge className="h-6 w-6" />
              Sync Conflicts
            </h1>
            <p className="text-muted-foreground">
              Resolve conflicts between your local changes and server data
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-yellow-100">
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingConflicts.length}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-100">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{resolvedConflicts.length}</p>
                  <p className="text-sm text-muted-foreground">Resolved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-100">
                  <Info className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{resolvedCount}</p>
                  <p className="text-sm text-muted-foreground">This Session</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        {pendingConflicts.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Quick Resolution</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>Resolve all {pendingConflicts.length} conflicts at once:</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleResolveAll('local')}>
                  <Smartphone className="h-4 w-4 mr-1" />
                  Keep All Local
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleResolveAll('server')}>
                  <Cloud className="h-4 w-4 mr-1" />
                  Keep All Server
                </Button>
                <Button size="sm" onClick={() => handleResolveAll('merged')}>
                  <GitMerge className="h-4 w-4 mr-1" />
                  Smart Merge All
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'resolved')}>
          <TabsList>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Pending ({pendingConflicts.length})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Resolved ({resolvedConflicts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingConflicts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-medium">All Caught Up!</h3>
                  <p className="text-muted-foreground">No pending sync conflicts to resolve.</p>
                </CardContent>
              </Card>
            ) : (
              pendingConflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  onResolve={handleResolve}
                  isExpanded={expandedConflict === conflict.id}
                  onToggleExpand={() => setExpandedConflict(
                    expandedConflict === conflict.id ? null : conflict.id
                  )}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="resolved" className="space-y-4 mt-4">
            {resolvedConflicts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Info className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Resolved Conflicts</h3>
                  <p className="text-muted-foreground">Resolved conflicts will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              resolvedConflicts.map((conflict) => (
                <Card key={conflict.id} className="opacity-75">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {conflict.entityType === 'farmer' ? '👤' :
                           conflict.entityType === 'farm' ? '🌾' :
                           conflict.entityType === 'harvest' ? '📦' :
                           conflict.entityType === 'expense' ? '💰' : '📄'}
                        </span>
                        <div>
                          <CardTitle className="text-lg">{conflict.entityName}</CardTitle>
                          <CardDescription>
                            Resolved with: {conflict.resolution === 'local' ? 'Local values' :
                                           conflict.resolution === 'server' ? 'Server values' : 'Smart merge'}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Resolved
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Help section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Understanding Sync Conflicts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Sync conflicts occur when the same data is modified both on your device (while offline) 
              and on the server (by another user or device). Here's how to resolve them:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex gap-3">
                <Smartphone className="h-5 w-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Keep Local</p>
                  <p>Your changes will overwrite the server data. Use this when you're sure your data is correct.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Cloud className="h-5 w-5 text-green-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Keep Server</p>
                  <p>Server data will replace your local changes. Use this when the server has the correct data.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <GitMerge className="h-5 w-5 text-purple-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Smart Merge</p>
                  <p>Automatically keeps the newest value for each field. Best for most situations.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Check className="h-5 w-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Manual</p>
                  <p>Choose which value to keep for each field individually. Use for complex conflicts.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
