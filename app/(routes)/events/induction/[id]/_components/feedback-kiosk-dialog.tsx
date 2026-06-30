'use client';

// Per-session VOLUNTEER-KIOSK feedback — the no-smartphone capture path. A
// coordinator/volunteer opens this on a SHARED device, hands it to each fresher,
// and the fresher taps their OWN 1–5 rating. This reaches the no-account freshers
// the own-phone path structurally cannot. Writes via the gated DEFINER proxy RPC
// (fn_induction_submit_feedback_proxy), which NEVER overwrites a fresher's own-login
// submission (the server silently skips a locked row). Sibling of attendance-dialog.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type RosterRow,
  type ProxyFeedbackMark,
} from '@/lib/services/induction/induction-service';
import { RatingScale } from '@/app/(routes)/learners/my-induction/_components/rating-scale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Star, Lock, CheckCircle2 } from 'lucide-react';

interface ExistingFeedback { rating: number; comment: string; isSelf: boolean; }

export function FeedbackKioskDialog({ sessionId, sessionTitle }: { sessionId: string; sessionTitle: string }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [existing, setExisting] = useState<Record<string, ExistingFeedback>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, fb] = await Promise.all([
        InductionService.getSessionRoster(sessionId),
        InductionService.getSessionFeedbackRoster(sessionId).catch(() => []),
      ]);
      setRoster(r);
      const ex: Record<string, ExistingFeedback> = {};
      const initRatings: Record<string, number> = {};
      const initComments: Record<string, string> = {};
      for (const row of fb) {
        ex[row.learner_id] = { rating: row.rating, comment: row.comment ?? '', isSelf: row.is_self };
        // pre-fill editable state only for non-locked (kiosk-entered) rows
        if (!row.is_self) {
          initRatings[row.learner_id] = row.rating;
          initComments[row.learner_id] = row.comment ?? '';
        }
      }
      setExisting(ex);
      setRatings(initRatings);
      setComments(initComments);
    } catch (e: any) {
      toast.error(`Couldn't load roster: ${e.message ?? e}`);
    } finally { setLoading(false); }
  }, [sessionId]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) load(); };
  const setRating = (id: string, v: number) => setRatings((m) => ({ ...m, [id]: v }));
  const setComment = (id: string, v: string) => setComments((m) => ({ ...m, [id]: v }));

  // A row is worth sending when it isn't self-locked, has a rating, and is new or
  // changed from what's stored — so an unchanged kiosk row isn't needlessly rewritten.
  const isDirty = (id: string): boolean => {
    if (existing[id]?.isSelf) return false;
    const r = ratings[id];
    if (r == null) return false;
    const ex = existing[id];
    if (!ex) return true;
    return r !== ex.rating || (comments[id] ?? '') !== (ex.comment ?? '');
  };

  const dirtyIds = roster.filter((row) => isDirty(row.learner_id)).map((row) => row.learner_id);

  const save = async () => {
    const payload: ProxyFeedbackMark[] = dirtyIds.map((id) => ({
      learner_id: id,
      rating: ratings[id],
      comment: (comments[id] ?? '').trim() || null,
    }));
    if (payload.length === 0) { toast.error('Tap a rating for at least one fresher.'); return; }
    setSaving(true);
    try {
      const n = await InductionService.submitFeedbackProxy(sessionId, payload);
      toast.success(`Saved ${n} rating${n === 1 ? '' : 's'}.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Couldn't save ratings: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const ratedCount = roster.filter((row) => existing[row.learner_id]).length;
  const lockedCount = roster.filter((row) => existing[row.learner_id]?.isSelf).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Feedback (kiosk)"><Star className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Feedback (kiosk) — {sessionTitle}</DialogTitle>
          <DialogDescription>
            Hand the device to each fresher to tap their own rating. This covers freshers
            with no phone or login. A fresher who already rated on their own login is locked
            and can&apos;t be changed here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b pb-2 text-sm text-muted-foreground">
          <span>{roster.length} enrolled · {ratedCount} rated · {lockedCount} self</span>
          {dirtyIds.length > 0 && <span>{dirtyIds.length} to save</span>}
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No freshers enrolled for this session&apos;s batch yet.</p>
          ) : roster.map((row) => {
            const ex = existing[row.learner_id];
            const selfLocked = ex?.isSelf === true;
            return (
              <div key={row.learner_id} className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{row.name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.register_number ?? '—'}{row.batch_label ? ` · Batch ${row.batch_label}` : ''}
                    </div>
                  </div>
                  {selfLocked ? (
                    <Badge variant="outline" className="gap-1 shrink-0 border-amber-300 text-amber-600">
                      <Lock className="h-3 w-3" /> Self · locked
                    </Badge>
                  ) : ex ? (
                    <Badge variant="outline" className="gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> Rated {ex.rating}/5
                    </Badge>
                  ) : null}
                </div>
                {selfLocked ? (
                  <p className="text-xs text-muted-foreground">
                    Rated on their own login — final and can&apos;t be changed here.
                  </p>
                ) : (
                  <>
                    <RatingScale
                      value={ratings[row.learner_id] ?? null}
                      onChange={(v) => setRating(row.learner_id, v)}
                      disabled={saving}
                      size="sm"
                    />
                    <Input
                      value={comments[row.learner_id] ?? ''}
                      onChange={(e) => setComment(row.learner_id, e.target.value)}
                      placeholder="One-line comment (optional)"
                      className="h-8 text-sm"
                      disabled={saving}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || dirtyIds.length === 0}>
            {saving ? 'Saving…' : 'Save ratings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
