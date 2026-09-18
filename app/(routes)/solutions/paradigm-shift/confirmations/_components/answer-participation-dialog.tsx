'use client';

/**
 * The two answers a head of department can give about their own department's
 * part in somebody else's community initiative: confirm it, with the hours our
 * people actually gave, or decline it with a note.
 *
 * One dialog, two modes, on purpose. Confirm and decline are the same decision
 * seen from two sides and they share every piece of context above the fold —
 * splitting them into two components meant maintaining the same initiative
 * summary twice, and the two copies drift.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  useConfirmParticipation,
  useDeclineParticipation,
  type ParticipationRow,
} from '@/hooks/solutions/use-participation-confirmations';

export type AnswerMode = 'confirm' | 'decline';

export function AnswerParticipationDialog({
  open,
  onOpenChange,
  mode,
  row,
  departmentId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  mode: AnswerMode;
  row: ParticipationRow | null;
  departmentId: string | null;
}) {
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');

  const confirmMutation = useConfirmParticipation(departmentId);
  const declineMutation = useDeclineParticipation(departmentId);
  const submitting = confirmMutation.isPending || declineMutation.isPending;

  // Reset on every open so a previous row's hours never ride along into the
  // next one. Answering the wrong initiative with the right number is a worse
  // failure than an empty box.
  useEffect(() => {
    if (open) {
      setHours('');
      setNote('');
    }
  }, [open, row?.id]);

  if (!row) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (mode === 'confirm') {
      let hoursValue: number | null = null;
      const typed = hours.trim();
      if (typed !== '') {
        hoursValue = Number(typed);
        if (!Number.isFinite(hoursValue) || hoursValue < 0) {
          toast.error('Hours must be a number, and cannot be negative.');
          return;
        }
      }
      try {
        await confirmMutation.mutateAsync({
          engagementId: row.engagement_id,
          hoursContributed: hoursValue,
        });
        toast.success(
          hoursValue === null
            ? 'Confirmed. Your department now counts on this initiative.'
            : `Confirmed, with ${hoursValue} hours from your department.`
        );
        onOpenChange(false);
      } catch (error) {
        toast.error((error as Error).message);
      }
      return;
    }

    if (note.trim().length < 3) {
      toast.error('Say briefly why your department is declining.');
      return;
    }
    try {
      await declineMutation.mutateAsync({ engagementId: row.engagement_id, note });
      toast.success('Declined. The record now says your department was asked and answered.');
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'confirm'
              ? 'Confirm your department took part'
              : 'Decline — your department did not take part'}
          </DialogTitle>
          <DialogDescription>
            {row.title} · {row.engagement_date}
            {row.lead_department_name ? ` · led by ${row.lead_department_name}` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {mode === 'confirm' ? (
            <>
              <div>
                <Label htmlFor='hours-contributed'>Hours our people gave</Label>
                <Input
                  id='hours-contributed'
                  type='number'
                  min={0}
                  step='0.5'
                  inputMode='decimal'
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder='e.g. 24'
                />
                <p className='mt-1 text-xs text-muted-foreground'>
                  Your department&apos;s own hours, not the whole initiative&apos;s
                  {row.hours_spent ? ` (the lead recorded ${row.hours_spent} in total)` : ''}.
                  Leave it blank if you are confirming without a figure — the
                  confirmation still counts, the hours simply stay unrecorded.
                </p>
              </div>
              <p className='rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground'>
                Confirming makes this initiative count for your college — all{' '}
                {row.beneficiaries_count} people it served, shared with every
                other confirmed college rather than divided between them. Until
                you confirm, your department counts for nothing here.
              </p>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor='decline-note'>Why are you declining?</Label>
                <Textarea
                  id='decline-note'
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={500}
                  placeholder='e.g. Our department was named in error — nobody from here attended.'
                />
                <p className='mt-1 text-xs text-muted-foreground'>
                  The note is the record. A declined row is kept deliberately: it
                  says your department was asked and answered, which is more
                  useful than the row disappearing.
                </p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={submitting} variant={mode === 'decline' ? 'destructive' : 'default'}>
              {submitting
                ? 'Saving…'
                : mode === 'confirm'
                  ? 'Confirm our part'
                  : 'Decline'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
