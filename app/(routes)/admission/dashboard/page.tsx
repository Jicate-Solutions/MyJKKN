'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useDashboardSummary,
  useFunnelSummary,
  useAdmissionLeads,
  useLatestUnreadBriefing
} from '@/hooks/admission';
import {
  Users,
  UserPlus,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Flame,
  Star,
  ArrowRight,
  RefreshCw,
  Loader2,
  Building2,
  Inbox,
  FileText,
  Landmark,
  Ticket,
  GraduationCap,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { BriefingNotificationBanner } from '@/components/admission/briefing-notification-banner';
import { BriefingPopup } from '@/components/admission/briefing-popup';

// navMeta — declares this page for sidebar auto-discovery, matching the
// canonical `{ label, icon }` shape used by `/admission/counselors/admin/rule-types`.
// Aligns discoverability with `/admission/group-dashboard` so both admission
// dashboards render consistently in nav scaffolding.
export const navMeta = { label: 'Admission Dashboard', icon: 'LayoutDashboard' } as const;

// 2026-05-20: Funnel stages now follow the lifecycle workflow shipped in
// commit c5b93ca0f. Colors mirror the admission_statuses seed so the
// dashboard chart, the LifecycleStatusBadge, and the group-dashboard funnel
// chart all speak the same visual language. 'admitted' aggregates
// admitted+active per the workflow spec.
const LIFECYCLE_STAGES = [
  { key: 'enquiry',           label: 'Enquiry',           color: 'bg-blue-500' },
  { key: 'enquiry_submitted', label: 'Enquiry Submitted', color: 'bg-purple-500' },
  { key: 'account',           label: 'Account',           color: 'bg-violet-500' },
  { key: 'reserved',          label: 'Reserved',          color: 'bg-sky-500' },
  { key: 'admitted',          label: 'Admitted',          color: 'bg-emerald-500' },
  { key: 'rejected',          label: 'Rejected',          color: 'bg-red-500' },
];

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  color = 'text-primary'
}: {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  trend?: { value: number; isPositive: boolean };
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div className={`flex items-center text-xs mt-2 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`h-3 w-3 mr-1 ${!trend.isPositive && 'rotate-180'}`} />
            {trend.isPositive ? '+' : ''}{trend.value}% from last week
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelVisualization({
  funnelData
}: {
  funnelData:
    | {
        total: number;
        activeTotal?: number;
        byStage: Record<string, number>;
        lifecycleByStage?: Record<string, number>;
        hotLeads: number;
        priorityLeads: number;
      }
    | undefined;
}) {
  if (!funnelData) return null;

  // 2026-05-20: Source of truth flipped from byStage (funnel_stage) to
  // lifecycleByStage (lifecycle_status, with admitted+active collapsed). If the
  // server hasn't rolled out the new field yet, fall back to an empty map so
  // the chart still renders (zeros across all stages) instead of crashing.
  const stageMap = funnelData.lifecycleByStage ?? {};
  const maxCount = Math.max(...Object.values(stageMap), 1);

  return (
    <div className="space-y-3">
      {LIFECYCLE_STAGES.map((stage) => {
        const count = stageMap[stage.key] || 0;
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

        return (
          <div key={stage.key} className="flex items-center gap-3">
            <div className="w-40 text-sm text-muted-foreground truncate" title={stage.label}>
              {stage.label}
              {stage.key === 'admitted' && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">(+ active)</span>
              )}
            </div>
            <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${stage.color} transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="w-12 text-sm font-medium text-right">{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function HotLeadsList({
  institutionId
}: {
  // `undefined` = "All Institutions" mode. The leads API treats omitted
  // institution_id as "every institution the caller's RLS allows" for
  // super-admin / admission-global users, and falls back to the user's
  // profile.institution_id otherwise.
  institutionId: string | undefined;
}) {
  const { leads, isLoading } = useAdmissionLeads({
    institution_id: institutionId,
    priority: 'hot'
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Flame className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No hot leads yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leads.slice(0, 5).map((lead) => (
        <Link
          key={lead.id}
          href={`/admission/leads/${lead.id}`}
          className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
              <Flame className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-sm">{(lead as any).learner_profile?.full_name || (lead as any).full_name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{(lead as any).stage || lead.funnel_stage || 'New'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary">
              Score: {lead.score || 0}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      ))}
      {leads.length > 5 && (
        <Link
          href="/admission/leads?isHotLead=true"
          className="block text-center text-sm text-primary hover:underline py-2"
        >
          View all {leads.length} hot leads
        </Link>
      )}
    </div>
  );
}

function AdmissionDashboardPageContent() {
  const { profile } = useAuth();
  const { institutions, selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const [chosenInstitutionId, setChosenInstitutionId] = useState<string>('');
  // Multi-institution users (super_admin etc): default to "all" (undefined = no filter).
  // Single-institution users: always use their one institution.
  const institutionId = chosenInstitutionId || (institutions.length <= 1 ? selectedInstitutionId : undefined);
  const [isRefetching, setIsRefetching] = useState(false);
  const [showBriefingPopup, setShowBriefingPopup] = useState(false);

  // Get latest unread briefing for popup
  const { data: latestBriefingNotification } = useLatestUnreadBriefing(profile?.id);

  // Pass `institutionId` through untouched — when undefined (= "All Institutions"),
  // both hooks forward it as `institutionId ?? null` to the server-side RPCs
  // (`get_admission_dashboard_summary_aggregate`, `get_admission_funnel_summary_aggregate`),
  // which aggregate across every institution the caller's RLS allows. The old
  // `institutionId || ''` collapsed undefined to '' — and '' is NOT coalesced by
  // `??` downstream, so the empty string flowed into the RPC as a UUID parameter
  // and matched zero rows. The dashboard appeared totally empty in "All" mode.
  const { summary, isLoading: summaryLoading, refetch } = useDashboardSummary(institutionId);
  const { funnel, isLoading: funnelLoading } = useFunnelSummary(institutionId);

  const isLoading = accessLoading || summaryLoading || funnelLoading;

  const handleRefresh = async () => {
    setIsRefetching(true);
    try {
      await refetch();
      toast.success('Dashboard data refreshed');
    } catch {
      toast.error('Failed to refresh data');
    } finally {
      setIsRefetching(false);
    }
  };

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Admission Dashboard">
          <DashboardSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Admission Dashboard">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink>Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefetching}>
                {isRefetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button asChild>
                <Link href="/admission/leads/new">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Lead
                </Link>
              </Button>
            </div>
          </div>

          {/* Institution picker — only shown when user has access to multiple institutions */}
          {institutions.length > 1 && (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Institution:</span>
              <Select
                value={chosenInstitutionId}
                onValueChange={(val) => setChosenInstitutionId(val === '__all__' ? '' : val)}
              >
                <SelectTrigger className="h-8 w-[280px] text-xs">
                  <SelectValue placeholder="All Institutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs font-medium">All Institutions</SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.institution_id} value={inst.institution_id} className="text-xs">
                      {inst.institution_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosenInstitutionId && (
                <button
                  onClick={() => setChosenInstitutionId('')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ← All
                </button>
              )}
            </div>
          )}

          {/* Daily Briefing Banner */}
          <BriefingNotificationBanner
            onViewBriefing={() => setShowBriefingPopup(true)}
          />

          {/* Briefing Popup Modal */}
          <BriefingPopup
            notification={latestBriefingNotification}
            open={showBriefingPopup}
            onOpenChange={setShowBriefingPopup}
          />

          {/* KPI strip — 2 rows × 4 cards (8 cards total).
              Row 1: lead-side signals (active leads, hot, priority) + headline
                     Admitted KPI for the cohort that crossed the fees threshold.
              Row 2: lifecycle workflow stages — Enquiry → Enquiry Submitted →
                     Account → Reserved (drill from entry to seat-reserved).
              All counts come from the same RPCs we just extended; modes:
                - "All Institutions" → aggregate across every institution the
                  caller's RLS allows (server-side RPC supports p_institution_id=null).
                - Single institution → filtered to that institution.
              2026-05-20: 'Application Start Rate' (funnel_stage-based) retired
              and replaced with the lifecycle KPIs to match the workflow-realigned
              group dashboard treatment. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Active Leads"
              value={funnel?.activeTotal ?? 0}
              description={institutionId ? 'In this institution' : 'Across all institutions'}
              icon={Users}
              color="text-blue-600"
            />
            <KPICard
              title="Hot Leads"
              value={funnel?.hotLeads ?? 0}
              description="High engagement prospects"
              icon={Flame}
              color="text-orange-600"
            />
            <KPICard
              title="Priority Leads"
              value={funnel?.priorityLeads ?? 0}
              description="Flagged for immediate action"
              icon={Star}
              color="text-yellow-600"
            />
            <KPICard
              title="Admitted"
              value={summary?.admittedCount ?? 0}
              description="Includes active learners"
              icon={GraduationCap}
              color="text-emerald-600"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Enquiry"
              value={summary?.enquiryCount ?? 0}
              description="Lead moved to counselor"
              icon={Inbox}
              color="text-blue-600"
            />
            <KPICard
              title="Enquiry Submitted"
              value={summary?.enquirySubmittedCount ?? 0}
              description="QR self-fill form completed"
              icon={FileText}
              color="text-purple-600"
            />
            <KPICard
              title="Account"
              value={summary?.accountCount ?? 0}
              description="Bills generated"
              icon={Landmark}
              color="text-violet-600"
            />
            <KPICard
              title="Reserved"
              value={summary?.reservedCount ?? 0}
              description="Universal fees paid"
              icon={Ticket}
              color="text-sky-600"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lifecycle Funnel Visualization — 6-stage workflow.
                2026-05-20: replaced the 26-stage admission_lead_stage chart
                with the lifecycle workflow shipped in c5b93ca0f. Bars now show
                learners_profiles distribution: Enquiry → Enquiry Submitted →
                Account → Reserved → Admitted (+ active) → Rejected. */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lifecycle Workflow</CardTitle>
                    <CardDescription>Learner distribution across lifecycle stages</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/admission/analytics">
                      View Details
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <FunnelVisualization funnelData={funnel} />
              </CardContent>
            </Card>

            {/* Hot Leads */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-orange-600" />
                      Hot Leads
                    </CardTitle>
                    <CardDescription>High-priority prospects</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* HotLeadsList accepts undefined = "All Institutions";
                    its own empty state ("No hot leads yet") handles the
                    no-data case without needing an outer gate. */}
                <HotLeadsList institutionId={institutionId} />
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks for admission management</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                  <Link href="/admission/leads">
                    <Users className="h-5 w-5" />
                    <span>View All Leads</span>
                  </Link>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                  <Link href="/admission/applications">
                    <CheckCircle className="h-5 w-5" />
                    <span>Applications</span>
                  </Link>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                  <Link href="/admission/analytics">
                    <TrendingUp className="h-5 w-5" />
                    <span>Analytics</span>
                  </Link>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
                  <Link href="/admission/settings/templates">
                    <AlertCircle className="h-5 w-5" />
                    <span>Templates</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionDashboardPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionDashboardPageContent />
    </AdmissionErrorBoundary>
  );
}
