'use client';

// The action dialogs shared by the issue record, the triage queue and the
// maintenance work queue: assign / reassign (with priority), reject (with a
// reason the reporter reads), and complete (notes + photograph of the work).
//
// AssignDialog is the standalone app's "Prioritise and assign" / "Reassign"
// dialog (C:\jkkn_instasolver app/(app)/issues/[id]/_components/issue-actions.tsx,
// TriageDialog), ported unchanged in behaviour: priority first (pre-selected
// from the reporter's severity), then the TEAM (pre-selected from the
// category's covering team), then the PERSON — a searchable picker with that
// team's members first and "Nobody in particular" — never pre-filled. A
// reassignment can carry a "why", saved as an internal note. Nothing is
// auto-assigned: the CAO's judgement is the point of triage.

import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import { InstaSolverActivityService } from '@/lib/services/instasolver/activity-service';
import { PRIORITY_META, PRIORITY_VALUES, SUGGESTED_PRIORITY_FOR_SEVERITY } from '@/lib/instasolver/constants';
import type { Issue, Priority } from '@/types/instasolver';
import { AssigneePicker, NOBODY, useAssignablePeople, useAssigneeSuggestions } from './assign';
import { PhotoUploader } from './photo-uploader';

const NONE = NOBODY;

type IssueLike = Pick<
  Issue,
  | 'id'
  | 'reference_no'
  | 'title'
  | 'status'
  | 'severity'
  | 'priority'
  | 'category_id'
  | 'institution_id'
  | 'assigned_to'
  | 'assigned_team_id'
> &
  Partial<Pick<Issue, 'assignee' | 'team' | 'category'>>;

// ---------------------------------------------------------------------------
// Prioritise and assign / Reassign
// ---------------------------------------------------------------------------
interface DialogProps<T> {
  issue: T | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Each dialog remounts per open (and per issue) through its `key`, so its form
 * state starts from the issue every time without a reset effect — and the
 * covering team is computed when the dialog opens, not at page load.
 */
function dialogKey(issue: { id: number } | null, open: boolean) {
  return `${issue?.id ?? 'none'}-${open ? 'open' : 'closed'}`;
}

export function AssignDialog(props: DialogProps<IssueLike>) {
  if (!props.open || !props.issue) return null;
  return <AssignDialogInner key={dialogKey(props.issue, props.open)} {...props} issue={props.issue} />;
}

function AssignDialogInner({
  issue,
  open,
  onOpenChange
}: DialogProps<IssueLike> & { issue: IssueLike }) {
  // Pending → first assignment. Assigned / In progress → reassignment, which
  // changes who holds it and leaves the status alone.
  const isReassign = issue.status !== 'pending';
  const { people, teamsByMember, activeTeams, isLoading } = useAssignablePeople();
  const { suggestions } = useAssigneeSuggestions(issue);

  // Opens with the priority the severity suggests; the CAO still decides.
  const suggested = SUGGESTED_PRIORITY_FOR_SEVERITY[issue.severity];
  const [priority, setPriority] = useState<Priority | ''>(issue.priority ?? suggested);

  // The TEAM is pre-selected from the category's covering team; the PERSON is
  // not — a name already in the box invites a hurried Assign, and team-only is
  // a legitimate outcome (it goes to that team's "To claim" queue).
  // Reassigning starts from exactly who holds it now.
  const firstSuggestion = isReassign ? undefined : suggestions[0];
  const currentAssignee = issue.assigned_to ?? NONE;
  const currentTeam = issue.assigned_team_id ? String(issue.assigned_team_id) : NONE;
  const [assignee, setAssignee] = useState<string>(currentAssignee);
  const [team, setTeam] = useState<string>(
    issue.assigned_team_id ? currentTeam : firstSuggestion ? String(firstSuggestion.teamId) : NONE
  );
  const [reason, setReason] = useState('');

  const teamPreselected = !issue.assigned_team_id && !!firstSuggestion && team === String(firstSuggestion.teamId);
  const unchanged =
    isReassign && assignee === currentAssignee && team === currentTeam && priority === (issue.priority ?? '');
  const holder = issue.assignee?.full_name ?? issue.team?.name ?? 'nobody';
  const canSubmit = !!priority && (assignee !== NONE || team !== NONE) && !unchanged;

  const save = useInstaSolverMutation(
    async () => {
      const target = {
        assigned_to: assignee === NONE ? null : assignee,
        assigned_team_id: team === NONE ? null : Number(team)
      };
      if (!isReassign) {
        await InstaSolverIssueService.triage(issue.id, { priority: priority as Priority, ...target });
        return;
      }
      if (priority && priority !== issue.priority) await InstaSolverIssueService.setPriority(issue.id, priority);
      if (target.assigned_to !== issue.assigned_to || target.assigned_team_id !== issue.assigned_team_id) {
        await InstaSolverIssueService.reassign(issue.id, target);
      }
      // The why of a reassignment goes on the record as an internal note,
      // beside the timeline entry the trigger already wrote.
      const why = reason.trim();
      if (why) await InstaSolverActivityService.addNote('issue', issue.id, `Reassigned from ${holder}: ${why}`, true);
    },
    () => `${issue.reference_no} ${isReassign ? 'reassigned' : 'assigned'}`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isReassign ? 'Reassign' : 'Prioritise and assign'}</DialogTitle>
          <DialogDescription>
            {issue.reference_no} · {issue.title}
            {isReassign ? (
              <span className="mt-1 block text-foreground">
                Currently with <span className="font-medium">{holder}</span>. The status stays as it is; the new
                person gets it straight away.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="triage-priority">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger id="triage-priority">
                <SelectValue placeholder="How urgently should this be acted on?" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {PRIORITY_META[v].label} — {PRIORITY_META[v].description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {issue.priority
                ? 'Required. The reporter set the severity; this is the institution’s decision about urgency.'
                : `Suggested from the reporter’s severity (${PRIORITY_META[suggested].label}). Change it if the institution sees the urgency differently.`}
            </p>
          </div>

          {/* Team first, person second: choosing the team lists its members at
              the top of the people list — "this is electrical; who on
              Electrical is free?" */}
          <div className="space-y-2">
            <Label htmlFor="triage-team">Assign to a team</Label>
            <Select value={team} onValueChange={setTeam} disabled={isLoading}>
              <SelectTrigger id="triage-team">
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No team</SelectItem>
                {activeTeams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {teamPreselected
                ? `Pre-selected: ${firstSuggestion?.teamName} covers ${issue.category?.name ?? 'this category'}. Change it if another team should take it.`
                : 'A team assignment with nobody named lets any member pick it up. Setting both names an owner while keeping the team able to cover.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="triage-assignee">Assign to a person</Label>
            <AssigneePicker
              id="triage-assignee"
              people={people}
              teamsByMember={teamsByMember}
              teamName={team === NONE ? null : activeTeams.find((t) => String(t.id) === team)?.name ?? null}
              value={assignee}
              onChange={setAssignee}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Leave it as “Nobody in particular” and the whole team sees it under “To claim”, for whoever
              is free to pick up.
            </p>
          </div>

          {isReassign ? (
            <div className="space-y-2">
              <Label htmlFor="reassign-reason">
                Why <span className="font-normal text-muted-foreground">— optional</span>
              </Label>
              <Textarea
                id="reassign-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Assigned to the wrong person / on leave this week / needs a licensed electrician"
              />
              <p className="text-xs text-muted-foreground">Saved as an internal note, so the team can see why it moved.</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            {save.isPending ? (isReassign ? 'Reassigning…' : 'Assigning…') : isReassign ? 'Reassign' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reject — with a reason the reporter can read
// ---------------------------------------------------------------------------
type RejectIssue = Pick<Issue, 'id' | 'reference_no' | 'status'>;

export function RejectDialog(props: DialogProps<RejectIssue>) {
  return <RejectDialogInner key={dialogKey(props.issue, props.open)} {...props} />;
}

function RejectDialogInner({ issue, open, onOpenChange }: DialogProps<RejectIssue>) {
  const [reason, setReason] = useState('');
  const reject = useInstaSolverMutation(
    () => InstaSolverIssueService.reject(issue!.id, issue!.status, reason),
    () => `${issue?.reference_no} rejected`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {issue?.reference_no}</DialogTitle>
          <DialogDescription>
            The reporter will see this reason. A duplicate? Say which report it duplicates.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Why is this being closed without work?"
          maxLength={1000}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 5 || reject.isPending}
            onClick={() => reject.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            {reject.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Complete — notes required; a photograph lets the reporter confirm remotely
// ---------------------------------------------------------------------------
type CompleteIssue = Pick<Issue, 'id' | 'reference_no' | 'institution_id'>;

export function CompleteDialog(props: DialogProps<CompleteIssue>) {
  return <CompleteDialogInner key={dialogKey(props.issue, props.open)} {...props} />;
}

function CompleteDialogInner({ issue, open, onOpenChange }: DialogProps<CompleteIssue>) {
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const complete = useInstaSolverMutation(
    () => InstaSolverIssueService.complete(issue!.id, notes, photos),
    () => `${issue?.reference_no} completed — the reporter will be asked to confirm`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {issue?.reference_no}</DialogTitle>
          <DialogDescription>
            Say what was done. A photograph of the finished work lets the reporter confirm without walking there.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="resolution-notes">What was done</Label>
            <Textarea
              id="resolution-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="e.g. Replaced the fan capacitor and tested at all speeds"
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Photograph of the finished work</Label>
            <PhotoUploader
              value={photos}
              onChange={setPhotos}
              kind="resolution"
              institutionId={issue?.institution_id}
              onBusyChange={setUploading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!notes.trim() || uploading || complete.isPending}
            onClick={() => complete.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            {complete.isPending ? 'Completing…' : 'Mark completed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
