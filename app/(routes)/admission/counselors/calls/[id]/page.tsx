'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { useCallLogs, formatDuration, type CallDisposition } from '@/hooks/admission';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ArrowLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  Calendar,
  User,
  FileText,
  Play,
  Pause,
  Square,
  Volume2,
  Hash,
  ExternalLink,
  Loader2,
  Save,
  UserPlus,
  History,
  MapPin,
  Route,
  AlertCircle,
  Sparkles,
  MessageSquare,
  Smile,
  Frown,
  Meh,
} from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface CallDetail {
  id: string;
  call_sid: string;
  direction: 'inbound' | 'outbound';
  status: string;
  from_number: string;
  to_number: string;
  duration_seconds: number;
  recording_url: string | null;
  call_notes: string | null;
  call_disposition: CallDisposition | null;
  follow_up_date: string | null;
  follow_up_at: string | null;
  call_outcome: string | null;
  prospect_sentiment: string | null;
  primary_objection: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  lead: { id: string; full_name: string; phone: string } | null;
  counselor: { id: string; full_name: string } | null;
  exotel: Record<string, unknown> | null;
  // Journey intelligence fields
  caller_journey_context: string | null;
  caller_location: string | null;
  caller_attempt_number: number | null;
}

// Shape returned by GET /api/admission/calls/[id]/intelligence
// (matches admission_call_intelligence row + null when no row exists).
interface CallIntelligence {
  id: string;
  call_log_id: string;
  call_sid: string | null;
  analyze_job_id: string | null;
  analyze_status: 'submitted' | 'processing' | 'completed' | 'failed' | string;
  analyze_submitted_at: string | null;
  analyze_completed_at: string | null;
  transcription: string | null;
  transcription_language: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  summary: string | null;
  categories: string[] | null;
  extracted_name: string | null;
  extracted_location: string | null;
  extracted_course: string | null;
  enrichment_applied: boolean | null;
  enrichment_applied_at: string | null;
  created_at: string;
  updated_at: string | null;
}

const DISPOSITION_OPTIONS: { value: CallDisposition; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback', label: 'Callback Requested' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'switched_off', label: 'Switched Off' },
  { value: 'busy', label: 'Busy' },
  { value: 'other', label: 'Other' },
];

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  completed: { label: 'Answered', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  'no-answer': { label: 'Missed', className: 'bg-red-100 text-red-700 border-red-200' },
  busy: { label: 'Busy', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800 border-red-200' },
  initiated: { label: 'Initiated', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  ringing: { label: 'Ringing', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  'in-progress': { label: 'In Progress', className: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const DISPOSITION_STYLES: Record<string, { label: string; className: string }> = {
  interested: { label: 'Interested', className: 'bg-green-100 text-green-800 border-green-200' },
  not_interested: { label: 'Not Interested', className: 'bg-red-100 text-red-800 border-red-200' },
  callback: { label: 'Callback', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  wrong_number: { label: 'Wrong Number', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  not_reachable: { label: 'Not Reachable', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  switched_off: { label: 'Switched Off', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  busy: { label: 'Busy', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  other: { label: 'Other', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

// ============================================================================
// AUDIO PLAYER
// ============================================================================

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('ended', () => setPlaying(false));

    return () => {
      audio.pause();
      audio.removeAttribute('src');
    };
  }, [url]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => window.open(url, '_blank'));
    }
    setPlaying(!playing);
  };

  const stop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
      <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={toggle}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      {playing && (
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={stop}>
          <Square className="h-3.5 w-3.5" />
        </Button>
      )}
      <div className="flex-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-mono tabular-nums w-16 text-right">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
      <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

// ============================================================================
// INFO ROW COMPONENT
// ============================================================================

function InfoRow({ icon: Icon, label, value, mono }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
      </div>
    </div>
  );
}

// ============================================================================
// AI INTELLIGENCE CARD
// ============================================================================
// Renders the AI-extracted transcription / sentiment / summary / categories
// from /api/admission/calls/[id]/intelligence.
//
// Per probe-compliance-2026-05-03.md (J2): the intel API route already
// existed but the call-detail page never consumed it — even when intel
// rows had data, counselors saw nothing. This card closes that gap.
//
// State machine (from analyze_status column):
//   submitted | processing → "Analyzing call recording…"
//   completed              → render transcript, sentiment, summary, categories
//   failed | <no row>      → "No analysis available"

function SentimentBadge({ sentiment, score }: { sentiment: string | null; score: number | null }) {
  if (!sentiment) return null;
  const lower = sentiment.toLowerCase();
  const config: { Icon: React.ElementType; className: string } =
    lower === 'positive'
      ? { Icon: Smile, className: 'bg-green-50 text-green-700 border-green-200' }
      : lower === 'negative'
      ? { Icon: Frown, className: 'bg-red-50 text-red-700 border-red-200' }
      : { Icon: Meh, className: 'bg-gray-50 text-gray-700 border-gray-200' };
  return (
    <Badge variant="outline" className={`${config.className} gap-1`}>
      <config.Icon className="h-3.5 w-3.5" />
      <span className="capitalize">{sentiment}</span>
      {typeof score === 'number' && (
        <span className="ml-0.5 text-[10px] font-mono opacity-75">
          ({score.toFixed(2)})
        </span>
      )}
    </Badge>
  );
}

function IntelligenceCard({ callId }: { callId: string }) {
  const { data, isLoading, isError } = useQuery<{ intelligence: CallIntelligence | null }>({
    queryKey: ['call-intelligence', callId],
    queryFn: async () => {
      const res = await fetch(`/api/admission/calls/${callId}/intelligence`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load intelligence');
      return res.json();
    },
    enabled: !!callId,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // No intel row at all OR API error → "No analysis available" empty state.
  const intel = data?.intelligence ?? null;
  if (isError || !intel || intel.analyze_status === 'failed') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              {intel?.analyze_status === 'failed'
                ? 'Analysis failed for this recording.'
                : 'No analysis available for this call.'}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // submitted / processing → in-flight banner.
  if (intel.analyze_status === 'submitted' || intel.analyze_status === 'processing') {
    const submittedAt = intel.analyze_submitted_at
      ? new Date(intel.analyze_submitted_at).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })
      : null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Intelligence
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 ml-1 text-xs">
              {intel.analyze_status === 'submitted' ? 'Queued' : 'Processing'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50/50 border border-blue-100">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Analyzing call recording…</p>
              {submittedAt && (
                <p className="text-xs text-blue-700/80 mt-0.5">
                  Submitted {submittedAt}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Transcription, sentiment, and summary will appear here once Exotel
                ExoVoice completes processing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // analyze_status === 'completed' → full render.
  const completedAt = intel.analyze_completed_at
    ? new Date(intel.analyze_completed_at).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI Intelligence
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 ml-1 text-xs">
            Completed
          </Badge>
          {intel.sentiment && (
            <span className="ml-auto">
              <SentimentBadge sentiment={intel.sentiment} score={intel.sentiment_score} />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        {intel.summary && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Summary
            </p>
            <p className="text-sm leading-relaxed">{intel.summary}</p>
          </div>
        )}

        {/* Categories */}
        {intel.categories && intel.categories.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {intel.categories.map((cat, i) => (
                <Badge key={`${cat}-${i}`} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Extracted entities (if any) */}
        {(intel.extracted_name || intel.extracted_location || intel.extracted_course) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t">
            {intel.extracted_name && (
              <div>
                <p className="text-xs text-muted-foreground">Name (AI)</p>
                <p className="text-sm font-medium">{intel.extracted_name}</p>
              </div>
            )}
            {intel.extracted_location && (
              <div>
                <p className="text-xs text-muted-foreground">Location (AI)</p>
                <p className="text-sm font-medium">{intel.extracted_location}</p>
              </div>
            )}
            {intel.extracted_course && (
              <div>
                <p className="text-xs text-muted-foreground">Course (AI)</p>
                <p className="text-sm font-medium">{intel.extracted_course}</p>
              </div>
            )}
          </div>
        )}

        {/* Transcription (collapsible-ish: rendered with max-height + scroll) */}
        {intel.transcription && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              Transcript
              {intel.transcription_language && (
                <Badge variant="outline" className="text-[10px] ml-1 px-1.5 py-0">
                  {intel.transcription_language}
                </Badge>
              )}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{intel.transcription}</p>
            </div>
          </div>
        )}

        {completedAt && (
          <p className="text-[10px] text-muted-foreground/70 pt-1">
            Analysis completed {completedAt}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

function CallDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id;

  // Fetch call details. The list dialog (`/admission/counselors/calls`) can
  // mutate this record and then the counselor navigates here to review — so we
  // force a refetch on mount/focus rather than trusting the cached copy. Paired
  // with explicit invalidation in useCallMutations, this guarantees the form
  // is populated with the latest server state.
  const { data: call, isLoading, isError } = useQuery<CallDetail>({
    queryKey: ['call-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/admission/calls/${id}/details`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load call details');
      const json = await res.json();
      return json.data;
    },
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Notes form state — synced to the latest server value by callKey, so that
  // the form reflects fresh data after saves and on call-id changes, but user
  // edits in flight are not clobbered mid-keystroke.
  const [notes, setNotes] = useState('');
  const [disposition, setDisposition] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const callKey = call
    ? `${id}|${call.updated_at ?? ''}|${call.call_notes ?? ''}|${call.call_disposition ?? ''}|${call.follow_up_date ?? ''}`
    : null;
  const lastSyncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!call || !callKey) return;
    if (lastSyncedKeyRef.current === callKey) return;
    setNotes(call.call_notes || '');
    setDisposition(call.call_disposition || '');
    setFollowUpDate(call.follow_up_date || '');
    lastSyncedKeyRef.current = callKey;
  }, [call, callKey]);

  // Save notes mutation
  const saveNotes = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admission/calls/${id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_notes: notes || null,
          call_disposition: disposition || null,
          follow_up_date: followUpDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to save notes' }));
        throw new Error(err.message || 'Failed to save notes');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Call notes saved');
      queryClient.invalidateQueries({ queryKey: ['call-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['call-logs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save call notes');
    },
  });

  // Call history from same number
  const { logs: relatedCalls } = useCallLogs({
    institution_id: institutionId,
    search: call?.from_number || '',
    limit: 10,
  });

  const otherCalls = relatedCalls.filter(c => c.id !== id);

  if (isLoading) {
    return (
      <ContentLayout title="Call Details">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48" />
              <Skeleton className="h-64" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-32" />
              <Skeleton className="h-48" />
            </div>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (isError || !call) {
    return (
      <ContentLayout title="Call Details">
        <div className="text-center py-20">
          <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="text-lg font-medium">Call not found</p>
          <p className="text-sm text-muted-foreground mt-1">This call may have been deleted.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/admission/counselors/calls')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Calls
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const statusStyle = STATUS_STYLES[call.status] || STATUS_STYLES.initiated;
  const isInbound = call.direction === 'inbound';

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Call Details">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/counselors/calls">Call Logs</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Call Details</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admission/counselors/calls')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-lg font-semibold">Call Details</h1>
            <Badge variant="outline" className={isInbound
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'
            }>
              {isInbound ? <PhoneIncoming className="h-3 w-3 mr-1" /> : <PhoneOutgoing className="h-3 w-3 mr-1" />}
              {isInbound ? 'Inbound' : 'Outbound'}
            </Badge>
            <Badge variant="outline" className={statusStyle.className}>
              {statusStyle.label}
            </Badge>
          </div>

          {/* Main Grid: 2/3 + 1/3 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column (2/3) */}
            <div className="lg:col-span-2 space-y-6">

              {/* Journey Context Card (FIX 5) */}
              {call.caller_journey_context && (call.caller_attempt_number ?? 1) > 1 && (
                <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                      <Route className="h-4 w-4" />
                      Caller Journey
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 ml-2">
                        Attempt #{call.caller_attempt_number}
                      </Badge>
                      {call.caller_location && (
                        <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 ml-1">
                          <MapPin className="h-3 w-3 mr-1" />
                          {call.caller_location}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Timeline dots */}
                    <div className="space-y-2">
                      {call.caller_journey_context.split('\n').map((line, i) => {
                        if (!line.trim()) return null;
                        const isHeader = line.startsWith('[Caller Journey]');
                        const isCurrent = line.includes('NOW:');
                        const isMissed = line.includes('missed');
                        const isAnswered = line.includes('answered') || line.includes('Connected');
                        const isLocation = line.startsWith('Location:');
                        const isLead = line.startsWith('Lead:');

                        if (isHeader) {
                          return (
                            <p key={i} className="text-sm font-semibold text-orange-800">
                              {line.replace('[Caller Journey] ', '')}
                            </p>
                          );
                        }

                        if (line.startsWith('- ')) {
                          return (
                            <div key={i} className="flex items-center gap-2 ml-2">
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                isCurrent ? 'bg-blue-500 ring-2 ring-blue-200' :
                                isMissed ? 'bg-red-400' :
                                isAnswered ? 'bg-green-500' :
                                'bg-gray-300'
                              }`} />
                              <span className={`text-xs ${
                                isCurrent ? 'font-bold text-blue-700' :
                                isMissed ? 'text-red-600' :
                                isAnswered ? 'text-green-700' :
                                'text-muted-foreground'
                              }`}>
                                {line.slice(2)}
                              </span>
                            </div>
                          );
                        }

                        if (isLocation || isLead) {
                          return (
                            <p key={i} className="text-xs text-muted-foreground ml-2 mt-1">
                              {line}
                            </p>
                          );
                        }

                        return <p key={i} className="text-xs text-muted-foreground">{line}</p>;
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Caller Location (shown even without full journey, if location exists) */}
              {call.caller_location && (!call.caller_journey_context || (call.caller_attempt_number ?? 1) <= 1) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-700">Caller location: <strong>{call.caller_location}</strong> (from phone prefix)</span>
                </div>
              )}

              {/* Call Info Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Call Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    <div className="divide-y">
                      <InfoRow icon={Phone} label="Caller Number" value={call.from_number} mono />
                      <InfoRow icon={Phone} label="ExoPhone" value={call.to_number} mono />
                      <InfoRow icon={Hash} label="Call SID" value={
                        <span className="text-xs break-all">{call.call_sid}</span>
                      } />
                    </div>
                    <div className="divide-y">
                      <InfoRow icon={Calendar} label="Date & Time" value={
                        new Date(call.started_at || call.created_at).toLocaleString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })
                      } />
                      <InfoRow icon={Clock} label="Duration" value={
                        call.duration_seconds > 0 ? formatDuration(call.duration_seconds) : '--'
                      } />
                      {call.counselor && (
                        <InfoRow icon={User} label="Handled By" value={call.counselor.full_name} />
                      )}
                    </div>
                  </div>

                  {/* Recording */}
                  {call.recording_url && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Call Recording</p>
                      <AudioPlayer url={call.recording_url} />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes Card (inline edit) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Notes & Disposition
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Disposition</Label>
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
                      <Label className="text-xs">Follow-up Date</Label>
                      <Input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Call Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What was discussed on this call..."
                      className="mt-1.5 min-h-[100px]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => saveNotes.mutate()}
                      disabled={saveNotes.isPending}
                    >
                      {saveNotes.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}
                      {saveNotes.isPending ? 'Saving...' : 'Save Notes'}
                    </Button>
                  </div>
                  {saveNotes.isSuccess && (
                    <p className="text-xs text-green-600">Notes saved successfully.</p>
                  )}
                </CardContent>
              </Card>

              {/* AI Intelligence — transcription, sentiment, summary, categories.
                  Renders all three states (in-flight / completed / no-data) so
                  counselors get correct feedback regardless of pipeline status. */}
              <IntelligenceCard callId={id} />
            </div>

            {/* Right Column (1/3) */}
            <div className="space-y-6">

              {/* Lead Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Caller
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {call.lead ? (
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium">{call.lead.full_name}</p>
                        <p className="text-sm text-muted-foreground font-mono">{call.lead.phone}</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link href={`/admission/leads/${call.lead.id}`}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          View Lead Profile
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-center py-2">
                        <User className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm font-medium text-muted-foreground">Unknown Caller</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{call.from_number}</p>
                      </div>
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link href={`/admission/leads/new?phone=${encodeURIComponent(call.from_number)}`}>
                          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                          Create Lead
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Current Disposition */}
              {call.call_disposition && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Current Disposition</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline" className={
                      DISPOSITION_STYLES[call.call_disposition]?.className || 'bg-gray-100 text-gray-600'
                    }>
                      {DISPOSITION_STYLES[call.call_disposition]?.label || call.call_disposition}
                    </Badge>
                    {call.follow_up_date && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Follow-up: {new Date(call.follow_up_date).toLocaleDateString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric'
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Structured Call Outcome (from list-dialog enrichment) */}
              {(call.call_outcome || call.prospect_sentiment || call.primary_objection || call.next_action || call.follow_up_at) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Outcome Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {call.call_outcome && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs text-muted-foreground">Outcome</span>
                        <span className="font-medium text-right capitalize">
                          {call.call_outcome.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                    {call.prospect_sentiment && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs text-muted-foreground">Sentiment</span>
                        <Badge variant="outline" className={
                          call.prospect_sentiment === 'positive' ? 'bg-green-50 text-green-700 border-green-200 text-xs' :
                          call.prospect_sentiment === 'negative' ? 'bg-red-50 text-red-700 border-red-200 text-xs' :
                          'bg-gray-50 text-gray-700 border-gray-200 text-xs'
                        }>
                          {call.prospect_sentiment}
                        </Badge>
                      </div>
                    )}
                    {call.primary_objection && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs text-muted-foreground">Objection</span>
                        <span className="font-medium text-right capitalize">
                          {call.primary_objection.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                    {call.next_action && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs text-muted-foreground">Next Action</span>
                        <span className="font-medium text-right capitalize">
                          {call.next_action.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                    {call.follow_up_at && (
                      <div className="flex items-start justify-between gap-3 pt-1 border-t">
                        <span className="text-xs text-muted-foreground">Follow-up</span>
                        <span className="font-medium text-right text-xs">
                          {new Date(call.follow_up_at).toLocaleString(undefined, {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Call History from same number */}
              {otherCalls.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Other Calls ({otherCalls.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {otherCalls.slice(0, 8).map((c: any) => {
                        const s = STATUS_STYLES[c.status] || STATUS_STYLES.initiated;
                        return (
                          <Link
                            key={c.id}
                            href={`/admission/counselors/calls/${c.id}`}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {c.direction === 'inbound' ? (
                                <PhoneIncoming className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <PhoneOutgoing className="h-3.5 w-3.5 text-blue-600" />
                              )}
                              <Badge variant="outline" className={`${s.className} text-[10px] px-1.5 py-0`}>
                                {s.label}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-mono">{formatDuration(c.duration_seconds)}</span>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(c.created_at).toLocaleDateString(undefined, {
                                  month: 'short', day: 'numeric',
                                })}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CallDetailPage() {
  return (
    <AdmissionErrorBoundary>
      <CallDetailContent />
    </AdmissionErrorBoundary>
  );
}
