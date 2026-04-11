'use client';

/**
 * SF100TeamDetail — Authenticated team transparency view
 *
 * Usage:
 *   <SF100TeamDetail enrollmentId="abc-123" defaultTab="check-ins" />
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  ExternalLink,
  Users,
  Calendar,
  MessageSquare,
  RefreshCw,
  GitBranch,
  CheckCircle2,
  Clock,
  DollarSign,
  Mic,
  TrendingUp,
} from 'lucide-react';
import {
  useSF100Enrollment,
  useSF100CheckIns,
  useSF100PaidUsers,
  useSF100Interviews,
  useSF100Pivots,
} from '@/hooks/startup-studio';
import { cn } from '@/lib/utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount?: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const PHASE_LABELS: Record<string, string> = {
  setup: 'Setup',
  problem_solution_fit: 'Problem-Solution Fit',
  first_users: 'First Users',
  growth: 'Growth',
  hundred_users: '100 Users',
  graduated: 'Graduated',
};

const PHASE_BADGE: Record<string, string> = {
  setup: 'bg-gray-100 text-gray-700 border-gray-200',
  problem_solution_fit: 'bg-purple-100 text-purple-700 border-purple-200',
  first_users: 'bg-green-100 text-green-700 border-green-200',
  growth: 'bg-blue-100 text-blue-700 border-blue-200',
  hundred_users: 'bg-orange-100 text-orange-700 border-orange-200',
  graduated: 'bg-amber-100 text-amber-700 border-amber-200',
};

const PIVOT_TYPE_LABELS: Record<string, string> = {
  customer_segment: 'Customer Segment',
  pricing: 'Pricing',
  solution: 'Solution',
  channel: 'Channel',
  problem: 'Problem',
  full: 'Full Pivot',
};

const STATUS_BADGE: Record<string, string> = {
  verified: 'bg-green-100 text-green-700 border-green-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

// ─── Skeletons ───────────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <div className="ml-auto">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ enrollmentId }: { enrollmentId: string }) {
  const { data: raw, isLoading, error } = useSF100Enrollment(enrollmentId);
  const enrollment = (raw as any)?.data ?? raw;

  if (isLoading) return <OverviewSkeleton />;
  if (error || !enrollment) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load team details.</AlertDescription>
      </Alert>
    );
  }

  const phase = enrollment.current_phase ?? enrollment.phase ?? 'setup';
  const members: any[] = enrollment.members ?? enrollment.team_members ?? [];
  const value = enrollment.value_declaration ?? enrollment.valueDeclaration ?? {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">
            {enrollment.app_name ?? enrollment.appName ?? enrollment.team_name ?? enrollment.teamName}
          </h2>
          {enrollment.app_name && (
            <p className="text-sm text-muted-foreground">
              by {enrollment.team_name ?? enrollment.teamName}
            </p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn('text-xs font-semibold self-start', PHASE_BADGE[phase])}
        >
          {PHASE_LABELS[phase] ?? phase}
        </Badge>
      </div>

      {/* Key metrics */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="shadow-sm border-0 bg-muted/30">
          <CardContent className="pt-4 pb-4 px-4 flex items-center gap-3">
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Paid Users</p>
              <p className="text-lg font-bold tabular-nums">
                {enrollment.paid_user_count ?? enrollment.paidUserCount ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        {(enrollment.live_url ?? enrollment.liveUrl) && (
          <Card className="shadow-sm border-0 bg-muted/30">
            <CardContent className="pt-4 pb-4 px-4 flex items-center gap-3">
              <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Live URL</p>
                <a
                  href={enrollment.live_url ?? enrollment.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-[#0b6d41] hover:underline truncate block"
                >
                  {enrollment.live_url ?? enrollment.liveUrl}
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm border-0 bg-muted/30">
          <CardContent className="pt-4 pb-4 px-4 flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className="text-sm font-medium">
                {formatDate(enrollment.enrolled_at ?? enrollment.enrolledAt ?? enrollment.created_at)}
              </p>
            </div>
          </CardContent>
        </Card>

        {(enrollment.college ?? enrollment.institution) && (
          <Card className="shadow-sm border-0 bg-muted/30">
            <CardContent className="pt-4 pb-4 px-4 flex items-center gap-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">College</p>
                <p className="text-sm font-medium">
                  {enrollment.college ?? enrollment.institution}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Team members */}
      {members.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Team Members</h3>
          <div className="space-y-1.5">
            {members.map((member: any, i: number) => (
              <div
                key={member.id ?? i}
                className="flex items-center gap-2 text-sm"
              >
                <div className="h-6 w-6 rounded-full bg-[#0b6d41]/10 flex items-center justify-center text-xs font-semibold text-[#0b6d41] flex-shrink-0">
                  {(member.name ?? member.full_name ?? 'M').charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">
                  {member.name ?? member.full_name ?? member.email ?? 'Member'}
                </span>
                {member.role && (
                  <span className="text-xs text-muted-foreground">— {member.role}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Value Declaration */}
      {(value.problem_domain || value.customer_segment || value.pricing_model) && (
        <div>
          <Separator className="mb-4" />
          <h3 className="text-sm font-semibold mb-3">Value Declaration</h3>
          <div className="space-y-2 text-sm">
            {value.problem_domain && (
              <div>
                <span className="text-muted-foreground">Problem domain: </span>
                <span>{value.problem_domain}</span>
              </div>
            )}
            {value.customer_segment && (
              <div>
                <span className="text-muted-foreground">Segment: </span>
                <span>{value.customer_segment}</span>
              </div>
            )}
            {value.pricing_model && (
              <div>
                <span className="text-muted-foreground">Pricing model: </span>
                <span>{value.pricing_model}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Check-ins Tab ───────────────────────────────────────────────────────────

function CheckInsTab({ enrollmentId }: { enrollmentId: string }) {
  const { data: raw, isLoading, error } = useSF100CheckIns(enrollmentId);
  const items: any[] = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load check-ins.</AlertDescription>
      </Alert>
    );
  }

  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.created_at ?? b.submitted_at ?? 0).getTime() -
      new Date(a.created_at ?? a.submitted_at ?? 0).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No check-ins submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((item: any, i: number) => (
        <Card key={item.id ?? i} className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                {formatDate(item.created_at ?? item.submitted_at)}
              </span>
              {item.week_number && (
                <Badge variant="outline" className="text-xs ml-auto">
                  Week {item.week_number}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4 space-y-3">
            {(item.content ?? item.update ?? item.body) && (
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {item.content ?? item.update ?? item.body}
              </p>
            )}

            {/* Structured fields */}
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              {item.users_this_week != null && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  <span>{item.users_this_week} new paid users</span>
                </div>
              )}
              {item.revenue_this_week != null && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3 w-3" aria-hidden="true" />
                  <span>{formatCurrency(item.revenue_this_week)} this week</span>
                </div>
              )}
            </div>

            {/* Mentor feedback */}
            {(item.mentor_feedback ?? item.feedback) && (
              <div className="mt-2 rounded-lg bg-[#0b6d41]/5 border border-[#0b6d41]/10 px-3 py-2.5">
                <p className="text-xs font-semibold text-[#0b6d41] mb-1">Mentor Feedback</p>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                  {item.mentor_feedback ?? item.feedback}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Paid Users Tab ──────────────────────────────────────────────────────────

function PaidUsersTab({ enrollmentId }: { enrollmentId: string }) {
  const { data: raw, isLoading, error } = useSF100PaidUsers(enrollmentId);
  const items: any[] = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load paid users.</AlertDescription>
      </Alert>
    );
  }

  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.created_at ?? b.date ?? 0).getTime() -
      new Date(a.created_at ?? a.date ?? 0).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Users className="h-10 w-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No paid users logged yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm" aria-label="Paid users list">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              User
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Active
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((item: any, i: number) => {
            const status = item.verification_status ?? item.status ?? 'pending';
            return (
              <tr key={item.id ?? i} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {item.user_identifier ?? item.userIdentifier ?? item.email ?? `User #${i + 1}`}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {item.amount != null ? formatCurrency(item.amount) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatDate(item.paid_at ?? item.created_at ?? item.date)}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn('text-xs capitalize', STATUS_BADGE[status])}
                  >
                    {status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {item.is_active ?? item.isActive ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Active" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Churned</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Interviews Tab ──────────────────────────────────────────────────────────

function InterviewsTab({ enrollmentId }: { enrollmentId: string }) {
  const { data: raw, isLoading, error } = useSF100Interviews(enrollmentId);
  const items: any[] = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);

  if (isLoading) return <ListSkeleton rows={3} />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load interviews.</AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Mic className="h-10 w-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No customer interviews logged yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item: any, i: number) => {
        const painLevel = item.pain_level ?? item.painLevel;
        return (
          <Card key={item.id ?? i} className="shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold">
                  {item.customer_name ?? item.customerName ?? `Interview #${i + 1}`}
                </CardTitle>
                {(item.customer_role ?? item.customerRole) && (
                  <span className="text-xs text-muted-foreground">
                    — {item.customer_role ?? item.customerRole}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDate(item.created_at ?? item.date)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4 px-4 space-y-2.5">
              {(item.key_quote ?? item.keyQuote) && (
                <blockquote className="border-l-2 border-[#0b6d41]/30 pl-3 text-sm italic text-muted-foreground">
                  "{item.key_quote ?? item.keyQuote}"
                </blockquote>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {painLevel != null && (
                  <div className="flex items-center gap-1">
                    <span>Pain level:</span>
                    <span
                      className={cn(
                        'font-bold',
                        painLevel >= 7 ? 'text-red-600' : painLevel >= 4 ? 'text-amber-600' : 'text-green-600',
                      )}
                    >
                      {painLevel}/10
                    </span>
                  </div>
                )}
                {(item.willingness_to_pay ?? item.willingnessToPay) != null && (
                  <div className="flex items-center gap-1">
                    <span>WTP:</span>
                    <span className={cn('font-semibold', (item.willingness_to_pay ?? item.willingnessToPay) ? 'text-green-600' : 'text-red-500')}>
                      {(item.willingness_to_pay ?? item.willingnessToPay) ? 'Yes' : 'No'}
                    </span>
                  </div>
                )}
                {(item.follow_up_needed ?? item.followUpNeeded) && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    Follow-up needed
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Pivots Tab ──────────────────────────────────────────────────────────────

function PivotsTab({ enrollmentId }: { enrollmentId: string }) {
  const { data: raw, isLoading, error } = useSF100Pivots(enrollmentId);
  const items: any[] = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);

  if (isLoading) return <ListSkeleton rows={3} />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load pivots.</AlertDescription>
      </Alert>
    );
  }

  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.created_at ?? b.pivoted_at ?? 0).getTime() -
      new Date(a.created_at ?? a.pivoted_at ?? 0).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <GitBranch className="h-10 w-10 text-muted-foreground/30 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No pivots recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 pl-5">
      {/* Timeline line */}
      <div
        className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-border"
        aria-hidden="true"
      />

      {sorted.map((item: any, i: number) => {
        const pivotType = item.pivot_type ?? item.pivotType ?? 'full';
        return (
          <div key={item.id ?? i} className="relative">
            {/* Timeline dot */}
            <div
              className="absolute -left-5 top-4 h-3 w-3 rounded-full border-2 border-white bg-[#0b6d41] ring-2 ring-[#0b6d41]/20"
              aria-hidden="true"
            />

            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    <RefreshCw className="h-2.5 w-2.5 mr-1" aria-hidden="true" />
                    {PIVOT_TYPE_LABELS[pivotType] ?? pivotType}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDate(item.created_at ?? item.pivoted_at)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-4 space-y-3">
                {/* Before → After */}
                {(item.before_description ?? item.beforeDescription) && (
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5">
                      <p className="text-xs font-semibold text-red-600 mb-1">Before</p>
                      <p className="text-muted-foreground leading-relaxed">
                        {item.before_description ?? item.beforeDescription}
                      </p>
                    </div>
                    {(item.after_description ?? item.afterDescription) && (
                      <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5">
                        <p className="text-xs font-semibold text-green-600 mb-1">After</p>
                        <p className="text-muted-foreground leading-relaxed">
                          {item.after_description ?? item.afterDescription}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {(item.reasoning) && (
                  <div>
                    <p className="text-xs font-semibold mb-1">Reasoning</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.reasoning}
                    </p>
                  </div>
                )}

                {(item.evidence) && (
                  <div>
                    <p className="text-xs font-semibold mb-1">Evidence</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.evidence}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface SF100TeamDetailProps {
  enrollmentId: string;
  /** Pre-select a tab via URL hash or query param */
  defaultTab?: 'overview' | 'check-ins' | 'paid-users' | 'interviews' | 'pivots';
}

export function SF100TeamDetail({
  enrollmentId,
  defaultTab = 'overview',
}: SF100TeamDetailProps) {
  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/40 rounded-xl w-full sm:w-auto">
        <TabsTrigger value="overview" className="text-xs sm:text-sm">
          Overview
        </TabsTrigger>
        <TabsTrigger value="check-ins" className="text-xs sm:text-sm">
          <MessageSquare className="h-3 w-3 mr-1.5" aria-hidden="true" />
          Check-ins
        </TabsTrigger>
        <TabsTrigger value="paid-users" className="text-xs sm:text-sm">
          <Users className="h-3 w-3 mr-1.5" aria-hidden="true" />
          Paid Users
        </TabsTrigger>
        <TabsTrigger value="interviews" className="text-xs sm:text-sm">
          <Mic className="h-3 w-3 mr-1.5" aria-hidden="true" />
          Interviews
        </TabsTrigger>
        <TabsTrigger value="pivots" className="text-xs sm:text-sm">
          <GitBranch className="h-3 w-3 mr-1.5" aria-hidden="true" />
          Pivots
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-0">
        <OverviewTab enrollmentId={enrollmentId} />
      </TabsContent>

      <TabsContent value="check-ins" className="mt-0">
        <CheckInsTab enrollmentId={enrollmentId} />
      </TabsContent>

      <TabsContent value="paid-users" className="mt-0">
        <PaidUsersTab enrollmentId={enrollmentId} />
      </TabsContent>

      <TabsContent value="interviews" className="mt-0">
        <InterviewsTab enrollmentId={enrollmentId} />
      </TabsContent>

      <TabsContent value="pivots" className="mt-0">
        <PivotsTab enrollmentId={enrollmentId} />
      </TabsContent>
    </Tabs>
  );
}
