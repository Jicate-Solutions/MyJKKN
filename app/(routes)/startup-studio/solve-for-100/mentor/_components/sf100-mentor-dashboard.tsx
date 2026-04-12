'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { AlertCircle, Loader2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useSF100Enrollments,
  useSF100CheckIns,
  useAddSF100MentorFeedback,
  useSF100Programs,
} from '@/hooks/startup-studio';

type TeamStatus = 'active' | 'warning' | 'probation';

function getTeamStatus(lastCheckinAt: string | null | undefined): TeamStatus {
  if (!lastCheckinAt) return 'probation';
  const daysSince = Math.floor(
    (Date.now() - new Date(lastCheckinAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince >= 28) return 'probation';
  if (daysSince >= 14) return 'warning';
  return 'active';
}

const STATUS_INDICATOR: Record<TeamStatus, { dot: string; label: string; badgeClass: string }> = {
  active: {
    dot: 'bg-green-500',
    label: 'Active',
    badgeClass: 'bg-green-100 text-green-700 border-green-200',
  },
  warning: {
    dot: 'bg-amber-400',
    label: 'Warning',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  probation: {
    dot: 'bg-red-500',
    label: 'Probation',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
  },
};

const PHASE_LABELS: Record<string, string> = {
  ideation: 'Ideation',
  validation: 'Validation',
  mvp: 'MVP',
  revenue: 'Revenue',
  growth: 'Growth',
  graduated: 'Graduated',
};

function TeamCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-36" />
      </CardContent>
    </Card>
  );
}

function CheckInReviewSheet({
  enrollment,
  open,
  onOpenChange,
}: {
  enrollment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const { data: raw, isLoading } = useSF100CheckIns(enrollment?.id ?? '', { limit: 1 });
  const checkIns: any[] = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
  const latest = checkIns[0];

  const { mutate: addFeedback, isPending } = useAddSF100MentorFeedback();

  const handleSubmit = () => {
    if (!feedback.trim() || !latest?.id) return;
    addFeedback(
      { checkInId: latest.id, feedback_text: feedback.trim() },
      {
        onSuccess: () => {
          toast.success('Feedback submitted.');
          setFeedback('');
          onOpenChange(false);
        },
        onError: () => toast.error('Failed to submit feedback.'),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{enrollment?.team_name ?? 'Team'} — Check-in Review</SheetTitle>
          <SheetDescription>
            Latest check-in details and mentor feedback
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !latest ? (
            <p className="text-sm text-muted-foreground">No check-ins submitted yet.</p>
          ) : (
            <>
              {/* Check-in meta */}
              <div className="text-sm text-muted-foreground">
                Submitted:{' '}
                {latest.submitted_at
                  ? new Date(latest.submitted_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'}
              </div>

              {/* Weekly fields */}
              {latest.check_in_type === 'weekly' || latest.what_did_you_do ? (
                <div className="space-y-4">
                  {[
                    { key: 'what_did_you_do', label: 'What did you do?' },
                    { key: 'blockers', label: 'Blockers' },
                    { key: 'next_steps', label: 'Next Steps' },
                    { key: 'wins', label: 'Wins' },
                  ].map(({ key, label }) =>
                    latest[key] ? (
                      <div key={key}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          {label}
                        </p>
                        <p className="text-sm leading-relaxed bg-muted/40 rounded p-3">
                          {latest[key]}
                        </p>
                      </div>
                    ) : null
                  )}

                  {/* Metrics */}
                  {(latest.cumulative_paid_users != null ||
                    latest.active_paid_users != null ||
                    latest.revenue != null) && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Metrics
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'cumulative_paid_users', label: 'Cumulative Users' },
                          { key: 'active_paid_users', label: 'Active Users' },
                          { key: 'revenue', label: 'Revenue (₹)' },
                        ].map(({ key, label }) => (
                          <div key={key} className="bg-muted/40 rounded p-2 text-center">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-base font-semibold">
                              {latest[key] ?? '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Micro check-in */
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Update
                  </p>
                  <p className="text-sm leading-relaxed bg-muted/40 rounded p-3">
                    {latest.content ?? latest.micro_update ?? '—'}
                  </p>
                </div>
              )}

              {/* Existing feedback */}
              {latest.mentor_feedback && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Previous Feedback
                  </p>
                  <p className="text-sm leading-relaxed bg-blue-50 border border-blue-100 rounded p-3">
                    {latest.mentor_feedback}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Feedback textarea */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Add Feedback</label>
            <Textarea
              placeholder="Write your feedback for this team..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="resize-none h-28"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!feedback.trim() || isPending || !latest}
            className="w-full"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Submit Feedback
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SF100MentorDashboard() {
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Discover the active program
  const { data: programsRaw } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const activeProgramId: string = activeProgram?.id ?? '';

  const { data: raw, isLoading, error } = useSF100Enrollments(activeProgramId, {
    my_teams: true,
  });
  const enrollments: any[] = Array.isArray(raw) ? raw : [];

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <TeamCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load your teams. Please try again.</AlertDescription>
      </Alert>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/30">
        <Users className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-lg font-medium">No teams assigned</p>
        <p className="text-sm text-muted-foreground mt-1">
          You have no teams assigned to you yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {enrollments.map((enrollment: any) => {
          const status = getTeamStatus(enrollment.last_checkin_at ?? enrollment.last_check_in_date);
          const indicator = STATUS_INDICATOR[status];
          const phase = enrollment.current_phase ?? enrollment.phase ?? 'ideation';
          const paidUsers = enrollment.paid_user_count ?? enrollment.total_paid_users ?? 0;
          const lastCheckin = enrollment.last_checkin_at ?? enrollment.last_check_in_date;
          const lastCheckinLabel = lastCheckin
            ? new Date(lastCheckin).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })
            : 'Never';

          return (
            <Card key={enrollment.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`shrink-0 h-2.5 w-2.5 rounded-full ${indicator.dot}`}
                      aria-label={indicator.label}
                    />
                    <CardTitle className="text-base leading-tight truncate">
                      {enrollment.team_name ?? 'Unnamed Team'}
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-xs font-medium ${indicator.badgeClass}`}
                  >
                    {indicator.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    Phase:{' '}
                    <span className="text-foreground font-medium">
                      {PHASE_LABELS[phase] ?? phase}
                    </span>
                  </span>
                  <span>
                    Paid:{' '}
                    <span className="text-foreground font-medium tabular-nums">
                      {paidUsers}/100
                    </span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last check-in: {lastCheckinLabel}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelectedEnrollment(enrollment);
                    setSheetOpen(true);
                  }}
                >
                  Review Check-in
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedEnrollment && (
        <CheckInReviewSheet
          enrollment={selectedEnrollment}
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setSelectedEnrollment(null);
          }}
        />
      )}
    </>
  );
}
