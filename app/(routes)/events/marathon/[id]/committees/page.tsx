'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMarathonCommittees,
  useTaskSummary,
  useCreateCommittee,
  useUpdateCommittee,
  useDeleteCommittee,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '@/hooks/events/marathon/use-marathon-committees';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import {
  Loader2,
  Plus,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  Trash2,
  ListTodo,
} from 'lucide-react';
import type {
  MarathonCommittee,
  MarathonTask,
  TaskStatus,
  TaskPriority,
  CreateMarathonCommitteeDto,
  CreateMarathonTaskDto,
} from '@/types/events-marathon';

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Pending', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400' },
  blocked: { label: 'Blocked', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
};

const STATUS_OPTIONS: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled', 'blocked'];
const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high', 'critical'];

// ============================================================================
// Summary Cards
// ============================================================================

function SummaryCards({ eventId }: { eventId: string }) {
  const { data: summary, isLoading } = useTaskSummary(eventId);

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Tasks',
      value: summary.total,
      icon: ListTodo,
      sub: `${summary.pending} pending`,
    },
    {
      label: 'Completed',
      value: summary.completed,
      icon: CheckCircle2,
      sub:
        summary.total > 0
          ? `${Math.round((summary.completed / summary.total) * 100)}% done`
          : '0% done',
    },
    {
      label: 'In Progress',
      value: summary.in_progress,
      icon: Clock,
      sub: 'Active now',
    },
    {
      label: 'Overdue',
      value: summary.overdue,
      icon: AlertTriangle,
      sub: 'Past due date',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Task Row
// ============================================================================

function TaskRow({
  task,
  eventId,
  onEdit,
}: {
  task: MarathonTask;
  eventId: string;
  onEdit: (task: MarathonTask) => void;
}) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const status = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;

  const isOverdue =
    task.due_date &&
    task.due_date < new Date().toISOString().split('T')[0] &&
    task.status !== 'completed' &&
    task.status !== 'cancelled';

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 items-center py-2 px-3 border-b last:border-0 hover:bg-muted/30 text-sm">
      {/* Title */}
      <div>
        <p className={`font-medium leading-tight ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
          {task.title}
        </p>
        {task.assigned_to_name && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {task.assigned_to_name}
          </p>
        )}
      </div>

      {/* Priority badge */}
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${priority.className}`}>
        {priority.label}
      </span>

      {/* Status badge */}
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${status.className}`}>
        {status.label}
      </span>

      {/* Due date */}
      <span className={`text-xs whitespace-nowrap ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
        {task.due_date
          ? new Date(task.due_date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
            })
          : '—'}
      </span>

      {/* Change status quick-select */}
      <Select
        value={task.status}
        onValueChange={(v) =>
          updateTask.mutate({
            id: task.id,
            eventId,
            dto: { status: v as TaskStatus },
          })
        }
      >
        <SelectTrigger className="h-6 text-[11px] w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STATUS_CONFIG[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => deleteTask.mutate({ id: task.id, eventId })}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============================================================================
// Committee Accordion Item
// ============================================================================

function CommitteeItem({
  committee,
  eventId,
  onAddTask,
  onEditTask,
  onEditCommittee,
}: {
  committee: MarathonCommittee;
  eventId: string;
  onAddTask: (committeeId: string) => void;
  onEditTask: (task: MarathonTask) => void;
  onEditCommittee: (committee: MarathonCommittee) => void;
}) {
  const deleteCommittee = useDeleteCommittee();

  const tasks = (committee.tasks ?? []) as MarathonTask[];
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalCount = tasks.length;

  return (
    <AccordionItem value={committee.id} className="border rounded-lg mb-3 overflow-hidden">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/30">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          {/* Committee name */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{committee.name}</p>
            {committee.lead_name && (
              <p className="text-xs text-muted-foreground truncate">
                Lead: {committee.lead_name}
              </p>
            )}
          </div>

          {/* Member count */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Users className="h-3.5 w-3.5" />
            {committee.member_names?.length ?? 0} members
          </div>

          {/* Task progress */}
          <Badge variant="secondary" className="text-xs shrink-0">
            {completedCount}/{totalCount} tasks
          </Badge>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditCommittee(committee)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit Committee
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() =>
                  deleteCommittee.mutate({ id: committee.id, eventId })
                }
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete Committee
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-0">
        {/* Task table header */}
        {tasks.length > 0 && (
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 px-3 py-1.5 bg-muted/50 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>Task</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Due</span>
            <span>Change Status</span>
            <span />
          </div>
        )}

        {/* Tasks */}
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No tasks yet. Add the first one below.
          </p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              eventId={eventId}
              onEdit={onEditTask}
            />
          ))
        )}

        {/* Add task button */}
        <div className="px-3 py-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onAddTask(committee.id)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Task
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ============================================================================
// Add / Edit Committee Dialog
// ============================================================================

function CommitteeDialog({
  open,
  onClose,
  eventId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  initial?: MarathonCommittee | null;
}) {
  const createCommittee = useCreateCommittee();
  const updateCommittee = useUpdateCommittee();

  const [form, setForm] = useState<Partial<CreateMarathonCommitteeDto>>({
    event_id: eventId,
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    lead_name: initial?.lead_name ?? '',
    member_names: initial?.member_names ?? [],
  });

  // Raw text for member_names input
  const [membersText, setMembersText] = useState(
    (initial?.member_names ?? []).join(', ')
  );

  const isEdit = !!initial;

  const handleSubmit = () => {
    if (!form.name?.trim()) return;

    const member_names = membersText
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    const payload = {
      event_id: eventId,
      name: form.name,
      description: form.description || undefined,
      lead_name: form.lead_name || undefined,
      member_names,
    };

    if (isEdit) {
      updateCommittee.mutate(
        { id: initial.id, dto: { ...payload, member_names } },
        { onSuccess: onClose }
      );
    } else {
      createCommittee.mutate(payload, { onSuccess: onClose });
    }
  };

  const set = (key: keyof CreateMarathonCommitteeDto, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isPending = createCommittee.isPending || updateCommittee.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Committee' : 'Add Committee'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Committee Name *</Label>
            <Input
              placeholder="e.g. Registration Committee"
              value={form.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              placeholder="What does this committee handle?"
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Lead Name</Label>
            <Input
              placeholder="e.g. Priya Sharma"
              value={form.lead_name ?? ''}
              onChange={(e) => set('lead_name', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Members (comma-separated)</Label>
            <Textarea
              placeholder="e.g. Ravi Kumar, Anita Singh, Suresh Babu"
              rows={2}
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Enter member names separated by commas.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !form.name?.trim()}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save Changes' : 'Create Committee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Add / Edit Task Dialog
// ============================================================================

function TaskDialog({
  open,
  onClose,
  eventId,
  committeeId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  committeeId: string;
  initial?: MarathonTask | null;
}) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [form, setForm] = useState<Partial<CreateMarathonTaskDto>>({
    committee_id: committeeId,
    event_id: eventId,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    priority: initial?.priority ?? 'medium',
    assigned_to_name: initial?.assigned_to_name ?? '',
    due_date: initial?.due_date ?? '',
  });

  const isEdit = !!initial;

  const handleSubmit = () => {
    if (!form.title?.trim()) return;

    const payload: CreateMarathonTaskDto = {
      committee_id: committeeId,
      event_id: eventId,
      title: form.title,
      description: form.description || undefined,
      priority: form.priority as TaskPriority,
      assigned_to_name: form.assigned_to_name || undefined,
      due_date: form.due_date || undefined,
    };

    if (isEdit) {
      updateTask.mutate(
        { id: initial.id, eventId, dto: payload },
        { onSuccess: onClose }
      );
    } else {
      createTask.mutate(payload, { onSuccess: onClose });
    }
  };

  const set = (key: keyof CreateMarathonTaskDto, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isPending = createTask.isPending || updateTask.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'Add Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Task Title *</Label>
            <Input
              placeholder="e.g. Set up registration desk"
              value={form.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              placeholder="Task details..."
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select
                value={form.priority ?? 'medium'}
                onValueChange={(v) => set('priority', v as TaskPriority)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p} className="text-sm">
                      {PRIORITY_CONFIG[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.due_date ?? ''}
                onChange={(e) => set('due_date', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Assigned To</Label>
            <Input
              placeholder="e.g. Ravi Kumar"
              value={form.assigned_to_name ?? ''}
              onChange={(e) => set('assigned_to_name', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !form.title?.trim()}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? 'Save Changes' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonCommitteesPage() {
  const params = useParams();
  const eventId = params.id as string;

  // Dialog state
  const [committeeDialogOpen, setCommitteeDialogOpen] = useState(false);
  const [editingCommittee, setEditingCommittee] = useState<MarathonCommittee | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskCommitteeId, setTaskCommitteeId] = useState('');
  const [editingTask, setEditingTask] = useState<MarathonTask | null>(null);

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data: committees, isLoading, error } = useMarathonCommittees(eventId);

  const handleAddTask = (committeeId: string) => {
    setTaskCommitteeId(committeeId);
    setEditingTask(null);
    setTaskDialogOpen(true);
  };

  const handleEditTask = (task: MarathonTask) => {
    setTaskCommitteeId(task.committee_id);
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const handleEditCommittee = (committee: MarathonCommittee) => {
    setEditingCommittee(committee);
    setCommitteeDialogOpen(true);
  };

  const handleCloseCommitteeDialog = () => {
    setCommitteeDialogOpen(false);
    setEditingCommittee(null);
  };

  const handleCloseTaskDialog = () => {
    setTaskDialogOpen(false);
    setEditingTask(null);
    setTaskCommitteeId('');
  };

  if (eventLoading) {
    return (
      <ContentLayout title="Committees">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} - Committees`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...', href: `/events/marathon/${eventId}/settings` },
          { label: 'Committees' },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Committees & Tasks</h1>
            <p className="text-sm text-muted-foreground">
              Manage organizing committees and track task progress for{' '}
              {event?.name ?? 'this event'}.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingCommittee(null);
              setCommitteeDialogOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Committee
          </Button>
        </div>

        {/* Summary cards */}
        <SummaryCards eventId={eventId} />

        {/* Loading / error */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load committees. Please try again.
          </div>
        )}

        {/* Committees accordion */}
        {!isLoading && !error && (
          <>
            {(committees ?? []).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No committees yet</p>
                <p className="text-sm mt-1">
                  Create your first committee to start organizing tasks.
                </p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-0">
                {(committees ?? []).map((committee) => (
                  <CommitteeItem
                    key={committee.id}
                    committee={committee}
                    eventId={eventId}
                    onAddTask={handleAddTask}
                    onEditTask={handleEditTask}
                    onEditCommittee={handleEditCommittee}
                  />
                ))}
              </Accordion>
            )}
          </>
        )}
      </div>

      {/* Committee dialog */}
      {committeeDialogOpen && (
        <CommitteeDialog
          open={committeeDialogOpen}
          onClose={handleCloseCommitteeDialog}
          eventId={eventId}
          initial={editingCommittee}
        />
      )}

      {/* Task dialog */}
      {taskDialogOpen && (
        <TaskDialog
          open={taskDialogOpen}
          onClose={handleCloseTaskDialog}
          eventId={eventId}
          committeeId={taskCommitteeId}
          initial={editingTask}
        />
      )}
    </ContentLayout>
  );
}
