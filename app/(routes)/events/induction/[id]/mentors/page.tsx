'use client';

// Senior Peer Mentor — admin management console.
// One page to manage every mentor AND their assigned mentee-freshers: appoint /
// remove mentors, mark trained, auto-balance, manually move a fresher between
// mentors or unassign them, and schedule the year's monthly check-ins. Backed by
// the admin-gated, anon-locked SECURITY DEFINER RPCs; the page self-gates (if the
// viewer can't list mentors it shows an access notice rather than a blank).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  InductionVolunteerService,
  type FeedbackVolunteer,
  type MentorMentee,
  type UnassignedFresher,
  type MentorHelpfulnessCrosscheckRow,
  type MentorCover,
  type AutobalanceMode,
} from '@/lib/services/induction/induction-volunteer-service';
import { AppointMentorDialog } from '../_components/appoint-mentor-dialog';
import { MentorIdentity } from '../_components/mentor-identity';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  GraduationCap, ChevronDown, ChevronRight, ShieldCheck, X,
  CalendarClock, Users, CheckCircle2, AlertTriangle, ShieldAlert,
  Shuffle, UserPlus, ArrowRightLeft, Undo2, Clock, Phone,
} from 'lucide-react';

/** Today as yyyy-mm-dd, for the cover-date input's min. */
const todayISO = () => new Date().toISOString().slice(0, 10);

/** dd Mon yyyy — cover dates are read at a glance, not parsed. */
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function SeniorPeerMentorConsolePage() {
  const params = useParams();
  const eventId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mentors, setMentors] = useState<FeedbackVolunteer[]>([]);
  const [mentees, setMentees] = useState<MentorMentee[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedFresher[]>([]);
  const [crosscheck, setCrosscheck] = useState<MentorHelpfulnessCrosscheckRow[]>([]);
  const [covers, setCovers] = useState<MentorCover[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [capacity, setCapacity] = useState(20);
  const [busy, setBusy] = useState<string | null>(null); // a label for the in-flight action

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [v, m, u, c, cv] = await Promise.all([
        InductionVolunteerService.listVolunteers(eventId),
        InductionVolunteerService.adminMentorMentees(eventId),
        InductionVolunteerService.adminUnassignedFreshers(eventId),
        InductionVolunteerService.mentorHelpfulnessCrosscheck(eventId),
        InductionVolunteerService.adminMentorCovers(eventId),
      ]);
      setMentors(v);
      setMentees(m);
      setUnassigned(u);
      setCrosscheck(c);
      setCovers(cv);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/not authorized|permission denied|forbidden/i.test(msg)) setHidden(true);
      else setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { if (eventId) load(); }, [eventId, load]);

  const menteesByMentor = useMemo(() => {
    const map = new Map<string, MentorMentee[]>();
    for (const mm of mentees) {
      const arr = map.get(mm.mentor_learner_id) ?? [];
      arr.push(mm);
      map.set(mm.mentor_learner_id, arr);
    }
    return map;
  }, [mentees]);

  const activeMentors = mentors.filter((m) => m.is_active);
  const trainedCount = activeMentors.filter((m) => m.is_trained).length;
  const assignedCount = mentees.length;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Sets ONLY the admin leg of the 3-legged is_trained generated column
  // (guide_read_at AND self_ack_at AND admin_trained_at). The mentor's own two
  // legs can't be written by an admin, so don't promise unlocked tools blindly.
  const setTrained = async (learnerId: string, name: string, trained: boolean) => {
    setBusy(`trained:${learnerId}`);
    const mentor = mentors.find((m) => m.learner_id === learnerId);
    const mentorLegsDone = Boolean(mentor?.guide_read && mentor?.self_ack);
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
      await load();
    } catch (e: any) { toast.error(`Couldn't update: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const removeMentor = async (learnerId: string, name: string) => {
    setBusy(`remove:${learnerId}`);
    try {
      await InductionVolunteerService.removeVolunteer(eventId, learnerId);
      toast.success(`Removed ${name}. Their freshers are back in the unassigned pool.`);
      await load();
    } catch (e: any) { toast.error(`Couldn't remove: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const autobalance = async (mode: AutobalanceMode) => {
    setBusy('autobalance');
    try {
      const r = await InductionVolunteerService.autobalanceVolunteers(eventId, capacity, mode);
      if (mode === 'rebalance') {
        toast.success(`Re-dealt all ${r.assigned} freshers across ${activeMentors.length} mentor(s).`);
      } else if (r.newly_assigned === 0 && r.unassigned === 0) {
        toast.success('Every fresher already has a mentor — nothing to assign.');
      } else if (r.newly_assigned > 0) {
        toast.success(
          `Assigned ${r.newly_assigned} pending fresher${r.newly_assigned === 1 ? '' : 's'}. ` +
          `${r.kept} existing assignment${r.kept === 1 ? '' : 's'} left untouched.`,
        );
      }
      if (r.unassigned > 0) {
        toast.warning(`${r.unassigned} fresher(s) still have NO mentor (${r.assigned}/${r.enrolled} covered) — raise the cap or appoint more mentors.`);
      }
      await load();
    } catch (e: any) { toast.error(`Couldn't auto-balance: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  /**
   * Move a mentor's whole group to a stand-in.
   *
   * coverUntil null = permanent handover; a date = the stand-in holds them until
   * that date (inclusive), after which the nightly sweep hands them back. The
   * target's capacity is reported, never enforced — an absent mentor's group
   * usually overflows the stand-in, and blocking would leave freshers unowned.
   */
  const reassignAll = async (
    fromId: string, fromName: string, toId: string, toName: string,
    coverUntil: string | null, note: string | null,
  ) => {
    setBusy(`reassign:${fromId}`);
    try {
      const r = await InductionVolunteerService.adminBulkReassignMentees(eventId, fromId, toId, {
        coverUntil, note,
      });
      if (r.moved === 0) {
        toast.warning(`${fromName} has no freshers to move.`);
      } else {
        toast.success(
          coverUntil
            ? `${toName} is covering ${r.moved} of ${fromName}'s freshers until ${fmtDate(coverUntil)}. They revert automatically.`
            : `Moved ${r.moved} fresher${r.moved === 1 ? '' : 's'} from ${fromName} to ${toName} permanently.`,
        );
        if (r.over_capacity) {
          toast.warning(
            `${toName} now has ${r.target_group_size} freshers, over their cap of ${r.target_capacity}. ` +
            `The move went through — raise their cap or split the group.`,
          );
        }
      }
      await load();
    } catch (e: any) { toast.error(`Couldn't reassign: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const endCover = async (originalLearnerId: string, name: string) => {
    setBusy(`endcover:${originalLearnerId}`);
    try {
      const n = await InductionVolunteerService.adminEndMentorCover(eventId, originalLearnerId);
      toast.success(`Handed ${n} fresher${n === 1 ? '' : 's'} back to ${name}.`);
      await load();
    } catch (e: any) { toast.error(`Couldn't end the cover: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const generateCheckins = async () => {
    setBusy('checkins');
    try {
      const n = await InductionVolunteerService.generateMonthlyCheckins(eventId);
      toast.success(n > 0
        ? `Scheduled ${n} monthly check-in${n === 1 ? '' : 's'} across the first year. Mentors see them in their lane.`
        : `Monthly check-ins are already scheduled — nothing new to add.`);
    } catch (e: any) { toast.error(`Couldn't schedule check-ins: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const moveFresher = async (fresherId: string, name: string, toMentorId: string) => {
    setBusy(`move:${fresherId}`);
    try {
      await InductionVolunteerService.adminAssignFresher(eventId, toMentorId, fresherId);
      toast.success(`Moved ${name}.`);
      await load();
    } catch (e: any) { toast.error(`Couldn't move: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const unassignFresher = async (fresherId: string, name: string) => {
    setBusy(`unassign:${fresherId}`);
    try {
      await InductionVolunteerService.adminUnassignFresher(eventId, fresherId);
      toast.success(`Unassigned ${name} — back in the pool.`);
      await load();
    } catch (e: any) { toast.error(`Couldn't unassign: ${e.message ?? e}`); }
    finally { setBusy(null); }
  };

  const breadcrumb = (
    <PageBreadcrumb items={[
      { label: 'Home', href: '/' },
      { label: 'Events', href: '/events' },
      { label: 'Induction', href: '/events/induction' },
      { label: 'Details', href: `/events/induction/${eventId}` },
      { label: 'Senior Peer Mentors' },
    ]} />
  );

  if (hidden) {
    return (
      <ContentLayout title="Senior Peer Mentors">
        {breadcrumb}
        <Card className="mt-4">
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            You don&apos;t have access to manage Senior Peer Mentors for this induction.
            Contact the induction coordinator or an administrator.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Senior Peer Mentors">
      {breadcrumb}

      {/* Summary + actions */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Manage Senior Peer Mentors &amp; their freshers
          </CardTitle>
          <CardDescription>
            Every mentor and their assigned first-year freshers, in one place. Appoint or remove mentors,
            mark them trained, move a fresher between mentors, and schedule the year&apos;s monthly check-ins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <span className="min-w-0 truncate">Couldn&apos;t load: {loadError}</span>
              <Button size="sm" variant="outline" onClick={load} disabled={loading} className="shrink-0">Retry</Button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Mentors" value={`${activeMentors.length}`} />
            <Stat label="Trained" value={`${trainedCount}/${activeMentors.length}`} />
            <Stat label="Freshers assigned" value={`${assignedCount}`} />
            <Stat label="Unassigned" value={`${unassigned.length}`} warn={unassigned.length > 0} />
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <AppointMentorDialog eventId={eventId} onAppointed={load} triggerLabel="Appoint mentor" />
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="cap" className="text-xs text-muted-foreground">Per-mentor cap</Label>
                <Input id="cap" type="number" min={1} max={100} value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="h-8 w-20" />
              </div>
              {/* Additive and safe to repeat: never moves a fresher who already
                  has a mentor, so this is the button to press after an intake. */}
              <Button size="sm" onClick={() => autobalance('incremental')} disabled={busy !== null || activeMentors.length === 0}>
                <UserPlus className="h-3.5 w-3.5 mr-1" /> {busy === 'autobalance' ? 'Assigning…' : 'Assign pending'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy !== null || activeMentors.length === 0}>
                    <Shuffle className="h-3.5 w-3.5 mr-1" /> Rebalance all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Re-deal every fresher from scratch?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This breaks <strong>all {assignedCount} existing mentor assignments</strong> and deals
                      the cohort again. Freshers a mentor has already walked will likely land with someone
                      else, and any temporary cover in force is discarded.
                      <br /><br />
                      To place only freshers who have no mentor yet, use <strong>Assign pending</strong>.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => autobalance('rebalance')}>Yes, re-deal everyone</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <Button size="sm" variant="outline" onClick={generateCheckins} disabled={busy !== null}>
              <CalendarClock className="h-3.5 w-3.5 mr-1" /> {busy === 'checkins' ? 'Scheduling…' : 'Schedule monthly check-ins'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Temporary covers in force. Shown above everything else because it is
          the one thing that makes the mentor list below read differently: a
          stand-in's group is temporarily larger, and someone else's is empty. */}
      {covers.length > 0 && (
        <Card className="mt-4 border-blue-400 dark:border-blue-500/60">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Clock className="h-4 w-4" /> {covers.length} temporary cover{covers.length === 1 ? '' : 's'} in force
            </CardTitle>
            <CardDescription>
              A stand-in is walking another mentor&apos;s freshers. Each hands back automatically the day
              after its end date &mdash; or hand them back now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {covers.map((c) => (
              <div key={`${c.covering_learner_id}:${c.original_learner_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{c.covering_name}</span>
                    <span className="text-muted-foreground"> is covering </span>
                    <span className="font-medium">{c.original_name}</span>
                    <span className="text-muted-foreground"> &middot; {c.fresher_count} fresher{c.fresher_count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Until {fmtDate(c.cover_until)}{c.cover_note ? ` · ${c.cover_note}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                  disabled={busy !== null}
                  onClick={() => endCover(c.original_learner_id, c.original_name)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Hand back now
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unassigned pool */}
      {unassigned.length > 0 && (
        <Card className="mt-4 border-amber-400 dark:border-amber-500/60">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> {unassigned.length} fresher{unassigned.length === 1 ? '' : 's'} with no mentor
            </CardTitle>
            <CardDescription>Assign each to a mentor, or run Auto-balance above.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-72 overflow-auto">
            {unassigned.map((f) => (
              <div key={f.fresher_learner_id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.fresher_name || 'Unnamed'}</div>
                  <div className="text-xs text-muted-foreground">{f.fresher_register ?? '—'}</div>
                </div>
                <MentorPicker mentors={activeMentors} disabled={busy !== null}
                  onPick={(mentorId) => moveFresher(f.fresher_learner_id, f.fresher_name, mentorId)} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Mentor roster */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading mentors…</p>
        ) : activeMentors.length === 0 ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">
            No Senior Peer Mentors appointed yet. Use <span className="font-medium">Appoint</span> above, then Auto-balance.
          </CardContent></Card>
        ) : (
          activeMentors.map((m) => {
            const isOpen = expanded.has(m.learner_id);
            const list = menteesByMentor.get(m.learner_id) ?? [];
            return (
              <Card key={m.learner_id}>
                <button type="button" onClick={() => toggle(m.learner_id)}
                  className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-muted/40 rounded-t-xl">
                  <div className="flex items-start gap-2 min-w-0">
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" />
                      : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" />}
                    <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <MentorIdentity mentor={m} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={m.group_size > 0 && m.captured >= m.group_size ? 'default' : 'secondary'} className="tabular-nums">
                      {m.captured}/{m.group_size} captured
                    </Badge>
                    {m.is_trained ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                        <ShieldCheck className="h-3 w-3" /> Trained
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs">{m.guide_read && m.self_ack ? 'awaiting admin' : 'untrained'}</Badge>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <CardContent className="border-t pt-3 space-y-2">
                    {/* Mentor-level actions */}
                    <div className="flex flex-wrap gap-2">
                      {m.is_trained ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          disabled={busy !== null} onClick={() => setTrained(m.learner_id, m.full_name, false)}>
                          Mark untrained
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          disabled={busy !== null} onClick={() => setTrained(m.learner_id, m.full_name, true)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark trained
                        </Button>
                      )}
                      {/* Bulk hand-off. The point of the whole cover feature:
                          one action moves this mentor's entire group when they
                          are absent, instead of N individual Move-to picks. */}
                      <ReassignAllDialog
                        fromName={m.full_name}
                        groupSize={list.length}
                        targets={activeMentors.filter((x) => x.learner_id !== m.learner_id)}
                        disabled={busy !== null}
                        onConfirm={(toId, toName, coverUntil, note) =>
                          reassignAll(m.learner_id, m.full_name, toId, toName, coverUntil, note)}
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive"
                        disabled={busy !== null} onClick={() => removeMentor(m.learner_id, m.full_name)}>
                        <X className="h-3.5 w-3.5 mr-1" /> Remove mentor
                      </Button>
                    </div>

                    {/* Mentees */}
                    <div className="text-xs text-muted-foreground">{list.length} fresher{list.length === 1 ? '' : 's'}</div>
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No freshers assigned yet — Auto-balance or assign from the unassigned pool.</p>
                    ) : (
                      <div className="space-y-1 max-h-96 overflow-auto">
                        {list.map((f) => (
                          <div key={f.fresher_learner_id} className="flex items-center justify-between gap-2 rounded-md border p-1.5 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${f.has_feedback ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                                title={f.has_feedback ? 'Feedback captured' : 'No feedback yet'} />
                              <div className="min-w-0">
                                <div className="truncate">
                                  {f.fresher_name || 'Unnamed'}
                                  {/* Shown inline only when it exists — most
                                      freshers have no register number yet, and a
                                      lone em-dash told the reader nothing. */}
                                  {f.fresher_register && (
                                    <span className="ml-2 text-[11px] font-normal text-muted-foreground tabular-nums">
                                      {f.fresher_register}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                  {f.program_name && (
                                    <span className="inline-flex items-center gap-1 min-w-0">
                                      <GraduationCap className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{f.program_name}</span>
                                    </span>
                                  )}
                                  {/* The fresher's own number first — this is the
                                      mentor's contact list. Parent's number is the
                                      fallback and is labelled as such, so nobody
                                      calls a parent thinking it is the student. */}
                                  {(f.student_mobile || f.father_mobile) && (
                                    <a
                                      href={`tel:${f.student_mobile || f.father_mobile}`}
                                      className="inline-flex items-center gap-1 tabular-nums hover:text-foreground hover:underline"
                                      title={f.student_mobile ? 'Student mobile' : "Parent's mobile"}
                                    >
                                      <Phone className="h-3 w-3 shrink-0" />
                                      {f.student_mobile || f.father_mobile}
                                      {!f.student_mobile && <span className="ml-0.5">(parent)</span>}
                                    </a>
                                  )}
                                  {/* Says WHY this fresher sits in a group they do
                                      not normally belong to, and when that ends. */}
                                  {f.is_cover && (
                                    <span className="text-blue-600 dark:text-blue-400">
                                      covering for {f.original_mentor_name ?? 'another mentor'} until {fmtDate(f.cover_until)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <MentorPicker mentors={activeMentors.filter((x) => x.learner_id !== m.learner_id)}
                                label="Move to" disabled={busy !== null}
                                onPick={(toId) => moveFresher(f.fresher_learner_id, f.fresher_name, toId)} />
                              <button type="button" aria-label={`Unassign ${f.fresher_name}`}
                                disabled={busy !== null}
                                onClick={() => unassignFresher(f.fresher_learner_id, f.fresher_name)}
                                className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Honesty cross-check — freshers' monthly "did your mentor help you?" rating
          vs whether the mentor actually performed that month's check-in. This is
          the measure of whether mentoring is REAL, not just polite ratings. */}
      {crosscheck.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" /> Fresher rating vs. mentor activity — honesty check
            </CardTitle>
            <CardDescription>
              Each month, freshers rate how much their mentor helped them. A high rating with NO recorded check-in
              activity from that mentor is flagged below — a fresher may be rating politely rather than accurately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-96 overflow-auto">
            {crosscheck.map((r) => (
              <div key={`${r.volunteer_id}-${r.session_id}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                  r.flagged ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-950/30' : ''
                }`}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.mentor_name || 'Unnamed mentor'}</div>
                  <div className="text-xs text-muted-foreground">{r.month_label} · {r.rating_count}/{r.group_size} rated</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="tabular-nums">avg {r.avg_rating ?? '—'}/5</Badge>
                  <Badge variant={r.mentor_checked_in ? 'default' : 'secondary'}>
                    {r.mentor_checked_in ? 'Mentor checked in' : 'No check-in recorded'}
                  </Badge>
                  {r.flagged && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-medium text-white">
                      <ShieldAlert className="h-3 w-3" /> Flagged
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Mentors mark attendance &amp; collect feedback for their freshers from their own lane at{' '}
        <Link href="/my-induction-feedback" className="underline">My Senior Peer Mentor</Link>. Their tools stay
        locked until fully trained, and the mentorship ends automatically at the freshers&apos; first-year end.
      </p>
    </ContentLayout>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${warn ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-950/30' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Move one mentor's whole group to a stand-in, in a single action.
 *
 * The choice that matters is temporary vs permanent, so it is a radio pair
 * rather than a checkbox: "cover until <date>" and "permanent" are different
 * decisions with different consequences, and a checkbox labelled "temporary"
 * would leave the permanent case unnamed. A cover records the original mentor
 * and reverts automatically; a permanent move does not.
 */
function ReassignAllDialog({
  fromName, groupSize, targets, disabled, onConfirm,
}: {
  fromName: string;
  groupSize: number;
  targets: FeedbackVolunteer[];
  disabled?: boolean;
  onConfirm: (toId: string, toName: string, coverUntil: string | null, note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [toId, setToId] = useState('');
  const [temporary, setTemporary] = useState(true);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');

  const target = targets.find((t) => t.learner_id === toId);
  // A temporary cover with no end date has nothing to revert on, so the date is
  // required in that mode — otherwise "temporary" would silently be permanent.
  const ready = Boolean(toId) && (!temporary || Boolean(until));

  const reset = () => { setToId(''); setTemporary(true); setUntil(''); setNote(''); };

  const submit = () => {
    if (!ready || !target) return;
    onConfirm(
      toId,
      target.full_name || 'the new mentor',
      temporary ? until : null,
      note.trim() || null,
    );
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || groupSize === 0 || targets.length === 0}>
          <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Reassign all
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign {fromName}&apos;s freshers</DialogTitle>
          <DialogDescription>
            Moves all {groupSize} fresher{groupSize === 1 ? '' : 's'} to another Senior Peer Mentor in one step
            &mdash; for when {fromName} is absent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="reassign-to" className="text-xs text-muted-foreground">Move to</Label>
            <select
              id="reassign-to"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="" disabled>Choose a mentor…</option>
              {targets.map((t) => (
                <option key={t.learner_id} value={t.learner_id}>
                  {t.full_name || t.register_number || 'Mentor'} ({t.group_size}/{t.capacity})
                </option>
              ))}
            </select>
            {/* Reported, not enforced — the move is allowed to overflow, because
                leaving freshers with nobody is worse than an oversized group. */}
            {target && groupSize + target.group_size > target.capacity && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                This takes {target.full_name} to {groupSize + target.group_size} freshers, over their cap of {target.capacity}.
                The move is still allowed.
              </p>
            )}
          </div>

          <div className="space-y-1.5 rounded-md border p-2.5">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" checked={temporary} onChange={() => setTemporary(true)} className="mt-1" />
              <span>
                <span className="font-medium">Temporary cover</span>
                <span className="block text-xs text-muted-foreground">
                  They hand back to {fromName} automatically after the end date.
                </span>
              </span>
            </label>
            {temporary && (
              <div className="pl-6 space-y-1">
                <Label htmlFor="cover-until" className="text-xs text-muted-foreground">Cover until (inclusive)</Label>
                <Input id="cover-until" type="date" min={todayISO()} value={until}
                  onChange={(e) => setUntil(e.target.value)} className="h-8" />
              </div>
            )}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" checked={!temporary} onChange={() => setTemporary(false)} className="mt-1" />
              <span>
                <span className="font-medium">Permanent</span>
                <span className="block text-xs text-muted-foreground">
                  The new mentor owns them outright. Nothing reverts.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cover-note" className="text-xs text-muted-foreground">Reason (optional)</Label>
            <Input id="cover-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. on leave this week" className="h-8" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!ready}>
            {temporary ? `Cover ${groupSize}` : `Move ${groupSize} permanently`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A tiny mentor dropdown for move/assign. Native select — 20-ish mentors, no need for a combobox. */
function MentorPicker({
  mentors, onPick, label = 'Assign to', disabled,
}: {
  mentors: FeedbackVolunteer[];
  onPick: (mentorLearnerId: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled || mentors.length === 0}
      defaultValue=""
      onChange={(e) => { const v = e.target.value; if (v) { onPick(v); e.target.value = ''; } }}
      className="h-7 rounded-md border bg-background px-1.5 text-xs max-w-[9rem] disabled:opacity-50"
    >
      <option value="" disabled>{label}…</option>
      {mentors.map((m) => (
        <option key={m.learner_id} value={m.learner_id}>{m.full_name || m.register_number || 'Mentor'}</option>
      ))}
    </select>
  );
}
