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
  type AssignablePeerMentor,
  type MentorHelpfulnessCrosscheckRow,
} from '@/lib/services/induction/induction-volunteer-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import {
  GraduationCap, ChevronDown, ChevronRight, ShieldCheck, X, UserPlus, Search,
  Scale, CalendarClock, Users, CheckCircle2, Loader2, AlertTriangle, ShieldAlert,
} from 'lucide-react';

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [capacity, setCapacity] = useState(20);
  const [busy, setBusy] = useState<string | null>(null); // a label for the in-flight action

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [v, m, u, c] = await Promise.all([
        InductionVolunteerService.listVolunteers(eventId),
        InductionVolunteerService.adminMentorMentees(eventId),
        InductionVolunteerService.adminUnassignedFreshers(eventId),
        InductionVolunteerService.mentorHelpfulnessCrosscheck(eventId),
      ]);
      setMentors(v);
      setMentees(m);
      setUnassigned(u);
      setCrosscheck(c);
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

  const setTrained = async (learnerId: string, name: string, trained: boolean) => {
    setBusy(`trained:${learnerId}`);
    try {
      await InductionVolunteerService.adminSetTrained(eventId, learnerId, trained);
      toast.success(trained ? `${name} marked trained — their tools are unlocked.` : `${name} marked untrained.`);
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

  const autobalance = async () => {
    setBusy('autobalance');
    try {
      const r = await InductionVolunteerService.autobalanceVolunteers(eventId, capacity);
      if (r.unassigned > 0) {
        toast.warning(`Assigned ${r.assigned}/${r.enrolled}. ${r.unassigned} fresher(s) still have NO mentor — raise the cap or appoint more mentors.`);
      } else {
        toast.success(`Assigned all ${r.assigned} freshers across ${activeMentors.length} mentor(s).`);
      }
      await load();
    } catch (e: any) { toast.error(`Couldn't auto-balance: ${e.message ?? e}`); }
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
            <AppointMentorDialog eventId={eventId} onAppointed={load} />
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="cap" className="text-xs text-muted-foreground">Per-mentor cap</Label>
                <Input id="cap" type="number" min={1} max={100} value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="h-8 w-20" />
              </div>
              <Button size="sm" variant="outline" onClick={autobalance} disabled={busy !== null || activeMentors.length === 0}>
                <Scale className="h-3.5 w-3.5 mr-1" /> {busy === 'autobalance' ? 'Balancing…' : 'Auto-balance'}
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={generateCheckins} disabled={busy !== null}>
              <CalendarClock className="h-3.5 w-3.5 mr-1" /> {busy === 'checkins' ? 'Scheduling…' : 'Schedule monthly check-ins'}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40 rounded-t-xl">
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.full_name || 'Unnamed'}</div>
                      <div className="text-xs text-muted-foreground">{m.register_number ?? '—'} · cap {m.capacity}</div>
                    </div>
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
                                <div className="truncate">{f.fresher_name || 'Unnamed'}</div>
                                <div className="text-[11px] text-muted-foreground">{f.fresher_register ?? '—'}</div>
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
      } catch { /* surfaced on appoint */ }
      finally { if (active) setSearching(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, eventId]);

  const appoint = async (m: AssignablePeerMentor) => {
    setAppointing(m.learner_id);
    try {
      await InductionVolunteerService.appointVolunteer(eventId, m.learner_id);
      toast.success(`${m.full_name} is now a Senior Peer Mentor.`);
      setOpen(false);
      onAppointed();
    } catch (e: any) { toast.error(`Couldn't appoint: ${e.message ?? e}`); }
    finally { setAppointing(null); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserPlus className="h-3.5 w-3.5 mr-1" /> Appoint mentor</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Appoint a Senior Peer Mentor</DialogTitle>
          <DialogDescription>
            Only 3rd-year students (or final-year of a 2-year PG) can be mentors — the list is already filtered to them.
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
            <p className="text-sm text-muted-foreground py-2">No appointable mentors found.</p>
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
