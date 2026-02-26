'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCallLogs,
  useCallStats,
  useCallMutations,
  formatDuration,
  type CallStatus,
  type CallDisposition,
} from '@/hooks/admission';
import { AdmissionErrorBoundary } from '@/components/admission';
import {
  Phone,
  PhoneOff,
  PhoneMissed,
  Clock,
  FileText,
  Play,
  Pause,
  AlertTriangle,
  TrendingUp,
  Users,
  Timer,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  X,
} from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { value: CallStatus; label: string }[] = [
  { value: 'initiated', label: 'Initiated' },
  { value: 'ringing', label: 'Ringing' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'busy', label: 'Busy' },
  { value: 'no-answer', label: 'No Answer' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const DISPOSITION_OPTIONS: { value: CallDisposition; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback', label: 'Callback' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'switched_off', label: 'Switched Off' },
  { value: 'busy', label: 'Busy' },
  { value: 'other', label: 'Other' },
];

function getStatusBadge(status: CallStatus) {
  const map: Record<CallStatus, { label: string; className: string }> = {
    'initiated': { label: 'Initiated', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    'ringing': { label: 'Ringing', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    'in-progress': { label: 'In Progress', className: 'bg-green-100 text-green-800 border-green-200' },
    'completed': { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    'busy': { label: 'Busy', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    'no-answer': { label: 'No Answer', className: 'bg-red-100 text-red-700 border-red-200' },
    'failed': { label: 'Failed', className: 'bg-red-100 text-red-800 border-red-200' },
    'cancelled': { label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  };
  const cfg = map[status] || map.initiated;
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
}

function getDispositionBadge(disposition: CallDisposition | null) {
  if (!disposition) return <span className="text-xs text-muted-foreground italic">No disposition</span>;
  const map: Record<string, { label: string; className: string }> = {
    interested: { label: 'Interested', className: 'bg-green-100 text-green-800 border-green-200' },
    not_interested: { label: 'Not Interested', className: 'bg-red-100 text-red-800 border-red-200' },
    callback: { label: 'Callback', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    wrong_number: { label: 'Wrong Number', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    not_reachable: { label: 'Not Reachable', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    switched_off: { label: 'Switched Off', className: 'bg-gray-100 text-gray-800 border-gray-200' },
    busy: { label: 'Busy', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    other: { label: 'Other', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const cfg = map[disposition] || { label: disposition, className: 'bg-gray-100 text-gray-600' };
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
}

// ============================================================================
// INLINE RECORDING PLAYER
// ============================================================================

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
        // Simple audio playback using the browser's Audio API
        const audio = new Audio(url);
        if (playing) {
          audio.pause();
          setPlaying(false);
        } else {
          audio.play().catch(() => {
            // Fallback: open in new tab if autoplay blocked
            window.open(url, '_blank');
          });
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
// CALL NOTES DIALOG
// ============================================================================

function CallNotesDialog({
  open,
  onOpenChange,
  callId,
  currentNotes,
  currentDisposition,
  currentFollowUp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string;
  currentNotes: string | null;
  currentDisposition: CallDisposition | null;
  currentFollowUp: string | null;
}) {
  const [notes, setNotes] = useState(currentNotes || '');
  const [disposition, setDisposition] = useState<string>(currentDisposition || '');
  const [followUpDate, setFollowUpDate] = useState(currentFollowUp || '');
  const { updateCallNotes, isUpdatingNotes } = useCallMutations();

  const handleSave = () => {
    updateCallNotes.mutate(
      {
        call_id: callId,
        call_notes: notes || undefined,
        call_disposition: (disposition as CallDisposition) || undefined,
        follow_up_date: followUpDate || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Call Notes</DialogTitle>
          <DialogDescription>Record the outcome of this call</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Disposition</Label>
            <Select value={disposition} onValueChange={setDisposition}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed..."
              className="mt-1.5"
              rows={4}
            />
          </div>
          <div>
            <Label>Follow-up Date</Label>
            <Input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdatingNotes}>
            {isUpdatingNotes && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

function CallLogDashboardContent() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id;

  // Filter state
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dispositionFilter, setDispositionFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Notes dialog state
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<{
    id: string;
    notes: string | null;
    disposition: CallDisposition | null;
    followUp: string | null;
  } | null>(null);

  // Data hooks
  const { logs, total, totalPages, isLoading: logsLoading } = useCallLogs({
    institution_id: institutionId,
    status: (statusFilter as CallStatus) || undefined,
    disposition: (dispositionFilter as CallDisposition) || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    page,
    limit: 20,
  });

  const { stats, isLoading: statsLoading } = useCallStats(institutionId);

  const isLoading = logsLoading;

  const clearFilters = () => {
    setStatusFilter('');
    setDispositionFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasFilters = !!statusFilter || !!dispositionFilter || !!fromDate || !!toDate;

  const openNotesDialog = (log: any) => {
    setSelectedCall({
      id: log.id,
      notes: log.call_notes,
      disposition: log.call_disposition,
      followUp: log.follow_up_date,
    });
    setNotesDialogOpen(true);
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Call Logs">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Call Logs</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
                <Phone className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : stats.total_calls}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                <Phone className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : stats.completed_calls}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Missed / No Answer</CardTitle>
                <PhoneMissed className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : stats.missed_calls}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Duration</CardTitle>
                <Timer className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : formatDuration(stats.avg_duration_seconds)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Missing Notes</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? <Skeleton className="h-7 w-12" /> : (
                    <span className={stats.calls_without_notes > 0 ? 'text-orange-600' : ''}>
                      {stats.calls_without_notes}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Call Volume by Date */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Call Volume
                </CardTitle>
                <CardDescription>Calls per day</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : stats.calls_by_date.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No call data yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.calls_by_date.slice(-14).map((day) => {
                      const max = Math.max(...stats.calls_by_date.map((d) => d.count), 1);
                      const pct = (day.count / max) * 100;
                      return (
                        <div key={day.date} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-20 shrink-0">
                            {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-8 text-right">{day.count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Counselor Call Volume */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Counselor Performance
                </CardTitle>
                <CardDescription>Calls per counselor</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : stats.calls_by_counselor.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No counselor data yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.calls_by_counselor
                      .sort((a, b) => b.call_count - a.call_count)
                      .slice(0, 10)
                      .map((c) => {
                        const max = Math.max(...stats.calls_by_counselor.map((x) => x.call_count), 1);
                        const pct = (c.call_count / max) * 100;
                        return (
                          <div key={c.counselor_id} className="flex items-center gap-3">
                            <span className="text-sm w-32 truncate shrink-0">{c.counselor_name}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-right shrink-0 w-24">
                              <span className="text-xs font-medium">{c.call_count} calls</span>
                              <span className="text-xs text-muted-foreground ml-1">({formatDuration(c.avg_duration)} avg)</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Call Log Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Call History</CardTitle>
                  <CardDescription>
                    {total} total call{total !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-4 w-4 mr-1" />
                    Filters
                  </Button>
                </div>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t mt-4">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === '_all' ? '' : v); setPage(1); }}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All statuses</SelectItem>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Disposition</Label>
                    <Select value={dispositionFilter} onValueChange={(v) => { setDispositionFilter(v === '_all' ? '' : v); setPage(1); }}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All dispositions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All dispositions</SelectItem>
                        {DISPOSITION_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">From Date</Label>
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">To Date</Label>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No calls found</p>
                  <p className="text-sm mt-1">
                    {hasFilters ? 'Try adjusting your filters' : 'Call logs will appear here once calls are made'}
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead / Number</TableHead>
                        <TableHead>Counselor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Recording</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openNotesDialog(log)}>
                          <TableCell>
                            <div>
                              {log.lead ? (
                                <Link
                                  href={`/admission/leads/${log.lead.id}`}
                                  className="text-sm font-medium hover:underline text-primary"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {log.lead.full_name}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium">{log.to_number}</span>
                              )}
                              <p className="text-xs text-muted-foreground">{log.to_number}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{log.counselor?.name || 'Unknown'}</span>
                          </TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell>{getDispositionBadge(log.call_disposition)}</TableCell>
                          <TableCell>
                            <span className="text-sm font-mono">
                              {formatDuration(log.duration_seconds)}
                            </span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <RecordingPlayer url={log.recording_url} />
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </TableCell>
                          <TableCell>
                            {log.call_notes ? (
                              <FileText className="h-4 w-4 text-green-600" />
                            ) : log.status === 'completed' ? (
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Add
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
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
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setPage(page + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Call Notes Dialog */}
        {selectedCall && (
          <CallNotesDialog
            open={notesDialogOpen}
            onOpenChange={setNotesDialogOpen}
            callId={selectedCall.id}
            currentNotes={selectedCall.notes}
            currentDisposition={selectedCall.disposition}
            currentFollowUp={selectedCall.followUp}
          />
        )}
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CallLogDashboardPage() {
  return (
    <AdmissionErrorBoundary>
      <CallLogDashboardContent />
    </AdmissionErrorBoundary>
  );
}
