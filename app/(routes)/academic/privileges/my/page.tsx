'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Clock, BookOpen, GraduationCap, Wallet, Award, ArrowRight, ShieldOff, Info, AlertTriangle, Pause, FileText } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useLearnerPrivileges } from '@/hooks/academic/use-privileges';
import type { ActivePrivilegeInfo, RenewalStatus } from '@/types/privileges';

// ============================================================
// Renewal status badge configuration
// ============================================================

const RENEWAL_BADGE_CONFIG: Record<
  RenewalStatus,
  { label: string; className: string; gradient: string; borderColor: string }
> = {
  active: {
    label: 'Active',
    className: 'bg-green-500/20 text-white border-green-300/40',
    gradient: 'bg-gradient-to-br from-amber-500 via-amber-400 to-yellow-400',
    borderColor: 'border-amber-200/60',
  },
  pending_report: {
    label: 'Renewal Due',
    className: 'bg-amber-500/30 text-white border-amber-300/50 animate-pulse',
    gradient: 'bg-gradient-to-br from-amber-600 via-amber-500 to-orange-400',
    borderColor: 'border-amber-300/60',
  },
  pending_review: {
    label: 'Pending Review',
    className: 'bg-blue-500/20 text-white border-blue-300/40',
    gradient: 'bg-gradient-to-br from-blue-500 via-blue-400 to-sky-400',
    borderColor: 'border-blue-200/60',
  },
  paused: {
    label: 'Paused',
    className: 'bg-red-500/20 text-white border-red-300/40',
    gradient: 'bg-gradient-to-br from-red-500 via-red-400 to-rose-400',
    borderColor: 'border-red-200/60',
  },
};

// ============================================================
// Privilege type display configuration
// ============================================================

interface PrivilegeTypeDisplay {
  key: string;
  icon: typeof Clock;
  label: string;
  description: string;
}

const PRIVILEGE_TYPE_DISPLAY: PrivilegeTypeDisplay[] = [
  {
    key: 'full_od',
    icon: Clock,
    label: 'Full OD',
    description: 'All attendance auto-marked as On-Duty',
  },
  {
    key: 'full_marks',
    icon: BookOpen,
    label: 'Full Marks',
    description: 'All internal assessments auto-filled to maximum',
  },
  {
    key: 'scholarship',
    icon: GraduationCap,
    label: 'Scholarship',
    description: 'Scholarship eligibility active',
  },
  {
    key: 'funding',
    icon: Wallet,
    label: 'Funding',
    description: 'Institutional funding support',
  },
];

// ============================================================
// Main page component
// ============================================================

export default function MyPrivilegesPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isLoading: permLoading } = usePermissions();
  const learnerId = profile?.learner_id ?? profile?.id ?? null;

  const {
    data: privileges,
    isLoading,
    error,
  } = useLearnerPrivileges(learnerId);

  // Loading state
  if (isLoading || permLoading) {
    return (
      <ContentLayout title="My Privileges">
        <LoadingSkeleton />
      </ContentLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <ContentLayout title="My Privileges">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldOff className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Unable to Load Privileges</h3>
            <p className="text-muted-foreground">
              Something went wrong while loading your privileges. Please try again later.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // Empty state -- learner has no active privileges
  if (!privileges || privileges.length === 0) {
    return (
      <ContentLayout title="My Privileges">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Privileges</h3>
            <p className="text-muted-foreground">
              You currently have no active exceptions or privileges assigned.
              If you believe this is an error, please contact your department.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Privileges">
      <div className="space-y-8 max-w-4xl mx-auto">
        {privileges.map((priv) => (
          <PrivilegeGroupView key={priv.group_id} privilege={priv} />
        ))}
      </div>
    </ContentLayout>
  );
}

// ============================================================
// Single privilege group view
// ============================================================

function PrivilegeGroupView({ privilege }: { privilege: ActivePrivilegeInfo }) {
  const activeTypeKeys = new Set(privilege.privilege_types.map((pt) => pt.key));
  const activeCount = PRIVILEGE_TYPE_DISPLAY.filter((d) => activeTypeKeys.has(d.key)).length;
  const renewalStatus = privilege.renewal_status ?? 'active';
  const badgeConfig = RENEWAL_BADGE_CONFIG[renewalStatus] ?? RENEWAL_BADGE_CONFIG.active;

  return (
    <div className="space-y-6">
      {/* Hero section */}
      <Card className={`overflow-hidden ${badgeConfig.borderColor}`}>
        <div className={`${badgeConfig.gradient} p-6 sm:p-8`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-6 w-6 text-white/90" />
                <Badge className={badgeConfig.className}>
                  {badgeConfig.label}
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                {privilege.group_name}
              </h1>
              <p className="text-white/80 text-sm sm:text-base">
                Director Order #{privilege.reference_code}
              </p>
              {renewalStatus === 'pending_report' && (
                <Link
                  href="/academic/privileges/my/report"
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-sm font-medium rounded-md bg-white/20 text-white hover:bg-white/30 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Submit Progress Report
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {renewalStatus === 'paused' && (
                <p className="mt-3 text-sm text-white/80 flex items-center gap-1.5">
                  <Pause className="h-4 w-4" />
                  Privileges paused until next review cycle
                </p>
              )}
              {renewalStatus === 'pending_review' && (
                <p className="mt-3 text-sm text-white/80 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Your report is being reviewed by the committee
                </p>
              )}
            </div>
            <div className="hidden sm:flex items-center justify-center h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm">
              <span className="text-2xl font-bold text-white">{activeCount}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Privilege types grid */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          {activeCount} Barrier{activeCount !== 1 ? 's' : ''} Removed
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PRIVILEGE_TYPE_DISPLAY.map((typeDisplay) => {
            const isActive = activeTypeKeys.has(typeDisplay.key);
            const Icon = typeDisplay.icon;

            return (
              <Card
                key={typeDisplay.key}
                className={
                  isActive
                    ? 'border-amber-300 bg-amber-50/50 shadow-sm'
                    : 'border-muted bg-muted/30 opacity-50'
                }
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div
                    className={
                      isActive
                        ? 'flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 shrink-0'
                        : 'flex items-center justify-center h-10 w-10 rounded-lg bg-muted shrink-0'
                    }
                  >
                    <Icon
                      className={
                        isActive
                          ? 'h-5 w-5 text-amber-600'
                          : 'h-5 w-5 text-muted-foreground'
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={
                        isActive
                          ? 'font-semibold text-amber-900'
                          : 'font-semibold text-muted-foreground'
                      }
                    >
                      {typeDisplay.label}
                    </p>
                    <p
                      className={
                        isActive
                          ? 'text-sm text-amber-700'
                          : 'text-sm text-muted-foreground'
                      }
                    >
                      {typeDisplay.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Detail tabs */}
      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="h-4 w-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="marks" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Marks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="p-6">
              {activeTypeKeys.has('full_od') ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-green-100 mx-auto">
                    <span className="text-3xl font-bold text-green-700">100%</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">
                      Full Attendance — Full OD
                    </h3>
                    <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                      All periods are marked as On-Duty under Director Order.
                      Your attendance is automatically maintained at 100%.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2 max-w-sm mx-auto">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>This privilege is reviewed each semester</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Full OD is not included in your current privilege set.
                    Your attendance is tracked normally.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marks">
          <Card>
            <CardContent className="p-6">
              {activeTypeKeys.has('full_marks') ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-blue-100 mx-auto">
                    <BookOpen className="h-10 w-10 text-blue-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">
                      Full Internal Marks
                    </h3>
                    <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                      All CIA components, assignments, and practicals are auto-filled
                      to maximum marks under Director Order.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2 max-w-sm mx-auto">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>University exam performance is your responsibility</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Full Marks is not included in your current privilege set.
                    Your internal marks are assessed normally.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info footer */}
      <Card className="border-dashed">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Valid from{' '}
                <span className="font-medium text-foreground">
                  {formatDateSafe(privilege.start_date)}
                </span>
                {privilege.end_date ? (
                  <>
                    {' '}to{' '}
                    <span className="font-medium text-foreground">
                      {formatDateSafe(privilege.end_date)}
                    </span>
                  </>
                ) : (
                  <> — <span className="font-medium text-foreground">ongoing</span></>
                )}
              </p>
              <p>Reviewed monthly by committee. Submit your progress report by the 27th.</p>
            </div>
            <Link
              href="/academic/privileges/my/report"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors whitespace-nowrap"
            >
              Submit Monthly Report
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatDateSafe(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    return format(new Date(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
