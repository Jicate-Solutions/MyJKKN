'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCallLogs,
  useInboundCallStats,
  useUniqueCallers,
  formatDuration,
  type CallStatus,
  type UniqueCaller,
} from '@/hooks/admission';
import {
  PhoneIncoming,
  PhoneCall,
  PhoneMissed,
  TrendingUp,
  AlertTriangle,
  Play,
  Pause,
  Clock,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  X,
  Users,
  MapPin,
  AlertCircle,
  FileText,
} from 'lucide-react';
import type { CallDisposition } from '@/lib/services/telephony/telephony-service';
import { useUrlState } from '@/components/data-table/utils/url-state';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { maskPhone } from '@/lib/utils/phone-number';

// ============================================================================
// HELPERS
// ============================================================================

// For inbound calls, Exotel marks ALL IVR-completed calls as status:"completed"
// regardless of whether a human answered. The reliable indicator is cost_amount:
//   cost_amount > 0 → agent answered (billed)
//   cost_amount = 0 or null → nobody answered (missed)
function getInboundStatusBadge(costAmount: number | null | undefined) {
  if (costAmount != null && costAmount > 0) {
    return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">Answered</Badge>;
  }
  return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Missed</Badge>;
}

// Keep the label/color map in sync with /admission/counselors/calls list page.
// Inbound calls often carry a disposition written post-answer by a counselor.
const DISPOSITION_STYLE_MAP: Record<string, { label: string; className: string }> = {
  interested:     { label: 'Interested',     className: 'bg-green-100 text-green-800 border-green-200' },
  not_interested: { label: 'Not Interested', className: 'bg-red-100 text-red-800 border-red-200' },
  callback:       { label: 'Callback',       className: 'bg-blue-100 text-blue-800 border-blue-200' },
  wrong_number:   { label: 'Wrong Number',   className: 'bg-orange-100 text-orange-800 border-orange-200' },
  not_reachable:  { label: 'Not Reachable',  className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  switched_off:   { label: 'Switched Off',   className: 'bg-gray-100 text-gray-800 border-gray-200' },
  busy:           { label: 'Busy',           className: 'bg-orange-100 text-orange-700 border-orange-200' },
  other:          { label: 'Other',          className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function getDispositionBadge(disposition: CallDisposition | null | undefined) {
  if (!disposition) {
    return <span className="text-xs text-muted-foreground italic">-</span>;
  }
  const cfg = DISPOSITION_STYLE_MAP[disposition] ?? { label: disposition, className: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <Badge variant="outline" className={`${cfg.className} text-[11px]`}>
      {cfg.label}
    </Badge>
  );
}

// Column header with click-to-sort behavior. Three-state: none → desc → asc → none.
// Matches the project's data-table/column-header convention for familiarity.
function SortableHeader({
  columnId,
  label,
  currentSortBy,
  currentSortOrder,
  onSort,
  align = 'left',
}: {
  columnId: string;
  label: string;
  currentSortBy: string;
  currentSortOrder: 'asc' | 'desc';
  onSort: (col: string) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSortBy === columnId;
  const Icon = !isActive ? ArrowUpDown : currentSortOrder === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(columnId)}
      className={`inline-flex items-center gap-1 text-xs font-medium hover:text-primary transition-colors ${
        align === 'right' ? 'flex-row-reverse' : ''
      } ${isActive ? 'text-primary' : ''}`}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3 shrink-0" />
    </button>
  );
}

function getNotesIndicator(log: { call_notes?: string | null; cost_amount?: number | null }) {
  if (log.call_notes && log.call_notes.trim().length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700" title={log.call_notes}>
        <FileText className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{log.call_notes}</span>
      </span>
    );
  }
  // Answered but no notes yet — nudge the counselor to add some
  const wasAnswered = log.cost_amount != null && log.cost_amount > 0;
  if (wasAnswered) {
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Add notes
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">-</span>;
}

function RecordingPlayer({ url }: { url: string | null }) {
  const [playing, setPlaying] = useState(false);
  if (!url) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        const audio = new Audio(url);
        if (playing) {
          audio.pause();
          setPlaying(false);
        } else {
          audio.play().catch(() => window.open(url, '_blank'));
          audio.onended = () => setPlaying(false);
          setPlaying(true);
        }
      }}
    >
      {playing ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
      {playing ? 'Pause' : 'Play'}
    </Button>
  );
}

// ============================================================================
// KPI CARDS
// ============================================================================

function InboundKpiCards({ stats, isLoading, onCardClick }: { stats: any; isLoading: boolean; onCardClick?: (filterStatus: string) => void }) {
  const cards = [
    {
      title: 'Total Incoming',
      value: stats.total_incoming,
      icon: PhoneIncoming,
      iconColor: 'text-blue-600',
      filter: '',
    },
    {
      title: 'Answered',
      value: stats.answered,
      icon: PhoneCall,
      iconColor: 'text-green-600',
      filter: 'completed',
    },
    {
      title: 'Missed',
      value: stats.missed,
      icon: PhoneMissed,
      iconColor: 'text-red-500',
      highlight: stats.missed > 0,
      filter: 'no-answer',
    },
    {
      title: 'Answer Rate',
      value: `${stats.answer_rate}%`,
      icon: TrendingUp,
      iconColor: stats.answer_rate >= 80 ? 'text-green-600' : stats.answer_rate >= 50 ? 'text-yellow-600' : 'text-red-600',
      filter: '',
    },
    {
      title: 'Missed (No Callback)',
      value: stats.missed_without_callback,
      icon: AlertTriangle,
      iconColor: 'text-orange-600',
      highlight: stats.missed_without_callback > 0,
      filter: 'no-answer',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
      {cards.map((card) => (
        <Card
          key={card.title}
          className={onCardClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98] transition-all' : ''}
          onClick={() => onCardClick?.(card.filter)}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.iconColor}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-xl sm:text-2xl font-bold ${card.highlight ? 'text-red-600' : ''}`}>
              {isLoading ? <Skeleton className="h-7 w-12" /> : card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// CHARTS
// ============================================================================

function InboundVolumeChart({ data, isLoading }: { data: Array<{ date: string; answered: number; missed: number }>; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data.length) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No incoming call data yet</div>;
  }

  const last14 = data.slice(-14);
  const maxTotal = Math.max(...last14.map((d) => d.answered + d.missed), 1);

  return (
    <div className="space-y-2">
      {last14.map((day) => {
        const total = day.answered + day.missed;
        const answeredPct = (day.answered / maxTotal) * 100;
        const missedPct = (day.missed / maxTotal) * 100;
        return (
          <div key={day.date} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 shrink-0">
              {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${answeredPct}%` }}
                title={`Answered: ${day.answered}`}
              />
              <div
                className="h-full bg-red-400 transition-all"
                style={{ width: `${missedPct}%` }}
                title={`Missed: ${day.missed}`}
              />
            </div>
            <span className="text-xs font-medium w-8 text-right">{total}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" />
          Answered
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-400" />
          Missed
        </div>
      </div>
    </div>
  );
}

function HourlyDistributionChart({ data, isLoading }: { data: Array<{ hour: number; answered: number; missed: number }>; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  // Only show hours 6-22 (relevant business hours in India)
  const filtered = data.filter((d) => d.hour >= 6 && d.hour <= 22);
  if (filtered.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No hourly data yet</div>;
  }

  const maxTotal = Math.max(...filtered.map((d) => d.answered + d.missed), 1);
  const peakHour = filtered.reduce((peak, d) =>
    (d.answered + d.missed > peak.answered + peak.missed) ? d : peak,
    filtered[0]
  );

  return (
    <div className="space-y-1.5">
      {filtered.map((h) => {
        const total = h.answered + h.missed;
        const answeredPct = (h.answered / maxTotal) * 100;
        const missedPct = (h.missed / maxTotal) * 100;
        const isPeak = h.hour === peakHour.hour && total > 0;
        const hourLabel = h.hour === 0 ? '12 AM' : h.hour < 12 ? `${h.hour} AM` : h.hour === 12 ? '12 PM' : `${h.hour - 12} PM`;

        return (
          <div key={h.hour} className={`flex items-center gap-3 ${isPeak ? 'bg-blue-50 dark:bg-blue-950/20 -mx-2 px-2 py-0.5 rounded' : ''}`}>
            <span className={`text-xs w-12 shrink-0 ${isPeak ? 'font-bold text-blue-600' : 'text-muted-foreground'}`}>
              {hourLabel}
            </span>
            <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${answeredPct}%` }} />
              <div className="h-full bg-red-400 transition-all" style={{ width: `${missedPct}%` }} />
            </div>
            <span className="text-xs w-6 text-right font-mono">{total || ''}</span>
          </div>
        );
      })}
      {peakHour && (peakHour.answered + peakHour.missed) > 0 && (
        <div className="text-xs text-blue-600 pt-1 font-medium">
          Peak: {peakHour.hour === 0 ? '12 AM' : peakHour.hour < 12 ? `${peakHour.hour} AM` : peakHour.hour === 12 ? '12 PM' : `${peakHour.hour - 12} PM`}
          {' '}({peakHour.answered + peakHour.missed} calls)
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface IncomingCallsTabProps {
  institutionId?: string;
}

export function IncomingCallsTab({ institutionId }: IncomingCallsTabProps) {
  const router = useRouter();

  // All filter/pagination/sort/view state is persisted in URL search params via
  // the project's useUrlState hook. This guarantees that when a counselor
  // clicks "Call Back" (tel: link on mobile) or drills into a call detail and
  // hits the browser back button, they land back on the exact same page +
  // filter slice + sort they were browsing. Keys are prefixed `inbound_` so
  // they don't collide with the outbound tab if both ever share a page.
  const [viewMode, setViewMode] = useUrlState<'all' | 'unique'>('inbound_view', 'all');
  const [page, setPage] = useUrlState<number>('inbound_page', 1);
  const [pageSize, setPageSize] = useUrlState<number>('inbound_size', 20);
  const [statusFilter, setStatusFilter] = useUrlState<string>('inbound_status', '');
  const [fromDate, setFromDate] = useUrlState<string>('inbound_from', '');
  const [toDate, setToDate] = useUrlState<string>('inbound_to', '');
  const [sortBy, setSortBy] = useUrlState<string>('inbound_sort', 'started_at');
  const [sortOrder, setSortOrder] = useUrlState<'asc' | 'desc'>('inbound_order', 'desc');

  const [showFilters, setShowFilters] = useState(false);

  // Click-to-sort: same column cycles desc → asc → reset to default;
  // different column switches to desc on that column.
  const handleSort = (columnId: string) => {
    if (sortBy === columnId) {
      if (sortOrder === 'desc') {
        setSortOrder('asc');
      } else {
        // Reset to default sort
        setSortBy('started_at');
        setSortOrder('desc');
      }
    } else {
      setSortBy(columnId);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Unique callers hook
  const { callers, summary: callerSummary, isLoading: uniqueLoading } = useUniqueCallers(
    institutionId,
    fromDate || undefined,
    toDate || undefined
  );

  // Data hooks
  const { logs, total, totalPages, isLoading: logsLoading } = useCallLogs({
    institution_id: institutionId,
    direction: 'inbound',
    status: (statusFilter as CallStatus) || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    page,
    limit: pageSize,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  const { stats, isLoading: statsLoading } = useInboundCallStats(institutionId);

  const clearFilters = () => {
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setSortBy('started_at');
    setSortOrder('desc');
    setPage(1);
  };

  const hasFilters = !!statusFilter || !!fromDate || !!toDate || sortBy !== 'started_at' || sortOrder !== 'desc';

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <InboundKpiCards
        stats={stats}
        isLoading={statsLoading}
        onCardClick={(filterStatus) => {
          setStatusFilter(filterStatus);
          setPage(1);
          document.getElementById('call-history')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Incoming Call Volume
            </CardTitle>
            <CardDescription>Answered vs. missed per day</CardDescription>
          </CardHeader>
          <CardContent>
            <InboundVolumeChart data={stats.calls_by_date} isLoading={statsLoading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              When Do Prospects Call?
            </CardTitle>
            <CardDescription>Hourly distribution (IST)</CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyDistributionChart data={stats.calls_by_hour} isLoading={statsLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Call Log Table */}
      <Card id="call-history">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Incoming Call History</CardTitle>
              <CardDescription>
                {viewMode === 'all'
                  ? `${total} incoming call${total !== 1 ? 's' : ''}`
                  : `${callerSummary.unique_callers} unconverted callers from ${callerSummary.total_calls} calls`
                }
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {/* View Mode Toggle */}
              <div className="flex rounded-md border">
                <Button
                  variant={viewMode === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => setViewMode('all')}
                >
                  <Phone className="h-3.5 w-3.5 mr-1" />
                  All Calls
                </Button>
                <Button
                  variant={viewMode === 'unique' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-l-none"
                  onClick={() => setViewMode('unique')}
                >
                  <Users className="h-3.5 w-3.5 mr-1" />
                  Unique Callers
                </Button>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4 mr-1" />
                Filters
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t mt-4">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === '_all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All statuses</SelectItem>
                    <SelectItem value="completed">Answered</SelectItem>
                    <SelectItem value="no-answer">Missed</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="mt-1" />
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* ======= UNIQUE CALLERS VIEW ======= */}
          {viewMode === 'unique' ? (
            uniqueLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : callers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No callers found</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div
                    className="p-3 rounded-lg bg-muted/50 text-center"
                    title="Unique phone numbers (E.164-normalized) whose calls are not yet linked to an admission lead. Converted callers appear in the Leads list instead."
                  >
                    <p className="text-2xl font-bold">{callerSummary.unique_callers}</p>
                    <p className="text-xs text-muted-foreground">Unconverted Callers</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold">{callerSummary.avg_attempts_per_caller}</p>
                    <p className="text-xs text-muted-foreground">Avg Attempts</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-center">
                    <p className="text-2xl font-bold text-red-600">{callerSummary.callers_never_reached}</p>
                    <p className="text-xs text-muted-foreground">Never Reached</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-center">
                    <p className="text-2xl font-bold text-orange-600">{callerSummary.callers_with_breached_sla}</p>
                    <p className="text-xs text-muted-foreground">SLA Breached</p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Caller</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Callback</TableHead>
                      <TableHead>Last Call</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callers.map((caller: UniqueCaller) => {
                      const neverReached = caller.answered_count === 0;
                      return (
                        <TableRow key={caller.from_number} className={`hover:bg-muted/50 ${neverReached ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                          <TableCell>
                            <div>
                              {caller.lead_name ? (
                                <Link
                                  href={caller.lead_id ? `/admission/leads/${caller.lead_id}` : '#'}
                                  className="text-sm font-medium hover:underline text-primary"
                                >
                                  {caller.lead_name}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium text-muted-foreground italic">Unknown</span>
                              )}
                              <p className="text-xs text-muted-foreground font-mono">
                                {maskPhone(caller.from_number)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {caller.caller_location ? (
                              <span className="text-xs flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                {caller.caller_location}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-bold">{caller.total_attempts}</span>
                              <div className="text-[10px] text-muted-foreground">
                                <span className="text-green-600">{caller.answered_count} ans</span>
                                {' / '}
                                <span className="text-red-500">{caller.missed_count} miss</span>
                              </div>
                            </div>
                            {caller.days_trying > 1 && (
                              <p className="text-[10px] text-muted-foreground">over {caller.days_trying} days</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {neverReached ? (
                              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                                <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                                Never Reached
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                Connected
                              </Badge>
                            )}
                            {caller.auto_sms_sent && (
                              <p className="text-[10px] text-blue-500 mt-0.5">SMS sent</p>
                            )}
                          </TableCell>
                          <TableCell>
                            {caller.callback_status ? (
                              <div>
                                <Badge variant="outline" className={`text-[10px] ${
                                  caller.sla_breached
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : caller.callback_status === 'completed'
                                    ? 'bg-green-100 text-green-700 border-green-200'
                                    : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                }`}>
                                  {caller.sla_breached ? 'SLA BREACHED' : caller.callback_status}
                                </Badge>
                                {caller.callback_priority && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{caller.callback_priority}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {new Date(caller.last_call_at).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata',
                              })}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )
          ) : (
          /* ======= ALL CALLS VIEW — mobile cards + desktop table ======= */
          logsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PhoneIncoming className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No incoming calls found</p>
              <p className="text-sm mt-1">
                {hasFilters ? 'Try adjusting your filters' : 'Incoming call records will appear here once synced from Exotel'}
              </p>
            </div>
          ) : (
            <>
              {/* ── MOBILE: Card layout (< md) ── */}
              <div className="md:hidden space-y-2">
                {logs.map((log: any) => {
                  const isMissed = !log.cost_amount || log.cost_amount <= 0;
                  const callTime = new Date(log.started_at || log.created_at);
                  const nowMs = Date.now();
                  const diffMins = Math.floor((nowMs - callTime.getTime()) / 60000);
                  const relTime = diffMins < 1 ? 'Just now' : diffMins < 60 ? `${diffMins}m ago` : diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` : `${Math.floor(diffMins / 1440)}d ago`;
                  return (
                    <div
                      key={log.id}
                      className={`relative rounded-lg border overflow-hidden active:bg-muted/50 ${isMissed ? 'border-l-[3px] border-l-red-500 bg-red-50/30 dark:bg-red-950/10' : 'border-l-[3px] border-l-emerald-500'}`}
                      onClick={() => router.push(`/admission/counselors/calls/${log.id}`)}
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {log.lead ? (
                              <p className="text-sm font-semibold truncate">{log.lead.full_name}</p>
                            ) : (
                              <p className="text-sm font-medium text-muted-foreground">Unknown Caller</p>
                            )}
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{log.from_number ? maskPhone(log.from_number) : '-'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-medium text-muted-foreground">{relTime}</p>
                            <p className="text-[10px] text-muted-foreground/70">{callTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            {isMissed
                              ? <span className="inline-flex items-center text-[11px] font-semibold text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full"><PhoneMissed className="h-3 w-3 mr-1" />Missed</span>
                              : <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full"><PhoneCall className="h-3 w-3 mr-1" />Answered</span>
                            }
                            {log.call_disposition && getDispositionBadge(log.call_disposition)}
                            {log.duration_seconds > 0 && <span className="text-xs text-muted-foreground font-mono">{formatDuration(log.duration_seconds)}</span>}
                          </div>
                          <div className="shrink-0" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            {isMissed && log.from_number ? (
                              <a href={`tel:${log.from_number}`} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-full shadow-sm">
                                <Phone className="h-4 w-4" />
                                Call Back
                              </a>
                            ) : log.recording_url ? (
                              <RecordingPlayer url={log.recording_url} />
                            ) : null}
                          </div>
                        </div>
                        {(log.call_notes && log.call_notes.trim().length > 0) ? (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2 flex items-start gap-1">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0 text-green-600" />
                            <span>{log.call_notes}</span>
                          </p>
                        ) : !isMissed ? (
                          <p className="mt-2 text-xs text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            No notes yet
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── DESKTOP: Table layout (≥ md) ── */}
              <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <SortableHeader
                          columnId="from_number"
                          label="Caller"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>ExoPhone</TableHead>
                      <TableHead>
                        <SortableHeader
                          columnId="cost_amount"
                          label="Status"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortableHeader
                          columnId="call_disposition"
                          label="Disposition"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortableHeader
                          columnId="duration_seconds"
                          label="Duration"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>Recording</TableHead>
                      <TableHead>
                        <SortableHeader
                          columnId="started_at"
                          label="Time"
                          currentSortBy={sortBy}
                          currentSortOrder={sortOrder}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => router.push(`/admission/counselors/calls/${log.id}`)}>
                        <TableCell>
                          <div>
                            {log.lead ? (
                              <Link href={`/admission/leads/${log.lead.id}`} className="text-sm font-medium hover:underline text-primary">{log.lead.full_name}</Link>
                            ) : (
                              <span className="text-sm font-medium text-muted-foreground italic">Unknown Caller</span>
                            )}
                            <p className="text-xs text-muted-foreground font-mono">{log.from_number ? maskPhone(log.from_number) : '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell><span className="text-xs text-muted-foreground font-mono">{log.to_number ? `...${log.to_number.slice(-4)}` : '-'}</span></TableCell>
                        <TableCell>{getInboundStatusBadge(log.cost_amount)}</TableCell>
                        <TableCell>{getDispositionBadge(log.call_disposition)}</TableCell>
                        <TableCell>{log.duration_seconds > 0 ? <span className="text-sm font-mono">{formatDuration(log.duration_seconds)}</span> : <span className="text-xs text-muted-foreground">--</span>}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}><RecordingPlayer url={log.recording_url} /></TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.started_at || log.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                          </span>
                        </TableCell>
                        <TableCell>{getNotesIndicator(log)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {(!log.cost_amount || log.cost_amount <= 0) && log.from_number && (
                            <a href={`tel:${log.from_number}`} className="inline-flex items-center h-7 px-2 text-xs border rounded-md hover:bg-accent">
                              <Phone className="h-3 w-3 mr-1" />Call Back
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Advanced pagination: page-size selector + first/prev/next/last */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t mt-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Page <span className="font-medium text-foreground">{page}</span> of{' '}
                    <span className="font-medium text-foreground">{Math.max(totalPages, 1)}</span>{' '}
                    <span className="text-muted-foreground">({total} call{total !== 1 ? 's' : ''})</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Rows</Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    >
                      <SelectTrigger className="h-8 w-[72px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                    aria-label="First page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(Math.max(totalPages, 1))}
                    aria-label="Last page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
