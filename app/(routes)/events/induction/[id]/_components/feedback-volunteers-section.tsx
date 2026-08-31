'use client';

// Feedback peer mentors (PR2 scale layer) — appoint senior students as peer
// mentors, auto-balance the cohort across them (no-account freshers first), and
// watch each mentor's coverage (freshers captured vs assigned). Backed by the
// gated DEFINER RPCs in 20260701094000_induction_volunteer_feedback_rpcs.sql.
//
// Self-gating: if the viewer can't list volunteers (no induction.view for this
// college), the section renders nothing — same posture as CoordinatorsPanel.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  InductionVolunteerService,
  type FeedbackVolunteer,
  type TrainingSession,
  type AutobalanceMode,
} from '@/lib/services/induction/induction-volunteer-service';
import { InductionService, type FeedbackMethodMix } from '@/lib/services/induction/induction-service';
import { AppointMentorDialog } from './appoint-mentor-dialog';
import { MentorIdentity } from './mentor-identity';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { MessagesSquare, X, Loader2, GraduationCap, AlertTriangle, ShieldCheck, CalendarClock, UserCheck, Shuffle, UserPlus } from 'lucide-react';

export function FeedbackVolunteersSection({ eventId }: { eventId: string }) {
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vols, setVols] = useState<FeedbackVolunteer[]>([]);
  const [capacity, setCapacity] = useState(20);
  const [balancing, setBalancing] = useState(false);
  const [mix, setMix] = useState<FeedbackMethodMix | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [v, m] = await Promise.all([
        InductionVolunteerService.listVolunteers(eventId),
        // Don't swallow a transient mix error — let it flow to the catch (Retry), else the
        // bias/coverage meter silently vanishes, defeating "the loop must KNOW its sample
        // is biased" (review #1694 r4). Both RPCs need induction.view, so they fail together.
        InductionService.getFeedbackMethodMix(eventId),
      ]);
      setVols(v);
      setMix(m);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Only a genuine authorization denial hides the panel for good. A transient
      // network/500 keeps it visible with a Retry (review #1694 r3 — don't hide on flake).
      if (/not authorized|permission denied|forbidden/i.test(msg)) {
        setHidden(true);
      } else {
        setLoadError(msg);
      }
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
      toast.success(`Removed ${name} as a Senior Peer Mentor.`);
      load();
    } catch (e: any) {
      toast.error(`Couldn't remove: ${e.message ?? e}`);
    }
  };

  // is_trained is a STORED GENERATED column: guide_read_at AND self_ack_at AND
  // admin_trained_at. This button sets ONLY the admin leg — the other two are
  // writable exclusively by the mentor (fn_induction_mentor_complete_self_training
  // resolves the row from auth.uid()), so an admin cannot unlock anyone alone.
  // Never claim "tools are unlocked" without checking the mentor's own two legs.
  const setTrained = async (learnerId: string, name: string, trained: boolean) => {
    const vol = vols.find((v) => v.learner_id === learnerId);
    const mentorLegsDone = Boolean(vol?.guide_read && vol?.self_ack);
    try {
      await InductionVolunteerService.adminSetTrained(eventId, learnerId, trained);
      if (!trained) {
        toast.success(`${name} marked untrained.`);
      } else if (mentorLegsDone) {
        toast.success(`${name} is fully trained — their tools are unlocked.`);
      } else {
        toast.warning(
          `${name}: your training sign-off is recorded, but their tools stay LOCKED. ` +
          `${name} must open My Induction Feedback and complete the guide + acknowledgement themselves.`,
        );
      }
      load();
    } catch (e: any) {
      toast.error(`Couldn't update training: ${e.message ?? e}`);
    }
  };

  /**
   * mode 'incremental' (the Assign pending button) keeps every existing
   * mentor↔fresher pair and places only the unassigned. 'rebalance' re-deals
   * the whole cohort and is therefore behind a confirmation.
   */
  const autobalance = async (mode: AutobalanceMode) => {
    setBalancing(true);
    try {
      const r = await InductionVolunteerService.autobalanceVolunteers(eventId, capacity, mode);
      const mentors = `${activeCount} mentor${activeCount === 1 ? '' : 's'}`;

      if (mode === 'rebalance') {
        toast.success(`Re-dealt all ${r.assigned} fresher${r.assigned === 1 ? '' : 's'} across ${mentors}.`);
      } else if (r.newly_assigned === 0 && r.unassigned === 0) {
        // The common repeat press. Say plainly that nothing needed doing rather
        // than reporting a success that implies work happened.
        toast.success(
          `Every fresher already has a mentor — nothing to assign. ` +
          `Use Rebalance all only if you want to even out group sizes from scratch.`,
        );
      } else if (r.newly_assigned > 0) {
        const kept = r.kept > 0 ? ` ${r.kept} existing assignment${r.kept === 1 ? '' : 's'} left untouched.` : '';
        const released = r.released > 0
          ? ` ${r.released} stale assignment${r.released === 1 ? '' : 's'} released (mentor no longer active).`
          : '';
        toast.success(
          `Assigned ${r.newly_assigned} pending fresher${r.newly_assigned === 1 ? '' : 's'} across ${mentors}.${kept}${released}`,
        );
      }

      // Independent of the above: an uncovered fresher is the one thing that
      // must never be implied away, so it warns even on an otherwise-good run.
      if (r.unassigned > 0) {
        toast.warning(
          `${r.unassigned} fresher${r.unassigned === 1 ? ' has' : 's have'} NO mentor ` +
          `(${r.assigned} of ${r.enrolled} covered) — raise the per-mentor cap or appoint more mentors.`,
        );
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <MessagesSquare className="h-4 w-4 text-primary" /> Senior Peer Mentors
            </CardTitle>
            <CardDescription>
              Appoint Senior Peer Mentors and auto-balance the cohort across them.
              Each mentor walks their assigned freshers — including those with no phone — and the
              fresher taps their own 1–5 rating on the mentor&apos;s phone (a fresher&apos;s own-login
              rating always wins and can&apos;t be overwritten).
            </CardDescription>
          </div>
          <Link href={`/events/induction/${eventId}/mentors`}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:border-primary hover:text-primary">
            Manage all &amp; freshers →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <span className="min-w-0 truncate">Couldn&apos;t load: {loadError}</span>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="shrink-0">Retry</Button>
          </div>
        )}
        {/* Auto-balance controls + at-a-glance coverage */}
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="vol-cap" className="text-xs text-muted-foreground">Per-mentor cap</Label>
              <Input id="vol-cap" type="number" min={1} max={100} value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="h-8 w-20" />
            </div>
            {/* The everyday action. Additive: it never moves a fresher who
                already has a mentor, so it is safe to press after every new
                admission intake. */}
            <Button size="sm" onClick={() => autobalance('incremental')} disabled={balancing || activeCount === 0}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              {balancing ? 'Assigning…' : 'Assign pending'}
            </Button>
            {/* The destructive one. Breaks every existing pair, so it is behind
                a confirmation and worded as what it actually does. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={balancing || activeCount === 0}>
                  <Shuffle className="h-3.5 w-3.5 mr-1" />
                  Rebalance all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Re-deal every fresher from scratch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This breaks <strong>all {totalAssigned} existing mentor assignments</strong> and
                    deals the whole cohort again. Freshers a mentor has already walked will
                    likely land with someone else, and any temporary cover in force is discarded.
                    <br /><br />
                    To place only freshers who have no mentor yet — new admissions, for instance —
                    use <strong>Assign pending</strong> instead; it leaves existing pairs alone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => autobalance('rebalance')}>
                    Yes, re-deal everyone
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
            No Senior Peer Mentors yet. Appoint a few, then auto-balance the cohort across them.
          </p>
        ) : (
          <div className="space-y-2">
            {vols.map((v) => (
              <div key={v.learner_id} className="flex items-start justify-between gap-3 rounded-lg border p-2.5">
                <div className="flex items-start gap-2 min-w-0">
                  <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <MentorIdentity mentor={v} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={v.group_size > 0 && v.captured >= v.group_size ? 'default' : 'secondary'} className="tabular-nums">
                    {v.captured}/{v.group_size} captured
                  </Badge>
                  {v.is_trained ? (
                    <button type="button" onClick={() => setTrained(v.learner_id, v.full_name, false)}
                      title="Trained — click to mark untrained"
                      className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700">
                      <ShieldCheck className="h-3 w-3" /> Trained
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {v.guide_read && v.self_ack ? 'mentor done' : 'awaiting mentor'}
                      </span>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => setTrained(v.learner_id, v.full_name, true)}>
                        Mark trained
                      </Button>
                    </div>
                  )}
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

        <div className="flex flex-wrap gap-2">
          <AppointMentorDialog eventId={eventId} onAppointed={load} />
          <TrainingSessionsDialog eventId={eventId} mentors={vols} onChanged={load} />
        </div>
      </CardContent>
    </Card>
  );
}

// Training sessions (P2b fast-follow) — schedule a Senior Peer Mentor training
// session and record who attended. Attendance sets ONLY the admin training leg
// (admin_trained_at); a mentor is fully trained — is_trained, tools unlocked —
// only once they've ALSO read the in-app guide and self-acknowledged. The copy
// here says so plainly so an admin isn't misled into thinking attendance alone
// unlocks a mentor. All three RPCs are gated by fn_induction_can_manage_training.
function TrainingSessionsDialog({
  eventId, mentors, onChanged,
}: {
  eventId: string;
  mentors: FeedbackVolunteer[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [venue, setVenue] = useState('');
  const [creating, setCreating] = useState(false);
  const [attendingSession, setAttendingSession] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(await InductionVolunteerService.listTrainingSessions(eventId));
    } catch (e: any) {
      toast.error(`Couldn't load training sessions: ${e.message ?? e}`);
    } finally {
      setLoadingSessions(false);
    }
  }, [eventId]);
  useEffect(() => { if (open) loadSessions(); }, [open, loadSessions]);

  const activeMentors = mentors.filter((m) => m.is_active);

  const create = async () => {
    if (!title.trim()) { toast.error('Give the session a title.'); return; }
    setCreating(true);
    try {
      await InductionVolunteerService.createTrainingSession(
        eventId, title.trim(),
        scheduledAt ? new Date(scheduledAt).toISOString() : null,
        venue.trim() || null,
      );
      toast.success('Training session scheduled.');
      setTitle(''); setScheduledAt(''); setVenue('');
      loadSessions();
    } catch (e: any) {
      toast.error(`Couldn't schedule: ${e.message ?? e}`);
    } finally {
      setCreating(false);
    }
  };

  const openAttendance = (sessionId: string) => {
    if (attendingSession === sessionId) { setAttendingSession(null); return; }
    setAttendingSession(sessionId);
    // Default-select mentors who still need the admin leg (skip the already-fully-trained).
    setSelected(new Set(activeMentors.filter((m) => !m.is_trained).map((m) => m.learner_id)));
  };

  const toggle = (learnerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(learnerId)) next.delete(learnerId); else next.add(learnerId);
      return next;
    });
  };

  const markAttended = async (sessionId: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) { toast.error('Select at least one mentor.'); return; }
    setMarking(true);
    try {
      const n = await InductionVolunteerService.markTrainingAttended(sessionId, ids);
      toast.success(
        `Recorded ${n} mentor${n === 1 ? '' : 's'} as present — the admin training step is done for them. ` +
        `Each becomes fully trained (tools unlocked) once they've also read the guide and self-acknowledged.`,
      );
      setAttendingSession(null);
      setSelected(new Set());
      onChanged(); // is_trained may have flipped for mentors who'd already done the mentor steps
    } catch (e: any) {
      toast.error(`Couldn't record attendance: ${e.message ?? e}`);
    } finally {
      setMarking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><CalendarClock className="h-3.5 w-3.5 mr-1" /> Training sessions</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Senior Peer Mentor training sessions</DialogTitle>
          <DialogDescription>
            Schedule a training session and record who attended. Attendance completes the
            admin training step — a mentor is fully trained (their attendance &amp; feedback
            tools unlock) only once they&apos;ve also read the in-app guide and self-acknowledged.
          </DialogDescription>
        </DialogHeader>

        {/* Schedule form */}
        <div className="space-y-2 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="ts-title" className="text-xs text-muted-foreground">Session title</Label>
            <Input id="ts-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Peer Mentor orientation" className="h-8" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1 flex-1 min-w-[9rem]">
              <Label htmlFor="ts-when" className="text-xs text-muted-foreground">Date &amp; time (optional)</Label>
              <Input id="ts-when" type="datetime-local" value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1 flex-1 min-w-[9rem]">
              <Label htmlFor="ts-venue" className="text-xs text-muted-foreground">Venue (optional)</Label>
              <Input id="ts-venue" value={venue} onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Seminar Hall" className="h-8" />
            </div>
          </div>
          <Button size="sm" onClick={create} disabled={creating || !title.trim()}>
            {creating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5 mr-1" />}
            Schedule session
          </Button>
        </div>

        {/* Session list */}
        <div className="max-h-80 overflow-auto space-y-2">
          {loadingSessions ? (
            <p className="text-sm text-muted-foreground py-2">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No training sessions scheduled yet.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="rounded-lg border p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : 'No date set'}
                      {s.venue ? ` · ${s.venue}` : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                    onClick={() => openAttendance(s.id)} disabled={activeMentors.length === 0}>
                    <UserCheck className="h-3.5 w-3.5 mr-1" />
                    {attendingSession === s.id ? 'Close' : 'Attendance'}
                  </Button>
                </div>

                {attendingSession === s.id && (
                  <div className="space-y-1.5 border-t pt-2">
                    <div className="max-h-44 overflow-auto space-y-1">
                      {activeMentors.map((m) => (
                        <label key={m.learner_id}
                          className="flex items-center gap-2 rounded-md border p-1.5 text-sm cursor-pointer hover:border-primary">
                          <input type="checkbox" checked={selected.has(m.learner_id)}
                            onChange={() => toggle(m.learner_id)} className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{m.full_name || 'Unnamed'}</span>
                          {m.is_trained ? (
                            <Badge variant="default" className="text-[10px] shrink-0">Trained</Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {m.guide_read && m.self_ack ? 'awaiting admin' : 'awaiting mentor steps'}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    <Button size="sm" onClick={() => markAttended(s.id)} disabled={marking || selected.size === 0}>
                      {marking ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <UserCheck className="h-3.5 w-3.5 mr-1" />}
                      Mark {selected.size} present
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
