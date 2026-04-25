'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tent,
  TrendingUp,
  Eye,
  IndianRupee,
  UserCheck,
  Target,
  BarChart3,
} from 'lucide-react';

import {
  useExpoSummaryStats,
  useExpoExpenseBreakdown,
  useExpoLeadFunnel,
  useExpoComparison,
} from '@/hooks/admission/use-expos';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/admission/marketing/expos',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatPercent(value: number, decimals = 1): string {
  return `${(value ?? 0).toFixed(decimals)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-14" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
      </div>
      {/* Performance row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
}

function KpiCard({ label, value, icon, bgColor, textColor }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold truncate">{value}</p>
          </div>
          <div className={`ml-2 p-2 rounded-full shrink-0 ${bgColor}`}>
            <div className={textColor}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pie chart custom label
// ─────────────────────────────────────────────────────────────────────────────

interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  name: string;
  percentage: number;
}

const RADIAN = Math.PI / 180;

function renderCustomPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  name,
  percentage,
}: PieLabelProps) {
  const radius = innerRadius + (outerRadius - innerRadius) * 1.3;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percentage < 5) return null; // skip tiny slices

  return (
    <text
      x={x}
      y={y}
      fill="currentColor"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-[10px] fill-foreground"
      fontSize={10}
    >
      {name} ({(percentage ?? 0).toFixed(1)}%)
    </text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page content
// ─────────────────────────────────────────────────────────────────────────────

function ExpoAnalyticsContent() {
  const { stats, isLoading: statsLoading } = useExpoSummaryStats();
  const { breakdown, isLoading: breakdownLoading } = useExpoExpenseBreakdown();
  const { funnel, isLoading: funnelLoading } = useExpoLeadFunnel();
  const { comparison, isLoading: comparisonLoading } = useExpoComparison();

  const isLoading =
    statsLoading || breakdownLoading || funnelLoading || comparisonLoading;

  // ── Breadcrumb ──────────────────────────────────────────────────────────────
  const breadcrumb = (
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
          <BreadcrumbLink href="/admission/marketing/campaigns/monitoring">Marketing</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Analytics</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );

  if (isLoading) {
    return (
      <ContentLayout title="Expo Analytics">
        <div className="space-y-6">
          {breadcrumb}
          <AnalyticsSkeleton />
        </div>
      </ContentLayout>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!stats || stats.total_expos === 0) {
    return (
      <ContentLayout title="Expo Analytics">
        <div className="space-y-6">
          {breadcrumb}
          <Card>
            <CardContent className="py-16 text-center">
              <Tent className="h-10 w-10 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground text-sm">
                No expo events yet. Create your first expo to see analytics.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  // Bar chart: scale expenses to thousands for visual balance
  const comparisonChartData = comparison.map((item) => ({
    name: item.event_name.length > 15 ? item.event_name.slice(0, 15) + '…' : item.event_name,
    Leads: item.total_leads,
    'Expenses (K)': Math.round(item.total_expenses / 1000),
  }));

  // Top-performing expos sorted by conversion rate
  const topExpos = [...comparison]
    .sort((a, b) => b.conversion_rate - a.conversion_rate)
    .slice(0, 10);

  // Funnel steps
  const funnelSteps = funnel
    ? [
        {
          label: 'Visitors',
          count: funnel.total_visitors,
          pct: 100,
          color: 'bg-blue-500',
        },
        {
          label: 'Counselling Done',
          count: funnel.counselling_done,
          pct: funnel.total_visitors > 0 ? (funnel.counselling_done / funnel.total_visitors) * 100 : 0,
          color: 'bg-blue-400',
        },
        {
          label: 'Interested',
          count: funnel.interested_students,
          pct: funnel.total_visitors > 0 ? (funnel.interested_students / funnel.total_visitors) * 100 : 0,
          color: 'bg-green-500',
        },
        {
          label: 'Leads Collected',
          count: funnel.leads_collected,
          pct: funnel.total_visitors > 0 ? (funnel.leads_collected / funnel.total_visitors) * 100 : 0,
          color: 'bg-green-600',
        },
      ]
    : [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <ContentLayout title="Expo Analytics">
      <div className="space-y-6">
        {breadcrumb}

        {/* ── Section 1: KPI Strip ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <KpiCard
            label="Total Expos"
            value={String(stats.total_expos)}
            icon={<Tent className="h-5 w-5" />}
            bgColor="bg-blue-100 dark:bg-blue-900/30"
            textColor="text-blue-600 dark:text-blue-400"
          />
          <KpiCard
            label="Active Expos"
            value={String(stats.active_expos)}
            icon={<TrendingUp className="h-5 w-5" />}
            bgColor="bg-green-100 dark:bg-green-900/30"
            textColor="text-green-600 dark:text-green-400"
          />
          <KpiCard
            label="Total Visitors"
            value={stats.total_visitors.toLocaleString('en-IN')}
            icon={<Eye className="h-5 w-5" />}
            bgColor="bg-purple-100 dark:bg-purple-900/30"
            textColor="text-purple-600 dark:text-purple-400"
          />
          <KpiCard
            label="Total Leads"
            value={stats.total_leads.toLocaleString('en-IN')}
            icon={<UserCheck className="h-5 w-5" />}
            bgColor="bg-green-100 dark:bg-green-900/30"
            textColor="text-green-600 dark:text-green-400"
          />
          <KpiCard
            label="Total Expenses"
            value={formatCurrency(stats.total_expenses)}
            icon={<IndianRupee className="h-5 w-5" />}
            bgColor="bg-yellow-100 dark:bg-yellow-900/30"
            textColor="text-yellow-600 dark:text-yellow-400"
          />
          <KpiCard
            label="Avg Cost / Lead"
            value={formatCurrency(stats.avg_cost_per_lead)}
            icon={<Target className="h-5 w-5" />}
            bgColor="bg-orange-100 dark:bg-orange-900/30"
            textColor="text-orange-600 dark:text-orange-400"
          />
          <KpiCard
            label="Conversion Rate"
            value={formatPercent(stats.conversion_rate)}
            icon={<BarChart3 className="h-5 w-5" />}
            bgColor="bg-blue-100 dark:bg-blue-900/30"
            textColor="text-blue-600 dark:text-blue-400"
          />
        </div>

        {/* ── Section 2: ROI Analysis ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expense Breakdown Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IndianRupee className="h-5 w-5" />
                Expense Breakdown
              </CardTitle>
              <CardDescription>Spend distribution by category</CardDescription>
            </CardHeader>
            <CardContent>
              {breakdown.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IndianRupee className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No expense data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      labelLine={false}
                      label={(props) =>
                        renderCustomPieLabel({
                          ...props,
                          name: props.name,
                          percentage: props.percentage ?? props.payload?.percentage ?? 0,
                        })
                      }
                    >
                      {breakdown.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name,
                      ]}
                    />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs text-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Expo Comparison Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Expo Comparison
              </CardTitle>
              <CardDescription>Leads vs expenses across events</CardDescription>
            </CardHeader>
            <CardContent>
              {comparisonChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No comparison data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparisonChartData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'Expenses (K)') return [`₹${(value * 1000).toLocaleString('en-IN')}`, 'Expenses'];
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Leads" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Expenses (K)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Section 3: Performance Analysis ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lead Conversion Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Lead Conversion Funnel
              </CardTitle>
              <CardDescription>Visitor-to-lead progression</CardDescription>
            </CardHeader>
            <CardContent>
              {!funnel || funnelSteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <UserCheck className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No funnel data available</p>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  {funnelSteps.map((step, idx) => {
                    const prevCount = idx === 0 ? step.count : funnelSteps[idx - 1].count;
                    const stepRate =
                      idx === 0 ? 100 : prevCount > 0 ? (step.count / prevCount) * 100 : 0;

                    return (
                      <div key={step.label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{step.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">
                              {idx > 0 && (
                                <Badge variant="outline" className="text-xs mr-1">
                                  {(stepRate ?? 0).toFixed(1)}% of prev
                                </Badge>
                              )}
                            </span>
                            <span className="font-semibold">
                              {step.count.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                        <div className="h-6 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${step.color} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(step.pct, 1)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-right">
                          {(step.pct ?? 0).toFixed(1)}% of total visitors
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Performing Expos Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top Performing Expos
              </CardTitle>
              <CardDescription>Ranked by conversion rate</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {topExpos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Conv.%</TableHead>
                        <TableHead className="text-right">Cost/Lead</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topExpos.map((item, idx) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <span
                              className="font-medium truncate block max-w-[120px]"
                              title={item.event_name}
                            >
                              {item.event_name}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.city}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.total_leads.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={
                                item.conversion_rate >= 20
                                  ? 'border-green-500 text-green-600'
                                  : item.conversion_rate >= 10
                                  ? 'border-yellow-500 text-yellow-600'
                                  : 'border-muted-foreground text-muted-foreground'
                              }
                            >
                              {formatPercent(item.conversion_rate)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(item.cost_per_lead)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page export
// ─────────────────────────────────────────────────────────────────────────────

export default function ExpoAnalyticsPage() {
  return (
    <PermissionGuard module="admission.marketing.expos" action="view">
      <AdmissionErrorBoundary>
        <ExpoAnalyticsContent />
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
