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
  useTelephonyHealth,
  useBulkCallback,
  useUniqueCallers,
  useCallFunnel,
  formatDuration,
  type CallStatus,
  type UniqueCaller,
  type FunnelStage,
} from '@/hooks/admission';
import { cn } from '@/lib/utils';
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
  Filter,
  X,
  Users,
  MapPin,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { CounselorAvailabilityCard } from './counselor-availability-card';
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

function InboundKpiCards({ stats, isLoading }: { stats: any; isLoading: boolean }) {
  const cards = [
    {
      title: 'Total Incoming',
      value: stats.total_incoming,
      icon: PhoneIncoming,
      iconColor: 'text-blue-600',
    },
    {
      title: 'Answered',
      value: stats.answered,
      icon: PhoneCall,
      iconColor: 'text-green-600',
    },
    {
      title: 'Missed',
      value: stats.missed,
      icon: PhoneMissed,
      iconColor: 'text-red-500',
      highlight: stats.missed > 0,
    },
    {
      title: 'Answer Rate',
      value: `${stats.answer_rate}%`,
      icon: TrendingUp,
      iconColor: stats.answer_rate >= 80 ? 'text-green-600' : stats.answer_rate >= 50 ? 'text-yellow-600' : 'text-red-600',
    },
    {
      title: 'Missed (No Callback)',
      value: stats.missed_without_callback,
      icon: AlertTriangle,
      iconColor: 'text-orange-600',
      highlight: stats.missed_without_callback > 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.iconColor}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.highlight ? 'text-red-600' : ''}`}>
              {isLoading ? <Skeleton className="h-7 w-12" /> : card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// CALL-TO-ENROLLMENT FUNNEL
// ============================================================================

function getConversionColor(rate: number | null): string {
  if (rate === null) return '';
  if (rate >= 50) return 'text-emerald-600';
  if (rate >= 25) return 'text-yellow-600';
  return 'text-red-500';
}

function getFunnelBarColor(index: number): string {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-amber-500',
    'bg-green-600',
  ];
  return colors[index] || 'bg-gray-400';
}

function CallFunnelView({ stages, isLoading }: { stages: FunnelStage[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call-to-Enrollment Funnel</CardTitle>
          <CardDescription>Prospect journey from inbound call to enrollment</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Call-to-Enrollment Funnel
        </CardTitle>
        <CardDescription>Inbound call prospect journey with conversion rates between stages</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Horizontal funnel for md+ screens */}
        <div className="hidden md:flex items-center gap-1">
          {stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-1 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground truncate">{stage.name}</p>
                  <p className="text-2xl font-bold tabular-nums">{stage.count.toLocaleString()}</p>
                  {stage.rate !== null && (
                    <p className={cn('text-xs font-medium', getConversionColor(stage.rate))}>
                      {stage.rate}%
                    </p>
                  )}
                </div>
                {/* Bar */}
                <div className="mt-1.5 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', getFunnelBarColor(i))}
                    style={{ width: `${Math.max((stage.count / maxCount) * 100, 2)}%` }}
                  />
                </div>
              </div>
              {i < stages.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mx-0.5" />
              )}
            </div>
          ))}
        </div>

        {/* Vertical funnel for small screens */}
        <div className="md:hidden space-y-3">
          {stages.map((stage, i) => (
            <div key={stage.key}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{stage.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{stage.count.toLocaleString()}</span>
                  {stage.rate !== null && (
                    <span className={cn('text-xs font-medium', getConversionColor(stage.rate))}>
                      {stage.rate}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                <div
                  className={cn('h-full rounded-full transition-all', getFunnelBarColor(i))}
                  style={{ width: `${Math.max((stage.count / maxCount) * 100, 2)}%` }}
                />
              </div>
              {i < stages.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// CHARTS
// ============================================================================

function InboundVolumeChart({
  data,
  isLoading,
  selectedDate,
  onDateClick,
}: {
  data: Array<{ date: string; answered: number; missed: number }>;
  isLoading: boolean;
  selectedDate?: string;
  onDateClick?: (date: string) => void;
}) {
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
        const isSelected = selectedDate === day.date;
        return (
          <div
            key={day.date}
            className={cn(
              "flex items-center gap-3 rounded px-1 -mx-1 transition-colors",
              onDateClick && "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20",
              isSelected && "bg-blue-100 dark:bg-blue-950/30 ring-1 ring-blue-300"
            )}
            onClick={() => onDateClick?.(day.date)}
          >
            <span className={cn("text-xs w-20 shrink-0", isSelected ? "font-bold text-blue-600" : "text-muted-foreground")}>
              {new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
        {selectedDate && (
          <button
            className="ml-auto text-blue-600 hover:underline flex items-center gap-1"
            onClick={(e) => { e.stopPropagation(); onDateClick?.(''); }}
          >
            <X className="h-3 w-3" /> Clear filter
          </button>
        )}
      </div>
    </div>
  );
}

function HourlyDistributionChart({
  data,
  isLoading,
  selectedHour,
  onHourClick,
}: {
  data: Array<{ hour: number; answered: number; missed: number }>;
  isLoading: boolean;
  selectedHour?: number | null;
  onHourClick?: (hour: number | null) => void;
}) {
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
        const isSelected = selectedHour === h.hour;
        const hourLabel = h.hour === 0 ? '12 AM' : h.hour < 12 ? `${h.hour} AM` : h.hour === 12 ? '12 PM' : `${h.hour - 12} PM`;

        return (
          <div
            key={h.hour}
            className={cn(
              "flex items-center gap-3 -mx-2 px-2 py-0.5 rounded transition-colors",
              onHourClick && total > 0 && "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20",
              isSelected && "bg-blue-100 dark:bg-blue-950/30 ring-1 ring-blue-300",
              isPeak && !isSelected && "bg-blue-50 dark:bg-blue-950/20",
            )}
            onClick={() => total > 0 && onHourClick?.(isSelected ? null : h.hour)}
          >
            <span className={cn(
              "text-xs w-12 shrink-0",
              isSelected ? "font-bold text-blue-600" : isPeak ? "font-bold text-blue-600" : "text-muted-foreground"
            )}>
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
      <div className="flex items-center gap-2 pt-1">
        {peakHour && (peakHour.answered + peakHour.missed) > 0 && (
          <span className="text-xs text-blue-600 font-medium">
            Peak: {peakHour.hour === 0 ? '12 AM' : peakHour.hour < 12 ? `${peakHour.hour} AM` : peakHour.hour === 12 ? '12 PM' : `${peakHour.hour - 12} PM`}
            {' '}({peakHour.answered + peakHour.missed} calls)
          </span>
        )}
        {selectedHour != null && (
          <button
            className="ml-auto text-xs text-blue-600 hover:underline flex items-center gap-1"
            onClick={(e) => { e.stopPropagation(); onHourClick?.(null); }}
          >
            <X className="h-3 w-3" /> Clear filter
          </button>
        )}
      </div>
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

  // View mode: 'all' = individual calls, 'unique' = grouped by caller
  const [viewMode, setViewMode] = useState<'all' | 'unique'>('all');

  // Filter state
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Drill-down state — set by clicking chart bars
  const [drilldownDate, setDrilldownDate] = useState<string>('');
  const [drilldownHour, setDrilldownHour] = useState<number | null>(null);

  // Compute effective date filters: drill-down overrides manual filters
  // When a day bar is clicked, scope to that day. When an hour bar is clicked
  // AND a day is selected, further narrow to that hour window.
  const effectiveFromDate = (() => {
    if (drilldownDate && drilldownHour != null) {
      // Date + hour selected: scope to that IST hour on that date
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${drilldownDate}T${pad(drilldownHour)}:00:00+05:30`;
    }
    return drilldownDate || fromDate;
  })();
  const effectiveToDate = (() => {
    if (drilldownDate && drilldownHour != null) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${drilldownDate}T${pad(drilldownHour)}:59:59+05:30`;
    }
    return drilldownDate || toDate;
  })();

  // Unique callers hook
  const { callers, summary: callerSummary, isLoading: uniqueLoading, isError: uniqueError, error: uniqueErrorMsg, refetch: refetchUnique } = useUniqueCallers(
    institutionId, effectiveFromDate || undefined, effectiveToDate || undefined
  );

  // Data hooks
  const { logs, total, totalPages, isLoading: logsLoading } = useCallLogs({
    institution_id: institutionId,
    direction: 'inbound',
    status: (statusFilter as CallStatus) || undefined,
    from_date: effectiveFromDate || undefined,
    to_date: effectiveToDate || undefined,
    page,
    limit: 20,
  });

  const { stats, isLoading: statsLoading } = useInboundCallStats(institutionId);
  const { funnel, isLoading: funnelLoading } = useCallFunnel(institutionId);
  const { data: health } = useTelephonyHealth();
  const bulkCallback = useBulkCallback();

  const clearFilters = () => {
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setDrilldownDate('');
    setDrilldownHour(null);
    setPage(1);
  };

  const hasFilters = !!statusFilter || !!fromDate || !!toDate || !!drilldownDate || drilldownHour != null;

  // Handlers for chart drill-down
  const handleDateClick = (date: string) => {
    if (date === drilldownDate || !date) {
      setDrilldownDate('');
    } else {
      setDrilldownDate(date);
      setDrilldownHour(null);
    }
    setPage(1);
  };

  const handleHourClick = (hour: number | null) => {
    setDrilldownHour(hour);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Health Banner */}
      {health && health.status !== 'healthy' && (
        <div className={cn(
          "p-3 rounded-lg text-sm flex items-center gap-2",
          health.status === 'critical' ? "bg-red-50 text-red-800 border border-red-200" : "bg-yellow-50 text-yellow-800 border border-yellow-200"
        )}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            {health.status === 'critical' ? 'ExoPhone Outage' : 'ExoPhone Warning'}
          </span>
          <span>— {health.latest?.connectivity_status || 'Unknown issue'}. Miss rates may be elevated.</span>
        </div>
      )}

      {/* KPI Cards */}
      <InboundKpiCards stats={stats} isLoading={statsLoading} />

      {/* Counselor Availability */}
      <CounselorAvailabilityCard />

      {/* Call-to-Enrollment Funnel */}
      <CallFunnelView stages={funnel.stages} isLoading={funnelLoading} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Incoming Call Volume
            </CardTitle>
            <CardDescription>Answered vs. missed per day — click a bar to filter</CardDescription>
          </CardHeader>
          <CardContent>
            <InboundVolumeChart
              data={stats.calls_by_date}
              isLoading={statsLoading}
              selectedDate={drilldownDate}
              onDateClick={handleDateClick}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              When Do Prospects Call?
            </CardTitle>
            <CardDescription>Hourly distribution (IST) — click a bar to filter</CardDescription>
          </CardHeader>
          <CardContent>
            <HourlyDistributionChart
              data={stats.calls_by_hour}
              isLoading={statsLoading}
              selectedHour={drilldownHour}
              onHourClick={handleHourClick}
            />
          </CardContent>
        </Card>
      </div>

      {/* Drill-down active banner */}
      {(drilldownDate || drilldownHour != null) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 text-sm text-blue-800 dark:text-blue-200">
          <Filter className="h-4 w-4 shrink-0" />
          <span>
            Showing calls
            {drilldownDate && (
              <> from <span className="font-semibold">{new Date(drilldownDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></>
            )}
            {drilldownHour != null && (
              <> between <span className="font-semibold">
                {drilldownHour === 0 ? '12 AM' : drilldownHour < 12 ? `${drilldownHour} AM` : drilldownHour === 12 ? '12 PM' : `${drilldownHour - 12} PM`}
                {' - '}
                {(drilldownHour + 1) % 24 === 0 ? '12 AM' : (drilldownHour + 1) < 12 ? `${drilldownHour + 1} AM` : (drilldownHour + 1) === 12 ? '12 PM' : `${(drilldownHour + 1) - 12} PM`}
              </span> (IST)</>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs text-blue-700 hover:text-blue-900"
            onClick={() => { setDrilldownDate(''); setDrilldownHour(null); setPage(1); }}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Call Log Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Incoming Call History</CardTitle>
              <CardDescription>
                {viewMode === 'all'
                  ? `${total} incoming call${total !== 1 ? 's' : ''}`
                  : `${callerSummary.unique_callers} unique callers from ${callerSummary.total_calls} calls`
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
            ) : uniqueError ? (
              <div className="text-center py-12 text-red-500">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-70" />
                <p className="font-medium">Failed to load callers</p>
                <p className="text-sm mt-1 text-muted-foreground">{uniqueErrorMsg?.message || 'Unknown error'}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchUnique()}>
                  Retry
                </Button>
              </div>
            ) : callers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No callers found</p>
                <p className="text-xs mt-1">Try adjusting the date filters</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold">{callerSummary.unique_callers}</p>
                    <p className="text-xs text-muted-foreground">Unique Callers</p>
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
                                <Link href={caller.lead_id ? `/admission/leads/${caller.lead_id}` : '#'} className="text-sm font-medium hover:underline text-primary">{caller.lead_name}</Link>
                              ) : (
                                <span className="text-sm font-medium text-muted-foreground italic">Unknown</span>
                              )}
                              <p className="text-xs text-muted-foreground font-mono">{maskPhone(caller.from_number)}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {caller.caller_location ? (
                              <span className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{caller.caller_location}</span>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-bold">{caller.total_attempts}</span>
                              <div className="text-[10px] text-muted-foreground">
                                <span className="text-green-600">{caller.answered_count} ans</span>{' / '}<span className="text-red-500">{caller.missed_count} miss</span>
                              </div>
                            </div>
                            {caller.days_trying > 1 && <p className="text-[10px] text-muted-foreground">over {caller.days_trying} days</p>}
                          </TableCell>
                          <TableCell>
                            {neverReached ? (
                              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                                <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Never Reached
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Connected</Badge>
                            )}
                            {caller.auto_sms_sent && <p className="text-[10px] text-blue-500 mt-0.5">SMS sent</p>}
                          </TableCell>
                          <TableCell>
                            {caller.callback_status ? (
                              <Badge variant="outline" className={`text-[10px] ${
                                caller.sla_breached ? 'bg-red-100 text-red-700 border-red-200' :
                                caller.callback_status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                                'bg-yellow-100 text-yellow-700 border-yellow-200'
                              }`}>{caller.sla_breached ? 'SLA BREACHED' : caller.callback_status}</Badge>
                            ) : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {new Date(caller.last_call_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
          /* ======= ALL CALLS VIEW (original) ======= */
          logsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caller</TableHead>
                    <TableHead>ExoPhone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Recording</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => router.push(`/admission/counselors/calls/${log.id}`)}>
                      <TableCell>
                        <div>
                          {log.lead ? (
                            <Link
                              href={`/admission/leads/${log.lead.id}`}
                              className="text-sm font-medium hover:underline text-primary"
                            >
                              {log.lead.full_name}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground italic">Unknown Caller</span>
                          )}
                          <p className="text-xs text-muted-foreground font-mono">
                            {log.from_number ? maskPhone(log.from_number) : '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.to_number ? `...${log.to_number.slice(-4)}` : '-'}
                        </span>
                      </TableCell>
                      <TableCell>{getInboundStatusBadge(log.cost_amount)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          {log.auto_sms_sent && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200">SMS</Badge>
                          )}
                          {log.callback_queued && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-purple-50 text-purple-700 border-purple-200">Callback</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.duration_seconds > 0 ? (
                          <span className="text-sm font-mono">{formatDuration(log.duration_seconds)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RecordingPlayer url={log.recording_url} />
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.started_at || log.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(!log.cost_amount || log.cost_amount <= 0) && log.callback_queue_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              if (!log.callback_queue_id) return;
                              bulkCallback.mutate([log.callback_queue_id]);
                            }}
                            disabled={bulkCallback.isPending}
                          >
                            <Phone className="h-3 w-3 mr-1" />
                            Call Back
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} calls)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
