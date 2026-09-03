'use client';

// Induction sessions — day-by-day schedule editor. All reads/writes go through
// the gated DEFINER RPCs via InductionService (event_sessions RLS is admin-only).
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type AttendanceCoverageRow,
  type InductionSessionRow,
  type ResourceLink,
} from '@/lib/services/induction/induction-service';
import { InductionSpeakersService, type DirectoryUser } from '@/lib/services/induction/induction-speakers-service';
import { PersonAvailabilityService } from '@/lib/services/availability/person-availability';
import { useAuth } from '@/hooks/use-auth';
import { AttendanceDialog } from './attendance-dialog';
import { AttendanceCoverageBanner } from './attendance-coverage-banner';
import { AttendancePdfButton } from './attendance-pdf-button';
import { DayAttendanceDialog } from './day-attendance-dialog';
import { FeedbackKioskDialog } from './feedback-kiosk-dialog';
import { SessionPollDialog } from './session-poll-dialog';
import { SessionQuestionDialog } from './session-question-dialog';
import { SessionShareDialog } from './session-share-dialog';
import { SessionSpeakerPicker } from './session-speaker-picker';
import {
  InductionSharingService,
  type SessionShareRow,
} from '@/lib/services/induction/induction-sharing-service';
import { VenueRoomPicker } from '@/app/(routes)/meetings/manage/_components/venue-room-picker';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, MapPin, User, Users, Target, LinkIcon, X, Star, CalendarDays, Settings2, Share2, ClipboardList } from 'lucide-react';

interface Batch { id: string; label: string; }
const COMBINED = '__combined__';

// ISO <-> <input type="datetime-local"> ('YYYY-MM-DDTHH:mm', local time)
function isoToLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function SessionsSection({
  eventId,
  batches,
  isLive,
}: {
  eventId: string;
  batches: Batch[];
  // Lifecycle mirror, NOT the gate. The real refusal is a BEFORE INSERT/UPDATE
  // trigger on event_session_attendance / event_session_feedback
  // (fn_induction_assert_live). This flag only stops us OFFERING a control the
  // database is going to refuse — same pattern as canEditEvent vs events_auth_update.
  // Building the schedule stays available in Draft; only running it does not.
  isLive: boolean;
}) {
  const { profile } = useAuth();
  // Server-truth event-level manage gate (admin / induction.manage WITH access to
  // THIS event's institution / per-event coordinator). Mirrors the DEFINER RPCs
  // exactly — a scope='own' resource person with no access to this event's
  // institution is NOT a manager, so edit/delete/Add-session/Mark-day-attendance
  // stay hidden on rows that aren't theirs (per-session tools still show via
  // isMySession below). Starts false → manage UI appears only once confirmed.
  const [canManage, setCanManage] = useState(false);
  const [sessions, setSessions] = useState<InductionSessionRow[]>([]);
  // session id → linked resource persons (shown on the card + drives per-session access)
  const [sessionSpeakers, setSessionSpeakers] = useState<Record<string, DirectoryUser[]>>({});
  // session id → OTHER colleges this session is co-conducted with (Director D2).
  // Labelling only — sharing carries no attendance/completion meaning yet.
  const [sessionShares, setSessionShares] = useState<Record<string, SessionShareRow[]>>({});
  const [feedback, setFeedback] = useState<Record<string, { avg: number; count: number }>>({});
  const [dayFeedback, setDayFeedback] = useState<Record<number, { avg: number; count: number }>>({});
  // per-day past-vs-marked attendance coverage (drives the back-mark nudge; empty for non-managers)
  const [coverage, setCoverage] = useState<AttendanceCoverageRow[]>([]);
  // distinguish "gate denied" (hide banner) from a real load failure (show
  // "unavailable" — a silent hide would read as "everything marked")
  const [coverageFailed, setCoverageFailed] = useState(false);
  const [programFeedback, setProgramFeedback] = useState<{ avg: number; count: number } | null>(null);
  const [scopes, setScopes] = useState({ dayEnabled: false, programEnabled: false });
  const [scopesSaving, setScopesSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InductionSessionRow | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [day, setDay] = useState('1');
  const [batchId, setBatchId] = useState(COMBINED);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  // STRICT venue: a Resource Management room id (no free text). venueInitialName
  // holds the stored venue_text so the picker trigger shows the real room name
  // before the room list loads (and even if the room is no longer listed); for a
  // legacy session it also surfaces the pre-existing typed venue to prompt linking.
  const [venueResourceId, setVenueResourceId] = useState('');
  const [venueInitialName, setVenueInitialName] = useState('');
  const [outcome, setOutcome] = useState('');
  const [links, setLinks] = useState<ResourceLink[]>([]);
  // The fresher REGISTRATION DESK (event_sessions.kind = 'registration'). A desk
  // needs no resource person, and Senior Peer Mentors staff it — so ticking this
  // hides the speaker picker here and opens the session to mentors server-side.
  const [isRegistration, setIsRegistration] = useState(false);
  const [speakers, setSpeakers] = useState<DirectoryUser[]>([]);
  // Guard: never write the speaker set until existing links have loaded, so a
  // save before/without a successful load can't silently wipe them.
  const [speakersLoaded, setSpeakersLoaded] = useState(false);
  // Retry-safe create: holds the id of a session created this open, so a retry
  // after a failed speaker-write updates the same row instead of duplicating it.
  const lastCreatedIdRef = useRef<string | null>(null);

  // Re-read cross-college shares on their own. Separated from load() so the
  // share dialog can refresh just this slice after an add/remove without
  // re-fetching the whole schedule (and without flashing the loading state).
  const loadShares = useCallback(() => {
    InductionSharingService.listEventShares(eventId)
      .then((rows) => {
        const byId: Record<string, SessionShareRow[]> = {};
        InductionSharingService.groupBySession(rows).forEach((v, k) => { byId[k] = v; });
        setSessionShares(byId);
      })
      .catch(() => setSessionShares({}));
  }, [eventId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, summary, sc, daySummary, progSummary, coverageRows] = await Promise.all([
        InductionService.listSessions(eventId),
        InductionService.getSessionFeedbackSummary(eventId).catch(() => []),
        InductionService.getFeedbackScopes(eventId).catch(() => ({ dayEnabled: false, programEnabled: false })),
        InductionService.getDayFeedbackSummary(eventId).catch(() => []),
        InductionService.getProgramFeedbackSummary(eventId).catch(() => null),
        // gated to managers/coordinators server-side — an auth denial hides the
        // banner; any OTHER failure is surfaced as "coverage unavailable".
        // Denial = SQLSTATE P0001: every RAISE in fn_induction_attendance_coverage
        // is an auth denial (contract documented in the fn), so the code alone is
        // exact — no message-text matching that could rot on a rewording.
        // Live-verified: a denied student call returns {code:'P0001'}.
        InductionService.getAttendanceCoverage(eventId)
          .then((rows) => ({ rows, failed: false }))
          .catch((e: any) => ({
            rows: [] as AttendanceCoverageRow[],
            failed: e?.code !== 'P0001',
          })),
      ]);
      setSessions(rows);
      // linked resource persons for every session (non-blocking: chips just stay empty on failure)
      InductionSpeakersService.getSpeakersBySession(rows.map((r) => r.id))
        .then(setSessionSpeakers)
        .catch(() => setSessionSpeakers({}));
      // cross-college shares, one call for the whole event (non-blocking, same
      // reasoning as speakers: a failure hides the badges, never the schedule)
      loadShares();
      const fb: Record<string, { avg: number; count: number }> = {};
      for (const s of summary) fb[s.session_id] = { avg: Number(s.avg_rating), count: s.response_count };
      setFeedback(fb);
      setScopes(sc);
      const df: Record<number, { avg: number; count: number }> = {};
      for (const d of daySummary) df[d.day_number] = { avg: Number(d.avg_rating), count: d.response_count };
      setDayFeedback(df);
      setProgramFeedback(progSummary ? { avg: Number(progSummary.avg_rating), count: progSummary.response_count } : null);
      setCoverage(coverageRows.rows);
      setCoverageFailed(coverageRows.failed);
    } catch (e: any) {
      // total load failure (e.g. listSessions): clear stale coverage so an old
      // "all clear" can't linger, but DON'T claim "coverage unavailable" — the
      // toast already announces the real failure and the banner is moot here
      setCoverage([]); setCoverageFailed(false);
      toast.error(`Couldn't load sessions: ${e.message ?? e}`);
    }
    finally { setLoading(false); }
  }, [eventId, loadShares]);
  useEffect(() => { load(); }, [load]);

  // Access model: admins / induction.manage holders / per-event coordinators manage
  // everything; a resource person views all sessions but operates (attendance,
  // feedback kiosk, polls) ONLY on sessions they're assigned to. The DEFINER RPCs
  // enforce the same rules server-side — this just keeps the UI honest.
  useEffect(() => {
    InductionService.canManageEvent(eventId).then(setCanManage).catch(() => setCanManage(false));
  }, [eventId]);

  const resetForm = () => {
    setDay('1'); setBatchId(COMBINED); setStart(''); setEnd('');
    setTitle(''); setSpeaker(''); setVenueResourceId(''); setVenueInitialName('');
    setOutcome(''); setLinks([]); setSpeakers([]); setIsRegistration(false);
    setSpeakersLoaded(false);
    lastCreatedIdRef.current = null;
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setSpeakersLoaded(true);   // new session has no speakers → safe to write
    setOpen(true);
  };
  const openEdit = (s: InductionSessionRow) => {
    setEditing(s);
    setDay(String(s.day_number ?? 1));
    setBatchId(s.batch_id ?? COMBINED);
    setStart(isoToLocal(s.start_at)); setEnd(isoToLocal(s.end_at));
    setTitle(s.title); setSpeaker(s.speaker_text ?? '');
    setIsRegistration(s.kind === 'registration');
    setVenueResourceId(s.venue_resource_id ?? '');
    setVenueInitialName(s.venue_text ?? '');
    setOutcome(s.outcome_text ?? ''); setLinks(s.resource_links ?? []);
    setSpeakers([]);
    setSpeakersLoaded(false);
    InductionSpeakersService.getSessionSpeakers(s.id)
      .then((r) => { setSpeakers(r); setSpeakersLoaded(true); })
      .catch(() => setSpeakers([]));   // leave speakersLoaded false → save won't wipe
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Title is required.'); return; }
    if (!start || !end) { toast.error('Start and end time are required.'); return; }
    if (new Date(end) <= new Date(start)) { toast.error('End must be after start.'); return; }

    // Tiered double-booking guard (availability spine, Limb 2): a meeting OR
    // event-speaking clash BLOCKS (a person can't be in two of those at once);
    // a teaching/class clash is advisory (shown as a warning in the picker, not
    // blocked). A super-admin may force past a hard block.
    if (speakers.length && start && end) {
      try {
        const rows = await PersonAvailabilityService.getPeopleConflicts(
          speakers.map((s) => s.id),
          new Date(start).toISOString(),
          new Date(end).toISOString(),
          // the session being saved is never a clash with itself — same id the
          // upsert below reuses, so a retry after a failed speaker-write is
          // excluded too.
          editing?.id ?? lastCreatedIdRef.current,
        );
        const hard = rows.filter((r) => r.source === 'meeting' || r.source === 'event');
        if (hard.length) {
          const nameById = new Map(speakers.map((s) => [s.id, s.full_name || s.email || 'Someone']));
          const who = [...new Set(hard.map((h) => (h.profile_id ? nameById.get(h.profile_id) : null) ?? 'Someone'))].join(', ');
          if (profile?.is_super_admin) {
            if (!window.confirm(`${who} already has a meeting or another event at this time. Force the assignment anyway? (admin override)`)) return;
          } else {
            toast.error(`Can't assign — ${who} already has a meeting or event at this time. Pick another time, or remove them.`);
            return;
          }
        }
      } catch {
        /* availability check failed — don't block the save on a transient hiccup */
      }
    }

    setSaving(true);
    try {
      // On a retry after a failed speaker-write, reuse the just-created id so we
      // update the same session instead of inserting a duplicate.
      const sessionId = editing?.id ?? lastCreatedIdRef.current;
      const sid = await InductionService.upsertSession({
        eventId,
        sessionId,
        dayNumber: Number(day) || null,
        batchId: batchId === COMBINED ? null : batchId,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        title: title.trim(),
        speakerText: speaker.trim() || null,
        // STRICT: send only the chosen room id — the RPC derives venue_text from
        // the registry name (or clears it when no room is chosen). No free text.
        venueResourceId: venueResourceId || null,
        // Always explicit from this form (it owns the checkbox), so unticking
        // clears the kind rather than leaving a stale 'registration' — except on
        // a mentor check-in, where omitting the key leaves the stored kind alone.
        // (The RPC enforces this too; sending nothing keeps the intent obvious.)
        kind: editing?.kind === 'mentor_checkin' ? undefined : isRegistration ? 'registration' : '',
        outcomeText: outcome.trim() || null,
        resourceLinks: links.filter((l) => l.url.trim()),
      });
      lastCreatedIdRef.current = sid;   // remember before the speaker write can fail
      // link the chosen resource persons to real user records (replace-set) —
      // only if existing links loaded, else a wipe-before-load is silent data loss
      if (speakersLoaded) {
        await InductionSpeakersService.setSessionSpeakers(sid, speakers.map((u) => u.id));
      }
      toast.success(editing ? 'Session updated.' : 'Session added.');
      setOpen(false); resetForm(); await load();
    } catch (e: any) {
      toast.error(`Couldn't save session: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const remove = async (s: InductionSessionRow) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    try { await InductionService.deleteSession(s.id); toast.success('Session deleted.'); await load(); }
    catch (e: any) { toast.error(`Couldn't delete: ${e.message ?? e}`); }
  };

  const toggleScope = async (key: 'dayEnabled' | 'programEnabled', value: boolean) => {
    const next = { ...scopes, [key]: value };
    setScopes(next);   // optimistic
    setScopesSaving(true);
    try {
      await InductionService.setFeedbackScopes(eventId, next.dayEnabled, next.programEnabled);
    } catch (e: any) {
      setScopes(scopes);   // revert on failure
      toast.error(`Couldn't update feedback settings: ${e.message ?? e}`);
    } finally { setScopesSaving(false); }
  };

  // group by day
  const byDay = new Map<number, InductionSessionRow[]>();
  for (const s of sessions) {
    const d = s.day_number ?? 0;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Sessions
              {sessions.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">
                  {sessions.length}
                </span>
              )}
            </CardTitle>
            <CardDescription>The day-by-day schedule — topics, speakers, venues, outcomes, and resources.</CardDescription>
          </div>
          {canManage && (
          <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1">
                <Settings2 className="h-4 w-4" /> Feedback settings
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">Day-end feedback</div>
                  <div className="text-xs text-muted-foreground">One rating per fresher per day.</div>
                </div>
                <Switch checked={scopes.dayEnabled} disabled={scopesSaving}
                  onCheckedChange={(v) => toggleScope('dayEnabled', v)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">Overall program feedback</div>
                  <div className="text-xs text-muted-foreground">One rating per fresher for the whole induction.</div>
                </div>
                <Switch checked={scopes.programEnabled} disabled={scopesSaving}
                  onCheckedChange={(v) => toggleScope('programEnabled', v)} />
              </div>
              {programFeedback && (
                <div className="border-t pt-2 text-xs text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  Overall: {programFeedback.avg.toFixed(1)} · {programFeedback.count} response{programFeedback.count === 1 ? '' : 's'}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add session</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit session' : 'Add session'}</DialogTitle>
                <DialogDescription>One slot of the schedule. Combined = both batches together.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-day">Day</Label>
                    <Input id="s-day" type="number" min={1} value={day} onChange={(e) => setDay(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Batch</Label>
                    <Select value={batchId} onValueChange={setBatchId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={COMBINED}>Combined (all batches)</SelectItem>
                        {batches.map((b) => <SelectItem key={b.id} value={b.id}>Batch {b.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-start">Start</Label>
                    <Input id="s-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-end">End</Label>
                    <Input id="s-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-title">Topic / activity</Label>
                  <Input id="s-title" placeholder="e.g. Unmute Yourself" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-speaker">Group / note (optional)</Label>
                  <Input id="s-speaker" placeholder="e.g. English Department" value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Venue</Label>
                  <VenueRoomPicker
                    value={venueResourceId}
                    onChange={setVenueResourceId}
                    initialName={venueInitialName || null}
                    disabled={saving}
                    strict
                  />
                  {!venueResourceId && venueInitialName && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Current venue “{venueInitialName}” was typed in, not linked to a room. Pick the matching
                      room from the list to link it — saving without picking will clear the venue.
                    </p>
                  )}
                </div>
                {/* Registration desk: no speaker, mentor-staffed. Sits directly
                    above the picker it replaces so the swap is self-explaining.
                    Hidden for a monthly mentor check-in — that kind is owned by
                    the training flow and is not convertible (the RPC refuses it
                    either way; this just avoids offering a no-op control). */}
                <div className={`rounded-md border p-3 ${editing?.kind === 'mentor_checkin' ? 'hidden' : ''}`}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={isRegistration}
                      onChange={(e) => setIsRegistration(e.target.checked)}
                      disabled={saving}
                    />
                    <span className="text-sm">
                      <span className="font-medium flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5" /> Registration desk
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        No resource person needed. Senior Peer Mentors of this induction can take
                        this session&apos;s attendance for the whole cohort, without waiting for their
                        training to be recorded.
                      </span>
                    </span>
                  </label>
                </div>
                <div className={`space-y-1.5 ${isRegistration ? 'hidden' : ''}`}>
                  <Label>Resource persons (linked users)</Label>
                  <SessionSpeakerPicker
                    value={speakers}
                    onChange={setSpeakers}
                    disabled={saving}
                    sessionStart={start}
                    sessionEnd={end}
                    excludeSessionId={editing?.id ?? lastCreatedIdRef.current}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-outcome">Outcome (what this session aims to achieve)</Label>
                  <Textarea id="s-outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Resource links (slides, Drive folders)</Label>
                    <Button type="button" size="sm" variant="ghost"
                      onClick={() => setLinks([...links, { label: '', url: '' }])}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add link
                    </Button>
                  </div>
                  {links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Label" value={l.label}
                        onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="w-1/3" />
                      <Input placeholder="https://…" value={l.url}
                        onChange={(e) => setLinks(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add session'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Back-mark nudge — managers/coordinators only (the RPC is gated anyway;
            this just avoids rendering an empty slot for students/speakers).
            canManage is the server-truth event manage gate (fn_induction_can_manage_event),
            which already includes per-event coordinators. */}
        {/* Draft explains itself. Without this the attendance and feedback icons
            simply vanish from every row and the coordinator has no idea why —
            the failure mode that made the missing lifecycle gate hard to spot in
            the first place. */}
        {!isLive && !loading && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-950/30">
            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-amber-900 dark:text-amber-200">
              This induction is a <strong>Draft</strong>. Freshers cannot see it, and attendance,
              feedback and polls are closed. Build the schedule here, then set the status to{' '}
              <strong>Live</strong> to open it.
            </p>
          </div>
        )}
        {/* Back-mark coverage compares past sessions against marks — meaningless
            while nothing can be marked. */}
        {canManage && isLive && !loading && (
          <AttendanceCoverageBanner coverage={coverage} unavailable={coverageFailed} />
        )}
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-sm font-medium">No sessions yet</p>
            <p className="text-xs text-muted-foreground">
              {canManage ? 'Add the first one to start building the day-by-day schedule.' : 'The schedule hasn’t been published yet.'}
            </p>
            {canManage && (
              <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Add session
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {days.map((d) => {
              const daySessions = byDay.get(d)!;
              return (
                <div key={d} className="space-y-2">
                  {/* Day header band */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 items-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary">
                      {d === 0 ? 'Unscheduled' : `Day ${d}`}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {daySessions.length} session{daySessions.length === 1 ? '' : 's'}
                    </span>
                    {scopes.dayEnabled && dayFeedback[d] && (
                      <Badge variant="outline" className="gap-1" title={`${dayFeedback[d].count} response(s)`}>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {dayFeedback[d].avg.toFixed(1)} · {dayFeedback[d].count}
                      </Badge>
                    )}
                    <div className="h-px flex-1 bg-border" />
                    {d !== 0 && canManage && (
                      <>
                        {isLive && <DayAttendanceDialog eventId={eventId} dayNumber={d} dayLabel={`Day ${d}`} />}
                        <AttendancePdfButton eventId={eventId} dayNumber={d} dayLabel={`Day ${d}`} />
                      </>
                    )}
                  </div>

                  {/* Agenda rows — time gutter + session card */}
                  <div className="space-y-2">
                    {daySessions.map((s) => {
                      const speakers = sessionSpeakers[s.id] ?? [];
                      const isMySession = speakers.some((u) => u.id === profile?.id);
                      const canOperate = canManage || isMySession;
                      return (
                      <div key={s.id} className="group flex flex-wrap gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30">
                        {/* time gutter */}
                        <div className="w-14 shrink-0 pt-0.5 text-right">
                          <div className="text-sm font-semibold leading-tight tabular-nums">{fmtTime(s.start_at)}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(s.end_at)}</div>
                        </div>
                        {/* content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.title}</span>
                            {s.kind === 'registration' && (
                              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                                title="Registration desk — Senior Peer Mentors can take this session's attendance">
                                <ClipboardList className="h-3 w-3" /> Registration
                              </Badge>
                            )}
                            <Badge variant="secondary">{s.batch_label ? `Batch ${s.batch_label}` : 'Combined'}</Badge>
                            {feedback[s.id] && (
                              <Badge variant="outline" className="gap-1" title={`${feedback[s.id].count} response(s)`}>
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {feedback[s.id].avg.toFixed(1)} · {feedback[s.id].count}
                              </Badge>
                            )}
                            {/* co-conducted with other colleges (D2). Names in the
                                tooltip so a 4-college share doesn't wrap the row. */}
                            {(sessionShares[s.id]?.length ?? 0) > 0 && (
                              <Badge variant="outline" className="gap-1"
                                title={`Shared with ${sessionShares[s.id].map((x) => x.institution_name).join(', ')}`}>
                                <Share2 className="h-3 w-3" />
                                {sessionShares[s.id].length === 1
                                  ? sessionShares[s.id][0].institution_name
                                  : `${sessionShares[s.id].length} colleges`}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {s.venue_text && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.venue_text}</span>}
                            {s.speaker_text && <span className="flex items-center gap-1"><User className="h-3 w-3" />{s.speaker_text}</span>}
                            {speakers.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {speakers.map((u, i) => (
                                  <span key={u.id}>
                                    {i > 0 && ', '}
                                    <span className={u.id === profile?.id ? 'font-medium text-foreground' : undefined}>
                                      {u.full_name || u.email}{u.id === profile?.id ? ' (you)' : ''}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                          {s.outcome_text && (
                            <p className="mt-1.5 text-xs text-muted-foreground flex items-start gap-1">
                              <Target className="h-3 w-3 mt-0.5 shrink-0" />{s.outcome_text}
                            </p>
                          )}
                          {s.resource_links?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              {s.resource_links.map((l, i) => (
                                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                                  <LinkIcon className="h-3 w-3" />{l.label || 'Resource'}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* actions — operate on assigned sessions; edit/delete for managers only */}
                        <div className="flex gap-1 shrink-0 w-full justify-end sm:w-auto">
                          {canOperate && (
                            <>
                              {/* Marking, capture and polls are all "running the
                                  induction" — Live only. The PDF below is a
                                  read-only export and stays available so a
                                  coordinator can still print blank sheets while
                                  the programme is being prepared. */}
                              {isLive && <AttendanceDialog sessionId={s.id} sessionTitle={s.title} />}
                              {/* Sits next to the attendance icon on purpose — mark
                                  it, then download the sheet for that same session. */}
                              <AttendancePdfButton eventId={eventId} session={s} />
                              {isLive && (
                                <>
                                  <FeedbackKioskDialog sessionId={s.id} sessionTitle={s.title} />
                                  <SessionPollDialog sessionId={s.id} sessionTitle={s.title} />
                                  {/* Learners ask + upvote; opening this switches the board on. */}
                                  <SessionQuestionDialog sessionId={s.id} sessionTitle={s.title} />
                                </>
                              )}
                            </>
                          )}
                          {canManage && (
                            <>
                              {/* D10: only the HOST college manages sharing, so this
                                  sits behind the same gate as edit/delete. */}
                              <SessionShareDialog
                                sessionId={s.id}
                                sessionTitle={s.title}
                                shares={sessionShares[s.id] ?? []}
                                onChanged={loadShares}
                              />
                              <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
