'use client';

import { Fragment, useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  useCounselorPerformance,
  useCounselorTimeline,
  type CounselorMetrics,
} from '@/hooks/admission/use-counselor-performance';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users, Clock, CheckCircle2, MessageSquare, RefreshCw,
  ChevronDown, ChevronRight, Trophy,
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '-';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function CounselorPerformanceContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id;

  // Date range state
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Expanded counselor for timeline
  const [expandedCounselorId, setExpandedCounselorId] = useState<string | null>(null);

  const { counselors, distribution, isLoading, refetch } = useCounselorPerformance(
    institutionId,
    { from: dateFrom, to: dateTo }
  );

  const { timeline, isLoading: timelineLoading } = useCounselorTimeline(
    expandedCounselorId || undefined,
    institutionId,
    { from: dateFrom, to: dateTo }
  );

  // Compute summary KPIs
  const kpis = useMemo(() => {
    if (counselors.length === 0) {
      return { avgResponse: null, avgResolution: 0, activeConvos: 0, totalConvos: 0 };
    }
    const responseTimes = counselors
      .map(c => c.avg_first_response_minutes)
      .filter((v): v is number => v !== null);
    const avgResponse = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;
    const totalConvos = counselors.reduce((sum, c) => sum + c.total_conversations, 0);
    const resolvedConvos = counselors.reduce((sum, c) => sum + c.resolved_conversations, 0);
    const activeConvos = counselors.reduce((sum, c) => sum + c.open_conversations, 0);
    const avgResolution = totalConvos > 0
      ? Math.round((resolvedConvos / totalConvos) * 1000) / 10
      : 0;

    return { avgResponse, avgResolution, activeConvos, totalConvos };
  }, [counselors]);

  const toggleExpand = (counselorId: string) => {
    setExpandedCounselorId(prev => prev === counselorId ? null : counselorId);
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Counselor Performance">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission">Admission</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="/admission/marketing/chat">Chat</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Counselor Performance</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
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
                <RefreshCw className="h-4 w-4 mr-2" />Refresh
              </Button>
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Counselor Performance</h1>
              <p className="text-sm text-muted-foreground">
                Track response times, resolution rates, and conversation metrics
              </p>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{formatMinutes(kpis.avgResponse)}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resolution Rate</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{kpis.avgResolution}%</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{kpis.activeConvos}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Conversations</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-7 w-16" /> :
                  <div className="text-2xl font-bold">{kpis.totalConvos}</div>}
              </CardContent>
            </Card>
          </div>

          {/* Response Time Distribution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Response Time Distribution</CardTitle>
              <CardDescription>
                How quickly counselors respond to first messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={distribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'percentage') return [`${value}%`, 'Percentage'];
                        return [value, 'Count'];
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Conversations" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No response time data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leaderboard Table */}
          <Card>
            <CardHeader>
              <CardTitle>Counselor Leaderboard</CardTitle>
              <CardDescription>
                Ranked by resolution rate. Click a row to see daily breakdown.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : counselors.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">No counselor data</p>
                  <p>Assign counselors to conversations to see performance metrics.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Counselor</TableHead>
                      <TableHead className="text-right">Conversations</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="text-right">Avg Response</TableHead>
                      <TableHead className="text-right">Resolution Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {counselors.map((counselor: CounselorMetrics, index: number) => {
                      const isExpanded = expandedCounselorId === counselor.counselor_id;
                      return (
                        <Fragment key={counselor.counselor_id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => toggleExpand(counselor.counselor_id)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                }
                                <span className="font-medium text-muted-foreground">{index + 1}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={counselor.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {getInitials(counselor.counselor_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{counselor.counselor_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {counselor.messages_sent} messages sent
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {counselor.total_conversations}
                            </TableCell>
                            <TableCell className="text-right">
                              {counselor.resolved_conversations}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline">
                                {formatMinutes(counselor.avg_first_response_minutes)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                className={
                                  counselor.resolution_rate >= 80
                                    ? 'bg-green-100 text-green-800'
                                    : counselor.resolution_rate >= 50
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }
                              >
                                {counselor.resolution_rate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {/* Expanded timeline */}
                          {isExpanded && (
                            <TableRow key={`${counselor.counselor_id}-timeline`}>
                              <TableCell colSpan={6} className="bg-muted/20 p-4">
                                {timelineLoading ? (
                                  <Skeleton className="h-[200px] w-full" />
                                ) : timeline.length > 0 ? (
                                  <div>
                                    <p className="text-sm font-medium mb-3">
                                      Daily Activity for {counselor.counselor_name}
                                    </p>
                                    <ResponsiveContainer width="100%" height={200}>
                                      <BarChart data={timeline}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                          dataKey="date"
                                          tick={{ fontSize: 11 }}
                                          tickFormatter={(d: string) => {
                                            const date = new Date(d);
                                            return `${date.getMonth() + 1}/${date.getDate()}`;
                                          }}
                                        />
                                        <YAxis />
                                        <Tooltip
                                          labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                                        />
                                        <Bar dataKey="conversations" fill="#3b82f6" name="Conversations" radius={[2, 2, 0, 0]} />
                                        <Bar dataKey="messages" fill="#10b981" name="Messages" radius={[2, 2, 0, 0]} />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                ) : (
                                  <p className="text-center text-muted-foreground py-4">
                                    No daily data available for this period
                                  </p>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CounselorPerformancePage() {
  return (
    <AdmissionErrorBoundary>
      <CounselorPerformanceContent />
    </AdmissionErrorBoundary>
  );
}
