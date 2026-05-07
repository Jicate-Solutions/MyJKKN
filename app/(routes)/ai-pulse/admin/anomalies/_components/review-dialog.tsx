'use client';

// Created: 2026-05-06 — AI Pulse module v3 (Wave B.5 Anomaly Review console)
//
// Modal dialog for Champion / Co-Champion to render a verdict on a single
// anomaly flag. Three outcome buttons + optional notes textarea. On Save,
// writes review_outcome + review_notes + reviewed_by + reviewed_at via the
// service hook, which triggers React Query invalidation.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  useReviewAnomalyFlag,
  type AnomalyFlagRow,
  type AnomalyReviewOutcome,
} from '@/lib/services/ai-pulse/anomaly-service';

type Verdict = Exclude<AnomalyReviewOutcome, 'pending'>;

const VERDICT_OPTIONS: { value: Verdict; label: string; tone: 'destructive' | 'success' | 'secondary' }[] = [
  { value: 'confirmed_anomaly', label: 'Confirmed anomaly', tone: 'destructive' },
  { value: 'false_positive', label: 'False positive', tone: 'success' },
  { value: 'inconclusive', label: 'Inconclusive', tone: 'secondary' },
];

interface ReviewDialogProps {
  flag: AnomalyFlagRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewDialog({ flag, open, onOpenChange }: ReviewDialogProps) {
  const { profile } = useAuth();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [notes, setNotes] = useState<string>('');
  const reviewMutation = useReviewAnomalyFlag();

  const handleClose = (next: boolean) => {
    if (!next) {
      setVerdict(null);
      setNotes('');
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    if (!flag || !verdict) return;
    if (!profile?.id) {
      toast.error('No active session — cannot record reviewer.');
      return;
    }

    try {
      await reviewMutation.mutateAsync({
        id: flag.id,
        outcome: verdict,
        notes: notes.trim() ? notes.trim() : null,
        reviewerId: profile.id,
      });
      toast.success('Review saved.');
      handleClose(false);
    } catch (err) {
      console.error('[anomaly review-dialog] save failed:', err);
      toast.error('Failed to save review. Check permissions and try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Review anomaly flag</DialogTitle>
          <DialogDescription>
            Record your verdict and optional notes. Saving locks the flag with
            your user ID and a timestamp; reviewed flags drop off the pending list.
          </DialogDescription>
        </DialogHeader>

        {flag && (
          <div className='space-y-4 py-2'>
            <div className='rounded-md border border-border bg-muted/30 p-3 text-xs'>
              <div>
                <span className='text-muted-foreground'>Flag type: </span>
                <code className='font-mono'>{flag.flag_type}</code>
              </div>
              {flag.target_user_id && (
                <div className='mt-1'>
                  <span className='text-muted-foreground'>Target user: </span>
                  <code className='font-mono'>{flag.target_user_id}</code>
                </div>
              )}
              {flag.signal_value !== null && flag.signal_threshold !== null && (
                <div className='mt-1'>
                  <span className='text-muted-foreground'>Signal: </span>
                  <span className='font-medium'>{flag.signal_value}</span>
                  <span className='text-muted-foreground'> vs threshold </span>
                  <span className='font-medium'>{flag.signal_threshold}</span>
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <Label>Verdict</Label>
              <div className='flex flex-col gap-2 sm:flex-row'>
                {VERDICT_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type='button'
                    variant={verdict === opt.value ? 'default' : 'outline'}
                    className='flex-1'
                    onClick={() => setVerdict(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='review-notes'>
                Notes <span className='text-muted-foreground'>(optional)</span>
              </Label>
              <Textarea
                id='review-notes'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='Context, reasoning, or follow-up actions for this flag.'
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type='button'
            variant='ghost'
            onClick={() => handleClose(false)}
            disabled={reviewMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type='button'
            onClick={handleSave}
            disabled={!verdict || reviewMutation.isPending}
          >
            {reviewMutation.isPending && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
