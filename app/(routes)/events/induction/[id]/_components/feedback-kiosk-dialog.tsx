'use client';

// Per-session VOLUNTEER-KIOSK feedback — the no-smartphone capture path. A
// coordinator/volunteer opens this on a SHARED device, hands it to each fresher,
// and the fresher taps their OWN 1–5 rating. This reaches the no-account freshers
// the own-phone path structurally cannot. Writes via the gated DEFINER proxy RPC
// (fn_induction_submit_feedback_proxy), which NEVER overwrites a fresher's own-login
// submission (the server silently skips a locked row). Sibling of attendance-dialog.
import { useCallback, useMemo, useState } from 'react';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Star, Lock, CheckCircle2, Search, X, Phone, GraduationCap } from 'lucide-react';

interface ExistingFeedback { rating: number; comment: string; isSelf: boolean; }

/** Bucket for freshers whose learners_profiles.program_id is still NULL. */
const NO_PROGRAM = '__none__';

/** Digits only — so "9843 123456" and "+91-9843123456" both find the same parent. */
const digits = (s: string) => s.replace(/\D/g, '');

export function FeedbackKioskDialog({ sessionId, sessionTitle }: { sessionId: string; sessionTitle: string }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [existing, setExisting] = useState<Record<string, ExistingFeedback>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [program, setProgram] = useState('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedbackError(false);
    try {
      const r = await InductionService.getSessionRoster(sessionId);
      setRoster(r);
      // The existing-feedback roster tells us which rows are SELF-LOCKED. If it fails we
      // must NOT fall back to "empty" — every fresher would look unlocked, and a re-rate
      // of a self-rated fresher would be silently anti-clobber-dropped. Surface it and
      // block saving until a successful reload. (review #1694 r4 MEDIUM)
      let fb: { learner_id: string; rating: number; comment: string | null; is_self: boolean }[];
      try {
        fb = await InductionService.getSessionFeedbackRoster(sessionId);
      } catch {
        setFeedbackError(true);
        setExisting({}); setRatings({}); setComments({});
        return;
      }
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

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) { setQuery(''); setProgram('all'); load(); } };
  const setRating = (id: string, v: number) => setRatings((m) => ({ ...m, [id]: v }));
  const setComment = (id: string, v: string) => setComments((m) => ({ ...m, [id]: v }));

  // Programs present on THIS roster, with head counts — an optional narrowing
  // control, so it only renders when the roster actually spans more than one.
  const programs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of roster) {
      const key = r.program_name?.trim() || NO_PROGRAM;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) =>
      a === NO_PROGRAM ? 1 : b === NO_PROGRAM ? -1 : a.localeCompare(b));
  }, [roster]);

  // Program filter AND text search — a VIEW concern only. Ratings and dirtyIds
  // below stay computed over the FULL roster, so narrowing the list can never
  // drop a fresher's tapped rating from the save payload.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = digits(q);
    return roster.filter((r) => {
      if (program !== 'all' && (r.program_name?.trim() || NO_PROGRAM) !== program) return false;
      if (!q) return true;
      return (r.name ?? '').toLowerCase().includes(q)
        || (r.register_number ?? '').toLowerCase().includes(q)
        || (r.program_name ?? '').toLowerCase().includes(q)
        || (qd.length >= 3 && digits(r.father_mobile ?? '').includes(qd));
    });
  }, [roster, query, program]);

  const narrowed = query.trim().length > 0 || program !== 'all';

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
      const skipped = payload.length - n;
      // The proxy filters/anti-clobber-skips ineligible or self-rated rows — surface
      // that instead of implying every tap saved (review #1694 r4 MEDIUM).
      toast.success(
        `Saved ${n} rating${n === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} not saved (already self-rated or no longer eligible)` : ''}.`,
      );
      setOpen(false);
    } catch (e: any) {
      toast.error(`Couldn't save ratings: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const ratedCount = roster.filter((row) => existing[row.learner_id]).length;
  const lockedCount = roster.filter((row) => existing[row.learner_id]?.isSelf).length;
  const pendingCount = roster.length - ratedCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Feedback (kiosk)"><Star className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] sm:max-w-2xl flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Feedback (kiosk) — {sessionTitle}</DialogTitle>
          <DialogDescription>
            Hand the device to each fresher to tap their own rating. This covers freshers
            with no phone or login. A fresher who already rated on their own login is locked
            and can&apos;t be changed here.
          </DialogDescription>
        </DialogHeader>

        {/* Search + program filter + counters — the roster can run to 200+ names */}
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, register number, program or parent mobile…"
                className="pl-8 pr-8"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Optional narrowing — pointless (and hidden) on a single-program roster */}
            {programs.length > 1 && (
              <Select value={program} onValueChange={setProgram}>
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="All programs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs ({roster.length})</SelectItem>
                  {programs.map(([p, n]) => (
                    <SelectItem key={p} value={p}>
                      {p === NO_PROGRAM ? 'No program' : p} ({n})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">{roster.length} enrolled</span>
            <span className="font-medium text-green-700 dark:text-green-500">{ratedCount} rated</span>
            <span className="text-muted-foreground">{lockedCount} self</span>
            {pendingCount > 0 && <span className="text-amber-600 dark:text-amber-500">{pendingCount} pending</span>}
            {dirtyIds.length > 0 && <span className="text-primary font-medium">{dirtyIds.length} to save</span>}
            {narrowed && <span className="text-muted-foreground">· showing {visible.length}</span>}
          </div>
        </div>

        {feedbackError && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <span className="min-w-0">Couldn&apos;t load existing ratings — saving is disabled so a self-rated fresher isn&apos;t accidentally overwritten.</span>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="shrink-0">Retry</Button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto divide-y rounded-md border">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No freshers enrolled for this session&apos;s batch yet.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              {query ? <>No fresher matches &ldquo;{query}&rdquo;</> : 'No fresher in this program'}
              {query && program !== 'all' ? ' in this program' : ''}.
            </p>
          ) : visible.map((row) => {
            const ex = existing[row.learner_id];
            const selfLocked = ex?.isSelf === true;
            return (
              <div
                key={row.learner_id}
                className={`px-3 py-3 space-y-2 ${ex || ratings[row.learner_id] != null ? '' : 'bg-muted/30'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {row.name || 'Unnamed'}
                      {row.register_number && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                          {row.register_number}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {row.program_name && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <GraduationCap className="h-3 w-3 shrink-0" />
                          <span className="truncate">{row.program_name}</span>
                        </span>
                      )}
                      {row.father_mobile && (
                        <a
                          href={`tel:${row.father_mobile}`}
                          className="inline-flex items-center gap-1 tabular-nums hover:text-foreground hover:underline"
                          title="Father's mobile"
                        >
                          <Phone className="h-3 w-3 shrink-0" />
                          {row.father_mobile}
                        </a>
                      )}
                      {row.batch_label && <span>Batch {row.batch_label}</span>}
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
          <Button onClick={save} disabled={saving || dirtyIds.length === 0 || feedbackError}>
            {saving ? 'Saving…' : `Save ratings${dirtyIds.length ? ` (${dirtyIds.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
