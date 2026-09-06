'use client';

// Day-level attendance roster (bulk mark: one pass covers every session that
// day). Fans out into the SAME event_session_attendance rows the per-session
// AttendanceDialog writes — this is a marking-UX convenience, not a new data
// model. A learner whose sessions that day already carry DIFFERENT statuses
// shows "Varies by session" instead of a misleading pre-selected button, so a
// day-mark can't silently overwrite a deliberate partial-day mark.
//
// Search + identity columns mirror AttendanceDialog: the day roster is the whole
// joining cohort (225+ freshers) and register_number is still NULL for most of
// them at induction time, so each row carries program + father's mobile and the
// list is searchable on both.
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type DayRosterRow,
  type AttendanceStatus,
  type AttendanceMark,
} from '@/lib/services/induction/induction-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarCheck, Search, X, Phone, GraduationCap } from 'lucide-react';
import { groupRosterByCollege } from './roster-college-groups';

/** Bucket for freshers whose learners_profiles.program_id is still NULL. */
const NO_PROGRAM = '__none__';

const OPTIONS: { value: AttendanceStatus; label: string; title: string; on: string }[] = [
  { value: 'present', label: 'P',  title: 'Present', on: 'bg-green-600 text-white border-green-600' },
  { value: 'absent',  label: 'A',  title: 'Absent',  on: 'bg-red-600 text-white border-red-600' },
  { value: 'excused', label: 'E',  title: 'Excused', on: 'bg-amber-500 text-white border-amber-500' },
  { value: 'od',      label: 'OD', title: 'On duty', on: 'bg-blue-600 text-white border-blue-600' },
];

/** Digits only — so "9843 123456" and "+91-9843123456" both find the same parent. */
const digits = (s: string) => s.replace(/\D/g, '');

export function DayAttendanceDialog({ eventId, dayNumber, dayLabel }: { eventId: string; dayNumber: number; dayLabel: string }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<DayRosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [query, setQuery] = useState('');
  const [program, setProgram] = useState('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await InductionService.getDayRoster(eventId, dayNumber);
      setRoster(r);
      const init: Record<string, AttendanceStatus> = {};
      for (const row of r) if (row.status) init[row.learner_id] = row.status;
      setMarks(init);
    } catch (e: any) {
      toast.error(`Couldn't load day roster: ${e.message ?? e}`);
    } finally { setLoading(false); }
  }, [eventId, dayNumber]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) { setQuery(''); setProgram('all'); load(); } };
  const set = (id: string, s: AttendanceStatus) => setMarks((m) => ({ ...m, [id]: s }));

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

  // Program filter AND text search. Name / register number / program match on
  // text; a numeric query also matches the father's mobile (ignoring spaces,
  // dashes and country code).
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

  // Applies to what's on screen, merged into existing marks — with a search or
  // program filter active this marks the matches, not the whole cohort.
  const allPresent = () => {
    setMarks((m) => {
      const next = { ...m };
      for (const row of visible) next[row.learner_id] = 'present';
      return next;
    });
  };

  const save = async () => {
    const payload: AttendanceMark[] = Object.entries(marks).map(([learner_id, status]) => ({ learner_id, status }));
    if (payload.length === 0) { toast.error('Mark at least one learner.'); return; }
    setSaving(true);
    try {
      const n = await InductionService.markDayAttendance(eventId, dayNumber, payload);
      toast.success(`Saved ${dayLabel} attendance for ${n} learner${n === 1 ? '' : 's'}.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Couldn't save day attendance: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const markedCount = Object.keys(marks).length;
  const presentCount = Object.values(marks).filter((s) => s === 'present' || s === 'od').length;
  const pendingCount = roster.length - markedCount;
  // Only a day containing sessions shared with other colleges produces more
  // than one group; a single-college roster renders exactly as it did before.
  // Groups `visible`, not `roster` — this IS the rendered list, so grouping the
  // unfiltered roster would leave the search box and program filter with nothing
  // to do (and would contradict the `visible.length === 0` empty state below).
  const collegeGroups = groupRosterByCollege(visible);
  const showColleges = collegeGroups.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <CalendarCheck className="h-3.5 w-3.5" /> Mark day attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] sm:max-w-2xl flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Attendance — {dayLabel}</DialogTitle>
          <DialogDescription>
            One mark applies to every session {dayLabel.toLowerCase()} for that learner. Present and OD count toward completion.
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">{roster.length} enrolled</span>
              <span className="text-green-700 dark:text-green-500 font-medium">{presentCount} present/OD</span>
              <span className="text-muted-foreground">{markedCount} marked</span>
              {pendingCount > 0 && <span className="text-amber-600 dark:text-amber-500">{pendingCount} pending</span>}
              {narrowed && <span className="text-muted-foreground">· showing {visible.length}</span>}
            </div>
            <Button size="sm" variant="outline" onClick={allPresent} disabled={loading || visible.length === 0}>
              {narrowed ? `Mark ${visible.length} present` : 'Mark all present'}
            </Button>
          </div>
        </div>

        {/* One scroll container, merged from the two the college-grouping edit
            left behind: keeps the original framing (min-h-0 is what lets it
            actually scroll inside the flex column, plus the rounded border) and
            drops `divide-y`, because each college group now draws its own
            dividers and its heading is sticky against THIS box. */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No freshers enrolled for this day&apos;s sessions yet.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              {query ? <>No fresher matches &ldquo;{query}&rdquo;</> : 'No fresher in this program'}
              {query && program !== 'all' ? ' in this program' : ''}.
            </p>
          ) : collegeGroups.map((group) => (
            <div key={group.key} className="divide-y">
              {showColleges && (
                <div className="sticky top-0 z-10 bg-background py-1.5 text-xs font-semibold text-muted-foreground">
                  {group.label} · {group.rows.length}
                </div>
              )}
              {group.rows.map((row) => (
                <div
                  key={row.learner_id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 ${marks[row.learner_id] ? '' : 'bg-muted/30'}`}
                >
                  {/* Identity block. register_number is NULL for most freshers at
                      induction time, so program + father's mobile are what
                      actually separate two same-named freshers on a 225-name
                      roster — the same fields the search box matches on. */}
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
                      {row.is_mixed && <span className="text-amber-600">Varies by session</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {OPTIONS.map((o) => {
                      const selected = marks[row.learner_id] === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => set(row.learner_id, o.value)}
                          className={`h-7 min-w-[32px] px-2 rounded border text-xs font-medium transition-colors ${
                            selected ? o.on : 'bg-background text-muted-foreground hover:bg-muted'
                          }`}
                          aria-pressed={selected}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || markedCount === 0}>
            {saving ? 'Saving…' : `Save day attendance${markedCount ? ` (${markedCount})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
