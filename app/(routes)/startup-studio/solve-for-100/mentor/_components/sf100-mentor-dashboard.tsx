'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { AlertCircle, Loader2, Users, Clock, AlertTriangle, ExternalLink, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useSF100Enrollments,
  useSF100CheckIns,
  useAddSF100MentorFeedback,
  useSF100Programs,
} from '@/hooks/startup-studio';

type TeamStatus = 'active' | 'warning' | 'probation';
type SortOption = 'recent-checkin' | 'oldest-checkin' | 'most-users' | 'least-users' | 'team-name';
type TabValue = 'all' | 'needs-review' | 'probation';

const VALID_TABS: TabValue[] = ['all', 'needs-review', 'probation'];

function getTeamStatus(lastCheckinAt: string | null | undefined): TeamStatus {
  if (!lastCheckinAt) return 'probation';
  const daysSince = Math.floor(
    (Date.now() - new Date(lastCheckinAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince >= 28) return 'probation';
  if (daysSince >= 14) return 'warning';
  return 'active';
}

function getDaysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
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

function StatCard({ label, value, accent, icon: Icon }: {
  label: string;
  value: number | string;
  accent?: string;
  icon?: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${accent || ''}`}>{value}</p>
          </div>
          {Icon && (
            <div className="p-3 rounded-full bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Check-in Review Sheet ──────────────────────────────────────────
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
          <SheetDescription>Latest check-in details and mentor feedback</SheetDescription>
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
              <div className="text-sm text-muted-foreground">
                Submitted:{' '}
                {latest.submitted_at
                  ? new Date(latest.submitted_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })
                  : '—'}
              </div>

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
                        <p className="text-sm leading-relaxed bg-muted/40 rounded p-3">{latest[key]}</p>
                      </div>
                    ) : null
                  )}

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
                            <p className="text-base font-semibold">{latest[key] ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Update
                  </p>
                  <p className="text-sm leading-relaxed bg-muted/40 rounded p-3">
                    {latest.content ?? latest.micro_update ?? '—'}
                  </p>
                </div>
              )}

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

          <div className="space-y-2">
            <label className="text-sm font-medium">Add Feedback</label>
            <Textarea
              placeholder="Write your feedback for this team..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="resize-none h-28"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!feedback.trim() || isPending || !latest}
              className="flex-1"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Feedback
            </Button>
            {enrollment?.id && (
              <Button asChild variant="outline">
                <Link href={`/startup-studio/solve-for-100/team/${enrollment.id}`}>
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Full View
                </Link>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Team Card ──────────────────────────────────────────────────────
function TeamCard({
  enrollment,
  onReview,
}: {
  enrollment: any;
  onReview: (e: any) => void;
}) {
  const lastCheckin = enrollment.last_checkin_at ?? enrollment.last_check_in_date;
  const status = getTeamStatus(lastCheckin);
  const indicator = STATUS_INDICATOR[status];
  const phase = enrollment.current_phase ?? enrollment.phase ?? 'ideation';
  const paidUsers = enrollment.paid_user_count ?? enrollment.total_paid_users ?? enrollment.cumulative_paid_users ?? 0;
  const daysSince = getDaysSince(lastCheckin);
  const lastCheckinLabel = lastCheckin
    ? new Date(lastCheckin).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : 'Never';

  return (
    <Card className="hover:shadow-md transition-shadow">
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
          {daysSince != null && daysSince > 0 && ` (${daysSince}d ago)`}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onReview(enrollment)}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" /> Review
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/startup-studio/solve-for-100/team/${enrollment.id}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Empty States ───────────────────────────────────────────────────
function EmptyTeamsState() {
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

function EmptyFilterState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── Team Grid ──────────────────────────────────────────────────────
function TeamGrid({
  enrollments,
  onReview,
  emptyMessage,
}: {
  enrollments: any[];
  onReview: (e: any) => void;
  emptyMessage?: string;
}) {
  if (enrollments.length === 0) {
    return <EmptyFilterState message={emptyMessage || 'No teams match this filter.'} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {enrollments.map((enrollment: any) => (
        <TeamCard key={enrollment.id} enrollment={enrollment} onReview={onReview} />
      ))}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────
export function SF100MentorDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlTab = searchParams.get('tab');
  const initialTab: TabValue = (urlTab && VALID_TABS.includes(urlTab as TabValue))
    ? (urlTab as TabValue)
    : 'all';
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [sortBy, setSortBy] = useState<SortOption>('oldest-checkin');
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabValue);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'all') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const handleReview = (enrollment: any) => {
    setSelectedEnrollment(enrollment);
    setSheetOpen(true);
  };

  // Discover active program
  const { data: programsRaw } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const activeProgramId: string = activeProgram?.id ?? '';

  const { data: raw, isLoading, error } = useSF100Enrollments(activeProgramId, {
    my_teams: true,
  });
  const enrollments: any[] = Array.isArray(raw) ? raw : [];

  // Sort enrollments
  const sortedEnrollments = useMemo(() => {
    const sorted = [...enrollments];
    sorted.sort((a, b) => {
      const aLast = a.last_checkin_at ?? a.last_check_in_date;
      const bLast = b.last_checkin_at ?? b.last_check_in_date;
      const aPaid = a.paid_user_count ?? a.cumulative_paid_users ?? 0;
      const bPaid = b.paid_user_count ?? b.cumulative_paid_users ?? 0;

      switch (sortBy) {
        case 'recent-checkin':
          return new Date(bLast || 0).getTime() - new Date(aLast || 0).getTime();
        case 'oldest-checkin':
          return new Date(aLast || 0).getTime() - new Date(bLast || 0).getTime();
        case 'most-users':
          return bPaid - aPaid;
        case 'least-users':
          return aPaid - bPaid;
        case 'team-name':
          return (a.team_name || '').localeCompare(b.team_name || '');
        default:
          return 0;
      }
    });
    return sorted;
  }, [enrollments, sortBy]);

  // Filter for tabs
  const needsReview = sortedEnrollments.filter(e => {
    const last = e.last_checkin_at ?? e.last_check_in_date;
    const days = getDaysSince(last);
    return days == null || days >= 7;
  });

  const probationTeams = sortedEnrollments.filter(e => {
    const last = e.last_checkin_at ?? e.last_check_in_date;
    return getTeamStatus(last) === 'probation';
  });

  const warningCount = sortedEnrollments.filter(e => {
    const last = e.last_checkin_at ?? e.last_check_in_date;
    return getTeamStatus(last) === 'warning';
  }).length;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <TeamCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load your teams. Please try again.</AlertDescription>
      </Alert>
    );
  }

  // Empty state
  if (enrollments.length === 0) {
    return <EmptyTeamsState />;
  }

  return (
    <div className="space-y-6">
      {/* Action Required Banner */}
      {(needsReview.length > 0 || probationTeams.length > 0) && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap gap-4 text-sm">
              {needsReview.length > 0 && (
                <span className="font-medium">
                  <strong className="text-amber-700 dark:text-amber-400">{needsReview.length}</strong> teams need review
                </span>
              )}
              {probationTeams.length > 0 && (
                <span className="font-medium">
                  <strong className="text-red-700 dark:text-red-400">{probationTeams.length}</strong> teams on probation
                </span>
              )}
            </div>
            {needsReview.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => handleTabChange('needs-review')} className="shrink-0">
                Review now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Teams" value={enrollments.length} icon={Users} />
        <StatCard
          label="Needs Review"
          value={needsReview.length}
          accent={needsReview.length > 0 ? 'text-amber-600' : ''}
          icon={Clock}
        />
        <StatCard
          label="Warning"
          value={warningCount}
          accent={warningCount > 0 ? 'text-amber-600' : ''}
        />
        <StatCard
          label="Probation"
          value={probationTeams.length}
          accent={probationTeams.length > 0 ? 'text-red-600' : ''}
          icon={AlertTriangle}
        />
      </div>

      {/* Tabs + Sort */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList>
            <TabsTrigger value="all">All Teams ({sortedEnrollments.length})</TabsTrigger>
            <TabsTrigger value="needs-review">
              Needs Review{needsReview.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold px-1.5 min-w-[1.25rem] h-5">
                  {needsReview.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="probation">
              Probation{probationTeams.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-1.5 min-w-[1.25rem] h-5">
                  {probationTeams.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest-checkin">Oldest check-in first</SelectItem>
              <SelectItem value="recent-checkin">Most recent check-in</SelectItem>
              <SelectItem value="most-users">Most paid users</SelectItem>
              <SelectItem value="least-users">Least paid users</SelectItem>
              <SelectItem value="team-name">Team name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="all" className="mt-6">
          <TeamGrid
            enrollments={sortedEnrollments}
            onReview={handleReview}
            emptyMessage="No teams to show."
          />
        </TabsContent>
        <TabsContent value="needs-review" className="mt-6">
          <TeamGrid
            enrollments={needsReview}
            onReview={handleReview}
            emptyMessage="All your teams have been reviewed recently. Great work!"
          />
        </TabsContent>
        <TabsContent value="probation" className="mt-6">
          <TeamGrid
            enrollments={probationTeams}
            onReview={handleReview}
            emptyMessage="No teams on probation. Everyone is on track."
          />
        </TabsContent>
      </Tabs>

      {/* Review Sheet */}
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
    </div>
  );
}
