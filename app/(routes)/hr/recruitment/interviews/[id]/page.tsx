'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Users,
  Video,
  Phone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  useInterview,
  useScorecards,
  useCancelInterview,
  useRescheduleInterview,
  useCompleteInterview,
  useMarkNoShow,
} from '@/hooks/hr/use-recruitment-interviews';
import { useCandidate, useJob } from '@/hooks/hr/use-recruitment';
import { useStaffForSelection } from '@/hooks/staff/use-staff';
import { useAuth } from '@/hooks/use-auth';
import { InterviewStatusBadge } from '@/features/hr/recruitment/interview-status-badge';
import { ScorecardForm } from '@/features/hr/recruitment/scorecard-form';
import {
  INTERVIEW_MODE_LABELS,
  SCORECARD_RECOMMENDATION_LABELS,
  type InterviewMode,
  type ScorecardRecommendation,
} from '@/types/hr-recruitment';
import { toast } from 'sonner';

// ---- Helpers ----
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const MODE_ICONS: Record<InterviewMode, typeof Video> = {
  in_person: MapPin,
  video: Video,
  phone: Phone,
  walk_in: MapPin,
};

const RECOMMENDATION_BADGE_COLORS: Record<ScorecardRecommendation, string> = {
  strong_hire:    'bg-green-100 text-green-800',
  hire:           'bg-emerald-100 text-emerald-800',
  neutral:        'bg-gray-100 text-gray-700',
  no_hire:        'bg-orange-100 text-orange-800',
  strong_no_hire: 'bg-red-100 text-red-800',
};

export default function InterviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  // Data
  const { data: interview, isLoading } = useInterview(id);
  const { data: scorecards = [] } = useScorecards(id);
  const { data: candidate } = useCandidate(interview?.candidate_id);
  const { data: job } = useJob(interview?.job_id ?? undefined);

  // Staff lookup for panel member names
  const institutionId = profile?.institution_id ?? '';
  const { data: staffList = [] } = useStaffForSelection({
    institution_id: institutionId,
    isActive: true,
  });
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  // Actions
  const cancelMutation = useCancelInterview();
  const rescheduleMutation = useRescheduleInterview();
  const completeMutation = useCompleteInterview();
  const noShowMutation = useMarkNoShow();

  // Dialogs
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [showComplete, setShowComplete] = useState(false);
  const [outcomeSummary, setOutcomeSummary] = useState('');

  // Determine if current user is a panel member
  const currentUserId = profile?.id;
  const isPanel = interview?.panel_member_ids?.includes(currentUserId ?? '') ?? false;
  const hasSubmittedScorecard = scorecards.some(
    (sc) => sc.interviewer_id === currentUserId,
  );

  const isScheduled = interview?.status === 'scheduled';

  // ---- Action handlers ----
  const handleCancel = async () => {
    if (!id) return;
    try {
      await cancelMutation.mutateAsync({ id, reason: cancelReason.trim() || undefined });
      toast.success('Interview cancelled');
      setShowCancel(false);
      setCancelReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleReschedule = async () => {
    if (!id || !rescheduleDate) return;
    try {
      const result = await rescheduleMutation.mutateAsync({
        id,
        scheduled_at: new Date(rescheduleDate).toISOString(),
      });
      toast.success('Interview rescheduled');
      setShowReschedule(false);
      setRescheduleDate('');
      // Navigate to the new interview
      router.push(`/hr/recruitment/interviews/${result.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleComplete = async () => {
    if (!id) return;
    try {
      await completeMutation.mutateAsync({
        id,
        outcome_summary: outcomeSummary.trim() || undefined,
      });
      toast.success('Interview marked as completed');
      setShowComplete(false);
      setOutcomeSummary('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleNoShow = async () => {
    if (!id) return;
    try {
      await noShowMutation.mutateAsync({ id });
      toast.success('Interview marked as no-show');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const staffName = (sid: string) => {
    const s = staffMap.get(sid);
    return s ? `${s.first_name} ${s.last_name}` : sid.slice(0, 8);
  };

  // ---- Loading / not found ----
  if (isLoading) {
    return (
      <ContentLayout title="Interview">
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!interview) {
    return (
      <ContentLayout title="Interview">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Interview not found</p>
          <Link href="/hr/recruitment/interviews" className="text-primary text-sm underline mt-2 inline-block">
            Back to interviews
          </Link>
        </div>
      </ContentLayout>
    );
  }

  const ModeIcon = MODE_ICONS[interview.mode] ?? MapPin;

  return (
    <ContentLayout title={`Interview — ${candidate?.name ?? 'Loading...'}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/recruitment/interviews">Interviews</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Detail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        {/* Back link */}
        <Link
          href="/hr/recruitment/interviews"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to interviews
        </Link>

        {/* Header card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-xl font-semibold">
                    {candidate?.name ?? 'Loading...'}
                  </h1>
                  <InterviewStatusBadge status={interview.status} />
                </div>

                {job && (
                  <p className="text-sm text-muted-foreground">
                    Job: <span className="font-medium text-foreground">{job.title}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {formatDateTime(interview.scheduled_at)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {interview.duration_minutes} min
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ModeIcon className="h-4 w-4" />
                    {INTERVIEW_MODE_LABELS[interview.mode]}
                  </span>
                </div>

                {interview.location_or_link && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Location: </span>
                    {interview.mode === 'video' ? (
                      <a
                        href={interview.location_or_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1"
                      >
                        Join video call <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span>{interview.location_or_link}</span>
                    )}
                  </p>
                )}

                {interview.round_name && (
                  <p className="text-sm text-muted-foreground">
                    Round #{interview.round_number}: {interview.round_name}
                  </p>
                )}

                {interview.outcome_summary && (
                  <div className="mt-2 p-3 rounded-md bg-muted text-sm">
                    <strong>Outcome:</strong> {interview.outcome_summary}
                  </div>
                )}
              </div>

              {/* Action buttons — only for scheduled interviews */}
              {isScheduled && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowComplete(true)}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Mark Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowReschedule(true)}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Reschedule
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleNoShow}
                    disabled={noShowMutation.isPending}
                  >
                    <AlertTriangle className="mr-1.5 h-4 w-4" />
                    No Show
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowCancel(true)}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Two-column layout: Panel + Scorecards */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Panel Members */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Panel Members ({interview.panel_member_ids?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!interview.panel_member_ids || interview.panel_member_ids.length === 0) ? (
                <p className="text-sm text-muted-foreground">No panel members assigned</p>
              ) : (
                <div className="space-y-2">
                  {interview.panel_member_ids.map((memberId) => {
                    const submitted = scorecards.some(
                      (sc) => sc.interviewer_id === memberId,
                    );
                    return (
                      <div
                        key={memberId}
                        className="flex items-center justify-between p-2 rounded-md border text-sm"
                      >
                        <span className="font-medium">{staffName(memberId)}</span>
                        <Badge
                          variant="outline"
                          className={
                            submitted
                              ? 'bg-green-100 text-green-800 border-transparent'
                              : 'bg-yellow-100 text-yellow-800 border-transparent'
                          }
                        >
                          {submitted ? 'Submitted' : 'Pending'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scorecards Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Scorecards ({scorecards.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scorecards.length === 0 ? (
                <p className="text-sm text-muted-foreground">No scorecards submitted yet</p>
              ) : (
                <div className="space-y-3">
                  {scorecards.map((sc) => (
                    <div key={sc.id} className="p-3 rounded-md border space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {staffName(sc.interviewer_id)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`border-transparent ${
                            RECOMMENDATION_BADGE_COLORS[sc.recommendation] ?? ''
                          }`}
                        >
                          {SCORECARD_RECOMMENDATION_LABELS[sc.recommendation]}
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Overall: {sc.rating_overall}/5</span>
                        {sc.rating_technical != null && (
                          <span>Technical: {sc.rating_technical}/5</span>
                        )}
                        {sc.rating_communication != null && (
                          <span>Communication: {sc.rating_communication}/5</span>
                        )}
                        {sc.rating_culture_fit != null && (
                          <span>Culture: {sc.rating_culture_fit}/5</span>
                        )}
                      </div>
                      {sc.strengths && (
                        <p className="text-xs text-muted-foreground">
                          <strong>Strengths:</strong> {sc.strengths}
                        </p>
                      )}
                      {sc.concerns && (
                        <p className="text-xs text-muted-foreground">
                          <strong>Concerns:</strong> {sc.concerns}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Scorecard form — only if current user is a panel member and hasn't submitted yet */}
        {isPanel && !hasSubmittedScorecard && (
          <ScorecardForm interviewId={id} />
        )}

        {isPanel && hasSubmittedScorecard && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-green-600" />
              You have already submitted your scorecard for this interview.
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- Dialogs ---- */}

      {/* Cancel Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Why is this interview being cancelled?"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Interview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reschedule-date">New Date &amp; Time</Label>
            <Input
              id="reschedule-date"
              type="datetime-local"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This will create a new interview and mark the current one as rescheduled.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReschedule(false)}>
              Back
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={!rescheduleDate || rescheduleMutation.isPending}
            >
              {rescheduleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showComplete} onOpenChange={setShowComplete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Interview Complete</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="outcome-summary">Outcome Summary (optional)</Label>
            <Textarea
              id="outcome-summary"
              placeholder="Brief summary of the interview outcome..."
              value={outcomeSummary}
              onChange={(e) => setOutcomeSummary(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComplete(false)}>
              Back
            </Button>
            <Button
              onClick={handleComplete}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
