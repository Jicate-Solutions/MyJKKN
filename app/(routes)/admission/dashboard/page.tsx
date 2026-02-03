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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  useDashboardSummary,
  useFunnelSummary,
  useAdmissionLeads,
  useLeadMutations
} from '@/hooks/admission';
import {
  Users,
  UserPlus,
  TrendingUp,
  Target,
  Clock,
  CheckCircle,
  AlertCircle,
  Flame,
  Star,
  ArrowRight,
  RefreshCw,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Funnel stages with colors
const FUNNEL_STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-indigo-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-purple-500' },
  { key: 'application_started', label: 'Application Started', color: 'bg-pink-500' },
  { key: 'application_submitted', label: 'Application Submitted', color: 'bg-rose-500' },
  { key: 'documents_pending', label: 'Documents Pending', color: 'bg-orange-500' },
  { key: 'documents_verified', label: 'Documents Verified', color: 'bg-amber-500' },
  { key: 'interview_scheduled', label: 'Interview Scheduled', color: 'bg-yellow-500' },
  { key: 'interview_completed', label: 'Interview Completed', color: 'bg-lime-500' },
  { key: 'offer_sent', label: 'Offer Sent', color: 'bg-green-500' },
  { key: 'offer_accepted', label: 'Offer Accepted', color: 'bg-emerald-500' },
  { key: 'token_paid', label: 'Token Paid', color: 'bg-teal-500' },
  { key: 'enrolled', label: 'Enrolled', color: 'bg-cyan-500' }
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
  funnelData: { total: number; byStage: Record<string, number>; hotLeads: number; priorityLeads: number } | undefined;
}) {
  if (!funnelData) return null;

  const maxCount = Math.max(...Object.values(funnelData.byStage), 1);

  return (
    <div className="space-y-3">
      {FUNNEL_STAGES.map((stage) => {
        const count = funnelData.byStage[stage.key] || 0;
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

        return (
          <div key={stage.key} className="flex items-center gap-3">
            <div className="w-32 text-sm text-muted-foreground truncate">{stage.label}</div>
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
  institutionId: string;
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
              <p className="text-xs text-muted-foreground">{lead.funnel_stage || 'New'}</p>
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
  const { profile, isLoading: accessLoading } = useAuth();
  const institutionId = profile?.institution_id;
  const [isRefetching, setIsRefetching] = useState(false);

  const { summary, isLoading: summaryLoading, refetch } = useDashboardSummary(institutionId || '');
  const { funnel, isLoading: funnelLoading } = useFunnelSummary(institutionId || '');

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
                  <BreadcrumbLink href="/admission">Admission</BreadcrumbLink>
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

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Active Leads"
              value={funnel?.total || 0}
              icon={Users}
              color="text-blue-600"
            />
            <KPICard
              title="Hot Leads"
              value={funnel?.hotLeads || 0}
              description="High engagement prospects"
              icon={Flame}
              color="text-orange-600"
            />
            <KPICard
              title="Priority Leads"
              value={funnel?.priorityLeads || 0}
              description="Flagged for immediate action"
              icon={Star}
              color="text-yellow-600"
            />
            <KPICard
              title="Conversion Rate"
              value={summary?.conversionRate ? `${summary.conversionRate.toFixed(1)}%` : '0%'}
              description="Lead to enrollment"
              icon={Target}
              color="text-green-600"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Funnel Visualization */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Admission Funnel</CardTitle>
                    <CardDescription>Lead distribution across stages</CardDescription>
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
                {institutionId && <HotLeadsList institutionId={institutionId} />}
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
                  <Link href="/admission/templates">
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
