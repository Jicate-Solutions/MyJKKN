'use client';

// Feedback peer mentors (PR2 scale layer) — appoint senior students as peer
// mentors, auto-balance the cohort across them (no-account freshers first), and
// watch each mentor's coverage (freshers captured vs assigned). Backed by the
// gated DEFINER RPCs in 20260701094000_induction_volunteer_feedback_rpcs.sql.
//
// Self-gating: if the viewer can't list volunteers (no induction.view for this
// college), the section renders nothing — same posture as CoordinatorsPanel.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionVolunteerService,
  type FeedbackVolunteer,
  type AssignablePeerMentor,
} from '@/lib/services/induction/induction-volunteer-service';
import { InductionService, type FeedbackMethodMix } from '@/lib/services/induction/induction-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { MessagesSquare, UserPlus, X, Loader2, Search, Scale, GraduationCap, AlertTriangle } from 'lucide-react';

export function FeedbackVolunteersSection({ eventId }: { eventId: string }) {
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vols, setVols] = useState<FeedbackVolunteer[]>([]);
  const [capacity, setCapacity] = useState(20);
  const [balancing, setBalancing] = useState(false);
  const [mix, setMix] = useState<FeedbackMethodMix | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, m] = await Promise.all([
        InductionVolunteerService.listVolunteers(eventId),
        InductionService.getFeedbackMethodMix(eventId).catch(() => null),
      ]);
      setVols(v);
      setMix(m);
    } catch {
      // not authorized for this college → hide the whole section
      setHidden(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  if (hidden) return null;

  const activeCount = vols.filter((v) => v.is_active).length;
  const totalAssigned = vols.reduce((s, v) => s + v.group_size, 0);
  const totalCaptured = vols.reduce((s, v) => s + v.captured, 0);

  const remove = async (learnerId: string, name: string) => {
    try {
      await InductionVolunteerService.removeVolunteer(eventId, learnerId);
      toast.success(`Removed ${name} as a peer mentor.`);
      load();
    } catch (e: any) {
      toast.error(`Couldn't remove: ${e.message ?? e}`);
    }
  };

  const autobalance = async () => {
    setBalancing(true);
    try {
      const r = await InductionVolunteerService.autobalanceVolunteers(eventId, capacity);
      const mentors = `${activeCount} mentor${activeCount === 1 ? '' : 's'}`;
      if (r.unassigned > 0) {
        // Surface the coverage TRUTH — don't imply full coverage when freshers are unowned.
        toast.warning(
          `Assigned ${r.assigned} of ${r.enrolled} freshers across ${mentors}. ` +
          `${r.unassigned} fresher${r.unassigned === 1 ? ' has' : 's have'} NO mentor — raise the per-mentor cap or appoint more mentors.`,
        );
      } else {
        toast.success(`Assigned all ${r.assigned} fresher${r.assigned === 1 ? '' : 's'} across ${mentors}.`);
      }
      load();
    } catch (e: any) {
      toast.error(`Couldn't auto-balance: ${e.message ?? e}`);
    } finally {
      setBalancing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-primary" /> Feedback peer mentors
        </CardTitle>
        <CardDescription>
          Appoint senior students as peer mentors and auto-balance the cohort across them.
          Each mentor walks their assigned freshers — including those with no phone — and the
          fresher taps their own 1–5 rating on the mentor&apos;s phone (a fresher&apos;s own-login
          rating always wins and can&apos;t be overwritten).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto-balance controls + at-a-glance coverage */}
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="vol-cap" className="text-xs text-muted-foreground">Per-mentor cap</Label>
              <Input id="vol-cap" type="number" min={1} max={100} value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="h-8 w-20" />
            </div>
            <Button size="sm" variant="outline" onClick={autobalance} disabled={balancing || activeCount === 0}>
              <Scale className="h-3.5 w-3.5 mr-1" />
              {balancing ? 'Balancing…' : 'Auto-balance'}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {activeCount} active mentor{activeCount === 1 ? '' : 's'} · {totalCaptured}/{totalAssigned} assigned freshers captured
          </div>
        </div>

        {/* Feedback coverage + bias meter — the loop must KNOW when its sample is thin or single-method */}
        {mix && (
          <div className={`rounded-lg border p-3 text-xs ${mix.bias_flag ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-950/30' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                Feedback coverage: {Math.round(mix.response_rate * 100)}% ({mix.responders}/{mix.enrolled} freshers)
              </span>
              <span className="text-muted-foreground tabular-nums">
                {mix.n_phone} phone · {mix.n_volunteer_kiosk} kiosk · {mix.no_account_enrolled} no-account
              </span>
            </div>
            {mix.bias_flag && (
              <div className="mt-1.5 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Biased sample — the loop is learning from a thin or single-method slice. Treat its suggestions with caution until coverage improves.</span>
              </div>
            )}
          </div>
        )}

        {/* Mentor list */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Loading mentors…</p>
        ) : vols.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No peer mentors yet. Appoint a few senior students, then auto-balance the cohort across them.
          </p>
        ) : (
          <div className="space-y-2">
            {vols.map((v) => (
              <div key={v.learner_id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.full_name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.register_number ?? '—'} · cap {v.capacity}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={v.group_size > 0 && v.captured >= v.group_size ? 'default' : 'secondary'} className="tabular-nums">
                    {v.captured}/{v.group_size} captured
                  </Badge>
                  <button
                    type="button"
                    aria-label={`Remove ${v.full_name}`}
                    onClick={() => remove(v.learner_id, v.full_name)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AppointMentorDialog eventId={eventId} onAppointed={load} />
      </CardContent>
    </Card>
  );
}

function AppointMentorDialog({ eventId, onAppointed }: { eventId: string; onAppointed: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignablePeerMentor[]>([]);
  const [searching, setSearching] = useState(false);
  const [appointing, setAppointing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await InductionVolunteerService.assignablePeerMentors(eventId, query);
        if (active) setResults(r);
      } catch {
        /* surfaced on appoint */
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, eventId]);

  const appoint = async (m: AssignablePeerMentor) => {
    setAppointing(m.learner_id);
    try {
      await InductionVolunteerService.appointVolunteer(eventId, m.learner_id);
      toast.success(`${m.full_name} is now a feedback peer mentor.`);
      setOpen(false);
      onAppointed();
    } catch (e: any) {
      toast.error(`Couldn't appoint: ${e.message ?? e}`);
    } finally {
      setAppointing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserPlus className="h-3.5 w-3.5 mr-1" /> Appoint peer mentor</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Appoint a peer mentor</DialogTitle>
          <DialogDescription>
            Pick a senior student of this college (they need a login). Freshers being inducted here can&apos;t be appointed.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or register number…"
            value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
        <div className="max-h-72 overflow-auto space-y-1">
          {searching ? (
            <p className="text-sm text-muted-foreground py-2">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No appointable peer mentors found.</p>
          ) : (
            results.map((m) => (
              <button key={m.learner_id} type="button" onClick={() => appoint(m)} disabled={!!appointing}
                className="w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left hover:border-primary disabled:opacity-50">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.register_number ?? '—'}</div>
                </div>
                {appointing === m.learner_id
                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  : <UserPlus className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
