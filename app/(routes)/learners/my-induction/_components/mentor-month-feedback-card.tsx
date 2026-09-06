'use client';

// Monthly Senior Peer Mentor helpfulness rating — "did your mentor help you
// this month?" 1-5 + optional comment, tied to each scheduled monthly check-in
// (fn_induction_generate_monthly_checkins, first beat 15 Aug 2026). Self-scoping,
// mirroring SeniorPeerMentorCard/DayFeedbackCard: renders nothing until the
// fresher has a current mentor group assignment AND at least one check-in has
// actually come due (fn_induction_my_mentor_checkins gates both server-side).
//
// Deliberately does NOT show whether the mentor "checked in" (marked attendance
// for their group that month) — that quiet honesty cross-check against this
// same rating is admin/coordinator-only (Senior Peer Mentors console), so a
// fresher can't see — and can't game — the signal used to flag their own rating.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, HeartHandshake } from 'lucide-react';
import { toast } from 'sonner';
import { InductionVolunteerService, type MentorCheckin } from '@/lib/services/induction/induction-volunteer-service';
import { RatingScale } from './rating-scale';

const BRAND = '#0b6d41';

export function MentorMonthFeedbackCard({ eventId }: { eventId: string }) {
  const [checkins, setCheckins] = useState<MentorCheckin[] | null>(null);

  useEffect(() => {
    let active = true;
    InductionVolunteerService.myMentorCheckins(eventId)
      .then((rows) => { if (active) setCheckins(rows); })
      .catch(() => { if (active) setCheckins([]); });
    return () => { active = false; };
  }, [eventId]);

  // Invisible while loading and for any fresher with nothing due yet.
  if (!checkins || checkins.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <HeartHandshake className="h-4 w-4" style={{ color: BRAND }} /> Your Senior Peer Mentor
        </CardTitle>
        <CardDescription>
          One quick question each month — it helps us know if the mentoring programme is actually working for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {checkins.map((c) => (
          <MonthRow
            key={c.session_id}
            checkin={c}
            onSubmitted={(rating, comment) =>
              setCheckins((prev) =>
                (prev ?? []).map((p) => (p.session_id === c.session_id ? { ...p, rating, comment } : p)),
              )
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

function MonthRow({
  checkin,
  onSubmitted,
}: {
  checkin: MentorCheckin;
  onSubmitted: (rating: number, comment: string | null) => void;
}) {
  const [rating, setRating] = useState<number | null>(checkin.rating);
  const [comment, setComment] = useState<string>(checkin.comment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<number | null>(checkin.rating);

  const dirty = rating !== saved || (comment ?? '') !== (checkin.comment ?? '');

  async function submit() {
    if (rating === null) { toast.error('Pick a rating from 1 to 5 first.'); return; }
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      await InductionVolunteerService.submitMentorMonthFeedback(checkin.session_id, rating, trimmed === '' ? null : trimmed);
      setSaved(rating);
      toast.success('Thanks — saved.');
      onSubmitted(rating, trimmed === '' ? null : trimmed);
    } catch (e: any) {
      toast.error(`Couldn't save your rating: ${e?.message ?? 'unknown error'}`);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-md border-2 border-dashed bg-muted/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {checkin.month_label} — did {checkin.mentor_name || 'your mentor'} help you this month?
        </Label>
        {saved !== null && !dirty && (
          <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: BRAND }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Rated {saved}/5
          </span>
        )}
      </div>

      <RatingScale value={rating} onChange={setRating} size="sm" />

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
          disabled={submitting || rating === null || (!dirty && saved !== null)}
          style={{ backgroundColor: BRAND }}
          className="text-white hover:opacity-90"
        >
          {submitting ? 'Saving…' : saved !== null ? 'Update rating' : 'Submit rating'}
        </Button>
      </div>
    </div>
  );
}
