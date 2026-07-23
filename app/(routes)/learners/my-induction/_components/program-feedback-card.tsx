'use client';

// Whole-program value rating for the fresher (1–5 + optional comment) — only
// rendered when feedback_program_enabled is on. Distinct from AdvocacyCard
// (which asks "would you recommend JKKN", 0–10 NPS) — this asks "how valuable
// was the induction overall". Writes via InductionService.submitProgramFeedback.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { InductionService } from '@/lib/services/induction/induction-service';
import { RatingScale } from './rating-scale';

const BRAND = '#0b6d41';

interface Props {
  eventId: string;
  initialRating?: number | null;
  initialComment?: string | null;
}

export function ProgramFeedbackCard({ eventId, initialRating, initialComment }: Props) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [comment, setComment] = useState<string>(initialComment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [savedRating, setSavedRating] = useState<number | null>(initialRating ?? null);

  const dirty = rating !== savedRating || (comment ?? '') !== (initialComment ?? '');

  async function submit() {
    if (rating === null) { toast.error('Pick a rating from 1 to 5 first.'); return; }
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      await InductionService.submitProgramFeedback(eventId, rating, trimmed === '' ? null : trimmed);
      setSavedRating(rating);
      toast.success('Thanks — your overall rating was saved.');
    } catch (e: any) {
      toast.error(`Couldn't save your rating: ${e?.message ?? 'unknown error'}`);
    } finally { setSubmitting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">How valuable was the induction overall?</CardTitle>
        <CardDescription>1 = not valuable, 5 = extremely valuable.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <RatingScale value={rating} onChange={setRating} />
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything to add? (optional)"
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs">
            {savedRating !== null && !dirty ? (
              <span className="flex items-center gap-1" style={{ color: BRAND }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Rated {savedRating}/5
              </span>
            ) : (
              <span className="text-muted-foreground">Pick a rating, then submit.</span>
            )}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || rating === null || (!dirty && savedRating !== null)}
            style={{ backgroundColor: BRAND }}
            className="text-white hover:opacity-90"
          >
            {submitting ? 'Saving…' : savedRating !== null ? 'Update' : 'Submit'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
