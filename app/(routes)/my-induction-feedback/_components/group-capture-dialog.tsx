'use client';

// Group capture (PR2) — a peer mentor opens ONE session, sees their assigned
// freshers (silent / no-account first), hands their phone to each fresher, and
// the fresher taps their own 1–5 + optional comment. Writes via the gated DEFINER
// RPC fn_induction_volunteer_submit_feedback (capture_method='volunteer_kiosk').
// A fresher's own-login rating is locked (anti-clobber) and shown as such.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionVolunteerService,
  type FeedbackGroupMember,
  type VolunteerFeedbackMark,
} from '@/lib/services/induction/induction-volunteer-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { MessageSquarePlus, CheckCircle2, Lock } from 'lucide-react';
// Reuse PR1's shared scale instead of re-inlining it, so the own-phone form and this
// kiosk dialog can never drift (review #1694).
import { RatingScale, RATING_BRAND as BRAND } from '@/app/(routes)/learners/my-induction/_components/rating-scale';

export function GroupCaptureDialog({
  sessionId, sessionTitle, onSaved,
}: { sessionId: string; sessionTitle: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<FeedbackGroupMember[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await InductionVolunteerService.myFeedbackGroup(sessionId);
      setGroup(g);
      setRatings({});
      setComments({});
    } catch (e: any) {
      toast.error(`Couldn't load your group: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) load(); };
  const setRating = (id: string, v: number) => setRatings((m) => ({ ...m, [id]: v }));
  const setComment = (id: string, v: string) => setComments((m) => ({ ...m, [id]: v }));

  // A row is locked from mentor entry once the fresher rated on their own login.
  const isLocked = (m: FeedbackGroupMember) => m.captured && m.capture_method === 'phone';

  const save = async () => {
    const marks: VolunteerFeedbackMark[] = Object.entries(ratings)
      .map(([learner_id, rating]) => ({ learner_id, rating, member: group.find((g) => g.learner_id === learner_id) }))
      .filter((x) => x.rating >= 1 && x.rating <= 5 && x.member !== undefined && !isLocked(x.member))
      .map(({ learner_id, rating }) => ({
        learner_id,
        rating,
        comment: comments[learner_id]?.trim() ? comments[learner_id].trim() : null,
      }));
    if (marks.length === 0) { toast.error('Tap a rating for at least one fresher.'); return; }
    setSaving(true);
    try {
      const n = await InductionVolunteerService.submitFeedback(sessionId, marks);
      const skipped = marks.length - n;
      // The RPC skips a row for anti-clobber (already self-rated) OR ineligibility
      // (not in group / batch mismatch). Don't claim all skips are self-rated (review #1694 r2).
      toast.success(
        `Saved ${n} rating${n === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} not saved (already self-rated or no longer eligible)` : ''}.`,
      );
      setOpen(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(`Couldn't save: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const ratedNow = Object.values(ratings).filter((r) => r >= 1 && r <= 5).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" style={{ backgroundColor: BRAND }} className="text-white hover:opacity-90">
          <MessageSquarePlus className="h-4 w-4 mr-1" /> Collect feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{sessionTitle}</DialogTitle>
          <DialogDescription>
            Hand your phone to each fresher and let them tap their own rating. Freshers without a
            phone are listed first. A fresher who already rated on their own login is locked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto divide-y -mx-1 px-1">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading your group…</p>
          ) : group.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No freshers assigned to you for this session yet.
            </p>
          ) : group.map((m) => {
            const locked = isLocked(m);
            const current = ratings[m.learner_id] ?? null;
            return (
              <div key={m.learner_id} className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.register_number ?? '—'}{m.batch_label ? ` · Batch ${m.batch_label}` : ''}
                      {!m.has_account && ' · no phone'}
                    </div>
                  </div>
                  {m.captured && (
                    locked ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Lock className="h-3.5 w-3.5" /> rated on own login
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: BRAND }}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> rated
                      </span>
                    )
                  )}
                </div>

                {locked ? (
                  <p className="text-xs text-muted-foreground italic">
                    This fresher&apos;s own rating is final and can&apos;t be changed here.
                  </p>
                ) : (
                  <>
                    <RatingScale
                      value={current}
                      onChange={(v) => setRating(m.learner_id, v)}
                      size="sm"
                    />
                    {current !== null && (
                      <Input
                        value={comments[m.learner_id] ?? ''}
                        onChange={(e) => setComment(m.learner_id, e.target.value)}
                        placeholder="Comment (optional)"
                        className="h-8 text-sm"
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">{ratedNow} rated now</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || ratedNow === 0}
              style={{ backgroundColor: BRAND }} className="text-white hover:opacity-90">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
