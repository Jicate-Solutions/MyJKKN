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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useAdmissionDashboard,
  useFunnelAnalyticsDashboard
} from '@/hooks/admission';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  BarChart3,
  RefreshCw,
  Calendar,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowRight,
  Flame,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { toast } from 'sonner';
import { AdmissionErrorBoundary, CounselorPerformanceDashboard, SourceROIDashboard } from '@/components/admission';

const FUNNEL_STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-indigo-500' },
  { key: 'not_reachable', label: 'Not Reachable', color: 'bg-slate-400' },
  { key: 'interested', label: 'Interested', color: 'bg-sky-500' },
  { key: 'follow_up_scheduled', label: 'Follow-up Scheduled', color: 'bg-violet-500' },
  { key: 'engaged', label: 'Engaged', color: 'bg-fuchsia-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-purple-500' },
  { key: 'application_started', label: 'Application Started', color: 'bg-pink-500' },
  { key: 'application_submitted', label: 'Submitted', color: 'bg-rose-500' },
  { key: 'documents_pending', label: 'Docs Pending', color: 'bg-orange-500' },
  { key: 'documents_verified', label: 'Docs Verified', color: 'bg-amber-500' },
  { key: 'interview_scheduled', label: 'Interview Scheduled', color: 'bg-yellow-500' },
  { key: 'interview_completed', label: 'Interview Done', color: 'bg-lime-500' },
  { key: 'offer_sent', label: 'Offer Sent', color: 'bg-green-500' },
  { key: 'offer_accepted', label: 'Offer Accepted', color: 'bg-emerald-500' },
  { key: 'token_paid', label: 'Token Paid', color: 'bg-teal-500' },
  { key: 'applied', label: 'Applied', color: 'bg-violet-400' },
  { key: 'interviewed', label: 'Interviewed', color: 'bg-rose-400' },
  { key: 'offered', label: 'Offered', color: 'bg-orange-400' },
  { key: 'enrolled', label: 'Enrolled', color: 'bg-cyan-500' },
  { key: 'confirmed', label: 'Confirmed', color: 'bg-green-600' },
  { key: 'declined', label: 'Declined', color: 'bg-red-500' },
  { key: 'withdrew', label: 'Withdrew', color: 'bg-red-400' },
  { key: 'expired', label: 'Expired', color: 'bg-gray-400' }
];

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' }
];

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
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
            {trend.isPositive ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {trend.isPositive ? '+' : ''}{trend.value}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Phase 2: Enhanced Funnel Chart with Drop-off Alerts
function EnhancedFunnelChart({
  data,
  dropOff
}: {
  data: Array<{
    stage: string;
    leadCount: number;
    avgDaysInStage: number;
    stuckCount: number;
    percentageOfTotal: number;
    wowChangePercent: number;
    alertLevel: 'normal' | 'warning' | 'critical';
  }>;
  dropOff: Array<{
    stage: string;
    conversionRate: number;
    dropOffRate: number;
    percentageReached: number;
  }>;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No funnel data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.leadCount), 1);

  return (
    <div className="space-y-4">
      {data.map((stage, index) => {
        const width = maxCount > 0 ? (stage.leadCount / maxCount) * 100 : 0;
        const stageConfig = FUNNEL_STAGES.find((s) => s.key === stage.stage);
        const dropOffData = dropOff.find((d) => d.stage === stage.stage);

        return (
          <div key={stage.stage} className="space-y-2">
            {/* Stage Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {stageConfig?.label || stage.stage.replace(/_/g, ' ')}
                </span>
                {/* Alert Badge */}
                {stage.alertLevel === 'critical' && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Critical
                  </Badge>
                )}
                {stage.alertLevel === 'warning' && (
                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Warning
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{stage.leadCount} leads</span>
                <Badge variant="outline" className="text-xs">
                  {stage.percentageOfTotal.toFixed(0)}%
                </Badge>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-10 bg-muted rounded-lg overflow-hidden relative">
              <div
                className={`h-full ${stageConfig?.color || 'bg-primary'} transition-all duration-500 rounded-lg flex items-center justify-end pr-3`}
                style={{ width: `${Math.max(width, 5)}%` }}
              >
                {width > 20 && (
                  <span className="text-white text-xs font-medium">
                    {stage.leadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Stage Metrics Row */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Avg: {stage.avgDaysInStage.toFixed(1)} days
                </span>
                {stage.stuckCount > 0 && (
                  <span className="flex items-center gap-1 text-orange-600">
                    <AlertTriangle className="h-3 w-3" />
                    {stage.stuckCount} stuck
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Drop-off indicator */}
                {dropOffData && index > 0 && (
                  <span className={`flex items-center gap-1 ${dropOffData.dropOffRate > 30 ? 'text-red-600' : dropOffData.dropOffRate > 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                    <ArrowRight className="h-3 w-3" />
                    {dropOffData.conversionRate.toFixed(0)}% conv.
                    {dropOffData.dropOffRate > 0 && (
                      <span className="text-red-500">
                        (-{dropOffData.dropOffRate.toFixed(0)}%)
                      </span>
                    )}
                  </span>
                )}
                {/* WoW Change */}
                {stage.wowChangePercent !== 0 && (
                  <span className={`flex items-center ${stage.wowChangePercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stage.wowChangePercent > 0 ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {stage.wowChangePercent > 0 ? '+' : ''}{stage.wowChangePercent.toFixed(0)}% WoW
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Bottleneck Alerts Component
function BottleneckAlerts({
  bottlenecks
}: {
  bottlenecks: Array<{
    stage: string;
    issue: string;
    severity: 'warning' | 'critical';
    metric: number;
    recommendation: string;
  }>;
}) {
  if (!bottlenecks || bottlenecks.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <div className="flex items-center justify-center gap-2 text-green-600 mb-2">
          <TrendingUp className="h-5 w-5" />
          <span className="font-medium">All Clear</span>
        </div>
        <p className="text-sm">No bottlenecks detected in your funnel</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bottlenecks.map((bottleneck, index) => (
        <div
          key={index}
          className={`p-4 rounded-lg border ${
            bottleneck.severity === 'critical'
              ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
              : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {bottleneck.severity === 'critical' ? (
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium capitalize">{bottleneck.stage}</span>
                <Badge variant={bottleneck.severity === 'critical' ? 'destructive' : 'secondary'}>
                  {bottleneck.issue.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{bottleneck.recommendation}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Stuck Leads Table Component
function StuckLeadsTable({
  stuckLeads
}: {
  stuckLeads: Array<{
    leadId: string;
    currentStage: string;
    counselorName: string | null;
    daysInStage: number;
    combinedScore: number;
    isHotLead: boolean;
    urgencyLevel: string;
    suggestedAction: string;
  }>;
}) {
  if (!stuckLeads || stuckLeads.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No stuck leads detected</p>
        <p className="text-sm">All leads are progressing normally</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Days Stuck</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Urgency</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stuckLeads.slice(0, 10).map((lead) => (
          <TableRow key={lead.leadId}>
            <TableCell>
              <Link
                href={`/admission/leads/${lead.leadId}`}
                className="flex items-center gap-2 font-medium hover:underline"
              >
                {lead.isHotLead && <Flame className="h-4 w-4 text-orange-500" />}
                {lead.leadId.slice(0, 8)}...
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="capitalize">
                {lead.currentStage.replace(/_/g, ' ')}
              </Badge>
            </TableCell>
            <TableCell>
              <span className={lead.daysInStage > 14 ? 'text-red-600 font-medium' : ''}>
                {lead.daysInStage} days
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={lead.combinedScore} className="w-16 h-2" />
                <span className="text-sm">{lead.combinedScore}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  lead.urgencyLevel === 'critical' ? 'destructive' :
                  lead.urgencyLevel === 'high' ? 'default' :
                  'secondary'
                }
              >
                {lead.urgencyLevel}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {lead.suggestedAction}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AdmissionAnalyticsPageContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId;
  const [dateRange, setDateRange] = useState('30');

  // Phase 1 hooks
  const { summary, isLoading: dashboardLoading, refetchAll: refetchDashboard } = useAdmissionDashboard(institutionId || '');

  // Phase 2 hooks
  const {
    enhanced,
    dropOff,
    stuckLeads,
    bottlenecks,
    isLoading: funnelLoading,
    refetchAll: refetchFunnel
  } = useFunnelAnalyticsDashboard(institutionId || '');

  const isLoading = accessLoading || dashboardLoading || funnelLoading;

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchDashboard(), refetchFunnel()]);
      toast.success('Analytics data refreshed');
    } catch {
      toast.error('Failed to refresh analytics data');
    }
  };

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Funnel Analytics">
          <AnalyticsSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  // Calculate total stuck leads
  const totalStuckLeads = enhanced.reduce((sum, stage) => sum + stage.stuckCount, 0);
  const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'critical').length;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Funnel Analytics">
        <div className="space-y-6">
          {/* Breadcrumb & Actions */}
          <div className="flex items-center justify-between">
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
                  <BreadcrumbPage>Analytics</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[150px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Leads"
              value={summary?.totalLeads || 0}
              icon={Users}
              color="text-blue-600"
            />
            <MetricCard
              title="Conversion Rate"
              value={summary?.conversionRate ? `${summary.conversionRate.toFixed(1)}%` : '0%'}
              icon={Target}
              color="text-green-600"
            />
            <MetricCard
              title="Stuck Leads"
              value={totalStuckLeads}
              description={totalStuckLeads > 10 ? 'Needs attention' : 'Healthy'}
              icon={Clock}
              color={totalStuckLeads > 10 ? 'text-orange-600' : 'text-green-600'}
            />
            <MetricCard
              title="Bottlenecks"
              value={criticalBottlenecks}
              description={criticalBottlenecks > 0 ? `${bottlenecks.length} total issues` : 'No issues detected'}
              icon={AlertTriangle}
              color={criticalBottlenecks > 0 ? 'text-red-600' : 'text-green-600'}
            />
          </div>

          {/* Bottleneck Alerts */}
          {bottlenecks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  Funnel Bottlenecks
                </CardTitle>
                <CardDescription>
                  Issues detected that may be impacting your conversion rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BottleneckAlerts bottlenecks={bottlenecks} />
              </CardContent>
            </Card>
          )}

          {/* Main Content */}
          <Tabs defaultValue="funnel" className="w-full">
            <TabsList>
              <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
              <TabsTrigger value="stuck">
                Stuck Leads
                {stuckLeads.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{stuckLeads.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="counselors">Leaderboard</TabsTrigger>
              <TabsTrigger value="sources">Source ROI</TabsTrigger>
            </TabsList>

            <TabsContent value="funnel" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Conversion Funnel</CardTitle>
                  <CardDescription>
                    Lead progression with drop-off analysis and week-over-week comparison
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EnhancedFunnelChart
                    data={enhanced}
                    dropOff={dropOff}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stuck" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Stuck Leads
                  </CardTitle>
                  <CardDescription>
                    Leads that have been in their current stage longer than expected
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StuckLeadsTable stuckLeads={stuckLeads} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="counselors" className="mt-4">
              {institutionId && (
                <CounselorPerformanceDashboard institutionId={institutionId} />
              )}
            </TabsContent>

            <TabsContent value="sources" className="mt-4">
              {institutionId && <SourceROIDashboard institutionId={institutionId} />}
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionAnalyticsPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionAnalyticsPageContent />
    </AdmissionErrorBoundary>
  );
}
