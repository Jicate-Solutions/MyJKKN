'use client';

import { useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  HandHelping,
  Pencil,
  Play,
  RotateCcw,
  Undo2,
  UserCheck,
  Users
} from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AssignDialog, CompleteDialog, RejectDialog } from '@/components/instasolver/issue-dialogs';
import { QuickAssign, useAssigneeSuggestions } from '@/components/instasolver/assign';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import type { InstaSolverAccess, Issue } from '@/types/instasolver';
import { ConfirmationPanel } from './confirmation-panel';
import { EditIssueDialog } from './edit-issue-dialog';

type Open = 'assign' | 'reject' | 'reopen' | 'complete' | 'edit' | 'withdraw' | 'takeover' | null;

type ReopenDialogProps = {
  issue: Issue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Remounts per open, so the reason starts empty each time. */
function ReopenDialog(props: ReopenDialogProps) {
  return <ReopenDialogInner key={`${props.issue.id}-${props.open}`} {...props} />;
}

function ReopenDialogInner({ issue, open, onOpenChange }: ReopenDialogProps) {
  const [reason, setReason] = useState('');
  const reopen = useInstaSolverMutation(
    () => InstaSolverIssueService.reopen(issue.id, reason),
    () => `${issue.reference_no} reopened`
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {issue.reference_no}</DialogTitle>
          <DialogDescription>
            It goes back to in progress and the reporter’s confirmation is cleared. The reason is optional and is kept as
            an internal note.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Why is it being reopened? (optional)"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={reopen.isPending} onClick={() => reopen.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {reopen.isPending ? 'Reopening…' : 'Reopen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NextActionPanel({ issue, access }: { issue: Issue; access: InstaSolverAccess }) {
  const [open, setOpen] = useState<Open>(null);
  const uid = access.user_id;

  const isManager = access.is_manager;
  const isReporter = !!uid && issue.reported_by === uid;
  const isWorker =
    !!uid &&
    (issue.assigned_to === uid ||
      (issue.assigned_team_id !== null && access.team_ids.includes(issue.assigned_team_id)));
  const mine = !!uid && issue.assigned_to === uid;
  const heldByOther = !!issue.assigned_to && !mine;
  const holder = issue.assignee?.full_name ?? 'a teammate';

  const { suggestions } = useAssigneeSuggestions(issue, isManager && issue.status === 'pending');
  const hasSuggestion = suggestions.length > 0;

  const start = useInstaSolverMutation(() => InstaSolverIssueService.start(issue), `${issue.reference_no} started`);
  const claim = useInstaSolverMutation(() => InstaSolverIssueService.claim(issue.id), `${issue.reference_no} is now yours`);
  const withdraw = useInstaSolverMutation(() => InstaSolverIssueService.withdraw(issue.id), `${issue.reference_no} withdrawn`);

  const actions: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => actions.push(<div key={key}>{node}</div>);

  if (isManager) {
    if (issue.status === 'pending') {
      // Team first, person second (standalone issue-actions.tsx, 2026-09-24):
      // "Assign team" opens the dialog on the category's covering team with
      // nobody named; "Assign member" is the one-click shortcut to a named
      // person from that team. No covering team → "Prioritise and assign".
      add(
        'assign',
        <Button className="w-full" onClick={() => setOpen('assign')}>
          {hasSuggestion ? <Users className="mr-1.5 h-4 w-4" /> : <UserCheck className="mr-1.5 h-4 w-4" />}
          {hasSuggestion ? 'Assign team' : 'Prioritise and assign'}
        </Button>
      );
      if (hasSuggestion) add('quick', <QuickAssign issue={issue} canAssign={isManager} className="w-full" />);
      add('reject', <Button className="w-full" variant="destructive" onClick={() => setOpen('reject')}><Ban className="mr-1.5 h-4 w-4" /> Reject</Button>);
    } else if (issue.status === 'assigned' || issue.status === 'in_progress') {
      // A wrong assignment is fixed by reassigning, not by rejecting.
      add('reassign', <Button className="w-full" variant="outline" onClick={() => setOpen('assign')}><ArrowRightLeft className="mr-1.5 h-4 w-4" /> Reassign</Button>);
      add('reject', <Button className="w-full" variant="destructive" onClick={() => setOpen('reject')}><Ban className="mr-1.5 h-4 w-4" /> Reject</Button>);
    } else if (issue.status === 'completed') {
      add('reopen', <Button className="w-full" variant="outline" onClick={() => setOpen('reopen')}><RotateCcw className="mr-1.5 h-4 w-4" /> Reopen</Button>);
    }
  }

  if (isWorker) {
    if (issue.status === 'assigned') {
      if (!heldByOther) {
        add(
          'start',
          <Button className="w-full" disabled={start.isPending} onClick={() => start.mutate(undefined)}>
            <Play className="mr-1.5 h-4 w-4" /> {start.isPending ? 'Starting…' : 'Start work'}
          </Button>
        );
        if (!issue.assigned_to) {
          add(
            'claim',
            <Button className="w-full" variant="outline" disabled={claim.isPending} onClick={() => claim.mutate(undefined)}>
              <HandHelping className="mr-1.5 h-4 w-4" /> Claim for me
            </Button>
          );
        }
      } else {
        add('takeover', <Button className="w-full" variant="outline" onClick={() => setOpen('takeover')}><HandHelping className="mr-1.5 h-4 w-4" /> Take over</Button>);
      }
    } else if (issue.status === 'in_progress') {
      if (mine) {
        add('complete', <Button className="w-full" onClick={() => setOpen('complete')}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Complete</Button>);
      } else if (heldByOther) {
        add('takeover', <Button className="w-full" variant="outline" onClick={() => setOpen('takeover')}><HandHelping className="mr-1.5 h-4 w-4" /> Take over</Button>);
      } else {
        add(
          'claim',
          <Button className="w-full" disabled={claim.isPending} onClick={() => claim.mutate(undefined)}>
            <HandHelping className="mr-1.5 h-4 w-4" /> Claim for me
          </Button>
        );
      }
    }
  }

  if (isReporter && issue.status === 'pending') {
    add('edit', <Button className="w-full" variant="outline" onClick={() => setOpen('edit')}><Pencil className="mr-1.5 h-4 w-4" /> Edit report</Button>);
    add('withdraw', <Button className="w-full" variant="outline" onClick={() => setOpen('withdraw')}><Undo2 className="mr-1.5 h-4 w-4" /> Withdraw</Button>);
  }

  const needsConfirmation =
    isReporter && issue.status === 'completed' && !issue.resolution_confirmed_at && !issue.resolution_disputed_at;

  if (!actions.length && !needsConfirmation) return null;

  return (
    <div className="space-y-4">
      {needsConfirmation && <ConfirmationPanel issue={issue} />}

      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Next action</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{actions}</CardContent>
        </Card>
      )}

      <AssignDialog issue={issue} open={open === 'assign'} onOpenChange={(o) => setOpen(o ? 'assign' : null)} />
      <RejectDialog issue={issue} open={open === 'reject'} onOpenChange={(o) => setOpen(o ? 'reject' : null)} />
      <CompleteDialog issue={issue} open={open === 'complete'} onOpenChange={(o) => setOpen(o ? 'complete' : null)} />
      <ReopenDialog issue={issue} open={open === 'reopen'} onOpenChange={(o) => setOpen(o ? 'reopen' : null)} />
      {isReporter && issue.status === 'pending' && (
        <EditIssueDialog issue={issue} open={open === 'edit'} onOpenChange={(o) => setOpen(o ? 'edit' : null)} />
      )}

      <AlertDialog open={open === 'withdraw'} onOpenChange={(o) => setOpen(o ? 'withdraw' : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw {issue.reference_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              The issue is closed and nobody will work on it. It stays on record; you can report it again if it comes back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => withdraw.mutate(undefined)}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={open === 'takeover'} onOpenChange={(o) => setOpen(o ? 'takeover' : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This is held by {holder}. Take it over?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be assigned to you and {holder} will no longer have it. Tell them before you do, if you can.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Leave it</AlertDialogCancel>
            <AlertDialogAction onClick={() => claim.mutate(undefined)}>Take it over</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
