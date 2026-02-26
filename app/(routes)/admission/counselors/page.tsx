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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useCounselorPerformance } from '@/hooks/admission';
import type { DateRange } from '@/lib/services/admission';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Trophy,
  Medal,
  Star,
  RefreshCw,
  Download,
  User,
  MessageSquare,
  Clock,
  Target,
  Award,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' }
];

// Performance badge thresholds
const PERFORMANCE_TIERS = {
  gold: { min: 30, color: 'bg-yellow-500', icon: Trophy, label: 'Gold' },
  silver: { min: 20, color: 'bg-gray-400', icon: Medal, label: 'Silver' },
  bronze: { min: 10, color: 'bg-amber-600', icon: Award, label: 'Bronze' }
};

function CounselorSkeleton() {
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

function PerformanceBadge({ conversionRate }: { conversionRate: number }) {
  let tier = null;

  if (conversionRate >= PERFORMANCE_TIERS.gold.min) {
    tier = PERFORMANCE_TIERS.gold;
  } else if (conversionRate >= PERFORMANCE_TIERS.silver.min) {
    tier = PERFORMANCE_TIERS.silver;
  } else if (conversionRate >= PERFORMANCE_TIERS.bronze.min) {
    tier = PERFORMANCE_TIERS.bronze;
  }

  if (!tier) return null;

  const Icon = tier.icon;
  return (
    <Badge className={`${tier.color} text-white`}>
      <Icon className="h-3 w-3 mr-1" />
      {tier.label}
    </Badge>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500 text-white font-bold">
        <Trophy className="h-4 w-4" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-400 text-white font-bold">
        <Medal className="h-4 w-4" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-600 text-white font-bold">
        <Award className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold">
      {rank}
    </div>
  );
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function CounselorLeaderboard({
  counselors,
  dateRange
}: {
  counselors: Array<{
    counselorId: string;
    counselorName: string;
    leadsAssigned: number;
    conversions: number;
    conversionRate: number;
    avgResponseTime: number;
    messagesSent: number;
  }>;
  dateRange: string;
}) {
  // Sort by conversion rate descending
  const sortedCounselors = [...counselors].sort((a, b) => b.conversionRate - a.conversionRate);

  // Calculate team averages
  const totalLeads = counselors.reduce((sum, c) => sum + c.leadsAssigned, 0);
  const totalConversions = counselors.reduce((sum, c) => sum + c.conversions, 0);
  const avgConversion = totalLeads > 0 ? (totalConversions / totalLeads * 100) : 0;
  const avgResponseTime = counselors.length > 0
    ? counselors.reduce((sum, c) => sum + c.avgResponseTime, 0) / counselors.length
    : 0;

  const handleExport = () => {
    try {
      const headers = ['Rank', 'Counselor', 'Leads Assigned', 'Conversions', 'Conversion %', 'Avg Response Time', 'Messages Sent'];
      const rows = sortedCounselors.map((c, idx) => [
        idx + 1,
        c.counselorName,
        c.leadsAssigned,
        c.conversions,
        `${c.conversionRate.toFixed(1)}%`,
        formatResponseTime(c.avgResponseTime),
        c.messagesSent
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `counselor-performance-${dateRange}days.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Counselor Leaderboard
            </CardTitle>
            <CardDescription>
              Performance rankings for the last {dateRange} days
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedCounselors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No counselor data available</p>
          </div>
        ) : (
          <>
            {/* Team Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Team Total Leads</p>
                <p className="text-2xl font-bold">{totalLeads}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Team Avg Conversion</p>
                <p className="text-2xl font-bold">{avgConversion.toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Team Avg Response</p>
                <p className="text-2xl font-bold">{formatResponseTime(avgResponseTime)}</p>
              </div>
            </div>

            {/* Leaderboard Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Counselor</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Conversions</TableHead>
                  <TableHead className="text-center">Conversion %</TableHead>
                  <TableHead className="text-center">Avg Response</TableHead>
                  <TableHead className="text-center">Messages</TableHead>
                  <TableHead className="text-center">Badge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCounselors.map((counselor, index) => {
                  const rank = index + 1;
                  const isAboveAvg = counselor.conversionRate > avgConversion;

                  return (
                    <TableRow
                      key={counselor.counselorId}
                      className={rank <= 3 ? 'bg-muted/30' : ''}
                    >
                      <TableCell>
                        <RankBadge rank={rank} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {counselor.counselorName.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{counselor.counselorName}</p>
                            {isAboveAvg && (
                              <p className="text-xs text-green-600 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Above team average
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{counselor.leadsAssigned}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium text-green-600">{counselor.conversions}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-bold">{counselor.conversionRate.toFixed(1)}%</span>
                          <Progress
                            value={Math.min(counselor.conversionRate, 100)}
                            className="w-16 h-1.5"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className={counselor.avgResponseTime <= 30 ? 'text-green-600' : counselor.avgResponseTime <= 60 ? 'text-yellow-600' : 'text-red-600'}>
                            {formatResponseTime(counselor.avgResponseTime)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span>{counselor.messagesSent}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <PerformanceBadge conversionRate={counselor.conversionRate} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CounselorPerformancePageContent() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id;
  const [dateRange, setDateRange] = useState('30');
  const [isRefetching, setIsRefetching] = useState(false);

  // Calculate date range for query — memoized so the object reference is stable
  // and the React Query key doesn't change on every render (which would cause infinite refetches)
  const dateRangeQuery = useMemo<DateRange | undefined>(() =>
    dateRange ? {
      from: new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString()
    } : undefined,
    [dateRange]
  );

  const { counselors, isLoading, error, refetch } = useCounselorPerformance(institutionId, dateRangeQuery);

  const handleRefresh = async () => {
    setIsRefetching(true);
    try {
      await refetch();
      toast.success('Data refreshed successfully');
    } catch {
      toast.error('Failed to refresh data');
    } finally {
      setIsRefetching(false);
    }
  };

  // Calculate summary stats
  const topPerformer = counselors.length > 0
    ? [...counselors].sort((a, b) => b.conversionRate - a.conversionRate)[0]
    : null;
  const totalConversions = counselors.reduce((sum, c) => sum + c.conversions, 0);
  const avgConversion = counselors.length > 0
    ? counselors.reduce((sum, c) => sum + c.conversionRate, 0) / counselors.length
    : 0;
  const goldCount = counselors.filter(c => c.conversionRate >= 30).length;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Counselor Performance">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Counselor Performance</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="text-2xl font-bold mt-2">Counselor Performance</h1>
              <p className="text-muted-foreground">
                Track and compare counselor performance metrics
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefetching}>
                {isRefetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <p className="text-red-600">{error}</p>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <CounselorSkeleton />
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard
                  title="Active Counselors"
                  value={counselors.length}
                  description="Team members with assigned leads"
                  icon={Users}
                  color="text-blue-600"
                />
                <MetricCard
                  title="Total Conversions"
                  value={totalConversions}
                  description={`In the last ${dateRange} days`}
                  icon={Target}
                  color="text-green-600"
                />
                <MetricCard
                  title="Avg Conversion Rate"
                  value={`${avgConversion.toFixed(1)}%`}
                  description="Team average"
                  icon={TrendingUp}
                  color="text-purple-600"
                />
                <MetricCard
                  title="Gold Performers"
                  value={goldCount}
                  description="Counselors with 30%+ conversion"
                  icon={Trophy}
                  color="text-yellow-500"
                />
              </div>

              {/* Top Performer Highlight */}
              {topPerformer && (
                <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500 text-white">
                        <Star className="h-8 w-8" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-yellow-700 font-medium">Top Performer</p>
                        <p className="text-xl font-bold">{topPerformer.counselorName}</p>
                        <p className="text-sm text-muted-foreground">
                          {topPerformer.conversions} conversions • {topPerformer.conversionRate.toFixed(1)}% rate • {formatResponseTime(topPerformer.avgResponseTime)} avg response
                        </p>
                      </div>
                      <PerformanceBadge conversionRate={topPerformer.conversionRate} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Leaderboard */}
              <CounselorLeaderboard counselors={counselors} dateRange={dateRange} />
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CounselorPerformancePage() {
  return (
    <AdmissionErrorBoundary>
      <CounselorPerformancePageContent />
    </AdmissionErrorBoundary>
  );
}
