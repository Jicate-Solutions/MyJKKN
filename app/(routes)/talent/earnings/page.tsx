'use client';

/**
 * Unified Earnings Dashboard
 * Purpose: Show earnings across all talent types (builder, cohort, production)
 * Location: /talent/earnings
 */

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  Code,
  GraduationCap,
  Palette,
  AlertCircle,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth-provider';
import {
  useUnifiedEarnings,
  useEarningsSummary,
  usePayoutHistory,
  getTalentTypeLabel,
  getTalentTypeColor,
  formatEarningsAmount,
  getEarningsStatusVariant,
  getEarningsStatusLabel,
  type TalentType,
} from '@/hooks/solutions/use-unified-earnings';

// ============================================
// HELPER COMPONENTS
// ============================================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  isLoading,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  isLoading?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'info';
}) {
  const iconColors = {
    default: 'text-gray-500',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <Icon className={`h-8 w-8 ${iconColors[variant]}`} />
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
          <p className="text-sm text-muted-foreground">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TalentTypeBreakdownCard({
  type,
  data,
  isLoading,
}: {
  type: TalentType;
  data: { total: number; pending: number; paid: number };
  isLoading?: boolean;
}) {
  const icons: Record<TalentType, React.ElementType> = {
    builder: Code,
    cohort_member: GraduationCap,
    production_learner: Palette,
  };

  const Icon = icons[type];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={getTalentTypeColor(type)}>
              <Icon className="mr-1 h-3 w-3" />
              {getTalentTypeLabel(type)}
            </Badge>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <span className="text-lg font-bold">
              {formatEarningsAmount(data.total)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            {isLoading ? (
              <Skeleton className="h-5 w-16 mt-1" />
            ) : (
              <p className="text-sm font-medium text-yellow-600">
                {formatEarningsAmount(data.pending)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid</p>
            {isLoading ? (
              <Skeleton className="h-5 w-16 mt-1" />
            ) : (
              <p className="text-sm font-medium text-green-600">
                {formatEarningsAmount(data.paid)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function UnifiedEarningsPage() {
  const { userId } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');

  // Fetch data
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useEarningsSummary(userId);
  const { data: earningsData, isLoading: earningsLoading } = useUnifiedEarnings(
    userId,
    activeTab !== 'all' ? { talent_types: [activeTab as TalentType] } : undefined
  );
  const { data: payoutsData, isLoading: payoutsLoading } = usePayoutHistory(userId);

  // Prepare chart data
  const chartData = summary?.by_month?.slice().reverse().map((month) => ({
    month: format(new Date(month.month + '-01'), 'MMM yy'),
    Builder: month.by_type.builder,
    Cohort: month.by_type.cohort_member,
    Production: month.by_type.production_learner,
    total: month.amount,
  })) || [];

  const earnings = earningsData?.data || [];
  const payouts = payoutsData?.data || [];

  // Check if user has any earnings
  const hasEarnings = summary && summary.total_earnings > 0;
  const isLoading = summaryLoading || earningsLoading;

  return (
    <ContentLayout title="My Earnings">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Talent', href: '/talent' },
          { label: 'My Earnings' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">My Earnings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track your earnings across builder, cohort, and production work
          </p>
        </div>

        {/* Error State */}
        {summaryError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load earnings data. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Earnings"
            value={summaryLoading ? '-' : formatEarningsAmount(summary?.total_earnings || 0)}
            icon={TrendingUp}
            isLoading={summaryLoading}
            variant="success"
          />
          <StatCard
            title="Pending"
            value={summaryLoading ? '-' : formatEarningsAmount(summary?.pending_earnings || 0)}
            icon={Clock}
            isLoading={summaryLoading}
            variant="warning"
          />
          <StatCard
            title="Paid"
            value={summaryLoading ? '-' : formatEarningsAmount(summary?.paid_earnings || 0)}
            icon={CheckCircle2}
            isLoading={summaryLoading}
            variant="success"
          />
          <StatCard
            title="Payout Count"
            value={summaryLoading ? '-' : payouts.length}
            subtitle="Completed payouts"
            icon={Wallet}
            isLoading={summaryLoading}
            variant="info"
          />
        </div>

        {/* Breakdown by Talent Type */}
        <div className="grid gap-4 md:grid-cols-3">
          <TalentTypeBreakdownCard
            type="builder"
            data={summary?.by_talent_type.builder || { total: 0, pending: 0, paid: 0 }}
            isLoading={summaryLoading}
          />
          <TalentTypeBreakdownCard
            type="cohort_member"
            data={summary?.by_talent_type.cohort_member || { total: 0, pending: 0, paid: 0 }}
            isLoading={summaryLoading}
          />
          <TalentTypeBreakdownCard
            type="production_learner"
            data={summary?.by_talent_type.production_learner || { total: 0, pending: 0, paid: 0 }}
            isLoading={summaryLoading}
          />
        </div>

        {/* Earnings Trend Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Earnings Trend</CardTitle>
              </div>
              <CardDescription>Monthly earnings breakdown by talent type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis
                      tickFormatter={(value) =>
                        new Intl.NumberFormat('en-IN', {
                          notation: 'compact',
                          compactDisplay: 'short',
                        }).format(value)
                      }
                    />
                    <Tooltip
                      formatter={(value: number) => formatEarningsAmount(value)}
                      labelStyle={{ color: '#374151' }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="Builder"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#93c5fd"
                    />
                    <Area
                      type="monotone"
                      dataKey="Cohort"
                      stackId="1"
                      stroke="#22c55e"
                      fill="#86efac"
                    />
                    <Area
                      type="monotone"
                      dataKey="Production"
                      stackId="1"
                      stroke="#a855f7"
                      fill="#d8b4fe"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Earnings Table with Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Earnings History</CardTitle>
            <CardDescription>Your earnings from completed work</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="px-6 border-b">
                <TabsList className="h-auto p-0 bg-transparent">
                  <TabsTrigger
                    value="all"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                  >
                    All
                  </TabsTrigger>
                  <TabsTrigger
                    value="builder"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                  >
                    <Code className="mr-1 h-4 w-4" />
                    Builder
                  </TabsTrigger>
                  <TabsTrigger
                    value="cohort_member"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                  >
                    <GraduationCap className="mr-1 h-4 w-4" />
                    Cohort
                  </TabsTrigger>
                  <TabsTrigger
                    value="production_learner"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                  >
                    <Palette className="mr-1 h-4 w-4" />
                    Production
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={activeTab} className="mt-0">
                {earningsLoading ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : earnings.length === 0 ? (
                  <div className="text-center py-10">
                    <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
                    <h3 className="mt-4 font-semibold">No earnings found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeTab === 'all'
                        ? 'Start working on assignments to earn'
                        : `No ${getTalentTypeLabel(activeTab as TalentType)} earnings yet`}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">%</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {earnings.map((earning) => (
                        <TableRow key={earning.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {earning.source?.title || 'Unknown'}
                              </p>
                              {earning.source?.solution_code && (
                                <p className="text-sm text-muted-foreground">
                                  {earning.source.solution_code}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getTalentTypeColor(earning.talent_type)}>
                              {getTalentTypeLabel(earning.talent_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatEarningsAmount(earning.amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {earning.percentage}%
                          </TableCell>
                          <TableCell>
                            <Badge variant={getEarningsStatusVariant(earning.status)}>
                              {getEarningsStatusLabel(earning.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(earning.created_at), 'dd MMM yyyy')}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Payout History */}
        <Card>
          <CardHeader>
            <CardTitle>Payout History</CardTitle>
            <CardDescription>Completed payouts to your account</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {payoutsLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-10">
                <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 font-semibold">No payouts yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Paid earnings will appear here
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Paid On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.slice(0, 10).map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {payout.source_title || 'Unknown'}
                          </p>
                          {payout.solution_code && (
                            <p className="text-sm text-muted-foreground">
                              {payout.solution_code}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getTalentTypeColor(payout.recipient_type)}>
                          {getTalentTypeLabel(payout.recipient_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatEarningsAmount(payout.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {format(new Date(payout.paid_at), 'dd MMM yyyy')}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
