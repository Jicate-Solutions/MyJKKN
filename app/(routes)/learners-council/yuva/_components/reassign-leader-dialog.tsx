'use client';

// app/(routes)/learners-council/yuva/_components/reassign-leader-dialog.tsx
// Moves a YUVA Chapter Chair / Co-Chair seat to a different learner.
//
// WHY this exists: the YUVA Chapter Leaders directory listed every sitting
// Chair and Co-Chair with no edit action at all (BUG-05), so leadership data
// went stale with no way to correct it.
//
// WHY it composes two existing service calls instead of editing lc_members
// .user_id in place: the council progression path promotes previous-year
// Chapter and Vertical Chairs into the Learners Council, and it reads
// lc_position_history. assignMember() opens a history row for the incoming
// holder and updateMemberStatus() closes the outgoing one, so last year's
// record of who actually held the seat survives. Overwriting user_id would
// silently rewrite that history. Both service methods already existed —
// no new service capability was added.
//
// ORDER MATTERS: the incoming holder is seated FIRST, then the outgoing holder
// is closed. If the second step fails the seat shows two active holders, which
// is visible in this same list and can be corrected; the reverse order would
// fail to a silently vacant seat that this list (status = active) cannot show.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserCog } from 'lucide-react';
import { PersonPicker } from '@/app/(routes)/learners-council/structure/members/person-picker';
import {
  useAssignMember,
  useUpdateMemberStatus,
} from '@/hooks/learners-council/use-lc-structure';

interface ReassignLeaderDialogProps {
  /** lc_members.id of the sitting holder. */
  memberId: string;
  currentName: string;
  roleLabel: string;
  positionId: string | null;
  termId: string | null;
  institutionId: string | null;
}

export function ReassignLeaderDialog({
  memberId,
  currentName,
  roleLabel,
  positionId,
  termId,
  institutionId,
}: ReassignLeaderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');

  const assignMember = useAssignMember();
  const updateStatus = useUpdateMemberStatus();

  // A seat can only be moved when we know which position, term and institution
  // it belongs to — all three are required to seat the incoming holder.
  const isMovable = Boolean(positionId && termId && institutionId);
  const isPending = assignMember.isPending || updateStatus.isPending;

  const handleSubmit = async () => {
    if (!userId || !positionId || !termId || !institutionId) return;

    await assignMember.mutateAsync({
      term_id: termId,
      position_id: positionId,
      user_id: userId,
      institution_id: institutionId,
      appointment_notes: `Reassigned from ${currentName}`,
    });
    await updateStatus.mutateAsync({ id: memberId, status: 'removed' });

    setUserId('');
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={!isMovable}
          title={
            isMovable
              ? 'Move this role to a different learner'
              : 'This record is missing its term or institution, so the role cannot be moved from here'
          }
        >
          <UserCog className="mr-1 h-3 w-3" />
          Reassign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {roleLabel}</DialogTitle>
          <DialogDescription>
            {currentName} currently holds this role. Choose the learner taking it
            over — {currentName} is stepped down and the handover is recorded in
            the position history the council progression path reads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor={`reassign-${memberId}`}>New holder</Label>
            <PersonPicker
              id={`reassign-${memberId}`}
              value={userId}
              onChange={setUserId}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Search by name or email. Only learners from institutions you can
              access are listed.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!userId || !isMovable || isPending}>
            {isPending ? 'Reassigning...' : 'Reassign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
