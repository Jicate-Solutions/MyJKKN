'use client';

import { Suspense, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { useAtRiskLearners, useEngagementSummary } from '@/hooks/pde/use-pde';
import type { PDEAtRiskLearner } from '@/types/pde';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  Download,
  Clock,
  Brain,
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
  AlertTriangle,
  Trophy,
} from 'lucide-react';

// Fink's Taxonomy Dimensions
const FINK_DIMENSIONS = [
  { key: 'foundational_knowledge', label: 'Foundational Knowledge', color: '#0b6d41' },
  { key: 'application', label: 'Application', color: '#2196F3' },
  { key: 'integration', label: 'Integration', color: '#FF9800' },
  { key: 'human_dimension', label: 'Human Dimension', color: '#9C27B0' },
  { key: 'caring', label: 'Caring', color: '#E91E63' },
  { key: 'learning_how_to_learn', label: 'Learning How to Learn', color: '#ffde59' },
];

// Tab values (order matches TabsList). Used for URL-synced tabs so each tab is
// deep-linkable / favoritable via ?tab=.
const ANALYTICS_TABS = ['overview', 'time', 'finks', 'performers'] as const;

function FacultyAnalyticsPageInner() {
  const { profile: user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [activeTab, setActiveTab] = useTabParam('overview', ANALYTICS_TABS);

  const { data: coursesData, isLoading: loadingCourses } = useVACCourses();
  const { data: atRiskLearners, isLoading: loadingAtRisk } = useAtRiskLearners(
    selectedCourseId || undefined
  );

  const courses = coursesData?.data || [];

  const [exportingReport, setExportingReport] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Streams a real CSV from /api/pde/analytics/export. The route scopes rows to
  // the caller's institution, so the download is fetched (not a plain <a href>)
  // in order to surface a 401/403/500 as a message instead of silently saving
  // an error page as a .csv file.
  const handleExportCSV = async (reportType: string) => {
    setExportingReport(reportType);
    setExportError(null);
    try {
      const params = new URLSearchParams({ type: reportType });
      if (selectedCourseId) params.set('courseId', selectedCourseId);

      const res = await fetch(`/api/pde/analytics/export?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pde-${reportType}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Delay revocation so the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingReport(null);
    }
  };

  return (
    <ContentLayout title="PDE Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              Detailed Analytics
            </h1>
            <p className="text-sm text-muted-foreground">
              In-depth analysis of Learner engagement, performance, and growth patterns
            </p>
          </div>
          <Select value={selectedCourseId || 'all'} onValueChange={(v) => setSelectedCourseId(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c: { id: string; name: string }) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Explains the "No data" states below: collection is pending, not broken. */}
        <div className="flex items-start gap-2 rounded-md border border-[#0b6d41]/20 bg-[#0b6d41]/5 px-3 py-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4 mt-0.5 shrink-0 text-[#0b6d41]" />
          <span>
            Analytics populate as learners interact with the PDE system. Empty or
            &ldquo;No data&rdquo; panels below mean collection is still in progress,
            not that anything is wrong.
          </span>
        </div>

        {/* Export failures must be visible — a silent no-op download is exactly
            the bug this replaced. */}
        {exportError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Could not export: {exportError}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-4 sm:gap-0 sm:overflow-visible">
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="time">
              <Clock className="h-4 w-4 mr-1" />
              Time on Task
            </TabsTrigger>
            <TabsTrigger value="finks">
              <Brain className="h-4 w-4 mr-1" />
              Fink&apos;s Dimensions
            </TabsTrigger>
            <TabsTrigger value="performers">
              <Users className="h-4 w-4 mr-1" />
              Performers
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#fbfbee]/30 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Engagement Trend (30 days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-8">
                    <TrendingUp className="h-10 w-10 text-[#0b6d41]/40 mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      Engagement trend data will populate as Learners interact with the PDE system.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#fbfbee]/30 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Completion Rates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-8">
                    <Trophy className="h-10 w-10 text-[#ffde59]/60 mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      Course and assessment completion rates will appear here.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#fbfbee]/30 dark:bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    At-Risk Learners
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAtRisk ? (
                    <div className="flex justify-center py-4">
                      <BeatLoader color="#0b6d41" size={8} />
                    </div>
                  ) : !atRiskLearners || atRiskLearners.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4">
                      <p className="text-2xl font-bold text-[#0b6d41]">0</p>
                      <p className="text-xs text-muted-foreground">No at-risk Learners detected</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4">
                      <p className="text-2xl font-bold text-amber-600">{atRiskLearners.length}</p>
                      <p className="text-xs text-muted-foreground">Learners need attention</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV('overview')}
                disabled={exportingReport === 'overview'}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingReport === 'overview' ? 'Preparing CSV…' : 'Export Overview CSV'}
              </Button>
            </div>
          </TabsContent>

          {/* Time on Task Tab */}
          <TabsContent value="time" className="space-y-4">
            <Card className="bg-[#fbfbee]/30 dark:bg-card">
              <CardHeader>
                <CardTitle className="text-base">Time-on-Task Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16">
                  <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-medium mb-1">Time analytics coming soon</h3>
                  <p className="text-sm text-muted-foreground max-w-md text-center">
                    This chart will show how Learners distribute their time across lessons,
                    assessments, quests, and build sessions. Data populates as engagement
                    events are logged.
                  </p>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV('time-on-task')}
                disabled={exportingReport === 'time-on-task'}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingReport === 'time-on-task' ? 'Preparing CSV…' : 'Export Time Data CSV'}
              </Button>
            </div>
          </TabsContent>

          {/* Fink's Dimensions Tab */}
          <TabsContent value="finks" className="space-y-4">
            <Card className="bg-[#fbfbee]/30 dark:bg-card">
              <CardHeader>
                <CardTitle className="text-base">Assessment Performance by Fink&apos;s Dimension</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {FINK_DIMENSIONS.map((dim) => (
                    <div key={dim.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{dim.label}</span>
                        <span className="text-muted-foreground">No data yet</span>
                      </div>
                      <Progress value={0} className="h-2" />
                    </div>
                  ))}
                </div>
                <Separator className="my-6" />
                <p className="text-sm text-muted-foreground text-center">
                  Assessment results will be mapped to Fink&apos;s Taxonomy dimensions to show
                  which areas of significant learning Learners are excelling in or struggling with.
                </p>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV('finks-dimensions')}
                disabled={exportingReport === 'finks-dimensions'}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingReport === 'finks-dimensions' ? 'Preparing CSV…' : 'Export Fink&apos;s Data CSV'}
              </Button>
            </div>
          </TabsContent>

          {/* Top/Bottom Performers Tab */}
          <TabsContent value="performers" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-[#fbfbee]/30 dark:bg-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#0b6d41]" />
                    Top Performers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-8">
                    <Trophy className="h-10 w-10 text-[#ffde59]/60 mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      Top performing Learners will be highlighted here based on
                      engagement scores and assessment results.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#fbfbee]/30 dark:bg-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-amber-500" />
                    Needs Attention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAtRisk ? (
                    <div className="flex justify-center py-4">
                      <BeatLoader color="#0b6d41" size={8} />
                    </div>
                  ) : !atRiskLearners || atRiskLearners.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <Users className="h-10 w-10 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        No at-risk Learners detected. All Learners are on track.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {atRiskLearners.slice(0, 5).map((learner: PDEAtRiskLearner, idx: number) => (
                        <div key={learner.learner_id || idx} className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/20">
                          <span className="text-sm font-medium">{learner.full_name || `Learner ${idx + 1}`}</span>
                          <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700">
                            At Risk
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV('performers')}
                disabled={exportingReport === 'performers'}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingReport === 'performers' ? 'Preparing CSV…' : 'Export Performers CSV'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function FacultyAnalyticsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <FacultyAnalyticsPageInner />
    </Suspense>
  );
}
