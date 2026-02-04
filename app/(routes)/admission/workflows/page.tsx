'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useWorkflows,
  useWorkflowStats,
  useWorkflowMutations,
  useWorkflowHelpers
} from '@/hooks/admission';
import type {
  Workflow,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowTriggerType,
  WorkflowActionType,
  CreateWorkflowInput
} from '@/lib/services/admission/workflows-service';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Copy,
  RefreshCw,
  Clock,
  MessageSquare,
  Mail,
  Phone,
  ArrowRight,
  Zap,
  Bell,
  GitBranch,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  Power,
  PowerOff,
  UserPlus,
  Tag
} from 'lucide-react';

// Icon mappings
const TRIGGER_ICONS: Record<WorkflowTriggerType, React.ElementType> = {
  stage_change: GitBranch,
  lead_created: UserPlus,
  time_delay: Clock,
  no_response: Bell,
  score_change: Zap,
  manual: Play,
};

const ACTION_ICONS: Record<WorkflowActionType, React.ElementType> = {
  send_whatsapp: MessageSquare,
  send_email: Mail,
  send_sms: Phone,
  assign_task: CheckCircle,
  update_stage: GitBranch,
  notify_counselor: Bell,
  add_tag: Tag,
  assign_counselor: UserPlus,
};

const ACTION_COLORS: Record<WorkflowActionType, string> = {
  send_whatsapp: 'bg-green-500',
  send_email: 'bg-blue-500',
  send_sms: 'bg-purple-500',
  assign_task: 'bg-orange-500',
  update_stage: 'bg-indigo-500',
  notify_counselor: 'bg-red-500',
  add_tag: 'bg-teal-500',
  assign_counselor: 'bg-pink-500',
};

const STAGES = [
  { value: 'new', label: 'New' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'offered', label: 'Offered' },
  { value: 'enrolled', label: 'Enrolled' }
];

function WorkflowsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TriggerIcon({ type }: { type: WorkflowTriggerType }) {
  const Icon = TRIGGER_ICONS[type] || Zap;
  return <Icon className="h-4 w-4" />;
}

function ActionIcon({ type }: { type: WorkflowActionType }) {
  const Icon = ACTION_ICONS[type] || Zap;
  return <Icon className="h-4 w-4 text-white" />;
}

function WorkflowCard({
  workflow,
  onToggle,
  onDelete,
  onDuplicate,
  isToggling,
  isDeleting,
  isDuplicating
}: {
  workflow: Workflow;
  onToggle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isToggling?: boolean;
  isDeleting?: boolean;
  isDuplicating?: boolean;
}) {
  const { triggerTypes, actionTypes } = useWorkflowHelpers();
  const triggerLabel = triggerTypes.find(t => t.value === workflow.trigger.type)?.label || workflow.trigger.type;

  return (
    <Card className={!workflow.is_active ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {workflow.name}
              {workflow.is_active ? (
                <Badge variant="default" className="bg-green-600">Active</Badge>
              ) : (
                <Badge variant="secondary">Paused</Badge>
              )}
            </CardTitle>
            <CardDescription>{workflow.description || 'No description'}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onDuplicate}
              disabled={isDuplicating}
              title="Duplicate"
            >
              {isDuplicating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Switch
              checked={workflow.is_active}
              onCheckedChange={onToggle}
              disabled={isToggling}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 text-red-500 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-red-500" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trigger */}
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900 rounded-full">
            <TriggerIcon type={workflow.trigger.type} />
            <span className="font-medium">
              {triggerLabel}
              {workflow.trigger.config?.stage && `: ${workflow.trigger.config.stage}`}
              {workflow.trigger.config?.to_stage && `: ${workflow.trigger.config.to_stage}`}
              {workflow.trigger.config?.delay_days && `: ${workflow.trigger.config.delay_days} days`}
              {workflow.trigger.config?.delay_hours && `: ${workflow.trigger.config.delay_hours} hours`}
            </span>
          </div>
        </div>

        {/* Actions Flow */}
        <div className="flex items-center gap-2 flex-wrap">
          {workflow.actions.map((action, index) => {
            const color = ACTION_COLORS[action.type] || 'bg-gray-500';
            const actionLabel = actionTypes.find(a => a.value === action.type)?.label || action.type;
            return (
              <div key={action.id} className="flex items-center gap-2">
                {index > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                <div className={`flex items-center gap-2 px-3 py-1.5 ${color} rounded-full text-white text-sm`}>
                  <ActionIcon type={action.type} />
                  <span>{actionLabel}</span>
                </div>
              </div>
            );
          })}
          {workflow.actions.length === 0 && (
            <span className="text-sm text-muted-foreground">No actions configured</span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Created: {new Date(workflow.created_at).toLocaleDateString()}
          </span>
          {workflow.last_run && (
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              Last run: {new Date(workflow.last_run).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {workflow.runs_count || 0} runs
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateWorkflowDialog({
  open,
  onOpenChange,
  onSubmit,
  institutionId,
  isCreating
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateWorkflowInput) => void;
  institutionId: string;
  isCreating: boolean;
}) {
  const { triggerTypes, actionTypes } = useWorkflowHelpers();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>('stage_change');
  const [triggerStage, setTriggerStage] = useState('new');
  const [delayDays, setDelayDays] = useState(3);
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [currentAction, setCurrentAction] = useState<WorkflowActionType | ''>('');

  const addAction = () => {
    if (!currentAction) return;
    const newAction: WorkflowAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: currentAction,
      order: actions.length,
      config: {}
    };
    setActions([...actions, newAction]);
    setCurrentAction('');
    toast.success('Action added');
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id));
    toast.success('Action removed');
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setTriggerType('stage_change');
    setTriggerStage('new');
    setDelayDays(3);
    setActions([]);
    setCurrentAction('');
  };

  const handleSubmit = () => {
    if (!name || actions.length === 0) return;

    const trigger: WorkflowTrigger = {
      type: triggerType,
      config: {}
    };

    if (triggerType === 'stage_change') {
      trigger.config.stage = triggerStage;
    } else if (triggerType === 'time_delay' || triggerType === 'no_response') {
      trigger.config.delay_days = delayDays;
    }

    onSubmit({
      institution_id: institutionId,
      name,
      description: description || undefined,
      trigger,
      actions,
      is_active: true
    });

    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Workflow</DialogTitle>
          <DialogDescription>
            Set up an automated workflow with triggers and actions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Workflow Name *</Label>
              <Input
                placeholder="e.g., Welcome New Leads"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Brief description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Trigger Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Trigger</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>When to trigger *</Label>
                <Select value={triggerType} onValueChange={(v) => setTriggerType(v as WorkflowTriggerType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerTypes.map((option) => {
                      const Icon = TRIGGER_ICONS[option.value];
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {triggerType === 'stage_change' && (
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={triggerStage} onValueChange={setTriggerStage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(triggerType === 'time_delay' || triggerType === 'no_response') && (
                <div className="space-y-2">
                  <Label>Delay (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={delayDays}
                    onChange={(e) => setDelayDays(parseInt(e.target.value) || 1)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Actions *</Label>

            {/* Current Actions */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 bg-muted rounded-lg">
                {actions.map((action, index) => {
                  const color = ACTION_COLORS[action.type] || 'bg-gray-500';
                  const label = actionTypes.find(a => a.value === action.type)?.label || action.type;
                  return (
                    <div key={action.id} className="flex items-center gap-2">
                      {index > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                      <div className={`flex items-center gap-2 px-3 py-1.5 ${color} rounded-full text-white text-sm`}>
                        <ActionIcon type={action.type} />
                        <span>{label}</span>
                        <button
                          onClick={() => removeAction(action.id)}
                          className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Action */}
            <div className="flex gap-2">
              <Select value={currentAction} onValueChange={(v) => setCurrentAction(v as WorkflowActionType)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select action to add..." />
                </SelectTrigger>
                <SelectContent>
                  {actionTypes.map((option) => {
                    const Icon = ACTION_ICONS[option.value];
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${option.color}`}>
                            <Icon className="h-3 w-3 text-white" />
                          </div>
                          {option.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button onClick={addAction} disabled={!currentAction}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name || actions.length === 0 || isCreating}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowBuilderPageContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { workflows, isLoading: workflowsLoading, refetch } = useWorkflows(selectedInstitutionId);
  const { stats } = useWorkflowStats(selectedInstitutionId);

  const {
    createWorkflow,
    toggleStatus,
    deleteWorkflow,
    duplicateWorkflow,
    isCreating,
    isToggling,
    isDeleting,
    isDuplicating
  } = useWorkflowMutations();

  const isLoading = accessLoading || workflowsLoading;

  const filteredWorkflows = workflows.filter(w => {
    if (filter === 'active') return w.is_active;
    if (filter === 'paused') return !w.is_active;
    return true;
  });

  const handleCreate = async (input: CreateWorkflowInput) => {
    try {
      await createWorkflow.mutateAsync(input);
      setIsCreateOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await toggleStatus.mutateAsync({ id, isActive: !currentStatus });
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId || !selectedInstitutionId) return;
    try {
      await deleteWorkflow.mutateAsync({ id: deleteConfirmId, institutionId: selectedInstitutionId });
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateWorkflow.mutateAsync(id);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Workflow Builder">
          <WorkflowsSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Workflow Builder">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Workflow Builder</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="text-2xl font-bold mt-2">Workflow Builder</h1>
              <p className="text-muted-foreground">
                Create automated communication workflows
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await refetch();
                    toast.success('Workflows refreshed');
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Workflows</p>
                    <p className="text-2xl font-bold">{stats.totalWorkflows}</p>
                  </div>
                  <GitBranch className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Workflows</p>
                    <p className="text-2xl font-bold text-green-600">{stats.activeWorkflows}</p>
                  </div>
                  <Play className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Runs</p>
                    <p className="text-2xl font-bold">{stats.totalExecutions}</p>
                  </div>
                  <Zap className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Today&apos;s Runs</p>
                    <p className="text-2xl font-bold">{stats.executionsToday}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All ({workflows.length})
            </Button>
            <Button
              variant={filter === 'active' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('active')}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Active ({workflows.filter(w => w.is_active).length})
            </Button>
            <Button
              variant={filter === 'paused' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('paused')}
            >
              <Pause className="h-4 w-4 mr-1" />
              Paused ({workflows.filter(w => !w.is_active).length})
            </Button>
          </div>

          {/* Workflows List */}
          <div className="space-y-4">
            {filteredWorkflows.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <GitBranch className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No workflows found</h3>
                  <p className="text-muted-foreground mb-4">
                    {workflows.length === 0
                      ? 'Create your first workflow to automate lead communication'
                      : 'Try adjusting your filter'}
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Workflow
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredWorkflows.map(workflow => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  onToggle={() => handleToggle(workflow.id, workflow.is_active)}
                  onDelete={() => setDeleteConfirmId(workflow.id)}
                  onDuplicate={() => handleDuplicate(workflow.id)}
                  isToggling={isToggling}
                  isDeleting={isDeleting}
                  isDuplicating={isDuplicating}
                />
              ))
            )}
          </div>
        </div>

        {/* Create Dialog */}
        {selectedInstitutionId && (
          <CreateWorkflowDialog
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
            onSubmit={handleCreate}
            institutionId={selectedInstitutionId}
            isCreating={isCreating}
          />
        )}

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteConfirmId}
          onOpenChange={() => setDeleteConfirmId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this workflow? This action cannot be undone.
                All execution history will also be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <AdmissionErrorBoundary>
      <WorkflowBuilderPageContent />
    </AdmissionErrorBoundary>
  );
}
