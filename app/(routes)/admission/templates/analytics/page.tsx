'use client';

import { useState, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useTemplateAnalytics,
  useTemplateTimeline,
} from '@/hooks/admission/use-template-analytics';
import type { TemplateAnalytics } from '@/lib/services/whatsapp/whatsapp-template-analytics-service';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  Send,
  CheckCircle,
  Eye,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';

// =============================================================================
// KPI CARD
// =============================================================================

function KPICard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription className="text-sm">{title}</CardDescription>
        <div className={cn('p-2 rounded-lg', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// QUALITY BADGE
// =============================================================================

function QualityBadge({ rate, type }: { rate: number; type: 'delivery' | 'read' | 'fail' }) {
  let variant: 'default' | 'secondary' | 'destructive' = 'secondary';
  if (type === 'delivery') {
    if (rate >= 90) variant = 'default';
    else if (rate < 70) variant = 'destructive';
  } else if (type === 'read') {
    if (rate >= 50) variant = 'default';
    else if (rate < 20) variant = 'destructive';
  } else if (type === 'fail') {
    if (rate <= 3) variant = 'default';
    else if (rate > 10) variant = 'destructive';
  }
  return <Badge variant={variant}>{rate.toFixed(1)}%</Badge>;
}

// =============================================================================
// TIMELINE ROW COMPONENT
// =============================================================================

function TimelineRow({ template, institutionId, dateRange }: {
  template: TemplateAnalytics;
  institutionId: string;
  dateRange: { from: string; to: string };
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setIsOpen(!isOpen)}>
        <TableCell>
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <div>
                <span className="font-medium">{template.template_name}</span>
                {template.category && (
                  <Badge variant="outline" className="ml-2 text-[10px]">{template.category}</Badge>
                )}
              </div>
            </div>
          </CollapsibleTrigger>
        </TableCell>
        <TableCell className="text-right font-mono">{template.sent_count.toLocaleString()}</TableCell>
        <TableCell className="text-right">
          <QualityBadge rate={template.delivery_rate} type="delivery" />
        </TableCell>
        <TableCell className="text-right">
          <QualityBadge rate={template.read_rate} type="read" />
        </TableCell>
        <TableCell className="text-right">
          <QualityBadge rate={template.fail_rate} type="fail" />
        </TableCell>
        <TableCell className="text-right">
          {template.quality_rating ? (
            <Badge variant={
              template.quality_rating === 'HIGH' ? 'default' :
              template.quality_rating === 'MEDIUM' ? 'secondary' : 'destructive'
            }>
              {template.quality_rating}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </TableCell>
      </TableRow>
      <CollapsibleContent asChild>
        <TableRow>
          <TableCell colSpan={6} className="p-0">
            <TimelineChart
              templateId={template.template_id}
              institutionId={institutionId}
              dateRange={dateRange}
            />
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// TIMELINE CHART (EXPANDED ROW)
// =============================================================================

function TimelineChart({ templateId, institutionId, dateRange }: {
  templateId: string;
  institutionId: string;
  dateRange: { from: string; to: string };
}) {
  const { timeline, isLoading } = useTemplateTimeline(templateId, institutionId, dateRange);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading timeline...</span>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No data for this date range.
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted/30">
      <p className="text-sm font-medium mb-2">Daily Performance</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={timeline}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(val) => format(new Date(val), 'MMM d')}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(val) => format(new Date(val as string), 'MMM d, yyyy')}
          />
          <Legend />
          <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={false} name="Sent" />
          <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} name="Delivered" />
          <Line type="monotone" dataKey="read" stroke="#3b82f6" strokeWidth={2} dot={false} name="Read" />
          <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} name="Failed" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// =============================================================================
// MAIN PAGE CONTENT
// =============================================================================

function TemplateAnalyticsContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();

  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const dateRange = useMemo(() => ({ from: dateFrom, to: dateTo }), [dateFrom, dateTo]);

  const {
    analytics,
    topPerforming,
    worstPerforming,
    isLoading: analyticsLoading,
    refetch,
  } = useTemplateAnalytics(selectedInstitutionId, dateRange);

  const isLoading = accessLoading || analyticsLoading;

  // Compute aggregate KPIs
  const kpis = useMemo(() => {
    if (analytics.length === 0) return { totalSent: 0, avgDelivery: 0, avgRead: 0, avgFail: 0 };

    const totalSent = analytics.reduce((s, a) => s + a.sent_count, 0);
    const totalDelivered = analytics.reduce((s, a) => s + a.delivered_count, 0);
    const totalRead = analytics.reduce((s, a) => s + a.read_count, 0);
    const totalFailed = analytics.reduce((s, a) => s + a.failed_count, 0);

    return {
      totalSent,
      avgDelivery: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 1000) / 10 : 0,
      avgRead: totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 1000) / 10 : 0,
      avgFail: totalSent > 0 ? Math.round((totalFailed / totalSent) * 1000) / 10 : 0,
    };
  }, [analytics]);

  // Bar chart data: top 15 templates by sent count
  const barChartData = useMemo(() => {
    return analytics.slice(0, 15).map((a) => ({
      name: a.template_name.length > 20 ? a.template_name.substring(0, 20) + '...' : a.template_name,
      'Delivery %': a.delivery_rate,
      'Read %': a.read_rate,
    }));
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Template Performance Analytics</h2>
          <p className="text-muted-foreground">
            Per-template delivery, read, and failure rates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
          />
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Sent"
          value={kpis.totalSent.toLocaleString()}
          icon={Send}
          color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30"
        />
        <KPICard
          title="Avg Delivery Rate"
          value={`${kpis.avgDelivery}%`}
          icon={CheckCircle}
          color="bg-green-100 text-green-600 dark:bg-green-900/30"
          subtitle={kpis.avgDelivery >= 90 ? 'Healthy' : kpis.avgDelivery >= 70 ? 'Needs attention' : 'Critical'}
        />
        <KPICard
          title="Avg Read Rate"
          value={`${kpis.avgRead}%`}
          icon={Eye}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30"
          subtitle={kpis.avgRead >= 50 ? 'Good engagement' : 'Low engagement'}
        />
        <KPICard
          title="Avg Fail Rate"
          value={`${kpis.avgFail}%`}
          icon={XCircle}
          color={cn(
            kpis.avgFail <= 3
              ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30'
          )}
          subtitle={kpis.avgFail <= 3 ? 'Healthy' : 'Review failing templates'}
        />
      </div>

      {/* Bar Chart: Delivery vs Read Rate per Template */}
      {barChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Delivery vs Read Rate by Template
            </CardTitle>
            <CardDescription>Top {barChartData.length} templates by volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, barChartData.length * 40)}>
              <BarChart data={barChartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Bar dataKey="Delivery %" fill="#22c55e" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Read %" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top & Worst Performing quick view */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topPerforming.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Top Performing (by read rate)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topPerforming.map((t) => (
                <div key={t.template_id} className="flex items-center justify-between text-sm">
                  <span className="truncate mr-2">{t.template_name}</span>
                  <Badge variant="default">{t.read_rate.toFixed(1)}% read</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {worstPerforming.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Needs Improvement (by delivery rate)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {worstPerforming.map((t) => (
                <div key={t.template_id} className="flex items-center justify-between text-sm">
                  <span className="truncate mr-2">{t.template_name}</span>
                  <Badge variant="destructive">{t.delivery_rate.toFixed(1)}% delivered</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Full Table with expandable timeline */}
      <Card>
        <CardHeader>
          <CardTitle>All Templates</CardTitle>
          <CardDescription>Click a row to see daily timeline</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No template data</p>
              <p className="text-sm">Send WhatsApp templates to see analytics here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Read</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.map((t) => (
                  <TimelineRow
                    key={t.template_id}
                    template={t}
                    institutionId={selectedInstitutionId!}
                    dateRange={{ from: dateFrom, to: dateTo }}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// PAGE EXPORT
// =============================================================================

export default function TemplateAnalyticsPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Template Analytics">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/templates">Templates</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Analytics</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <AdmissionErrorBoundary>
          <TemplateAnalyticsContent />
        </AdmissionErrorBoundary>
      </ContentLayout>
    </PermissionGuard>
  );
}
