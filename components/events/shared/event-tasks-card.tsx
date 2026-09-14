'use client';

// components/events/shared/event-tasks-card.tsx
//
// The "Pending Tasks" card on the event detail console — what is still
// outstanding before this event can run, and the door to adding more. Sits with
// the Registration forms and Feedback cards rather than inside the Event
// Logistics tab strip, because an outstanding-work list nobody sees is not a
// task list.
//
// ── Two kinds of row, one list ──────────────────────────────────────────────
// It reads every event_tasks row for the event, which is deliberately a mix:
//
//   * EVENT-LEVEL tasks (committee_id IS NULL) — this card owns them. Add, tick,
//     delete, all gated on `canManage`.
//   * COMMITTEE prep-tasks (committee_id IS NOT NULL) — shown READ-ONLY, tagged
//     with the committee's name, with a pointer to the Committees tab.
//
// Committee rows are read-only here even for a super admin, who has every right
// to edit them, because they answer to a DIFFERENT write policy
// (fn_can_manage_committee_tasks, which also admits committee leads and
// assignees). Offering two authorities behind one identical-looking checkbox is
// how a permission bug gets built. The card's job is to make them VISIBLE — the
// Committees board remains the one place they are edited.
//
// ── Who sees it, who edits it ───────────────────────────────────────────────
// The card gates ITSELF, via useEventTaskAccess — every console just renders
// <EventTasksCard eventId={id} /> and gets the right behaviour. That is
// deliberate: this card appears on four consoles that each resolve "who runs
// this event" differently, and a `canManage` prop would have meant four
// hand-written copies of one rule, each free to drift from the RLS policy.
//
// The hook asks fn_can_manage_event_level_tasks — the same SQL function the
// event_tasks_event_level_write policy calls — so a button appears exactly when
// the write would succeed. Students get nothing rendered at all.
//
// In particular the rule is NOT the general page's `canEdit` (canEditEvent),
// which recognises the event's CREATOR. A creator who is not an in-charge may
// edit the event but not its tasks; wiring canEdit here would paint buttons
// whose every click RLS refuses.

import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Loader2,
  Lock,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateEventTask,
  useDeleteEventTask,
  useEventTasks,
  useUpdateEventTask,
} from '@/hooks/events/shared/use-event-tasks';
import { useEventTaskAccess } from '@/hooks/events/shared/use-event-task-access';
import { OPEN_TASK_STATUSES, type EventTaskRow } from '@/lib/services/events/shared/event-task-service';
import type { TaskPriority } from '@/types/events-marathon';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Only the two urgent tiers get colour — if everything is highlighted, nothing is. */
const PRIORITY_STYLE: Record<TaskPriority, string> = {
  critical: 'border-destructive/40 bg-destructive/10 text-destructive',
  high: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  medium: 'text-muted-foreground',
  low: 'text-muted-foreground',
};

/** Local midnight today, so "overdue" flips at the day boundary, not at 00:00 UTC. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "Due 12 Sep", "Due today", "Overdue — 3 Sep". null when the task has no date. */
function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null;
  // due_date is a `date` column ("2026-09-12"). Parsing that bare string gives
  // UTC midnight, which reads as the PREVIOUS day for anyone behind UTC — so
  // build the date from its parts in local time instead.
  const [y, m, d] = due.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  const today = startOfToday();
  const pretty = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  if (date.getTime() === today.getTime()) return { text: 'Due today', overdue: false };
  if (date < today) return { text: `Overdue — ${pretty}`, overdue: true };
  return { text: `Due ${pretty}`, overdue: false };
}

function TaskLine({
  task,
  eventId,
  canManage,
}: {
  task: EventTaskRow;
  eventId: string;
  canManage: boolean;
}) {
  const update = useUpdateEventTask(eventId);
  const del = useDeleteEventTask(eventId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const done = task.status === 'completed';
  const fromCommittee = task.committee_id !== null;
  // See the file header: committee rows answer to another write policy and stay
  // read-only here whatever the viewer holds.
  const editable = canManage && !fromCommittee;
  const due = dueLabel(task.due_date);

  return (
    <div className="flex items-start gap-2.5 border-b py-2 last:border-b-0">
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={!editable || update.isPending}
        title={
          fromCommittee
            ? 'Managed on the Committees tab'
            : canManage
              ? undefined
              : 'Only a super admin or the event in-charge can change tasks'
        }
        onCheckedChange={(v) =>
          update.mutate({ id: task.id, dto: { status: v ? 'completed' : 'pending' } })
        }
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={`break-words text-sm ${done ? 'text-muted-foreground line-through' : ''}`}>
          {task.title}
        </p>

        {task.description && (
          <p className="whitespace-pre-line break-words text-xs text-muted-foreground">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5">
          {task.priority && task.priority !== 'medium' && task.priority !== 'low' && (
            <Badge
              variant="outline"
              className={`h-4 px-1.5 text-[10px] font-normal ${PRIORITY_STYLE[task.priority]}`}
            >
              {PRIORITY_LABEL[task.priority]}
            </Badge>
          )}

          {due && !done && (
            <span
              className={`flex items-center gap-1 text-[11px] ${
                due.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
              }`}
            >
              <CalendarClock className="h-3 w-3" />
              {due.text}
            </span>
          )}

          {task.assigned_to_name && (
            <span className="text-[11px] text-muted-foreground">{task.assigned_to_name}</span>
          )}

          {fromCommittee && (
            <span
              className="flex items-center gap-1 text-[11px] text-muted-foreground"
              title="This task belongs to a committee — edit it on the Committees tab"
            >
              <Users className="h-3 w-3" />
              {task.committee_name ?? 'Committee'}
              <Lock className="h-2.5 w-2.5 opacity-60" />
            </span>
          )}
        </div>
      </div>

      {editable && (
        // Two-step delete rather than an AlertDialog: a task is cheap to retype,
        // and opening a modal from inside a list row is the exact Radix nesting
        // that traps pointer events elsewhere in this codebase.
        <Button
          size="sm"
          variant="ghost"
          className={`h-6 shrink-0 px-1.5 ${confirmingDelete ? 'text-destructive' : ''}`}
          disabled={del.isPending}
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              window.setTimeout(() => setConfirmingDelete(false), 3000);
              return;
            }
            del.mutate(task.id);
          }}
        >
          {del.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : confirmingDelete ? (
            <span className="text-[10px]">Sure?</span>
          ) : (
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
      )}
    </div>
  );
}

function AddTaskDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const create = useCreateEventTask(eventId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setAssignee('');
  };

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        event_id: eventId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        // Free text, like the committee boards' assignees: the person
        // responsible is often an external helper with no MyJKKN profile.
        assigned_to_name: assignee.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
          <DialogDescription>
            Something that has to happen before this event can run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Task *</Label>
            <Input
              autoFocus
              placeholder="Book the auditorium"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              // Enter submits from the single-line field only — the textarea
              // below needs Enter for newlines.
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional detail — who to contact, what is blocking it…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['critical', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Owner</Label>
            <Input
              placeholder="Who is doing it (optional)"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventTasksCard({ eventId }: { eventId: string }) {
  const { canView, canManage } = useEventTaskAccess(eventId);
  // Render nothing for students — not a disabled card, not an empty one. The
  // SELECT policy would hand them an empty list anyway; this just avoids showing
  // a learner an internal work list they can never populate.
  const { data: tasks, isLoading, isError, error } = useEventTasks(eventId, canView);
  const [addOpen, setAddOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const { outstanding, closed } = useMemo(() => {
    const all = tasks ?? [];
    return {
      outstanding: all.filter((t) => (OPEN_TASK_STATUSES as string[]).includes(t.status)),
      // 'cancelled' is neither pending nor an achievement — it belongs in the
      // collapsed section, not on the outstanding list.
      closed: all.filter((t) => !(OPEN_TASK_STATUSES as string[]).includes(t.status)),
    };
  }, [tasks]);

  // After every hook, never before — an early return above `useMemo` would
  // change the hook count between renders the moment the permission answer
  // arrives, which React treats as a fatal error rather than a re-render.
  if (!canView) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Pending Tasks
              {outstanding.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {outstanding.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              What still has to happen before this event can run.
              {!canManage && ' Only a super admin or the event in-charge can change this list.'}
            </CardDescription>
          </div>

          {canManage && (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add task
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        )}

        {isError && (
          <p className="py-4 text-sm text-destructive">
            {(error as Error)?.message ?? 'The task list could not be loaded.'}
          </p>
        )}

        {!isLoading && !isError && outstanding.length === 0 && closed.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {canManage
              ? 'No tasks yet — add the first thing that has to happen.'
              : 'No tasks have been recorded for this event.'}
          </p>
        )}

        {!isLoading && !isError && outstanding.length === 0 && closed.length > 0 && (
          <p className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Everything on the list is done.
          </p>
        )}

        {outstanding.length > 0 && (
          <div className="-my-2">
            {outstanding.map((t) => (
              <TaskLine key={t.id} task={t} eventId={eventId} canManage={canManage} />
            ))}
          </div>
        )}

        {closed.length > 0 && (
          <div className={outstanding.length > 0 ? 'mt-3 border-t pt-2' : 'mt-1'}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-1.5 text-xs text-muted-foreground"
              onClick={() => setShowDone((s) => !s)}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showDone ? '' : '-rotate-90'}`}
              />
              {closed.length} closed
            </Button>
            {showDone && (
              <div className="-my-2 pt-1">
                {closed.map((t) => (
                  <TaskLine key={t.id} task={t} eventId={eventId} canManage={canManage} />
                ))}
              </div>
            )}
          </div>
        )}

        {(outstanding.some((t) => t.committee_id) || closed.some((t) => t.committee_id)) && (
          <p className="mt-3 flex items-center gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" />
            Tasks marked with a committee are managed on Event Logistics →
            Committees.
          </p>
        )}
      </CardContent>

      {canManage && (
        <AddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} eventId={eventId} />
      )}
    </Card>
  );
}
