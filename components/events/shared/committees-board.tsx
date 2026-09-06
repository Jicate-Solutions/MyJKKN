'use client';

// components/events/shared/committees-board.tsx
// Shared organizing-committees + prep-tasks board for ANY event type (Events Platform Promotion PR3).
// Committees list their lead, internal members (member_names) and external guests (name/phone, decision #8),
// plus a per-committee task checklist. Read-only when canManage is false.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, Users, UserPlus, Crown, Phone } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useEventCommittees,
  useCreateEventCommittee,
  useDeleteEventCommittee,
  useAddInternalMembers,
  useRemoveInternalMember,
  useAddExternalMember,
  useRemoveExternalMember,
  useCreateEventTask,
  useUpdateEventTask,
  useDeleteEventTask,
} from '@/hooks/events/shared/use-event-committees';
import { MemberPickerDialog } from './member-picker-dialog';
import type { MarathonCommittee, MarathonTask } from '@/types/events-marathon';

function AddCommitteeDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const create = useCreateEventCommittee(eventId);
  const [name, setName] = useState('');
  const [lead, setLead] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { event_id: eventId, name: name.trim(), lead_name: lead.trim() || undefined },
      {
        onSuccess: () => {
          setName('');
          setLead('');
          onClose();
        },
      }
    );
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Committee</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Committee Name *</Label>
            <Input placeholder="Logistics, Hospitality…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lead (name)</Label>
            <Input placeholder="Optional" value={lead} onChange={(e) => setLead(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim()}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddGuestDialog({
  open,
  onClose,
  committee,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  committee: MarathonCommittee | null;
  eventId: string;
}) {
  const add = useAddExternalMember(eventId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const submit = () => {
    if (!committee || !name.trim()) return;
    add.mutate(
      { committee, member: { name: name.trim(), phone: phone.trim() || undefined } },
      {
        onSuccess: () => {
          setName('');
          setPhone('');
          onClose();
        },
      }
    );
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Guest Member</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          External (non-JKKN) people — guest referees, parent volunteers. No login needed.
        </p>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input placeholder="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={add.isPending || !name.trim()}>
            {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add Guest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  eventId,
  canManage,
  canEditTasks,
}: {
  task: MarathonTask;
  eventId: string;
  canManage: boolean;
  /** Committee members may tick tasks without managing the event. */
  canEditTasks: boolean;
}) {
  const update = useUpdateEventTask(eventId);
  const del = useDeleteEventTask(eventId);
  const { profile } = useAuth();
  const done = task.status === 'completed';

  // Task-tier editors (tournament committee members: canEditTasks && !canManage) may
  // tick ONLY their own tasks — mirroring event_tasks' UPDATE policy, which admits a
  // plain member solely via assigned_to = auth.uid(). Ticking someone else's task
  // would be filtered by RLS and read as a no-op, so don't offer it. Managers keep
  // full control, and marathon (where canEditTasks defaults to canManage) is unchanged.
  const assignedToMe = !!profile?.id && task.assigned_to === profile.id;
  const editable = canManage || (canEditTasks && assignedToMe);

  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <Checkbox
        checked={done}
        disabled={!editable || update.isPending}
        title={
          editable
            ? undefined
            : canEditTasks
              ? 'Only the member this task is assigned to can tick it'
              : undefined
        }
        onCheckedChange={(v) => update.mutate({ id: task.id, dto: { status: v ? 'completed' : 'pending' } })}
      />
      <span className={`min-w-0 flex-1 truncate ${done ? 'text-muted-foreground line-through' : ''}`}>
        {task.title}
      </span>
      {task.assigned_to_name && (
        <span
          className={`shrink-0 text-[11px] ${
            assignedToMe ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
          }`}
        >
          {assignedToMe ? 'You' : task.assigned_to_name}
        </span>
      )}
      {canManage && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          disabled={del.isPending}
          onClick={() => del.mutate(task.id)}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

function CommitteeCard({
  committee,
  eventId,
  canManage,
  canEditTasks,
  onAddMember,
  onAddGuest,
}: {
  committee: MarathonCommittee;
  eventId: string;
  canManage: boolean;
  canEditTasks: boolean;
  onAddMember: (c: MarathonCommittee) => void;
  onAddGuest: (c: MarathonCommittee) => void;
}) {
  const del = useDeleteEventCommittee(eventId);
  const removeMember = useRemoveInternalMember(eventId);
  const removeGuest = useRemoveExternalMember(eventId);
  const createTask = useCreateEventTask(eventId);
  const [taskTitle, setTaskTitle] = useState('');
  const [assigneeIdx, setAssigneeIdx] = useState<string>('unassigned');
  const tasks = committee.tasks ?? [];
  const externals = committee.external_members ?? [];

  // Assignable people = internal members picked from the MyJKKN directory, i.e. the
  // slots where member_ids is index-aligned with member_names (see
  // EventCommitteeService.addInternalMembers). Legacy free-text committees have
  // names without ids; those can't be assigned because assigned_to must be an auth
  // uid for the member to pass event_tasks' UPDATE policy.
  const memberNames = committee.member_names ?? [];
  const memberIds = committee.member_ids ?? [];
  const assignable =
    memberIds.length === memberNames.length
      ? memberNames.map((name, i) => ({ idx: String(i), name, id: memberIds[i] }))
      : [];

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const picked = assignable.find((a) => a.idx === assigneeIdx);
    createTask.mutate(
      {
        event_id: eventId,
        committee_id: committee.id,
        title: taskTitle.trim(),
        // assigned_to is the auth uid — it is what event_tasks' UPDATE policy
        // compares against auth.uid(). Without it the assignee cannot tick the task.
        assigned_to: picked?.id,
        assigned_to_name: picked?.name,
      },
      {
        onSuccess: () => {
          setTaskTitle('');
          setAssigneeIdx('unassigned');
        },
      }
    );
  };

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="truncate font-semibold">{committee.name}</span>
            </div>
            {committee.lead_name && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Crown className="h-3 w-3" /> {committee.lead_name}
              </div>
            )}
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={del.isPending}
              onClick={() => del.mutate(committee.id)}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>

        {/* Members */}
        <div className="flex flex-wrap gap-1">
          {(committee.member_names ?? []).map((m, i) => (
            <Badge key={`m-${i}`} variant="secondary" className="gap-1 text-[10px]">
              {m}
              {canManage && (
                <button
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => removeMember.mutate({ committee, index: i })}
                  title="Remove member"
                >
                  ×
                </button>
              )}
            </Badge>
          ))}
          {externals.map((g, i) => (
            <Badge key={`g-${i}`} variant="outline" className="gap-1 text-[10px]">
              {g.name}
              {g.phone && <Phone className="h-2.5 w-2.5" />}
              {canManage && (
                <button
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => removeGuest.mutate({ committee, index: i })}
                  title="Remove guest"
                >
                  ×
                </button>
              )}
            </Badge>
          ))}
          {canManage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => onAddMember(committee)}
              >
                <UserPlus className="h-3 w-3" /> Member
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => onAddGuest(committee)}
              >
                <UserPlus className="h-3 w-3" /> Guest
              </Button>
            </>
          )}
        </div>

        {/* Tasks */}
        <div className="border-t pt-2">
          {tasks.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No tasks yet.</p>
          ) : (
            tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                eventId={eventId}
                canManage={canManage}
                canEditTasks={canEditTasks}
              />
            ))
          )}
          {/* Creating tasks is a manage action. It was previously gated on
              canEditTasks, which showed the box to view-only committee members. */}
          {canManage && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                className="h-8 min-w-[8rem] flex-1 text-xs"
                placeholder="Add a task…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
              {assignable.length > 0 && (
                <Select value={assigneeIdx} onValueChange={setAssigneeIdx}>
                  <SelectTrigger className="h-8 w-[9rem] text-xs">
                    <SelectValue placeholder="Assign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignable.map((a) => (
                      <SelectItem key={a.idx} value={a.idx}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" className="h-8" disabled={createTask.isPending || !taskTitle.trim()} onClick={addTask}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CommitteesBoard({
  eventId,
  canManage = true,
  canEditTasks,
}: {
  eventId: string;
  canManage?: boolean;
  /** Defaults to canManage. Tournament committee members get true while canManage is false. */
  canEditTasks?: boolean;
}) {
  const tasksEditable = canEditTasks ?? canManage;
  const { data: committees, isLoading } = useEventCommittees(eventId);
  const addMembers = useAddInternalMembers(eventId);
  const [addOpen, setAddOpen] = useState(false);
  const [memberFor, setMemberFor] = useState<MarathonCommittee | null>(null);
  const [guestFor, setGuestFor] = useState<MarathonCommittee | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Organizing Committees</h3>
          <p className="text-sm text-muted-foreground">Teams, members (incl. guests) and prep tasks.</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Committee
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (committees ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No committees yet{canManage ? ' — add the first one.' : '.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(committees ?? []).map((c) => (
            <CommitteeCard
              key={c.id}
              committee={c}
              eventId={eventId}
              canManage={canManage}
              canEditTasks={tasksEditable}
              onAddMember={(cm) => setMemberFor(cm)}
              onAddGuest={(cm) => setGuestFor(cm)}
            />
          ))}
        </div>
      )}

      <AddCommitteeDialog open={addOpen} onClose={() => setAddOpen(false)} eventId={eventId} />
      <MemberPickerDialog
        open={!!memberFor}
        onClose={() => setMemberFor(null)}
        committeeName={memberFor?.name}
        existingNames={memberFor?.member_names ?? []}
        isAdding={addMembers.isPending}
        onAdd={(people) => {
          if (!memberFor || people.length === 0) return;
          addMembers.mutate(
            { committee: memberFor, people },
            { onSuccess: () => setMemberFor(null) }
          );
        }}
      />
      <AddGuestDialog
        open={!!guestFor}
        onClose={() => setGuestFor(null)}
        committee={guestFor}
        eventId={eventId}
      />
    </div>
  );
}
