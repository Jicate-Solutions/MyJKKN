'use client';

// School of Influence — attendance tick-list + completion bar (spec §7 S6).
//
// D11 — a coordinator ticks a list each session.
// D9  — completion is the attendance share measured against
//       soi.completion.min_attendance_pct, READ AT RUNTIME. This file never
//       states that number: it renders `min_attendance_pct` exactly as the
//       database returned it, so the screen always shows the bar the database
//       actually judged against.
//
// FAST FOR A ROOM OF 30. Opening a session loads one roster, every line pre-set
// to the mark already stored, "Mark everyone present" fills the list in one
// click, and Save is a single round trip. Nothing auto-saves per tap — a
// half-saved register is worse than an unsaved one.
//
// PERMISSION FAILURES ARE EXPLICIT (CLAUDE.md rule 27). Every RPC raises 42501
// with a sentence naming the permission; the service turns that into status 403
// and this component renders it as an access panel. Nothing here redirects, and
// nothing renders an empty list where a refusal belongs.
//
// UNTRACKABLE MEMBERS ARE SHOWN, NOT HIDDEN. The register stores marks against a
// learner record; a staff member (D4 admits staff) has none, so no mark can
// exist for them. They stay on the list with the reason spelled out and sit
// outside the completion figures — never counted as absent, never silently
// dropped.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, ClipboardCheck, Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { SoiBatchService } from '@/lib/services/school-of-influence/batch-service';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';
import {
  SOI_ATTENDANCE_STATUSES,
  SoiAttendanceService,
  type SoiAttendanceStatus,
  type SoiCompletionRow,
  type SoiRosterRow,
  type SoiSession,
} from '@/lib/services/school-of-influence/attendance-service';
import type { Cohort } from '@/lib/types/cohort-core';

/** Colour per mark, matching the register convention already used elsewhere. */
const MARK_STYLE: Record<SoiAttendanceStatus, string> = {
  present: 'bg-green-600 text-white border-green-600',
  absent: 'bg-red-600 text-white border-red-600',
  excused: 'bg-amber-500 text-white border-amber-500',
  od: 'bg-blue-600 text-white border-blue-600',
};

const STATE_LABEL: Record<SoiCompletionRow['completion_state'], string> = {
  met: 'Bar met',
  on_track: 'Still reachable',
  cannot_meet: 'Cannot reach the bar',
  not_tracked: 'Not measured',
};

const STATE_STYLE: Record<SoiCompletionRow['completion_state'], string> = {
  met: 'bg-green-100 text-green-800 border-green-200',
  on_track: 'bg-amber-100 text-amber-900 border-amber-200',
  cannot_meet: 'bg-red-100 text-red-800 border-red-200',
  not_tracked: 'bg-slate-100 text-slate-700 border-slate-200',
};

function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? 'Something went wrong.';
}

function isDenied(error: unknown): boolean {
  return (error as { status?: number })?.status === 403;
}

function whenText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Explicit refusal panel — never a redirect, never an empty list (rule 27). */
function AccessPanel({ message }: { message: string }) {
  return (
    <Card className="mt-4 border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> You do not have access
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

interface Props {
  /** Programme event whose batches this screen offers. */
  eventId: string | null;
  /** Deep-linked batch, if the coordinator arrived from the batch admin. */
  initialCohortId: string | null;
}

export function AttendanceWorkspace({ eventId, initialCohortId }: Props) {
  const [batches, setBatches] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState<string | null>(initialCohortId);
  const [sessions, setSessions] = useState<SoiSession[]>([]);
  const [completion, setCompletion] = useState<SoiCompletionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  const [openSession, setOpenSession] = useState<SoiSession | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // ── Batch list. Reuses SoiBatchService (S3) rather than re-querying cohorts:
  // one lister, one definition of "a batch of this programme".
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    SoiBatchService.listBatches(eventId)
      .then((rows) => {
        if (cancelled) return;
        setBatches(rows);
        setCohortId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isDenied(error)) setDenied(messageOf(error));
        else toast.error(`Couldn't load the batches: ${messageOf(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const refresh = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    setDenied(null);
    try {
      const [sessionRows, completionRows] = await Promise.all([
        SoiAttendanceService.listSessions(cohortId),
        SoiAttendanceService.getCompletion(cohortId),
      ]);
      setSessions(sessionRows);
      setCompletion(completionRows);
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
      setSessions([]);
      setCompletion([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => SoiAttendanceService.summarise(completion), [completion]);

  if (denied) return <AccessPanel message={denied} />;

  if (!cohortId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Pick a batch</CardTitle>
          <CardDescription>
            {eventId
              ? 'This programme has no School of Influencer batches yet. Create one from the batch admin, then come back here to run the register.'
              : 'Open this screen from a batch in the School of Influencer admin, or add ?event=<programme event id> to the address to choose a batch here.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* ── Batch picker + refresh ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {batches.length > 0 && (
          <Select value={cohortId} onValueChange={setCohortId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {soiDisplayName(batch.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Add session
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <>
          <CompletionPanel rows={completion} summary={summary} />
          <SessionsPanel
            sessions={sessions}
            onOpen={setOpenSession}
            memberCount={summary.tracked}
          />
        </>
      )}

      {openSession && (
        <RegisterDialog
          cohortId={cohortId}
          session={openSession}
          onClose={() => setOpenSession(null)}
          onSaved={() => {
            setOpenSession(null);
            void refresh();
          }}
        />
      )}

      <AddSessionDialog
        cohortId={cohortId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          setAddOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

// ── Completion (D9) ──────────────────────────────────────────────────────────
// Everything rendered here is a derived read. `min_attendance_pct` comes back
// from the database with each row, so the bar shown is the bar applied.

function CompletionPanel({
  rows,
  summary,
}: {
  rows: SoiCompletionRow[];
  summary: ReturnType<typeof SoiAttendanceService.summarise>;
}) {
  const bar = summary.minAttendancePct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" /> Completion
        </CardTitle>
        <CardDescription>
          {bar === null
            ? 'Nobody is in this batch yet.'
            : `Someone completes the programme by attending at least ${bar}% of its sessions. ` +
              `${summary.met} met the bar · ${summary.onTrack} can still reach it · ` +
              `${summary.cannotMeet} cannot` +
              (summary.notTracked > 0 ? ` · ${summary.notTracked} not measured` : '') +
              '.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No one holds a place in this batch yet, so there is nothing to measure.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.membership_id}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{row.full_name}</span>
                  <Badge variant="outline" className={STATE_STYLE[row.completion_state]}>
                    {STATE_LABEL[row.completion_state]}
                  </Badge>
                </div>
                {row.attendance_trackable ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {row.sessions_attended} of {row.sessions_held} held ·{' '}
                    {row.pct_to_date}% so far · {row.pct_of_programme}% of the whole programme
                    {row.sessions_still_needed > 0 && (
                      <>
                        {' '}
                        · needs{' '}
                        <span className="font-medium text-foreground">
                          {row.sessions_still_needed} more
                        </span>{' '}
                        of the {row.sessions_remaining} left
                        {!row.can_still_complete && ' — more than remain'}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      Attendance is not recorded for this person, so they are left out of the
                      figures rather than counted as absent.
                    </span>
                  </div>
                )}
              </div>
              <div className="w-40 shrink-0">
                <Progress
                  value={row.attendance_trackable ? Math.min(row.pct_of_programme, 100) : 0}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Sessions (P4 + D11 entry point) ──────────────────────────────────────────

function SessionsPanel({
  sessions,
  onOpen,
  memberCount,
}: {
  sessions: SoiSession[];
  onOpen: (session: SoiSession) => void;
  memberCount: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sessions</CardTitle>
        <CardDescription>
          {sessions.length === 0
            ? 'This programme has no sessions yet. Add one to start taking the register.'
            : `${sessions.length} session${sessions.length === 1 ? '' : 's'}. Open one to tick off who came.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {sessions.map((session) => (
          <div
            key={session.session_id}
            className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{session.title}</div>
              <div className="text-xs text-muted-foreground">
                {whenText(session.start_at)}
                {session.venue_text ? ` · ${session.venue_text}` : ''} ·{' '}
                {session.marked_count === 0
                  ? 'not marked yet'
                  : `${session.present_count} of ${session.marked_count} marked attended`}
                {memberCount > 0 &&
                  session.marked_count > 0 &&
                  session.marked_count < memberCount &&
                  ` · ${memberCount - session.marked_count} still unmarked`}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onOpen(session)}>
              {session.marked_count > 0 ? 'Edit register' : 'Take register'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── The tick-list (D11) ──────────────────────────────────────────────────────

function RegisterDialog({
  cohortId,
  session,
  onClose,
  onSaved,
}: {
  cohortId: string;
  session: SoiSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roster, setRoster] = useState<SoiRosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, SoiAttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    SoiAttendanceService.getSessionRoster(cohortId, session.session_id)
      .then((rows) => {
        if (cancelled) return;
        setRoster(rows);
        const initial: Record<string, SoiAttendanceStatus> = {};
        for (const row of rows) {
          if (row.marked_status) initial[row.profile_id] = row.marked_status;
        }
        setMarks(initial);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isDenied(error)) setDenied(messageOf(error));
        else toast.error(messageOf(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cohortId, session.session_id]);

  const trackable = useMemo(() => roster.filter((r) => r.attendance_trackable), [roster]);

  const markAllPresent = () => {
    const next: Record<string, SoiAttendanceStatus> = { ...marks };
    for (const row of trackable) next[row.profile_id] = 'present';
    setMarks(next);
  };

  const save = async () => {
    // Only trackable members can carry a mark; the RPC refuses the whole save
    // otherwise, so filtering here keeps a stray key from failing a good save.
    const payload = trackable
      .filter((row) => marks[row.profile_id])
      .map((row) => ({ profile_id: row.profile_id, status: marks[row.profile_id] }));

    setSaving(true);
    try {
      const saved = await SoiAttendanceService.markAttendance(
        cohortId,
        session.session_id,
        payload
      );
      toast.success(`Register saved for ${saved} ${saved === 1 ? 'person' : 'people'}.`);
      onSaved();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const markedCount = trackable.filter((r) => marks[r.profile_id]).length;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>{session.title}</DialogTitle>
          <DialogDescription>
            {whenText(session.start_at)} · tick who came, then save once.
          </DialogDescription>
        </DialogHeader>

        {denied ? (
          <p className="py-4 text-sm text-amber-700">{denied}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <span className="text-sm text-muted-foreground">
                {trackable.length} on the list · {markedCount} marked
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={markAllPresent}
                disabled={loading || trackable.length === 0}
              >
                Mark everyone present
              </Button>
            </div>

            <div className="flex-1 divide-y overflow-y-auto">
              {loading ? (
                <p className="py-4 text-sm text-muted-foreground">Loading the list…</p>
              ) : roster.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nobody holds a place in this batch yet.
                </p>
              ) : (
                roster.map((row) => (
                  <div
                    key={row.membership_id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{row.full_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.member_type} · {row.membership_status}
                      </div>
                      {!row.attendance_trackable && row.untrackable_reason && (
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-amber-700">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{row.untrackable_reason}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {SOI_ATTENDANCE_STATUSES.map((option) => {
                        const selected = marks[row.profile_id] === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-label={`${option.label} — ${row.full_name}`}
                            aria-pressed={selected}
                            disabled={!row.attendance_trackable}
                            onClick={() =>
                              setMarks((current) => ({
                                ...current,
                                [row.profile_id]: option.value,
                              }))
                            }
                            className={`h-7 min-w-[32px] rounded border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              selected ? MARK_STYLE[option.value] : 'bg-background'
                            }`}
                          >
                            {option.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || markedCount === 0}>
                {saving ? 'Saving…' : 'Save register'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Add a session (spec P4) ──────────────────────────────────────────────────

function AddSessionDialog({
  cohortId,
  open,
  onOpenChange,
  onCreated,
}: {
  cohortId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [venue, setVenue] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      await SoiAttendanceService.createSession({
        cohortId,
        title,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        venueText: venue || null,
      });
      toast.success('Session added.');
      setTitle('');
      setStartAt('');
      setEndAt('');
      setVenue('');
      onCreated();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const ready = title.trim().length > 0 && startAt.length > 0 && endAt.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a session</DialogTitle>
          <DialogDescription>
            Sessions belong to the programme, so every batch shares them. Each batch keeps its
            own register.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="soi-session-title">Title</Label>
            <Input
              id="soi-session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Week 1 — Finding your voice"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="soi-session-start">Starts</Label>
              <Input
                id="soi-session-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="soi-session-end">Ends</Label>
              <Input
                id="soi-session-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="soi-session-venue">Where (optional)</Label>
            <Input
              id="soi-session-venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Seminar hall"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={!ready || saving}>
            {saving ? 'Adding…' : 'Add session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
