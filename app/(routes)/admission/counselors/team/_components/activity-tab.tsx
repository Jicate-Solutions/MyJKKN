'use client';

// activity-tab.tsx
// Tab 5: Team Activity Dashboard — day-by-day counselor activity log with
// advanced stats. Replaces the prior cascade-only last-50 list.
//
// Surface:
//   1. Date selector (chevron nav + Today shortcut + calendar popover).
//   2. KPI strip — Total / Calls / Emails+WhatsApp+SMS / Meetings / Notes /
//      Stage changes + Tasks / Cascades (6 tiles).
//   3. 7-day stacked-bar trend (recharts) — daily volume coloured by type.
//   4. Per-counselor breakdown table — sortable by total activity desc.
//   5. Chronological timeline — every event on the selected day.
//   6. CSV export of the day's timeline.
//
// Backed by:
//   - useTeamActivityDay(institutionId, date)  — list of events
//   - useTeamActivityTrend(institutionId, 7)   — 7-day stacked bar feed
// Both call SECURITY DEFINER RPCs that re-gate on
// admission.counselors.team.view + role_has_institution_access; see
// migrations 20260514120000_team_activity_rpcs and
// 20260516120000_team_activity_rpcs_fix_permission_gate.

import { useMemo, useState } from 'react';
import { format, subDays, addDays, isToday, isFuture } from 'date-fns';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  ActivitySquare,
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  CalendarIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FilePen,
  GitBranch,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  ShieldCheck,
  StickyNote,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
  useTeamActivityDay,
  useTeamActivityTrend,
  TEAM_ACTIVITY_TYPES,
  type TeamActivityType,
  type TeamActivityDayRow,
} from '@/hooks/admission/use-team-activity';

// ─── Activity-type visual vocabulary ────────────────────────────────────────
// Shared between the KPI strip, timeline row, and chart legend so a "call"
// looks the same everywhere.

const ACTIVITY_META: Record<
  TeamActivityType,
  { label: string; icon: typeof Activity; colorClass: string; chartColor: string }
> = {
  call:         { label: 'Calls',        icon: Phone,         colorClass: 'text-blue-600 bg-blue-50',       chartColor: '#2563eb' },
  email:        { label: 'Emails',       icon: Mail,          colorClass: 'text-green-600 bg-green-50',     chartColor: '#16a34a' },
  meeting:      { label: 'Meetings',     icon: Users,         colorClass: 'text-orange-600 bg-orange-50',   chartColor: '#ea580c' },
  note:         { label: 'Notes',        icon: StickyNote,    colorClass: 'text-yellow-600 bg-yellow-50',   chartColor: '#ca8a04' },
  sms:          { label: 'SMS',          icon: MessageSquare, colorClass: 'text-indigo-600 bg-indigo-50',   chartColor: '#4f46e5' },
  whatsapp:     { label: 'WhatsApp',     icon: MessageCircle, colorClass: 'text-emerald-600 bg-emerald-50', chartColor: '#059669' },
  stage_change: { label: 'Stage changes',icon: ArrowRight,    colorClass: 'text-purple-600 bg-purple-50',   chartColor: '#9333ea' },
  task:         { label: 'Tasks',        icon: CheckSquare,   colorClass: 'text-sky-600 bg-sky-50',         chartColor: '#0284c7' },
  cascade:                  { label: 'Cascades',          icon: GitBranch,     colorClass: 'text-rose-600 bg-rose-50',       chartColor: '#e11d48' },
  lead_created:             { label: 'Lead Created',      icon: UserPlus,      colorClass: 'text-teal-600 bg-teal-50',       chartColor: '#0d9488' },
  enquiry_submitted:        { label: 'Enquiry Submitted', icon: ClipboardCheck,colorClass: 'text-cyan-600 bg-cyan-50',       chartColor: '#0891b2' },
  student_section_filled:   { label: 'Section Filled',    icon: UserCheck,     colorClass: 'text-lime-600 bg-lime-50',       chartColor: '#65a30d' },
  moved_to_account_verified:{ label: 'Account Verified',  icon: ShieldCheck,   colorClass: 'text-emerald-700 bg-emerald-50', chartColor: '#047857' },
  moved_to_counselor:       { label: 'Assigned Counselor',icon: Users,         colorClass: 'text-violet-600 bg-violet-50',   chartColor: '#7c3aed' },
  manual_edit:              { label: 'Manual Edit',       icon: FilePen,       colorClass: 'text-slate-600 bg-slate-50',     chartColor: '#475569' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ActivityTabProps {
  institutionId: string | undefined;
}

export function ActivityTab({ institutionId }: ActivityTabProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const {
    data: events = [],
    isLoading,
    error,
  } = useTeamActivityDay(institutionId, selectedDate);

  const { data: trend = [] } = useTeamActivityTrend(institutionId, 7);

  // ── KPI counts (current day) ────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = Object.fromEntries(
      TEAM_ACTIVITY_TYPES.map((t) => [t, 0]),
    ) as Record<TeamActivityType, number>;
    for (const e of events) c[e.activity_type] = (c[e.activity_type] ?? 0) + 1;
    const total = events.length;
    // Grouped KPI tiles: Calls / (Email+WhatsApp+SMS) / Meetings /
    // (Notes+Stage changes+Tasks) / Cascades + Total.
    const messages = c.email + c.whatsapp + c.sms;
    const workOps = c.note + c.stage_change + c.task;
    return { ...c, total, messages, workOps };
  }, [events]);

  // ── Per-counselor breakdown ─────────────────────────────────────────────
  type CounselorRow = {
    counselor_id: string | null;
    counselor_name: string;
    counts: Record<TeamActivityType, number>;
    total: number;
  };

  const counselorRows = useMemo<CounselorRow[]>(() => {
    const map = new Map<string, CounselorRow>();
    for (const ev of events) {
      const key = ev.counselor_id ?? `unattributed:${ev.counselor_name}`;
      let row = map.get(key);
      if (!row) {
        row = {
          counselor_id: ev.counselor_id,
          counselor_name: ev.counselor_name,
          counts: Object.fromEntries(
            TEAM_ACTIVITY_TYPES.map((t) => [t, 0]),
          ) as Record<TeamActivityType, number>,
          total: 0,
        };
        map.set(key, row);
      }
      row.counts[ev.activity_type] += 1;
      row.total += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [events]);

  // ── 7-day trend → chart-friendly shape ──────────────────────────────────
  // One row per day; columns per activity_type with the count.
  const trendChart = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, 'yyyy-MM-dd');
      byDay.set(key, {
        day: key,
        label: format(d, 'EEE dd'),
        ...Object.fromEntries(TEAM_ACTIVITY_TYPES.map((t) => [t, 0])),
      });
    }
    for (const row of trend) {
      const slot = byDay.get(row.day);
      if (slot) slot[row.activity_type] = (slot[row.activity_type] as number) + row.count;
    }
    return Array.from(byDay.values());
  }, [trend]);

  // ── CSV export ───────────────────────────────────────────────────────────
  const handleExport = () => {
    try {
      const headers = [
        'Time',
        'Counselor',
        'Activity Type',
        'Lead',
        'Subject',
        'Description / Reason',
        'Outcome',
      ];
      const rows = events.map((e) => [
        formatTime(e.created_at),
        e.counselor_name,
        e.activity_type,
        e.lead_name,
        (e.subject ?? '').replace(/[\r\n]+/g, ' '),
        (e.description ?? '').replace(/[\r\n]+/g, ' '),
        e.outcome ?? '',
      ]);
      const csv = [headers, ...rows]
        .map((r) =>
          r
            .map((cell) => {
              const s = String(cell ?? '');
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(','),
        )
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `team-activity-${format(selectedDate, 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch {
      toast.error('Export failed');
    }
  };

  // ── Date nav handlers ────────────────────────────────────────────────────
  const goPrev = () => setSelectedDate((d) => subDays(d, 1));
  const goNext = () => {
    const next = addDays(selectedDate, 1);
    if (!isFuture(next)) setSelectedDate(next);
  };
  const goToday = () => setSelectedDate(new Date());

  const nextDisabled = isFuture(addDays(selectedDate, 1)) || isToday(selectedDate);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Date selector + Export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[200px] justify-start gap-2">
                <CalendarIcon className="h-4 w-4" />
                <span>{format(selectedDate, 'EEEE, dd MMM yyyy')}</span>
                {isToday(selectedDate) && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">Today</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && !isFuture(d) && setSelectedDate(d)}
                disabled={(d) => isFuture(d)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            onClick={goNext}
            disabled={nextDisabled}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {!isToday(selectedDate) && (
            <Button variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={events.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          icon={<ActivitySquare className="h-4 w-4" />}
          label="Total activities"
          value={isLoading ? '—' : counts.total}
          loading={isLoading}
          accent="text-foreground"
        />
        <KpiTile
          icon={<Phone className="h-4 w-4 text-blue-600" />}
          label="Calls"
          value={isLoading ? '—' : counts.call}
          loading={isLoading}
          accent="text-blue-700"
        />
        <KpiTile
          icon={<Mail className="h-4 w-4 text-green-600" />}
          label="Messages"
          sublabel="Email · WhatsApp · SMS"
          value={isLoading ? '—' : counts.messages}
          loading={isLoading}
          accent="text-green-700"
        />
        <KpiTile
          icon={<Users className="h-4 w-4 text-orange-600" />}
          label="Meetings"
          value={isLoading ? '—' : counts.meeting}
          loading={isLoading}
          accent="text-orange-700"
        />
        <KpiTile
          icon={<StickyNote className="h-4 w-4 text-yellow-600" />}
          label="Notes & ops"
          sublabel="Notes · Stage · Tasks"
          value={isLoading ? '—' : counts.workOps}
          loading={isLoading}
          accent="text-yellow-700"
        />
        <KpiTile
          icon={<ArrowLeftRight className="h-4 w-4 text-rose-600" />}
          label="Cascades"
          value={isLoading ? '—' : counts.cascade}
          loading={isLoading}
          accent="text-rose-700"
        />
      </div>

      {/* 7-day stacked bar trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Last 7 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number, name: string) => [
                    value,
                    ACTIVITY_META[name as TeamActivityType]?.label ?? name,
                  ]}
                  labelFormatter={(l) => `Day: ${l}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(v) =>
                    ACTIVITY_META[v as TeamActivityType]?.label ?? v
                  }
                />
                {TEAM_ACTIVITY_TYPES.map((t) => (
                  <Bar
                    key={t}
                    dataKey={t}
                    stackId="a"
                    fill={ACTIVITY_META[t].chartColor}
                    radius={t === 'cascade' ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-counselor breakdown table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Per-counselor breakdown
            {!isLoading && counselorRows.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {counselorRows.length} counselor{counselorRows.length !== 1 ? 's' : ''} active
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : counselorRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity recorded on this day.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Counselor</TableHead>
                    {TEAM_ACTIVITY_TYPES.map((t) => {
                      const Icon = ACTIVITY_META[t].icon;
                      return (
                        <TableHead key={t} className="text-center">
                          <div
                            className="inline-flex items-center gap-1"
                            title={ACTIVITY_META[t].label}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">
                              {ACTIVITY_META[t].label}
                            </span>
                          </div>
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counselorRows.map((row) => (
                    <TableRow key={row.counselor_id ?? row.counselor_name}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs">
                              {initials(row.counselor_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{row.counselor_name}</span>
                        </div>
                      </TableCell>
                      {TEAM_ACTIVITY_TYPES.map((t) => (
                        <TableCell
                          key={t}
                          className={cn(
                            'text-center tabular-nums',
                            row.counts[t] === 0 && 'text-muted-foreground/40',
                          )}
                        >
                          {row.counts[t] === 0 ? '·' : row.counts[t]}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.total}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chronological timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Timeline
            {!isLoading && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground">
              <Activity className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">No activity on this day</p>
              <p className="mt-1 text-xs">
                Use the date picker to navigate to a day with logged events.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {events.map((ev) => (
                <TimelineRow key={`${ev.source}-${ev.activity_id}`} event={ev} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function KpiTile({
  icon,
  label,
  sublabel,
  value,
  loading,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value: number | string;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div
          className={cn(
            'mt-0.5 text-xl font-semibold tabular-nums',
            accent ?? '',
          )}
        >
          {loading ? <Skeleton className="h-6 w-12" /> : typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sublabel && (
          <div className="text-[11px] text-muted-foreground">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}

const FALLBACK_META = {
  label: 'Activity',
  icon: Activity,
  colorClass: 'text-gray-600 bg-gray-50',
  chartColor: '#6b7280',
};

function TimelineRow({ event }: { event: TeamActivityDayRow }) {
  const meta = ACTIVITY_META[event.activity_type] ?? FALLBACK_META;
  const Icon = meta.icon;

  return (
    <li className="flex items-start gap-2 rounded-md border border-transparent p-2 text-xs hover:border-border hover:bg-muted/40">
      <div
        className={cn('flex-shrink-0 rounded p-1 mt-0.5', meta.colorClass)}
        title={meta.label}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[9px]">
              {initials(event.counselor_name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{event.counselor_name}</span>
          <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">
            {meta.label}
          </Badge>
          <span className="text-muted-foreground">·</span>
          <span className="truncate text-muted-foreground">{event.lead_name}</span>
        </div>

        {(event.subject || event.description) && (
          <p className="mt-0.5 line-clamp-2 text-muted-foreground">
            {event.subject ? <span className="font-medium">{event.subject}</span> : null}
            {event.subject && event.description ? ' — ' : null}
            {event.description}
          </p>
        )}

        {event.outcome && (
          <p className="mt-0.5 text-[11px] italic text-muted-foreground/80">
            Outcome: {event.outcome}
          </p>
        )}
      </div>

      <time
        dateTime={event.created_at}
        className="flex-shrink-0 whitespace-nowrap text-[11px] text-muted-foreground tabular-nums"
        title={new Date(event.created_at).toLocaleString('en-IN')}
      >
        {formatTime(event.created_at)}
      </time>
    </li>
  );
}
