'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { AssigneePicker, NOBODY, useAssignablePeople } from '@/components/instasolver/assign';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { PRIORITY_META, PRIORITY_VALUES } from '@/lib/instasolver/constants';
import type { Priority } from '@/types/instasolver';

type BulkAssignDialogProps = {
  ids: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

/** Remounts per open, so the choices start fresh each time. */
export function BulkAssignDialog(props: BulkAssignDialogProps) {
  return <BulkAssignDialogInner key={String(props.open)} {...props} />;
}

function BulkAssignDialogInner({ ids, open, onOpenChange, onDone }: BulkAssignDialogProps) {
  const [priority, setPriority] = useState<Priority>('medium');
  const [teamId, setTeamId] = useState<number | null>(null);
  // A person as well as (or instead of) a team, as in the standalone app's
  // bulk assign: the same searchable picker, the chosen team's members first.
  const [assignee, setAssignee] = useState<string>(NOBODY);
  const { people, teamsByMember, activeTeams } = useAssignablePeople();

  const assign = useInstaSolverMutation(
    () =>
      InstaSolverIssueService.bulkTriage(ids, {
        priority,
        assigned_team_id: teamId,
        assigned_to: assignee === NOBODY ? null : assignee
      }),
    (r) => `${r.ok} ${r.ok === 1 ? 'issue' : 'issues'} assigned`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Assign {ids.length} {ids.length === 1 ? 'issue' : 'issues'}
          </DialogTitle>
          <DialogDescription>
            One priority, team and person for all of them. With a team and nobody named, a team member claims each
            job before starting it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Priority</Label>
            <RadioGroup
              value={priority}
              onValueChange={(v) => setPriority(v as Priority)}
              className="grid grid-cols-2 gap-2"
            >
              {PRIORITY_VALUES.map((p) => (
                <Label
                  key={p}
                  htmlFor={`bulk-prio-${p}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm font-normal',
                    priority === p && 'border-primary bg-primary/5'
                  )}
                >
                  <RadioGroupItem id={`bulk-prio-${p}`} value={p} />
                  {PRIORITY_META[p].label}
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-team">Team</Label>
            <Select value={teamId ? String(teamId) : ''} onValueChange={(v) => setTeamId(Number(v))}>
              <SelectTrigger id="bulk-team">
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent>
                {activeTeams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                    {t.category?.name ? ` — ${t.category.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-assignee">Person</Label>
            <AssigneePicker
              id="bulk-assignee"
              people={people}
              teamsByMember={teamsByMember}
              teamName={activeTeams.find((t) => t.id === teamId)?.name ?? null}
              value={assignee}
              onChange={setAssignee}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Leave it as “Nobody in particular” and the whole team sees them under “To claim”.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={(!teamId && assignee === NOBODY) || assign.isPending}
            onClick={() =>
              assign.mutate(undefined, {
                onSuccess: (r) => {
                  if (r.failed.length) toast.error(`Not assigned — ${r.failed.join('; ')}`, { duration: 8000 });
                  onDone();
                  onOpenChange(false);
                }
              })
            }
          >
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
