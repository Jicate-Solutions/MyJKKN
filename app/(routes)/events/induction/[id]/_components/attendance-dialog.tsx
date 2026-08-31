'use client';

// Per-session attendance roster (decision 5: coordinator marks the roster).
// Reads/writes via gated DEFINER RPCs through InductionService; marking
// recomputes induction_completion server-side.
//
// A combined session carries the WHOLE joining cohort (225+ freshers), and
// register_number is still NULL for most of them at induction time — so the
// roster is searchable by name / register number / father's mobile, and each row
// shows program + parent contact to tell same-name freshers apart.
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type RosterRow,
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
import { ClipboardCheck, Search, X, Phone, GraduationCap, UsersRound } from 'lucide-react';
import { groupRosterByCollege } from './roster-college-groups';

/** Bucket for freshers whose learners_profiles.program_id is still NULL. */
const NO_PROGRAM = '__none__';

/** Bucket for freshers no Senior Peer Mentor has been assigned yet. Worth its
 *  own entry rather than being hidden: 'who is nobody's?' is exactly the
 *  question a coordinator asks when a group goes unwalked. */
const NO_MENTOR = '__nomentor__';

const OPTIONS: { value: AttendanceStatus; label: string; title: string; on: string }[] = [
  { value: 'present', label: 'P',  title: 'Present', on: 'bg-green-600 text-white border-green-600' },
  { value: 'absent',  label: 'A',  title: 'Absent',  on: 'bg-red-600 text-white border-red-600' },
  { value: 'excused', label: 'E',  title: 'Excused', on: 'bg-amber-500 text-white border-amber-500' },
  { value: 'od',      label: 'OD', title: 'On duty', on: 'bg-blue-600 text-white border-blue-600' },
];

/** Digits only — so "9843 123456" and "+91-9843123456" both find the same parent. */
const digits = (s: string) => s.replace(/\D/g, '');

export function AttendanceDialog({
  sessionId,
  sessionTitle,
  trigger,
  api,
}: {
  sessionId: string;
  sessionTitle: string;
  /** Optional replacement for the default icon button. The coordinator console
   *  wants a compact icon in a crowded action row; the resource person's own
   *  "Sessions you led" card wants a labelled button, since attendance is the
   *  main thing they came to do. Same dialog either way. */
  trigger?: React.ReactNode;
  /** Which RPC pair backs the dialog. Defaults to the staff/coordinator path
   *  (fn_induction_session_roster + fn_induction_mark_attendance). The Senior
   *  Peer Mentor working a REGISTRATION desk passes the mentor-scoped pair
   *  instead — identical roster shape, different server-side gate — so both
   *  audiences get the same searchable P/A/E/OD screen without a second
   *  implementation to keep in step. */
  api?: {
    loadRoster: (sessionId: string) => Promise<RosterRow[]>;
    save: (sessionId: string, marks: AttendanceMark[]) => Promise<number>;
  };
}) {
  const loadRoster = api?.loadRoster ?? InductionService.getSessionRoster;
  const saveMarks = api?.save ?? InductionService.markAttendance;
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [query, setQuery] = useState('');
  const [program, setProgram] = useState('all');
  const [mentor, setMentor] = useState('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await loadRoster(sessionId);
      setRoster(r);
      const init: Record<string, AttendanceStatus> = {};
      for (const row of r) if (row.status) init[row.learner_id] = row.status;
      setMarks(init);
    } catch (e: any) {
      toast.error(`Couldn't load roster: ${e.message ?? e}`);
    } finally { setLoading(false); }
    // `load` runs only from onOpenChange, never inside an effect, so a fresh
    // loadRoster identity each render costs nothing here.
  }, [sessionId, loadRoster]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) { setQuery(''); setProgram('all'); setMentor('all'); load(); } };
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

  // Senior Peer Mentors on THIS roster, with the size of each one's group.
  // Keyed by mentor_learner_id, not name: two mentors can share a name, and the
  // filter must not merge their groups. Optional in the same way the programme
  // filter is — it renders only once a mentor is actually assigned, so an
  // induction that never appointed any is unchanged.
  const mentors = useMemo(() => {
    const byId = new Map<string, { label: string; count: number }>();
    for (const r of roster) {
      const id = r.mentor_learner_id ?? NO_MENTOR;
      const label = r.mentor_name?.trim() || 'No mentor assigned';
      const entry = byId.get(id);
      if (entry) entry.count += 1;
      else byId.set(id, { label, count: 1 });
    }
    return [...byId.entries()].sort(([aId, a], [bId, b]) =>
      aId === NO_MENTOR ? 1 : bId === NO_MENTOR ? -1 : a.label.localeCompare(b.label));
  }, [roster]);

  // Program filter AND text search. Name / register number / program match on
  // text; a numeric query also matches the father's mobile (ignoring spaces,
  // dashes and country code).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = digits(q);
    return roster.filter((r) => {
      if (program !== 'all' && (r.program_name?.trim() || NO_PROGRAM) !== program) return false;
      if (mentor !== 'all' && (r.mentor_learner_id ?? NO_MENTOR) !== mentor) return false;
      if (!q) return true;
      return (r.name ?? '').toLowerCase().includes(q)
        || (r.register_number ?? '').toLowerCase().includes(q)
        || (r.program_name ?? '').toLowerCase().includes(q)
        || (r.mentor_name ?? '').toLowerCase().includes(q)
        || (qd.length >= 3 && digits(r.father_mobile ?? '').includes(qd));
    });
  }, [roster, query, program, mentor]);

  const narrowed = query.trim().length > 0 || program !== 'all' || mentor !== 'all';

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
      const n = await saveMarks(sessionId, payload);
      toast.success(`Saved attendance for ${n} learner${n === 1 ? '' : 's'}.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Couldn't save attendance: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const markedCount = Object.keys(marks).length;
  const presentCount = Object.values(marks).filter((s) => s === 'present' || s === 'od').length;
  const pendingCount = roster.length - markedCount;
  // Only a session shared with other colleges produces more than one group; a
  // single-college roster renders exactly as it did before.
  // Groups `visible`, not `roster` — this IS the rendered list, so grouping the
  // unfiltered roster would leave the search box and program filter with nothing
  // to do on a 225-name screen (and would contradict the `visible.length === 0`
  // empty-state directly above it).
  const collegeGroups = groupRosterByCollege(visible);
  const showColleges = collegeGroups.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="icon" variant="ghost" title="Take attendance"><ClipboardCheck className="h-4 w-4" /></Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] sm:max-w-2xl flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Attendance — {sessionTitle}</DialogTitle>
          <DialogDescription>
            Mark each fresher: Present, Absent, Excused, or OD (on duty). Present and OD count toward completion.
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
                <SelectTrigger className="w-full sm:w-[220px]">
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
            {/* Senior Peer Mentor narrowing. Optional in the same way the
                programme filter is: hidden entirely until the cohort actually
                has mentors, so an induction that never appointed any sees the
                screen exactly as before. Composes with programme and search —
                all three narrow the same list. */}
            {mentors.length > 1 && (
              <Select value={mentor} onValueChange={setMentor}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="All mentors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All mentors ({roster.length})</SelectItem>
                  {mentors.map(([id, m]) => (
                    <SelectItem key={id} value={id}>
                      {m.label} ({m.count})
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
            <p className="text-sm text-muted-foreground p-4">No freshers enrolled for this session&apos;s batch yet.</p>
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
                      actually separate two "AKASH"s on a 225-name roster — the
                      same fields the search box matches on. */}
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
                      {/* The mentor walking this fresher — the same value the
                          Senior Peer Mentor filter above narrows on, so a
                          filtered roster shows WHY each row survived. */}
                      {row.mentor_name && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <UsersRound className="h-3 w-3 shrink-0" />
                          <span className="truncate">{row.mentor_name}</span>
                        </span>
                      )}
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
            {saving ? 'Saving…' : `Save attendance${markedCount ? ` (${markedCount})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
