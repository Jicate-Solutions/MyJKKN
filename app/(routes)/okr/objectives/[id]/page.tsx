'use client';

// ============================================================================
// OKR Objective Detail View
// Full TIER 1 support with all 11 sections
// Extended display for ai_integration_notes data
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import { OKRErrorBoundary } from '../../_components';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Target,
  Calendar,
  User,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Link2,
  ListTodo,
  ShieldAlert,
  TrendingUp,
  Edit2,
  Play,
  Archive,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Users,
  Lightbulb,
  DollarSign,
  Flag,
  Shield,
  Compass,
  Globe,
  Star
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// Hooks
import {
  useObjective,
  useUpdateObjective,
  useActivateObjective,
  useArchiveObjective,
  useDependenciesByObjective,
  useCreateDependency,
  useUpdateDependencyStatus,
  useDeleteDependency,
  useTasksByObjective,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useRisksByObjective,
  useCreateRisk,
  useUpdateRisk,
  useDeleteRisk,
  useCheckInsByKeyResult,
  useCreateCheckIn
} from '@/hooks/okr';

// Types
import type {
  OKRObjective,
  OKRKeyResult,
  OKRDependency,
  OKRTask,
  OKRRisk,
  OKRKRUpdateHistory,
  DependencyType,
  DependencyStatus,
  RiskLevel
} from '@/types/okr';

import { ABCD_CATEGORY_CONFIG, PROCESS_RATING_LABELS } from '@/types/okr';

// ABCD Components
import { ProcessRatingInput } from '../../_components/process-rating-input';

// ============================================================================
// STATUS BADGES
// ============================================================================

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  archived: 'bg-red-100 text-red-800',
  on_hold: 'bg-yellow-100 text-yellow-800'
};

const tierColors: Record<string, string> = {
  tier_1: 'bg-purple-100 text-purple-800 border-purple-200',
  tier_2: 'bg-blue-100 text-blue-800 border-blue-200',
  tier_3: 'bg-gray-100 text-gray-800 border-gray-200',
  '1': 'bg-purple-100 text-purple-800 border-purple-200',
  '2': 'bg-blue-100 text-blue-800 border-blue-200',
  '3': 'bg-gray-100 text-gray-800 border-gray-200'
};

const levelIcons: Record<string, React.ReactNode> = {
  organization: <Globe className="h-4 w-4" />,
  institution: <Building2 className="h-4 w-4" />,
  department: <Users className="h-4 w-4" />,
  individual: <User className="h-4 w-4" />
};

// ============================================================================
// EXTENDED DATA TYPES (from ai_integration_notes)
// ============================================================================

interface SuccessKPI {
  metric_name: string;
  target: string;
  measurement_frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
}

interface Stakeholder {
  name: string;
  role: string;
  involvement_type: 'sponsor' | 'owner' | 'contributor' | 'informed' | 'consulted';
}

interface ExtendedRisk {
  description: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation_strategy: string;
}

interface Milestone {
  title: string;
  target_date: string;
  description?: string;
}

interface ExtendedDependency {
  title: string;
  description: string;
  dependency_type: DependencyType;
  required_by_date?: string;
}

interface RACITask {
  title: string;
  description?: string;
  deadline?: string;
  responsible?: string;
  accountable?: string;
  consulted?: string[];
  informed?: string[];
}

interface ExtendedObjectiveData {
  vision_alignment?: string;
  mission_alignment?: string;
  stakeholder_impact?: string;
  impact_scope?: string;
  success_kpis?: SuccessKPI[];
  stakeholders?: Stakeholder[];
  dependencies?: ExtendedDependency[];
  tasks?: RACITask[];
  risks?: ExtendedRisk[];
  resources?: {
    budget?: string;
    people?: string;
    tools?: string;
    external_support?: string;
  };
  milestones?: Milestone[];
  contingency?: {
    plan?: string;
    alternative?: string;
    escalation?: string;
  };
  contingency_plan?: string; // For organization OKRs
}

function parseExtendedData(aiIntegrationNotes: string | null): ExtendedObjectiveData | null {
  if (!aiIntegrationNotes) return null;
  try {
    return JSON.parse(aiIntegrationNotes);
  } catch {
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getProgressColor(progress: number): string {
  if (progress >= 70) return 'bg-green-500';
  if (progress >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getRiskSeverity(likelihood: RiskLevel, impact: RiskLevel): number {
  const levels = { low: 1, medium: 2, high: 3 };
  return levels[likelihood] * levels[impact];
}

function getRiskBadgeColor(likelihood: RiskLevel, impact: RiskLevel): string {
  const severity = getRiskSeverity(likelihood, impact);
  if (severity >= 6) return 'bg-red-100 text-red-800';
  if (severity >= 3) return 'bg-yellow-100 text-yellow-800';
  return 'bg-green-100 text-green-800';
}

// ============================================================================
// KEY RESULT CARD COMPONENT
// ============================================================================

function KeyResultCard({
  keyResult,
  objectiveId
}: {
  keyResult: OKRKeyResult;
  objectiveId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [checkInValue, setCheckInValue] = useState('');
  const [checkInNote, setCheckInNote] = useState('');
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);

  const { data: checkIns } = useCheckInsByKeyResult(keyResult.id);
  const createCheckIn = useCreateCheckIn(keyResult.id);

  const progress = useMemo(() => {
    if (!keyResult.current_value || !keyResult.target_value) return 0;
    const range = keyResult.target_value - (keyResult.start_value || 0);
    if (range <= 0) return 0;
    const current = keyResult.current_value - (keyResult.start_value || 0);
    return Math.min(100, Math.max(0, (current / range) * 100));
  }, [keyResult]);

  const handleCheckIn = async () => {
    const value = parseFloat(checkInValue);
    if (isNaN(value)) return;

    await createCheckIn.mutateAsync({
      key_result_id: keyResult.id,
      check_in_value: value,
      notes: checkInNote || undefined
    });

    setCheckInValue('');
    setCheckInNote('');
    setShowCheckInDialog(false);
  };

  return (
    <Card className="border-l-4 border-l-[#0b6d41]">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 py-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-[#0b6d41]" />
                  {keyResult.title}
                </CardTitle>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span>
                    From {keyResult.start_value || 0} → {keyResult.target_value}{' '}
                    {keyResult.unit}
                  </span>
                  <span>Current: {keyResult.current_value || 0}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* ABCD Category Badge */}
                {keyResult.abcd_category && (
                  <Badge
                    className={cn(
                      'shrink-0',
                      keyResult.abcd_category === 'A' && 'bg-emerald-600 hover:bg-emerald-700',
                      keyResult.abcd_category === 'B' && 'bg-blue-600 hover:bg-blue-700',
                      keyResult.abcd_category === 'C' && 'bg-amber-600 hover:bg-amber-700',
                      keyResult.abcd_category === 'D' && 'bg-red-600 hover:bg-red-700 animate-pulse'
                    )}
                    title={keyResult.abcd_category ? ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.label : ''}
                  >
                    {keyResult.abcd_category}
                  </Badge>
                )}
                <div className="w-32">
                  <Progress value={progress} className="h-2" />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {Math.round(progress)}%
                </span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <Separator className="mb-4" />

            {/* ABCD Category Info */}
            {keyResult.abcd_category && (
              <div className={cn(
                'p-3 rounded-lg mb-4',
                ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.bgColor,
                ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.borderColor,
                'border'
              )}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={cn('font-semibold', ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.color)}>
                      Category {keyResult.abcd_category}: {ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.label}
                    </span>
                    <p className={cn('text-sm', ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.color)}>
                      {ABCD_CATEGORY_CONFIG[keyResult.abcd_category]?.action}
                    </p>
                  </div>
                  {keyResult.process_rating && (
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            'h-4 w-4',
                            star <= keyResult.process_rating!
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-gray-300'
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {keyResult.process_notes && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Note: {keyResult.process_notes}
                  </p>
                )}
              </div>
            )}

            {/* Process Rating Button */}
            <div className="mb-4">
              <ProcessRatingInput
                keyResultId={keyResult.id}
                currentRating={keyResult.process_rating}
                currentNotes={keyResult.process_notes}
              />
            </div>

            {/* Check-in History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Check-in History</h4>
                <Dialog
                  open={showCheckInDialog}
                  onOpenChange={setShowCheckInDialog}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Check-in
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Check-in</DialogTitle>
                      <DialogDescription>
                        Record your progress for this key result
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Current Value ({keyResult.unit})</Label>
                        <Input
                          type="number"
                          value={checkInValue}
                          onChange={(e) => setCheckInValue(e.target.value)}
                          placeholder={`Current: ${keyResult.current_value || 0}`}
                        />
                      </div>
                      <div>
                        <Label>Notes (optional)</Label>
                        <Textarea
                          value={checkInNote}
                          onChange={(e) => setCheckInNote(e.target.value)}
                          placeholder="What progress did you make?"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button
                        onClick={handleCheckIn}
                        disabled={createCheckIn.isPending}
                        className="bg-[#0b6d41] hover:bg-[#095432]"
                      >
                        Save Check-in
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {checkIns && checkIns.length > 0 ? (
                <div className="space-y-2">
                  {checkIns.slice(0, 5).map((checkIn: OKRKRUpdateHistory) => (
                    <div
                      key={checkIn.id}
                      className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="font-medium">
                          {checkIn.check_in_value} {keyResult.unit}
                        </span>
                        {checkIn.notes && (
                          <span className="text-gray-500">
                            - {checkIn.notes}
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-xs">
                        {format(new Date(checkIn.check_in_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No check-ins yet
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============================================================================
// DEPENDENCIES SECTION
// ============================================================================

function DependenciesSection({ objectiveId }: { objectiveId: string }) {
  const { data: dependencies, isLoading } =
    useDependenciesByObjective(objectiveId);
  const createDependency = useCreateDependency(objectiveId);
  const updateStatus = useUpdateDependencyStatus(objectiveId);
  const deleteDependency = useDeleteDependency(objectiveId);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDep, setNewDep] = useState({
    title: '',
    description: '',
    dependency_type: 'external' as DependencyType,
    required_by_date: ''
  });

  const handleAdd = async () => {
    await createDependency.mutateAsync({
      objective_id: objectiveId,
      ...newDep,
      required_by_date: newDep.required_by_date || undefined
    });
    setNewDep({
      title: '',
      description: '',
      dependency_type: 'external',
      required_by_date: ''
    });
    setShowAddDialog(false);
  };

  const statusColors: Record<DependencyStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    blocked: 'bg-red-100 text-red-800'
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[#0b6d41]" />
            Dependencies
          </CardTitle>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Dependency</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={newDep.title}
                    onChange={(e) =>
                      setNewDep({ ...newDep, title: e.target.value })
                    }
                    placeholder="What do you depend on?"
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={newDep.dependency_type}
                    onValueChange={(v) =>
                      setNewDep({
                        ...newDep,
                        dependency_type: v as DependencyType
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="external">External</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="resource">Resource</SelectItem>
                      <SelectItem value="budget">Budget</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Required By</Label>
                  <Input
                    type="date"
                    value={newDep.required_by_date}
                    onChange={(e) =>
                      setNewDep({ ...newDep, required_by_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={newDep.description}
                    onChange={(e) =>
                      setNewDep({ ...newDep, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleAdd}
                  disabled={!newDep.title || createDependency.isPending}
                  className="bg-[#0b6d41] hover:bg-[#095432]"
                >
                  Add Dependency
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {dependencies && dependencies.length > 0 ? (
          <div className="space-y-2">
            {dependencies.map((dep: OKRDependency) => (
              <div
                key={dep.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{dep.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {dep.dependency_type}
                    </Badge>
                  </div>
                  {dep.required_by_date && (
                    <span className="text-xs text-gray-500">
                      Due: {format(new Date(dep.required_by_date), 'MMM d')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={dep.status}
                    onValueChange={(v) =>
                      updateStatus.mutate({
                        id: dep.id,
                        status: v as DependencyStatus
                      })
                    }
                  >
                    <SelectTrigger className="w-28 h-8">
                      <Badge className={statusColors[dep.status]}>
                        {dep.status}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-500"
                    onClick={() => deleteDependency.mutate(dep.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No dependencies added
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TASKS SECTION (RACI)
// ============================================================================

function TasksSection({ objectiveId }: { objectiveId: string }) {
  const { data: tasks, isLoading } = useTasksByObjective(objectiveId);
  const createTask = useCreateTask(objectiveId);
  const updateTask = useUpdateTask(objectiveId);
  const deleteTask = useDeleteTask(objectiveId);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    deadline: ''
  });

  const handleAdd = async () => {
    await createTask.mutateAsync({
      objective_id: objectiveId,
      ...newTask,
      deadline: newTask.deadline || undefined
    });
    setNewTask({ title: '', description: '', deadline: '' });
    setShowAddDialog(false);
  };

  const taskStatusColors: Record<string, string> = {
    not_started: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    blocked: 'bg-red-100 text-red-800'
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-[#0b6d41]" />
            Tasks (RACI)
          </CardTitle>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={newTask.title}
                    onChange={(e) =>
                      setNewTask({ ...newTask, title: e.target.value })
                    }
                    placeholder="Task name"
                  />
                </div>
                <div>
                  <Label>Deadline</Label>
                  <Input
                    type="date"
                    value={newTask.deadline}
                    onChange={(e) =>
                      setNewTask({ ...newTask, deadline: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={newTask.description}
                    onChange={(e) =>
                      setNewTask({ ...newTask, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleAdd}
                  disabled={!newTask.title || createTask.isPending}
                  className="bg-[#0b6d41] hover:bg-[#095432]"
                >
                  Add Task
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {tasks && tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task: OKRTask) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {task.deadline && (
                      <span>
                        Due: {format(new Date(task.deadline), 'MMM d')}
                      </span>
                    )}
                    {task.responsible && (
                      <span>
                        R:{' '}
                        {task.responsible.first_name ||
                          task.responsible.email?.split('@')[0]}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={task.status}
                    onValueChange={(v) =>
                      updateTask.mutate({ id: task.id, data: { status: v } })
                    }
                  >
                    <SelectTrigger className="w-28 h-8">
                      <Badge className={taskStatusColors[task.status]}>
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_started">Not Started</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-500"
                    onClick={() => deleteTask.mutate(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No tasks added
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// RISKS SECTION
// ============================================================================

function RisksSection({ objectiveId }: { objectiveId: string }) {
  const { data: risks, isLoading } = useRisksByObjective(objectiveId);
  const createRisk = useCreateRisk(objectiveId);
  const updateRisk = useUpdateRisk(objectiveId);
  const deleteRisk = useDeleteRisk(objectiveId);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newRisk, setNewRisk] = useState({
    description: '',
    likelihood: 'medium' as RiskLevel,
    impact: 'medium' as RiskLevel,
    mitigation_strategy: ''
  });

  const handleAdd = async () => {
    await createRisk.mutateAsync({
      objective_id: objectiveId,
      ...newRisk
    });
    setNewRisk({
      description: '',
      likelihood: 'medium',
      impact: 'medium',
      mitigation_strategy: ''
    });
    setShowAddDialog(false);
  };

  const riskStatusColors: Record<string, string> = {
    identified: 'bg-gray-100 text-gray-800',
    monitoring: 'bg-blue-100 text-blue-800',
    mitigated: 'bg-green-100 text-green-800',
    occurred: 'bg-red-100 text-red-800'
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#0b6d41]" />
            Risks
          </CardTitle>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Risk</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Risk Description</Label>
                  <Textarea
                    value={newRisk.description}
                    onChange={(e) =>
                      setNewRisk({ ...newRisk, description: e.target.value })
                    }
                    placeholder="Describe the risk..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Likelihood</Label>
                    <Select
                      value={newRisk.likelihood}
                      onValueChange={(v) =>
                        setNewRisk({ ...newRisk, likelihood: v as RiskLevel })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Impact</Label>
                    <Select
                      value={newRisk.impact}
                      onValueChange={(v) =>
                        setNewRisk({ ...newRisk, impact: v as RiskLevel })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Mitigation Strategy</Label>
                  <Textarea
                    value={newRisk.mitigation_strategy}
                    onChange={(e) =>
                      setNewRisk({
                        ...newRisk,
                        mitigation_strategy: e.target.value
                      })
                    }
                    placeholder="How will you mitigate this risk?"
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleAdd}
                  disabled={!newRisk.description || createRisk.isPending}
                  className="bg-[#0b6d41] hover:bg-[#095432]"
                >
                  Add Risk
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {risks && risks.length > 0 ? (
          <div className="space-y-2">
            {risks.map((risk: OKRRisk) => (
              <div
                key={risk.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`h-4 w-4 ${
                        getRiskSeverity(risk.likelihood, risk.impact) >= 6
                          ? 'text-red-500'
                          : getRiskSeverity(risk.likelihood, risk.impact) >= 3
                            ? 'text-yellow-500'
                            : 'text-green-500'
                      }`}
                    />
                    <span className="font-medium text-sm line-clamp-1">{risk.description}</span>
                    <Badge
                      className={getRiskBadgeColor(
                        risk.likelihood,
                        risk.impact
                      )}
                    >
                      {risk.likelihood}/{risk.impact}
                    </Badge>
                  </div>
                  {risk.mitigation_strategy && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                      Mitigation: {risk.mitigation_strategy}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={risk.status}
                    onValueChange={(v) =>
                      updateRisk.mutate({ id: risk.id, data: { status: v } })
                    }
                  >
                    <SelectTrigger className="w-28 h-8">
                      <Badge className={riskStatusColors[risk.status]}>
                        {risk.status}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="monitoring">Monitoring</SelectItem>
                      <SelectItem value="mitigated">Mitigated</SelectItem>
                      <SelectItem value="occurred">Occurred</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-500"
                    onClick={() => deleteRisk.mutate(risk.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No risks identified
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// EXTENDED DATA DISPLAY COMPONENTS
// ============================================================================

// Strategic Context Section (Vision & Mission Alignment)
function StrategicContextSection({ extendedData }: { extendedData: ExtendedObjectiveData }) {
  const hasContent = extendedData.vision_alignment || extendedData.mission_alignment ||
                     extendedData.stakeholder_impact || extendedData.impact_scope;

  if (!hasContent) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-600" />
          Strategic Context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {extendedData.vision_alignment && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Compass className="h-4 w-4" />
              Vision Alignment
            </h4>
            <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">
              {extendedData.vision_alignment}
            </p>
          </div>
        )}
        {extendedData.mission_alignment && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Target className="h-4 w-4" />
              Mission Alignment
            </h4>
            <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">
              {extendedData.mission_alignment}
            </p>
          </div>
        )}
        {extendedData.impact_scope && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Globe className="h-4 w-4" />
              Impact Scope
            </h4>
            <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">
              {extendedData.impact_scope}
            </p>
          </div>
        )}
        {extendedData.stakeholder_impact && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Users className="h-4 w-4" />
              Stakeholder Impact
            </h4>
            <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">
              {extendedData.stakeholder_impact}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Success KPIs Section
function SuccessKPIsSection({ kpis }: { kpis: SuccessKPI[] }) {
  if (!kpis || kpis.length === 0) return null;

  const frequencyColors: Record<string, string> = {
    daily: 'bg-green-100 text-green-800',
    weekly: 'bg-blue-100 text-blue-800',
    monthly: 'bg-purple-100 text-purple-800',
    quarterly: 'bg-orange-100 text-orange-800'
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          Success KPIs ({kpis.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {kpis.map((kpi, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-sm">{kpi.metric_name}</p>
                  <p className="text-xs text-gray-500">Target: {kpi.target}</p>
                </div>
              </div>
              <Badge className={frequencyColors[kpi.measurement_frequency] || 'bg-gray-100'}>
                {kpi.measurement_frequency}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Stakeholders Section
function StakeholdersSection({ stakeholders }: { stakeholders: Stakeholder[] }) {
  if (!stakeholders || stakeholders.length === 0) return null;

  const involvementColors: Record<string, string> = {
    sponsor: 'bg-purple-100 text-purple-800 border-purple-200',
    owner: 'bg-green-100 text-green-800 border-green-200',
    contributor: 'bg-blue-100 text-blue-800 border-blue-200',
    consulted: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    informed: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-600" />
          Stakeholders ({stakeholders.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {stakeholders.map((stakeholder, index) => (
            <div key={index} className="p-3 bg-purple-50/50 rounded-lg border border-purple-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{stakeholder.name}</p>
                  <p className="text-xs text-gray-500">{stakeholder.role}</p>
                </div>
                <Badge className={involvementColors[stakeholder.involvement_type] || 'bg-gray-100'}>
                  {stakeholder.involvement_type}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Extended Dependencies Section (from ai_integration_notes)
function ExtendedDependenciesSection({ dependencies }: { dependencies: ExtendedDependency[] }) {
  if (!dependencies || dependencies.length === 0) return null;

  const typeColors: Record<string, string> = {
    external: 'bg-orange-100 text-orange-800',
    internal: 'bg-blue-100 text-blue-800',
    resource: 'bg-green-100 text-green-800',
    budget: 'bg-purple-100 text-purple-800'
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-5 w-5 text-orange-600" />
          Planned Dependencies ({dependencies.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {dependencies.map((dep, index) => (
            <div key={index} className="p-3 bg-orange-50/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{dep.title}</span>
                <div className="flex items-center gap-2">
                  <Badge className={typeColors[dep.dependency_type] || 'bg-gray-100'}>
                    {dep.dependency_type}
                  </Badge>
                  {dep.required_by_date && (
                    <span className="text-xs text-gray-500">
                      by {format(new Date(dep.required_by_date), 'MMM d')}
                    </span>
                  )}
                </div>
              </div>
              {dep.description && (
                <p className="text-xs text-gray-600">{dep.description}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Extended RACI Tasks Section
function ExtendedTasksSection({ tasks }: { tasks: RACITask[] }) {
  if (!tasks || tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-indigo-600" />
          Planned Tasks ({tasks.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tasks.map((task, index) => (
            <div key={index} className="p-3 bg-indigo-50/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{task.title}</span>
                {task.deadline && (
                  <span className="text-xs text-gray-500">
                    by {format(new Date(task.deadline), 'MMM d')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {task.responsible && (
                  <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                    R: {task.responsible}
                  </span>
                )}
                {task.accountable && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    A: {task.accountable}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Extended Risks Section (from ai_integration_notes)
function ExtendedRisksSection({ risks }: { risks: ExtendedRisk[] }) {
  if (!risks || risks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          Planned Risk Mitigation ({risks.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {risks.map((risk, index) => {
            const severity = getRiskSeverity(risk.likelihood, risk.impact);
            return (
              <div key={index} className="p-3 bg-red-50/50 rounded-lg">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`h-4 w-4 mt-0.5 ${
                        severity >= 6 ? 'text-red-500' : severity >= 3 ? 'text-yellow-500' : 'text-green-500'
                      }`}
                    />
                    <span className="font-medium text-sm">{risk.description}</span>
                  </div>
                  <Badge className={getRiskBadgeColor(risk.likelihood, risk.impact)}>
                    {risk.likelihood}/{risk.impact}
                  </Badge>
                </div>
                {risk.mitigation_strategy && (
                  <p className="text-xs text-gray-600 ml-6">
                    <span className="font-medium">Mitigation:</span> {risk.mitigation_strategy}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Resources Section
function ResourcesSection({ resources }: { resources: ExtendedObjectiveData['resources'] }) {
  if (!resources) return null;

  const hasContent = resources.budget || resources.people || resources.tools || resources.external_support;
  if (!hasContent) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          Resources Required
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {resources.budget && (
            <div className="p-3 bg-green-50 rounded-lg">
              <h4 className="text-xs font-medium text-green-700 mb-1">Budget</h4>
              <p className="text-sm text-gray-700">{resources.budget}</p>
            </div>
          )}
          {resources.people && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="text-xs font-medium text-blue-700 mb-1">People</h4>
              <p className="text-sm text-gray-700">{resources.people}</p>
            </div>
          )}
          {resources.tools && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <h4 className="text-xs font-medium text-purple-700 mb-1">Tools & Technology</h4>
              <p className="text-sm text-gray-700">{resources.tools}</p>
            </div>
          )}
          {resources.external_support && (
            <div className="p-3 bg-orange-50 rounded-lg">
              <h4 className="text-xs font-medium text-orange-700 mb-1">External Support</h4>
              <p className="text-sm text-gray-700">{resources.external_support}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Milestones Section
function MilestonesSection({ milestones }: { milestones: Milestone[] }) {
  if (!milestones || milestones.length === 0) return null;

  // Sort milestones by date
  const sortedMilestones = [...milestones].sort((a, b) => {
    if (!a.target_date) return 1;
    if (!b.target_date) return -1;
    return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flag className="h-5 w-5 text-blue-600" />
          Milestones ({milestones.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-blue-200" />

          <div className="space-y-4">
            {sortedMilestones.map((milestone, index) => {
              const isPast = milestone.target_date && new Date(milestone.target_date) < new Date();
              return (
                <div key={index} className="relative pl-10">
                  {/* Timeline dot */}
                  <div className={`absolute left-2 top-1 h-5 w-5 rounded-full flex items-center justify-center ${
                    isPast ? 'bg-green-500' : 'bg-blue-500'
                  }`}>
                    {isPast ? (
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    ) : (
                      <Flag className="h-3 w-3 text-white" />
                    )}
                  </div>

                  <div className={`p-3 rounded-lg ${isPast ? 'bg-green-50' : 'bg-blue-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{milestone.title}</span>
                      {milestone.target_date && (
                        <span className={`text-xs ${isPast ? 'text-green-600' : 'text-blue-600'}`}>
                          {format(new Date(milestone.target_date), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    {milestone.description && (
                      <p className="text-xs text-gray-600">{milestone.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Contingency Plan Section
function ContingencySection({ contingency, contingencyPlan }: {
  contingency?: ExtendedObjectiveData['contingency'];
  contingencyPlan?: string;
}) {
  const plan = contingency?.plan || contingencyPlan;
  const hasContent = plan || contingency?.alternative || contingency?.escalation;

  if (!hasContent) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5 text-gray-600" />
          Contingency Plan (Plan B)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-xs font-medium text-gray-700 mb-1">Primary Contingency</h4>
            <p className="text-sm text-gray-600">{plan}</p>
          </div>
        )}
        {contingency?.alternative && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-xs font-medium text-gray-700 mb-1">Alternative Approach</h4>
            <p className="text-sm text-gray-600">{contingency.alternative}</p>
          </div>
        )}
        {contingency?.escalation && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="text-xs font-medium text-gray-700 mb-1">Escalation Path</h4>
            <p className="text-sm text-gray-600">{contingency.escalation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function ObjectiveDetailPage() {
  const params = useParams();
  const router = useRouter();

  // Fix: Properly validate objectiveId to prevent "undefined" string bug
  const objectiveId = typeof params.id === 'string' && params.id !== 'undefined' && params.id.length > 0
    ? params.id
    : null;

  const { data: objective, isLoading, error } = useObjective(objectiveId || '');
  const activateObjective = useActivateObjective();
  const archiveObjective = useArchiveObjective();

  // Handle missing/invalid objectiveId
  if (!objectiveId) {
    return (
      <OKRErrorBoundary>
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Objective ID</h2>
            <p className="text-gray-500 mb-4">
              The objective ID is missing or invalid. Please select a valid objective.
            </p>
            <Button onClick={() => router.push('/okr/objectives')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Objectives
            </Button>
          </Card>
        </div>
      </OKRErrorBoundary>
    );
  }

  if (isLoading) {
    return (
      <OKRErrorBoundary>
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
      </OKRErrorBoundary>
    );
  }

  if (error || !objective) {
    return (
      <OKRErrorBoundary>
      <div className="container mx-auto p-6">
        <Card className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Objective Not Found</h2>
          <p className="text-gray-500 mb-4">
            The objective you are looking for does not exist or you do not have
            access.
          </p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </Card>
      </div>
      </OKRErrorBoundary>
    );
  }

  const showDependencies = objective.tier === 'tier_1' || objective.tier === 'tier_2';
  const showTasks = objective.tier === 'tier_1';
  const showRisks = objective.tier === 'tier_1';
  const isOrganizationLevel = objective.level === 'organization';

  // Parse extended data from ai_integration_notes
  const extendedData = parseExtendedData(objective.ai_integration_notes);
  const hasExtendedData = !!extendedData;

  // Determine tier display text
  const tierDisplayText = objective.tier?.startsWith('tier_')
    ? objective.tier.replace('tier_', 'TIER ')
    : `TIER ${objective.tier}`;

  return (
    <OKRErrorBoundary>
    <div className="container mx-auto p-6 space-y-6">
      {/* Organization Level Badge */}
      {isOrganizationLevel && (
        <div className="bg-gradient-to-r from-green-700 to-green-600 text-white p-4 rounded-lg flex items-center gap-3">
          <Globe className="h-8 w-8" />
          <div>
            <h3 className="font-bold text-lg">JKKN Group Organization OKR</h3>
            <p className="text-green-100 text-sm">
              This is a group-wide objective that applies to all 9 JKKN Institutions
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{objective.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={tierColors[objective.tier] || tierColors['tier_3']}>
                {tierDisplayText}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                {levelIcons[objective.level]}
                {objective.level}
              </Badge>
              <Badge className={statusColors[objective.status]}>
                {objective.status}
              </Badge>
              {isOrganizationLevel && (
                <Badge className="bg-green-700 text-white">
                  <Globe className="h-3 w-3 mr-1" />
                  JKKN Group
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {objective.status === 'draft' && (
            <Button
              onClick={() => activateObjective.mutate(objectiveId)}
              disabled={activateObjective.isPending}
              className="bg-[#0b6d41] hover:bg-[#095432]"
            >
              <Play className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {objective.status !== 'archived' && (
            <Button
              variant="outline"
              onClick={() => {
                archiveObjective.mutate(objectiveId);
                router.back();
              }}
              disabled={archiveObjective.isPending}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(`/okr/objectives/${objectiveId}/edit`)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <h3 className="font-medium">Overall Progress</h3>
              <p className="text-sm text-gray-500">
                Based on {objective.key_results?.length || 0} key results
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-[#0b6d41]">
                {Math.round(objective.overall_progress || 0)}%
              </span>
            </div>
          </div>
          <Progress
            value={objective.overall_progress || 0}
            className="h-3"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Calendar className="h-5 w-5 mx-auto text-gray-500 mb-1" />
              <p className="text-xs text-gray-500">Start Date</p>
              <p className="font-medium">
                {objective.start_date
                  ? format(new Date(objective.start_date), 'MMM d, yyyy')
                  : '-'}
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Clock className="h-5 w-5 mx-auto text-gray-500 mb-1" />
              <p className="text-xs text-gray-500">End Date</p>
              <p className="font-medium">
                {objective.end_date
                  ? format(new Date(objective.end_date), 'MMM d, yyyy')
                  : '-'}
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <User className="h-5 w-5 mx-auto text-gray-500 mb-1" />
              <p className="text-xs text-gray-500">Owner</p>
              <p className="font-medium">
                {objective.owner?.first_name ||
                  objective.owner?.email?.split('@')[0] ||
                  '-'}
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Target className="h-5 w-5 mx-auto text-gray-500 mb-1" />
              <p className="text-xs text-gray-500">Cycle</p>
              <p className="font-medium capitalize">
                {objective.cycle_type || '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {objective.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 whitespace-pre-wrap">
              {objective.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Results */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-[#0b6d41]" />
          Key Results ({objective.key_results?.length || 0})
        </h2>
        {objective.key_results && objective.key_results.length > 0 ? (
          objective.key_results.map((kr: OKRKeyResult) => (
            <KeyResultCard
              key={kr.id}
              keyResult={kr}
              objectiveId={objectiveId}
            />
          ))
        ) : (
          <Card className="p-8 text-center">
            <Target className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No key results defined yet</p>
          </Card>
        )}
      </div>

      {/* TIER 1 & 2: Dependencies */}
      {showDependencies && (
        <DependenciesSection objectiveId={objectiveId} />
      )}

      {/* TIER 1 Only: Tasks & Risks */}
      {showTasks && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TasksSection objectiveId={objectiveId} />
          {showRisks && <RisksSection objectiveId={objectiveId} />}
        </div>
      )}

      {/* ================================================================== */}
      {/* EXTENDED DATA SECTIONS (from ai_integration_notes) */}
      {/* ================================================================== */}
      {hasExtendedData && extendedData && (
        <>
          {/* Collapsible Extended Information */}
          <Collapsible defaultOpen={true}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-600" />
                      Extended Planning Information
                    </CardTitle>
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-6">
                  {/* Strategic Context */}
                  <StrategicContextSection extendedData={extendedData} />

                  {/* Success KPIs */}
                  {extendedData.success_kpis && extendedData.success_kpis.length > 0 && (
                    <SuccessKPIsSection kpis={extendedData.success_kpis} />
                  )}

                  {/* Stakeholders */}
                  {extendedData.stakeholders && extendedData.stakeholders.length > 0 && (
                    <StakeholdersSection stakeholders={extendedData.stakeholders} />
                  )}

                  {/* Extended Dependencies (from form, not DB) */}
                  {extendedData.dependencies && extendedData.dependencies.length > 0 && (
                    <ExtendedDependenciesSection dependencies={extendedData.dependencies} />
                  )}

                  {/* Extended Tasks (from form, not DB) */}
                  {extendedData.tasks && extendedData.tasks.length > 0 && (
                    <ExtendedTasksSection tasks={extendedData.tasks} />
                  )}

                  {/* Extended Risks (from form, not DB) */}
                  {extendedData.risks && extendedData.risks.length > 0 && (
                    <ExtendedRisksSection risks={extendedData.risks} />
                  )}

                  {/* Resources */}
                  {extendedData.resources && (
                    <ResourcesSection resources={extendedData.resources} />
                  )}

                  {/* Milestones */}
                  {extendedData.milestones && extendedData.milestones.length > 0 && (
                    <MilestonesSection milestones={extendedData.milestones} />
                  )}

                  {/* Contingency Plan */}
                  <ContingencySection
                    contingency={extendedData.contingency}
                    contingencyPlan={extendedData.contingency_plan}
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      )}

      {/* Parent Objective Link */}
      {objective.parent_objective && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[#0b6d41]" />
              Linked to Parent Objective
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() =>
                router.push(`/okr/objectives/${objective.parent_objective?.id}`)
              }
            >
              <span>{objective.parent_objective?.title}</span>
              <Badge variant="secondary">
                {Math.round(objective.parent_objective?.overall_progress || 0)}%
              </Badge>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
    </OKRErrorBoundary>
  );
}
