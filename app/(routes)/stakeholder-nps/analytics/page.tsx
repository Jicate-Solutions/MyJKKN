'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, TrendingUp, TrendingDown, Users, BarChart3 } from 'lucide-react';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useNPSTrendAnalytics } from '@/hooks/stakeholder-nps';
import { NPSTrendChart, NPSSegmentTrendChart } from '@/components/stakeholder-nps';
import {
  NPSScoreDisplay,
  NPSDistributionBar,
} from '../_components/nps-score-display';
import type { StakeholderType, NPSTrendData } from '@/types/stakeholder-nps';

const stakeholderOptions: { value: StakeholderType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Stakeholders' },
  { value: 'student', label: 'Students' },
  { value: 'learner', label: 'Learners' },
  { value: 'parent', label: 'Parents' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'staff', label: 'Staff' },
  { value: 'industry', label: 'Industry Partners' },
  { value: 'employer', label: 'Employers' },
  { value: 'community', label: 'Community' },
];

const timeRangeOptions = [
  { value: '3', label: 'Last 3 Months' },
  { value: '6', label: 'Last 6 Months' },
  { value: '12', label: 'Last 12 Months' },
  { value: '24', label: 'Last 2 Years' },
];

function calculateAggregateMetrics(data: NPSTrendData[]) {
  if (!data || data.length === 0) {
    return {
      currentNPS: 0,
      totalResponses: 0,
      totalPromoters: 0,
      totalPassives: 0,
      totalDetractors: 0,
      avgScore: 0,
      trend: 0,
    };
  }

  // Sort by month to get most recent
  const sorted = [...data].sort((a, b) => b.month.localeCompare(a.month));

  // Get most recent month's NPS
  const mostRecent = sorted[0];
  const previousMonth = sorted[1];

  // Calculate totals
  const totals = data.reduce(
    (acc, curr) => ({
      responses: acc.responses + curr.response_count,
      promoters: acc.promoters + curr.promoters,
      passives: acc.passives + curr.passives,
      detractors: acc.detractors + curr.detractors,
    }),
    { responses: 0, promoters: 0, passives: 0, detractors: 0 }
  );

  // Calculate overall NPS
  const totalAll = totals.promoters + totals.passives + totals.detractors;
  const overallNPS = totalAll > 0
    ? Math.round(((totals.promoters - totals.detractors) / totalAll) * 100)
    : 0;

  return {
    currentNPS: mostRecent?.nps_score || 0,
    totalResponses: totals.responses,
    totalPromoters: totals.promoters,
    totalPassives: totals.passives,
    totalDetractors: totals.detractors,
    avgScore: overallNPS,
    trend: previousMonth ? mostRecent.nps_score - previousMonth.nps_score : 0,
  };
}

export default function AnalyticsPage() {
  const { selectedInstitutionId: institutionId } = useUserInstitutionAccess();
  const [stakeholderFilter, setStakeholderFilter] = useState<StakeholderType | 'all'>('all');
  const [timeRange, setTimeRange] = useState('12');

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - parseInt(timeRange, 10));

  const { data: trendData, isLoading, error } = useNPSTrendAnalytics({
    institution_id: institutionId || '',
    stakeholder_type: stakeholderFilter !== 'all' ? stakeholderFilter : undefined,
    date_from: startDate.toISOString(),
    date_to: endDate.toISOString(),
  });

  const metrics = calculateAggregateMetrics(trendData || []);

  if (!institutionId) {
    return (
      <ContentLayout title="NPS Analytics">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
            { label: 'Analytics', href: '/stakeholder-nps/analytics' },
          ]}
        />
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              You need to be assigned to an institution to view analytics.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="NPS Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Stakeholder NPS', href: '/stakeholder-nps' },
          { label: 'Analytics', href: '/stakeholder-nps/analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold">NPS Analytics</h1>
            <p className="text-muted-foreground">
              Track trends and insights across stakeholder groups
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <Select
                value={stakeholderFilter}
                onValueChange={(value) => setStakeholderFilter(value as StakeholderType | 'all')}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Stakeholder Type" />
                </SelectTrigger>
                <SelectContent>
                  {stakeholderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-destructive font-medium">Failed to load analytics</p>
              <p className="text-muted-foreground text-sm mt-1">
                {error.message || 'An unexpected error occurred'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <>
            {/* Summary Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Current NPS</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <NPSScoreDisplay
                    score={metrics.currentNPS}
                    size="md"
                    showTrend={true}
                    previousScore={metrics.currentNPS - metrics.trend}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metrics.totalResponses}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    In selected period
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Promoters</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {metrics.totalPromoters}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Score 9-10</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Detractors</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">
                    {metrics.totalDetractors}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Score 0-6</p>
                </CardContent>
              </Card>
            </div>

            {/* Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Response Distribution</CardTitle>
                <CardDescription>Breakdown of promoters, passives, and detractors</CardDescription>
              </CardHeader>
              <CardContent>
                <NPSDistributionBar
                  promoters={metrics.totalPromoters}
                  passives={metrics.totalPassives}
                  detractors={metrics.totalDetractors}
                />
              </CardContent>
            </Card>

            {/* Trend Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <NPSTrendChart
                data={trendData || []}
                title="NPS Score Trend"
                description="Net Promoter Score over time"
                stakeholderFilter={stakeholderFilter !== 'all' ? stakeholderFilter : undefined}
              />

              <NPSSegmentTrendChart
                data={trendData || []}
                title="Segment Distribution Trend"
                description="Percentage breakdown over time"
                stakeholderFilter={stakeholderFilter !== 'all' ? stakeholderFilter : undefined}
              />
            </div>

            {/* NPS Interpretation Guide */}
            <Card>
              <CardHeader>
                <CardTitle>NPS Score Interpretation</CardTitle>
                <CardDescription>Understanding what your NPS score means</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="font-semibold text-green-700">70 to 100</div>
                    <div className="text-sm text-green-600">World Class</div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="font-semibold text-green-600">50 to 69</div>
                    <div className="text-sm text-green-500">Excellent</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="font-semibold text-emerald-600">30 to 49</div>
                    <div className="text-sm text-emerald-500">Great</div>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <div className="font-semibold text-yellow-600">0 to 29</div>
                    <div className="text-sm text-yellow-500">Good</div>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <div className="font-semibold text-orange-600">-20 to -1</div>
                    <div className="text-sm text-orange-500">Needs Improvement</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="font-semibold text-red-600">-100 to -21</div>
                    <div className="text-sm text-red-500">Critical</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
