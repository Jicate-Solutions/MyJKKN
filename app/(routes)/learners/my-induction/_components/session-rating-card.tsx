'use client';

// Per-session value rating for the fresher (1–5 + optional comment).
// Mirrors the proven class-feedback button scale (lib pattern: brand #0b6d41,
// flex-1 buttons, selected = filled). Writes via InductionService.submitFeedback
// (the gated DEFINER RPC fn_induction_submit_feedback, upsert on session+learner).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { InductionService } from '@/lib/services/induction/induction-service';
import { RatingScale } from './rating-scale';

const BRAND = '#0b6d41';

interface Props {
  sessionId: string;
  initialRating?: number | null;
  initialComment?: string | null;
  onSubmitted?: (rating: number, comment: string | null) => void;
}

export function SessionRatingCard({ sessionId, initialRating, initialComment, onSubmitted }: Props) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [comment, setComment] = useState<string>(initialComment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [savedRating, setSavedRating] = useState<number | null>(initialRating ?? null);

  const dirty = rating !== savedRating || (comment ?? '') !== (initialComment ?? '');

  async function submit() {
    if (rating === null) {
      toast.error('Pick a rating from 1 to 5 first.');
      return;
    }
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      await InductionService.submitFeedback(sessionId, rating, trimmed === '' ? null : trimmed);
      setSavedRating(rating);
      toast.success('Thanks — your rating was saved.');
      onSubmitted?.(rating, trimmed === '' ? null : trimmed);
    } catch (e: any) {
      toast.error(`Couldn't save your rating: ${e?.message ?? 'unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          How valuable was this session?
        </Label>
        {savedRating !== null && !dirty && (
          <span className="flex items-center gap-1 text-xs" style={{ color: BRAND }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Rated {savedRating}/5
          </span>
        )}
      </div>

      <RatingScale value={rating} onChange={setRating} />

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything to add? (optional)"
        rows={2}
        className="resize-none text-sm"
      />

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting || rating === null || (!dirty && savedRating !== null)}
          style={{ backgroundColor: BRAND }}
          className="text-white hover:opacity-90"
        >
          {submitting ? 'Saving…' : savedRating !== null ? 'Update rating' : 'Submit rating'}
        </Button>
      </div>
    </div>
  );
}
