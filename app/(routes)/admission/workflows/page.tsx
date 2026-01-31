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
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Settings,
  Clock,
  MessageSquare,
  Mail,
  Phone,
  UserCheck,
  ArrowRight,
  Zap,
  Bell,
  GitBranch,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

// Types for workflow builder
interface WorkflowTrigger {
  type: 'stage_change' | 'time_delay' | 'no_response' | 'manual';
  config: {
    stage?: string;
    delayHours?: number;
    delayDays?: number;
  };
}

interface WorkflowAction {
  id: string;
  type: 'send_whatsapp' | 'send_email' | 'send_sms' | 'assign_task' | 'update_stage' | 'notify_counselor';
  config: {
    templateId?: string;
    message?: string;
    newStage?: string;
    taskDescription?: string;
  };
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  isActive: boolean;
  createdAt: string;
  lastRun?: string;
  runsCount: number;
}

// Sample workflows for demonstration
const SAMPLE_WORKFLOWS: Workflow[] = [
  {
    id: '1',
    name: 'Welcome New Lead',
    description: 'Send welcome message when new lead is created',
    trigger: { type: 'stage_change', config: { stage: 'new' } },
    actions: [
      { id: 'a1', type: 'send_whatsapp', config: { templateId: 'welcome_template' } },
      { id: 'a2', type: 'assign_task', config: { taskDescription: 'Follow up within 24 hours' } }
    ],
    isActive: true,
    createdAt: '2026-01-10',
    lastRun: '2026-01-16',
    runsCount: 45
  },
  {
    id: '2',
    name: 'Follow-up Reminder',
    description: 'Send reminder if no response for 3 days',
    trigger: { type: 'no_response', config: { delayDays: 3 } },
    actions: [
      { id: 'b1', type: 'send_whatsapp', config: { message: 'Hi! Just checking in...' } },
      { id: 'b2', type: 'notify_counselor', config: {} }
    ],
    isActive: true,
    createdAt: '2026-01-12',
    lastRun: '2026-01-15',
    runsCount: 23
  },
  {
    id: '3',
    name: 'Application Submitted',
    description: 'Notify when application is submitted',
    trigger: { type: 'stage_change', config: { stage: 'applied' } },
    actions: [
      { id: 'c1', type: 'send_email', config: { templateId: 'application_received' } },
      { id: 'c2', type: 'update_stage', config: { newStage: 'document_verification' } }
    ],
    isActive: false,
    createdAt: '2026-01-08',
    runsCount: 12
  }
];

const TRIGGER_OPTIONS = [
  { value: 'stage_change', label: 'Stage Change', icon: GitBranch, description: 'When lead moves to a stage' },
  { value: 'time_delay', label: 'Time Delay', icon: Clock, description: 'After X hours/days' },
  { value: 'no_response', label: 'No Response', icon: Bell, description: 'If lead hasn\'t responded' },
  { value: 'manual', label: 'Manual Trigger', icon: Play, description: 'Triggered manually' }
];

const ACTION_OPTIONS = [
  { value: 'send_whatsapp', label: 'Send WhatsApp', icon: MessageSquare, color: 'bg-green-500' },
  { value: 'send_email', label: 'Send Email', icon: Mail, color: 'bg-blue-500' },
  { value: 'send_sms', label: 'Send SMS', icon: Phone, color: 'bg-purple-500' },
  { value: 'assign_task', label: 'Assign Task', icon: CheckCircle, color: 'bg-orange-500' },
  { value: 'update_stage', label: 'Update Stage', icon: GitBranch, color: 'bg-indigo-500' },
  { value: 'notify_counselor', label: 'Notify Counselor', icon: Bell, color: 'bg-red-500' }
];

const STAGES = [
  { value: 'new', label: 'New' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'offered', label: 'Offered' },
  { value: 'enrolled', label: 'Enrolled' }
];

function TriggerIcon({ type }: { type: string }) {
  const option = TRIGGER_OPTIONS.find(o => o.value === type);
  if (!option) return <Zap className="h-4 w-4" />;
  const Icon = option.icon;
  return <Icon className="h-4 w-4" />;
}

function ActionIcon({ type }: { type: string }) {
  const option = ACTION_OPTIONS.find(o => o.value === type);
  if (!option) return <Zap className="h-4 w-4" />;
  const Icon = option.icon;
  return <Icon className="h-4 w-4 text-white" />;
}

function WorkflowCard({
  workflow,
  onToggle,
  onDelete,
  isDeleting
}: {
  workflow: Workflow;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}) {
  return (
    <Card className={!workflow.isActive ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {workflow.name}
              {workflow.isActive ? (
                <Badge variant="default" className="bg-green-600">Active</Badge>
              ) : (
                <Badge variant="secondary">Paused</Badge>
              )}
            </CardTitle>
            <CardDescription>{workflow.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={workflow.isActive}
              onCheckedChange={() => onToggle(workflow.id)}
              disabled={isDeleting}
            />
            <Button variant="ghost" size="icon" onClick={() => onDelete(workflow.id)} disabled={isDeleting}>
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
              {TRIGGER_OPTIONS.find(t => t.value === workflow.trigger.type)?.label}
              {workflow.trigger.config.stage && `: ${workflow.trigger.config.stage}`}
              {workflow.trigger.config.delayDays && `: ${workflow.trigger.config.delayDays} days`}
            </span>
          </div>
        </div>

        {/* Actions Flow */}
        <div className="flex items-center gap-2 flex-wrap">
          {workflow.actions.map((action, index) => {
            const actionOption = ACTION_OPTIONS.find(a => a.value === action.type);
            return (
              <div key={action.id} className="flex items-center gap-2">
                {index > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                <div className={`flex items-center gap-2 px-3 py-1.5 ${actionOption?.color || 'bg-gray-500'} rounded-full text-white text-sm`}>
                  <ActionIcon type={action.type} />
                  <span>{actionOption?.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Created: {workflow.createdAt}
          </span>
          {workflow.lastRun && (
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              Last run: {workflow.lastRun}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {workflow.runsCount} runs
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateWorkflowDialog({
  open,
  onOpenChange,
  onCreate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (workflow: Omit<Workflow, 'id' | 'createdAt' | 'runsCount'>) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<string>('stage_change');
  const [triggerStage, setTriggerStage] = useState<string>('new');
  const [delayDays, setDelayDays] = useState(3);
  const [actions, setActions] = useState<WorkflowAction[]>([]);
  const [currentAction, setCurrentAction] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  const addAction = () => {
    if (!currentAction) return;
    const newAction: WorkflowAction = {
      id: `action_${Date.now()}`,
      type: currentAction as WorkflowAction['type'],
      config: {}
    };
    setActions([...actions, newAction]);
    setCurrentAction('');
    toast.success('Action added to workflow');
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id));
    toast.success('Action removed');
  };

  const handleCreate = async () => {
    if (!name || actions.length === 0) return;

    setIsCreating(true);
    try {
      const trigger: WorkflowTrigger = {
        type: triggerType as WorkflowTrigger['type'],
        config: {}
      };

      if (triggerType === 'stage_change') {
        trigger.config.stage = triggerStage;
      } else if (triggerType === 'time_delay' || triggerType === 'no_response') {
        trigger.config.delayDays = delayDays;
      }

      onCreate({
        name,
        description,
        trigger,
        actions,
        isActive: true
      });

      // Reset form
      setName('');
      setDescription('');
      setTriggerType('stage_change');
      setActions([]);
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
              <Label>Workflow Name</Label>
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
                <Label>When to trigger</Label>
                <Select value={triggerType} onValueChange={setTriggerType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <option.icon className="h-4 w-4" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
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
            <Label className="text-base font-semibold">Actions</Label>

            {/* Current Actions */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 bg-muted rounded-lg">
                {actions.map((action, index) => {
                  const actionOption = ACTION_OPTIONS.find(a => a.value === action.type);
                  return (
                    <div key={action.id} className="flex items-center gap-2">
                      {index > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                      <div className={`flex items-center gap-2 px-3 py-1.5 ${actionOption?.color || 'bg-gray-500'} rounded-full text-white text-sm`}>
                        <ActionIcon type={action.type} />
                        <span>{actionOption?.label}</span>
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
              <Select value={currentAction} onValueChange={setCurrentAction}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select action to add..." />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <div className={`p-1 rounded ${option.color}`}>
                          <option.icon className="h-3 w-3 text-white" />
                        </div>
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
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
          <Button onClick={handleCreate} disabled={!name || actions.length === 0 || isCreating}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowBuilderPageContent() {
  const [workflows, setWorkflows] = useState<Workflow[]>(SAMPLE_WORKFLOWS);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const filteredWorkflows = workflows.filter(w => {
    if (filter === 'active') return w.isActive;
    if (filter === 'paused') return !w.isActive;
    return true;
  });

  const handleToggle = (id: string) => {
    const workflow = workflows.find(w => w.id === id);
    const newState = !workflow?.isActive;
    setWorkflows(workflows.map(w =>
      w.id === id ? { ...w, isActive: !w.isActive } : w
    ));
    toast.success(newState ? 'Workflow activated' : 'Workflow paused');
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(id);
    try {
      setWorkflows(workflows.filter(w => w.id !== id));
      toast.success('Workflow deleted');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCreate = (newWorkflow: Omit<Workflow, 'id' | 'createdAt' | 'runsCount'>) => {
    const workflow: Workflow = {
      ...newWorkflow,
      id: `workflow_${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
      runsCount: 0
    };
    setWorkflows([workflow, ...workflows]);
    toast.success('Workflow created successfully');
  };

  const activeCount = workflows.filter(w => w.isActive).length;
  const totalRuns = workflows.reduce((sum, w) => sum + w.runsCount, 0);

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
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Workflow
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Workflows</p>
                    <p className="text-2xl font-bold">{workflows.length}</p>
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
                    <p className="text-2xl font-bold text-green-600">{activeCount}</p>
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
                    <p className="text-2xl font-bold">{totalRuns}</p>
                  </div>
                  <Zap className="h-8 w-8 text-yellow-500" />
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
              Active ({activeCount})
            </Button>
            <Button
              variant={filter === 'paused' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('paused')}
            >
              <Pause className="h-4 w-4 mr-1" />
              Paused ({workflows.length - activeCount})
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
                    Create your first workflow to automate lead communication
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
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  isDeleting={isDeleting === workflow.id}
                />
              ))
            )}
          </div>
        </div>

        <CreateWorkflowDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          onCreate={handleCreate}
        />
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
