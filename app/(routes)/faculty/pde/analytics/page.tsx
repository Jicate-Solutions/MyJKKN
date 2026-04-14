'use client';

import { useState } from 'react';
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

export default function FacultyAnalyticsPage() {
  const { profile: user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: coursesData, isLoading: loadingCourses } = useVACCourses();
  const { data: atRiskLearners, isLoading: loadingAtRisk } = useAtRiskLearners(
    selectedCourseId || undefined
  );

  const courses = coursesData?.data || [];

  const handleExportCSV = (reportType: string) => {
    // CSV export placeholder - will trigger download when backend supports it
    const csvContent = `Report: ${reportType}\nGenerated: ${new Date().toISOString()}\nCourse: ${selectedCourseId || 'All'}\n\nNo data available yet.`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pde-${reportType}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ContentLayout title="PDE Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/faculty/pde/dashboard' },
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

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
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
              >
                <Download className="h-4 w-4 mr-2" />
                Export Overview CSV
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
              >
                <Download className="h-4 w-4 mr-2" />
                Export Time Data CSV
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
              >
                <Download className="h-4 w-4 mr-2" />
                Export Fink&apos;s Data CSV
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
                      {atRiskLearners.slice(0, 5).map((learner: { id: string; name?: string; risk_score?: number }, idx: number) => (
                        <div key={learner.id || idx} className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/20">
                          <span className="text-sm font-medium">{learner.name || `Learner ${idx + 1}`}</span>
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
              >
                <Download className="h-4 w-4 mr-2" />
                Export Performers CSV
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
