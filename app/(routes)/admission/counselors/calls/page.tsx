'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { IncomingCallsTab } from './_components/incoming-calls-tab';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
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

// Structured Call Notes taxonomy (added 2026-04-18)
// Keep values snake_case so they round-trip cleanly to the DB's TEXT columns.
const CALL_OUTCOME_OPTIONS = [
  { value: 'connected', label: 'Connected' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'invalid_number', label: 'Invalid Number' },
];

const PROSPECT_SENTIMENT_OPTIONS = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

const PRIMARY_OBJECTION_OPTIONS = [
  { value: 'fees', label: 'Fees' },
  { value: 'distance', label: 'Distance' },
  { value: 'undecided', label: 'Undecided' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'none', label: 'None' },
];

const NEXT_ACTION_OPTIONS = [
  { value: 'send_brochure', label: 'Send Brochure' },
  { value: 'schedule_visit', label: 'Schedule Visit' },
  { value: 'escalate_admin', label: 'Escalate to Admin' },
  { value: 'close_lost', label: 'Close-Lost' },
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!url) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        if (playing && audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
          setPlaying(false);
        } else {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.play().catch(() => {
            window.open(url, '_blank');
          });
          audio.onended = () => {
            audioRef.current = null;
            setPlaying(false);
          };
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
  currentFollowUpAt,
  currentCallOutcome,
  currentSentiment,
  currentObjection,
  currentNextAction,
  canEdit,
  onAdvance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string;
  currentNotes: string | null;
  currentDisposition: CallDisposition | null;
  currentFollowUp: string | null;
  currentFollowUpAt: string | null;
  currentCallOutcome: string | null;
  currentSentiment: string | null;
  currentObjection: string | null;
  currentNextAction: string | null;
  canEdit: boolean;
  onAdvance?: () => void;
}) {
  const [notes, setNotes] = useState(currentNotes || '');
  const [callOutcome, setCallOutcome] = useState(currentCallOutcome || '');
  const [sentiment, setSentiment] = useState(currentSentiment || '');
  const [objection, setObjection] = useState(currentObjection || '');
  const [nextAction, setNextAction] = useState(currentNextAction || '');
  // Follow-up datetime-local string (YYYY-MM-DDTHH:mm). Hydrated from
  // follow_up_at when present, otherwise the legacy DATE column + 09:00.
  const hydrateFollowUp = () => {
    if (currentFollowUpAt) {
      const d = new Date(currentFollowUpAt);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    return currentFollowUp ? `${currentFollowUp.slice(0, 10)}T09:00` : '';
  };
  const [followUpLocal, setFollowUpLocal] = useState(hydrateFollowUp());
  const [formError, setFormError] = useState<string | null>(null);
  const { updateCallNotes, isUpdatingNotes } = useCallMutations();

  // Re-hydrate fields every time the dialog opens on a new call
  useEffect(() => {
    if (!open) return;
    setNotes(currentNotes || '');
    setCallOutcome(currentCallOutcome || '');
    setSentiment(currentSentiment || '');
    setObjection(currentObjection || '');
    setNextAction(currentNextAction || '');
    setFollowUpLocal(hydrateFollowUp());
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, callId]);

  // Follow-up is required unless the lead is being closed-lost.
  const followUpRequired = nextAction !== 'close_lost';
  const isFollowUpMissing = followUpRequired && !followUpLocal;

  const handleSave = () => {
    if (isFollowUpMissing) {
      setFormError('Follow-up Date/Time is required unless Next Action is Close-Lost.');
      return;
    }
    setFormError(null);

    const followUpAtIso = followUpLocal ? new Date(followUpLocal).toISOString() : null;
    const followUpDateOnly = followUpLocal ? followUpLocal.slice(0, 10) : null;

    updateCallNotes.mutate(
      {
        call_id: callId,
        call_notes: notes || undefined,
        follow_up_date: followUpDateOnly,
        follow_up_at: followUpAtIso,
        call_outcome: callOutcome || null,
        prospect_sentiment: sentiment || null,
        primary_objection: objection || null,
        next_action: nextAction || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          // Advance to the next lead in the list (if the parent supplied a handler)
          if (onAdvance) {
            setTimeout(() => onAdvance(), 150);
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call Notes</DialogTitle>
          <DialogDescription>Record the outcome of this call</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Call Outcome</Label>
              <Select value={callOutcome} onValueChange={setCallOutcome}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {CALL_OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prospect Sentiment</Label>
              <Select value={sentiment} onValueChange={setSentiment}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select sentiment" />
                </SelectTrigger>
                <SelectContent>
                  {PROSPECT_SENTIMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary Objection</Label>
              <Select value={objection} onValueChange={setObjection}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select objection" />
                </SelectTrigger>
                <SelectContent>
                  {PRIMARY_OBJECTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Next Action Required</Label>
              <Select value={nextAction} onValueChange={setNextAction}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select next action" />
                </SelectTrigger>
                <SelectContent>
                  {NEXT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>
              Follow-up Date/Time
              {followUpRequired && <span className="text-destructive"> *</span>}
            </Label>
            <Input
              type="datetime-local"
              value={followUpLocal}
              onChange={(e) => setFollowUpLocal(e.target.value)}
              className={`mt-1.5 ${isFollowUpMissing && formError ? 'border-destructive' : ''}`}
            />
            {!followUpRequired && (
              <p className="mt-1 text-xs text-muted-foreground">
                Optional because Next Action is Close-Lost.
              </p>
            )}
          </div>

          <div>
            <Label>Caller Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed — specific conversational nuances..."
              className="mt-1.5"
              rows={4}
            />
          </div>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={isUpdatingNotes}>
              {isUpdatingNotes && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </Button>
          )}
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
  const { isSuperAdmin, isAdmissionGlobalUser, canAccess } = usePermissions();
  const isGlobalUser = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId = isGlobalUser ? undefined : profile?.institution_id;
  const canEditNotes = canAccess('admission', 'leads.edit')
    || canAccess('admission', 'counselors.calls.edit')
    || canAccess('admission', 'counselors.edit');

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
    followUpAt: string | null;
    callOutcome: string | null;
    sentiment: string | null;
    objection: string | null;
    nextAction: string | null;
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
      followUpAt: log.follow_up_at ?? null,
      callOutcome: log.call_outcome ?? null,
      sentiment: log.prospect_sentiment ?? null,
      objection: log.primary_objection ?? null,
      nextAction: log.next_action ?? null,
    });
    setNotesDialogOpen(true);
  };

  // Auto-advance: after submit, open the next call in the current list that
  // still lacks a structured Call Outcome. Falls back to closing the dialog
  // cleanly if nothing remains in the queue.
  const advanceToNextCall = () => {
    if (!selectedCall) return;
    const currentIdx = logs.findIndex((l: any) => l.id === selectedCall.id);
    if (currentIdx === -1) return;
    const next = logs.slice(currentIdx + 1).find((l: any) => !l.call_outcome);
    if (next) openNotesDialog(next);
  };

  // Tab state from URL search params
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('direction') === 'outbound' ? 'outbound' : 'incoming';
  const [activeTab, setActiveTab] = useState(defaultTab);

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

          {/* Direction Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="outbound" className="gap-2">
                <Phone className="h-4 w-4" />
                Outbound Calls
              </TabsTrigger>
              <TabsTrigger value="incoming" className="gap-2">
                <PhoneIncoming className="h-4 w-4" />
                Incoming Calls
              </TabsTrigger>
            </TabsList>

            {/* Incoming Calls Tab */}
            <TabsContent value="incoming" className="mt-6">
              <IncomingCallsTab institutionId={institutionId} />
            </TabsContent>

            {/* Outbound Calls Tab (existing content) */}
            <TabsContent value="outbound" className="mt-6 space-y-6">

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
                            {new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}
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
                  <div className="overflow-x-auto -mx-6 px-6">
                  <Table className="min-w-[680px]">
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
                            <span className="text-sm">{log.counselor?.full_name || 'Unknown'}</span>
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
                              {new Date(log.created_at).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata',
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
                  </div>

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

            </TabsContent>
          </Tabs>
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
            currentFollowUpAt={selectedCall.followUpAt}
            currentCallOutcome={selectedCall.callOutcome}
            currentSentiment={selectedCall.sentiment}
            currentObjection={selectedCall.objection}
            currentNextAction={selectedCall.nextAction}
            canEdit={canEditNotes}
            onAdvance={advanceToNextCall}
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
