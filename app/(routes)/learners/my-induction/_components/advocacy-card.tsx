'use client';

// Phase 4 — end-of-induction advocacy / NPS (0–10). The bridge between
// experienced value and referral (spec §5b). Writes induction_completion.
// advocacy_score via the gated DEFINER RPC.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { InductionService } from '@/lib/services/induction/induction-service';

const BRAND = '#0b6d41';

interface Props {
  eventId: string;
  initialScore: number | null;
}

export function AdvocacyCard({ eventId, initialScore }: Props) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [saved, setSaved] = useState<number | null>(initialScore);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (score === null) { toast.error('Pick a number from 0 to 10.'); return; }
    setSubmitting(true);
    try {
      await InductionService.submitAdvocacy(eventId, score);
      setSaved(score);
      toast.success('Thank you — your feedback helps us improve induction.');
    } catch (e: any) {
      toast.error(e?.message?.replace(/^fn_induction_submit_advocacy:\s*/, '') ?? 'Could not save.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">How likely are you to recommend JKKN to a friend?</CardTitle>
        <CardDescription>0 = not at all likely, 10 = extremely likely.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, n) => {
            const selected = score === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                aria-pressed={selected}
                className={`h-9 w-9 rounded-md border text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 ${
                  selected ? 'border-[#0b6d41] bg-[#0b6d41] text-white' : 'border-input bg-background hover:bg-muted'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs">
            {saved !== null && saved === score ? (
              <span className="flex items-center gap-1" style={{ color: BRAND }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> You rated us {saved}/10
              </span>
            ) : (
              <span className="text-muted-foreground">Tap a number, then submit.</span>
            )}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || score === null || (saved !== null && saved === score)}
            style={{ backgroundColor: BRAND }}
            className="text-white hover:opacity-90"
          >
            {submitting ? 'Saving…' : saved !== null ? 'Update' : 'Submit'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
