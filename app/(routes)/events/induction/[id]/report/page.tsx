'use client';

// Fresher Induction — attendance report console.
//
// Two scopes, mirroring the two ways attendance is taken:
//   Day     — one row per fresher for a whole day (a learner whose sessions that
//             day carry different marks reads "Varies by session", never a
//             flattened half-truth).
//   Session — one row per fresher on a single session's roster.
//
// The screen and the PDF share one grouping implementation
// (groupRosterByProgram), so the per-program tables and the summary can never
// disagree with the sheet a coordinator signs. The ONE deliberate difference:
// the PDF carries a trailing blank "Remarks" column for hand-written notes,
// which would be dead space on screen and so is not rendered here.
//
// Rows come from /api/events/[eventId]/induction-attendance, which re-checks the
// caller's manage rights and enriches the gated roster with date of birth,
// mobile number and program code.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  InductionService,
  type InductionSessionRow,
} from '@/lib/services/induction/induction-service';
import { fetchAttendanceReportRows } from '../_components/attendance-pdf-button';
import {
  downloadInductionAttendancePdf,
  groupRosterByProgram,
  attendanceLabel,
  type InductionAttendanceReportRow,
  type ReportMode,
} from '@/lib/utils/induction/induction-attendance-pdf';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileDown, Search, X, ArrowLeft, ClipboardList, ShieldAlert, MessageSquare,
} from 'lucide-react';

const supabase = createClientSupabaseClient();

interface EventRow {
  id: string;
  name: string;
  institution_id: string;
  institutions?: { name: string | null; counselling_code: string | null; logo_url: string | null } | null;
}

type Scope = 'day' | 'session';

/** Colour chip per mark — same palette as the marking dialogs' P/A/E/OD buttons. */
const STATUS_CLASS: Record<string, string> = {
  present: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  od: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  absent: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  excused: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  none: 'bg-muted text-muted-foreground',
};

/** Safe filename fragment — "Day 2" / a session title become "Day-2". */
const slug = (s: string) =>
  s.trim().replace(/[^\w\d]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDob = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export default function InductionAttendanceReportPage() {
  const params = useParams();
  const eventId = params?.id as string;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [sessions, setSessions] = useState<InductionSessionRow[]>([]);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Which report. Both tabs read the SAME fetched rows — the API returns the
  // attendance mark and the feedback Yes/No together — so switching tabs is
  // instant and the two can never describe different rosters.
  const [mode, setMode] = useState<ReportMode>('attendance');
  const [scope, setScope] = useState<Scope>('day');
  const [dayNumber, setDayNumber] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [rows, setRows] = useState<InductionAttendanceReportRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  // ── Event + schedule + the manage gate ────────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: ev }, sess, manage] = await Promise.all([
          supabase
            .from('events')
            .select('id,name,institution_id,institutions(name,counselling_code,logo_url)')
            .eq('id', eventId)
            .maybeSingle(),
          InductionService.listSessions(eventId),
          InductionService.canManageEvent(eventId).catch(() => false),
        ]);
        if (cancelled) return;
        setEvent((ev as any) ?? null);
        setSessions(sess);
        setCanManage(!!manage);
      } catch (e: any) {
        if (!cancelled) toast.error(`Couldn't load the induction: ${e.message ?? e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Days that actually carry sessions. day_number NULL is the "Unscheduled"
  // bucket in the schedule UI — it has no day roster (fn_induction_day_roster
  // keys on a real day), so it is deliberately absent from this picker.
  const days = useMemo(() => {
    const set = new Set<number>();
    for (const s of sessions) if (s.day_number != null && s.day_number > 0) set.add(s.day_number);
    return [...set].sort((a, b) => a - b);
  }, [sessions]);

  // Sessions ordered the way the schedule shows them: day, then order, then time.
  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) =>
      (a.day_number ?? 0) - (b.day_number ?? 0)
      || (a.session_order ?? 0) - (b.session_order ?? 0)
      || a.start_at.localeCompare(b.start_at)),
    [sessions],
  );

  // Default the pickers once the schedule lands.
  useEffect(() => {
    if (!dayNumber && days.length > 0) setDayNumber(String(days[0]));
  }, [days, dayNumber]);
  useEffect(() => {
    if (!sessionId && orderedSessions.length > 0) setSessionId(orderedSessions[0].id);
  }, [orderedSessions, sessionId]);

  const selectedSession = useMemo(
    () => orderedSessions.find((s) => s.id === sessionId) ?? null,
    [orderedSessions, sessionId],
  );

  // ── Roster for the chosen scope ───────────────────────────────────────────
  const loadRoster = useCallback(async () => {
    if (scope === 'day' && !dayNumber) { setRows([]); return; }
    if (scope === 'session' && !sessionId) { setRows([]); return; }
    setRosterLoading(true);
    try {
      setRows(await fetchAttendanceReportRows(
        eventId,
        scope === 'day' ? { dayNumber: Number(dayNumber) } : { sessionId },
      ));
    } catch (e: any) {
      setRows([]);
      toast.error(`Couldn't load the roster: ${e.message ?? e}`);
    } finally {
      setRosterLoading(false);
    }
  }, [scope, eventId, dayNumber, sessionId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  // Group FIRST (program-wise, students by name), then filter inside each group
  // — so the search narrows the sheet without reordering or re-bucketing it.
  const groups = useMemo(() => groupRosterByProgram(rows), [rows]);
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter((r) =>
          (r.name ?? '').toLowerCase().includes(q)
          || (r.program_name ?? '').toLowerCase().includes(q)
          || (r.program_code ?? '').toLowerCase().includes(q)
          || (r.mobile ?? '').includes(q)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [groups, query]);

  const grand = useMemo(
    () => groups.reduce(
      (a, g) => ({
        total: a.total + g.total,
        present: a.present + g.present,
        absent: a.absent + g.absent,
        excused: a.excused + g.excused,
        od: a.od + g.od,
        notMarked: a.notMarked + g.notMarked,
        mixed: a.mixed + g.mixed,
        submitted: a.submitted + g.submitted,
        notSubmitted: a.notSubmitted + g.notSubmitted,
      }),
      { total: 0, present: 0, absent: 0, excused: 0, od: 0, notMarked: 0, mixed: 0, submitted: 0, notSubmitted: 0 },
    ),
    [groups],
  );

  const visibleCount = visibleGroups.reduce((n, g) => n + g.rows.length, 0);

  // The scope line printed on the PDF (and shown on screen).
  const scopeLabel = scope === 'day'
    ? (dayNumber ? `Day ${dayNumber}` : '')
    : (selectedSession?.title ?? '');

  // Date/venue meta — a session knows its own slot; a day is dated from the
  // first session scheduled that day.
  const dayFirstSession = useMemo(
    () => (scope === 'day' && dayNumber
      ? orderedSessions.find((s) => String(s.day_number ?? '') === dayNumber) ?? null
      : null),
    [scope, dayNumber, orderedSessions],
  );
  const scopeDate = scope === 'session'
    ? (selectedSession ? fmtDateTime(selectedSession.start_at) : null)
    : (dayFirstSession ? fmtDate(dayFirstSession.start_at) : null);
  const scopeVenue = scope === 'session'
    ? [selectedSession?.venue_text || null,
       selectedSession?.batch_label ? `Batch ${selectedSession.batch_label}` : null]
        .filter(Boolean).join(' | ') || null
    : null;
  const scopeMeta = [scopeDate, scopeVenue].filter(Boolean).join('  |  ') || null;

  const handleExport = async () => {
    if (rows.length === 0) { toast.error('Nothing to export — this roster is empty.'); return; }
    setExporting(true);
    try {
      // Exports the FULL roster, not the on-screen search subset: the report is
      // a record of everyone, and a stray search term silently truncating a
      // signed sheet would be a data-integrity bug.
      await downloadInductionAttendancePdf(
        {
          institutionName: event?.institutions?.name ?? null,
          institutionCode: event?.institutions?.counselling_code ?? null,
          institutionLogoUrl: event?.institutions?.logo_url ?? null,
          eventName: event?.name ?? 'Fresher Induction',
          scopeLabel,
          scopeDate,
          scopeVenue,
          mode,
          rows,
        },
        `${mode === 'feedback' ? 'Feedback' : 'Attendance'}-${slug(event?.name ?? 'Induction')}-${slug(scopeLabel)}.pdf`,
      );
      toast.success('Attendance report downloaded.');
    } catch (e: any) {
      toast.error(`Couldn't generate the PDF: ${e.message ?? e}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <ContentLayout title="Report">
        <p className="mt-6 text-sm text-muted-foreground">Loading induction…</p>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Report">
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Induction not found</CardTitle>
            <CardDescription>This induction doesn&apos;t exist, or you don&apos;t have access to it.</CardDescription>
          </CardHeader>
        </Card>
      </ContentLayout>
    );
  }

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Events', href: '/events' },
    { label: 'Induction', href: '/events/induction' },
    { label: event.name, href: `/events/induction/${eventId}` },
    { label: 'Report' },
  ];

  // Self-gate: the report route is coordinator-scoped, so a viewer who can't
  // manage the event gets an explicit notice instead of an empty table that
  // looks like "nobody attended".
  if (canManage === false) {
    return (
      <ContentLayout title="Report">
        <PageBreadcrumb items={crumbs} />
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" /> Coordinator access required
            </CardTitle>
            <CardDescription>
              Reports are available to this induction&apos;s coordinators. Ask an event coordinator to share the sheet.
            </CardDescription>
          </CardHeader>
        </Card>
      </ContentLayout>
    );
  }

  const noSchedule = sessions.length === 0;

  return (
    <ContentLayout title="Report">
      <PageBreadcrumb items={crumbs} />

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight truncate">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              {event.institutions?.name ?? 'Report'}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/events/induction/${eventId}`}>
              <ArrowLeft className="h-4 w-4" /> Back to induction
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {mode === 'feedback'
                    ? <><MessageSquare className="h-4 w-4 text-primary" /> Feedback Report</>
                    : <><ClipboardList className="h-4 w-4 text-primary" /> Attendance Report</>}
                </CardTitle>
                <CardDescription>
                  Program-wise, day or session scope. The PDF prints exactly this.
                </CardDescription>
              </div>
              <Button onClick={handleExport} disabled={exporting || rosterLoading || rows.length === 0} className="gap-1">
                <FileDown className="h-4 w-4" />
                {exporting ? 'Preparing…' : 'Download PDF'}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {noSchedule ? (
              <p className="text-sm text-muted-foreground">
                No sessions have been scheduled yet — there is nothing to report on.
              </p>
            ) : (
              <>
                {/* Which report. Sits ABOVE the scope tabs because it changes
                    what the columns mean, not which roster is loaded. */}
                <Tabs value={mode} onValueChange={(v) => setMode(v as ReportMode)}>
                  <TabsList>
                    <TabsTrigger value="attendance">Attendance Report</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback Report</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Scope + picker */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)} className="w-full lg:w-auto">
                    <TabsList>
                      <TabsTrigger value="day" disabled={days.length === 0}>Day-wise</TabsTrigger>
                      <TabsTrigger value="session">Session-wise</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {scope === 'day' ? (
                    days.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No day has scheduled sessions yet.</p>
                    ) : (
                      <Select value={dayNumber} onValueChange={setDayNumber}>
                        <SelectTrigger className="w-full lg:w-[220px]">
                          <SelectValue placeholder="Select day" />
                        </SelectTrigger>
                        <SelectContent>
                          {days.map((d) => (
                            <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : (
                    <Select value={sessionId} onValueChange={setSessionId}>
                      <SelectTrigger className="w-full lg:w-[420px]">
                        <SelectValue placeholder="Select session" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderedSessions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.day_number ? `Day ${s.day_number} · ` : ''}{s.title}
                            {s.batch_label ? ` (${s.batch_label})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {scopeMeta && <p className="text-xs text-muted-foreground">{scopeMeta}</p>}

                {/* Search — narrows the screen only; the PDF always prints all */}
                <div className="relative max-w-md">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search student, program or mobile…"
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

                {rosterLoading ? (
                  <p className="text-sm text-muted-foreground">Loading roster…</p>
                ) : groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No freshers on this roster yet.</p>
                ) : visibleGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No student matches &ldquo;{query}&rdquo;.</p>
                ) : (
                  <>
                    {/* ── Grand total ────────────────────────────────────── */}
                    <p className="text-sm font-semibold">
                      Total Programs: {groups.length} &nbsp;&nbsp;&nbsp; Total Students: {grand.total}
                      {query && visibleCount !== grand.total && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (showing {visibleCount} — the PDF exports all {grand.total})
                        </span>
                      )}
                    </p>

                    {/* ── Summary ────────────────────────────────────────── */}
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <caption className="px-3 py-2 text-left text-sm font-semibold">Summary</caption>
                        <thead className="bg-muted/50">
                          <tr className="text-left">
                            <th className="px-3 py-2 w-14 font-medium">S.No</th>
                            <th className="px-3 py-2 font-medium">Program</th>
                            <th className="px-3 py-2 w-24 font-medium text-center">Total</th>
                            {mode === 'feedback' ? (
                              <>
                                <th className="px-3 py-2 w-28 font-medium text-center">Submitted</th>
                                <th className="px-3 py-2 w-32 font-medium text-center">Not Submitted</th>
                              </>
                            ) : (
                              <>
                                <th className="px-3 py-2 w-24 font-medium text-center">Present</th>
                                <th className="px-3 py-2 w-24 font-medium text-center">Absent</th>
                                <th className="px-3 py-2 w-24 font-medium text-center">Excused</th>
                                <th className="px-3 py-2 w-24 font-medium text-center">On Duty</th>
                                <th className="px-3 py-2 w-28 font-medium text-center">Not Marked</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {groups.map((g, i) => (
                            <tr key={`sum-${g.heading}`} className="hover:bg-muted/30">
                              <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-2">{g.heading}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{g.total}</td>
                              {mode === 'feedback' ? (
                                <>
                                  <td className="px-3 py-2 text-center tabular-nums text-green-700 dark:text-green-500">{g.submitted}</td>
                                  <td className="px-3 py-2 text-center tabular-nums text-red-700 dark:text-red-400">{g.notSubmitted}</td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-2 text-center tabular-nums text-green-700 dark:text-green-500">{g.present}</td>
                                  <td className="px-3 py-2 text-center tabular-nums text-red-700 dark:text-red-400">{g.absent}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{g.excused}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{g.od}</td>
                                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{g.notMarked + g.mixed}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/40 font-semibold">
                            <td colSpan={2} className="px-3 py-2 text-right">TOTAL</td>
                            <td className="px-3 py-2 text-center tabular-nums">{grand.total}</td>
                            {mode === 'feedback' ? (
                              <>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.submitted}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.notSubmitted}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.present}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.absent}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.excused}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.od}</td>
                                <td className="px-3 py-2 text-center tabular-nums">{grand.notMarked + grand.mixed}</td>
                              </>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {/* ── Program-wise tables ─────────────────────────────── */}
                    {visibleGroups.map((g) => (
                      <div key={g.heading} className="overflow-hidden rounded-md border">
                        {/* Program band — code + name left, head count right */}
                        <div className="flex items-center justify-between gap-2 bg-muted/60 px-3 py-2">
                          <span className="text-sm font-semibold">{g.heading}</span>
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            Students: {g.total}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30">
                              <tr className="text-left">
                                <th className="px-3 py-2 w-14 font-medium">S.No</th>
                                <th className="px-3 py-2 font-medium">Student Name</th>
                                <th className="px-3 py-2 w-32 font-medium">Date of Birth</th>
                                <th className="px-3 py-2 w-40 font-medium">Father Mobile Number</th>
                                <th className="px-3 py-2 w-40 font-medium">
                                  {mode === 'feedback' ? 'Feedback Submitted' : 'Attendance'}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {g.rows.map((r, i) => (
                                <tr key={`${g.heading}-${r.name}-${i}`} className="hover:bg-muted/30">
                                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                                  <td className="px-3 py-2 font-medium">{r.name || 'Unnamed'}</td>
                                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmtDob(r.date_of_birth)}</td>
                                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.mobile || '-'}</td>
                                  <td className="px-3 py-2">
                                    {mode === 'feedback' ? (
                                      // Yes/No is always definite: no feedback row IS "No".
                                      <Badge variant="secondary" className={r.feedback_submitted ? STATUS_CLASS.present : STATUS_CLASS.absent}>
                                        {r.feedback_submitted ? 'Yes' : 'No'}
                                      </Badge>
                                    ) : r.status || r.is_mixed ? (
                                      <Badge variant="secondary" className={STATUS_CLASS[r.is_mixed ? 'none' : (r.status ?? 'none')]}>
                                        {attendanceLabel(r)}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
