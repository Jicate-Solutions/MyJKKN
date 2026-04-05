'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Brain,
  ExternalLink,
  GraduationCap,
  LayoutGrid,
  Mail,
  Rocket,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAtRiskLearners, useQuests } from '@/hooks/pde/use-pde';
import type { CapabilityStatus, FinksDimension, PDEAtRiskLearner, RiskLevel } from '@/types/pde';

import { CapabilityHeatmap } from './_components/capability-heatmap';
import { FinksRadar } from './_components/finks-radar';
import { AgencyDistributionBar, AgencyTrendLine } from './_components/agency-distribution';

// ============================================
// Helper: untyped supabase (PDE tables not in generated types)
// ============================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient();

// ============================================
// Section 1: Overview Stats Hook
// ============================================

function useFacultyOverviewStats() {
  return useQuery({
    queryKey: ['pde', 'faculty-overview'],
    queryFn: async () => {
      const supabase = getSupabase();

      // Total enrolled learners (from quest enrollments)
      const { count: totalEnrolled } = await supabase
        .from('pde_quest_enrollments')
        .select('learner_id', { count: 'exact', head: true });

      // Active this week: learners with engagement in last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: activeRows } = await supabase
        .from('pde_engagement_daily')
        .select('learner_id')
        .gte('date', weekAgo.toISOString().split('T')[0]);
      const activeThisWeek = new Set(
        (activeRows || []).map((r: { learner_id: string }) => r.learner_id)
      ).size;

      // Avg completion %: from quest enrollments completed vs total
      const { count: completedEnrollments } = await supabase
        .from('pde_quest_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');
      const avgCompletion =
        totalEnrolled && totalEnrolled > 0
          ? Math.round(((completedEnrollments || 0) / totalEnrolled) * 100)
          : 0;

      // Avg engagement score (from daily aggregate)
      const { data: dailyAll } = await supabase
        .from('pde_engagement_daily')
        .select('learner_id, time_spent_minutes');
      const learnerTimes: Record<string, number> = {};
      for (const r of dailyAll || []) {
        learnerTimes[r.learner_id] =
          (learnerTimes[r.learner_id] || 0) + (r.time_spent_minutes || 0);
      }
      const learnerCount = Object.keys(learnerTimes).length;
      const avgEngagement =
        learnerCount > 0
          ? Math.round(
              Object.values(learnerTimes).reduce(
                (s, t) => s + Math.min(100, (t / 60) * 20 + 30),
                0
              ) / learnerCount
            )
          : 0;

      return {
        totalEnrolled: totalEnrolled || 0,
        activeThisWeek,
        avgCompletion,
        avgEngagement,
      };
    },
    staleTime: 60000,
  });
}

// ============================================
// Section 2: Quest Progress Hook
// ============================================

function useQuestProgress() {
  return useQuery({
    queryKey: ['pde', 'faculty-quest-progress'],
    queryFn: async () => {
      const supabase = getSupabase();

      // Get all quests
      const { data: quests } = await supabase
        .from('pde_quests')
        .select('id, title, status')
        .order('created_at', { ascending: false });

      // Get enrollment and submission counts per quest
      const { data: enrollments } = await supabase
        .from('pde_quest_enrollments')
        .select('quest_id, status');

      const { data: submissions } = await supabase
        .from('pde_quest_submissions')
        .select('quest_id');

      // Aggregate
      const questStats = (quests || []).map(
        (q: { id: string; title: string; status: string }) => {
          const qEnrollments = (enrollments || []).filter(
            (e: { quest_id: string }) => e.quest_id === q.id
          );
          const qSubmissions = (submissions || []).filter(
            (s: { quest_id: string }) => s.quest_id === q.id
          );
          const completed = qEnrollments.filter(
            (e: { status: string }) => e.status === 'completed'
          ).length;
          const total = qEnrollments.length;
          return {
            id: q.id,
            title: q.title,
            status: q.status,
            enrolled: total,
            submissions: qSubmissions.length,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          };
        }
      );

      return questStats;
    },
    staleTime: 60000,
  });
}

// ============================================
// Section 3: Capability Heat Map Hook
// ============================================

function useCapabilityHeatmapData() {
  return useQuery({
    queryKey: ['pde', 'faculty-capability-heatmap'],
    queryFn: async () => {
      const supabase = getSupabase();

      // Get all capabilities
      const { data: capabilities } = await supabase
        .from('pde_capabilities')
        .select('id, name, category')
        .order('category')
        .order('level')
        .order('name');

      // Get all learner capabilities with learner info
      const { data: learnerCaps } = await supabase
        .from('pde_learner_capabilities')
        .select(
          'learner_id, capability_id, status, learner:profiles!pde_learner_capabilities_learner_id_fkey(full_name)'
        );

      // Get at-risk info
      const { data: atRiskData } = await supabase
        .from('pde_at_risk_learners')
        .select('learner_id, risk_level');

      // Build risk map
      const riskMap: Record<string, string> = {};
      for (const r of atRiskData || []) {
        // Take worst risk across courses
        const existing = riskMap[r.learner_id];
        const order: Record<string, number> = {
          critical: 0,
          warning: 1,
          struggling: 2,
          on_track: 3,
        };
        if (!existing || (order[r.risk_level] ?? 4) < (order[existing] ?? 4)) {
          riskMap[r.learner_id] = r.risk_level;
        }
      }

      // Group by learner
      const learnerMap: Record<
        string,
        {
          learner_id: string;
          learner_name: string;
          risk_level?: string;
          capabilities: Record<
            string,
            { status: CapabilityStatus; capability_name: string }
          >;
        }
      > = {};

      for (const lc of learnerCaps || []) {
        if (!learnerMap[lc.learner_id]) {
          learnerMap[lc.learner_id] = {
            learner_id: lc.learner_id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            learner_name: (lc.learner as any)?.full_name || 'Unknown',
            risk_level: riskMap[lc.learner_id],
            capabilities: {},
          };
        }
        const capName =
          (capabilities || []).find(
            (c: { id: string }) => c.id === lc.capability_id
          )?.name || 'Unknown';
        learnerMap[lc.learner_id].capabilities[lc.capability_id] = {
          status: lc.status,
          capability_name: capName,
        };
      }

      return {
        learners: Object.values(learnerMap),
        capabilityNames: (capabilities || []).map(
          (c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          })
        ),
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================
// Section 4: Agency Index Hook
// ============================================

function useAgencyIndexData() {
  return useQuery({
    queryKey: ['pde', 'faculty-agency'],
    queryFn: async () => {
      const supabase = getSupabase();

      // Get all agency index records
      const { data: agencyRows } = await supabase
        .from('pde_agency_index')
        .select('learner_id, score, measured_at')
        .order('measured_at', { ascending: true });

      // Distribution: bucket into 5 levels
      // dependent: 0-20, guided: 21-40, collaborative: 41-60,
      // self_directed: 61-80, principal: 81-100
      const latestScores: Record<string, number> = {};
      for (const row of agencyRows || []) {
        latestScores[row.learner_id] = row.score; // last wins (sorted asc)
      }

      const distribution: Record<string, number> = {
        dependent: 0,
        guided: 0,
        collaborative: 0,
        self_directed: 0,
        principal: 0,
      };

      for (const score of Object.values(latestScores)) {
        if (score <= 20) distribution.dependent++;
        else if (score <= 40) distribution.guided++;
        else if (score <= 60) distribution.collaborative++;
        else if (score <= 80) distribution.self_directed++;
        else distribution.principal++;
      }

      // Trend: average score per week
      const weeklyAverages: Record<string, { sum: number; count: number }> = {};
      for (const row of agencyRows || []) {
        const date = new Date(row.measured_at);
        // Group by ISO week start (Monday)
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date);
        weekStart.setDate(diff);
        const key = weekStart.toISOString().split('T')[0];
        if (!weeklyAverages[key]) weeklyAverages[key] = { sum: 0, count: 0 };
        weeklyAverages[key].sum += row.score;
        weeklyAverages[key].count++;
      }

      const trend = Object.entries(weeklyAverages)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { sum, count }]) => ({
          date,
          average: Math.round(sum / count),
        }));

      // Count dependents for alert
      const dependentCount = distribution.dependent;

      return { distribution, trend, dependentCount };
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================
// Section 5: Assessment Performance Hook
// ============================================

function useAssessmentPerformance() {
  return useQuery({
    queryKey: ['pde', 'faculty-assessment-perf'],
    queryFn: async () => {
      const supabase = getSupabase();

      // Get all assessments with titles
      const { data: assessments } = await supabase
        .from('pde_assessments')
        .select('id, title, pass_threshold')
        .eq('is_active', true);

      // Get all submissions
      const { data: submissions } = await supabase
        .from('pde_submissions')
        .select('assessment_id, passed, final_score, answers')
        .not('completed_at', 'is', null);

      // Pass rates per assessment
      const passRates = (assessments || []).map(
        (a: { id: string; title: string; pass_threshold: number }) => {
          const aSubmissions = (submissions || []).filter(
            (s: { assessment_id: string }) => s.assessment_id === a.id
          );
          const passed = aSubmissions.filter(
            (s: { passed: boolean | null }) => s.passed === true
          ).length;
          const total = aSubmissions.length;
          return {
            title: a.title,
            passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
            total,
            passed,
          };
        }
      );

      // Most missed questions: count wrong answers across all submissions
      const questionErrors: Record<string, number> = {};
      for (const sub of submissions || []) {
        const answers = sub.answers || [];
        for (const ans of answers) {
          if (ans && !ans.is_correct) {
            questionErrors[ans.question_id] =
              (questionErrors[ans.question_id] || 0) + 1;
          }
        }
      }

      // Get top 10 missed question IDs
      const topMissed = Object.entries(questionErrors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      // Fetch question texts
      let missedQuestions: { question_text: string; miss_count: number }[] = [];
      if (topMissed.length > 0) {
        const ids = topMissed.map(([id]) => id);
        const { data: questions } = await supabase
          .from('pde_assessment_questions')
          .select('id, question_text')
          .in('id', ids);

        missedQuestions = topMissed.map(([id, count]) => {
          const q = (questions || []).find(
            (qq: { id: string }) => qq.id === id
          );
          return {
            question_text: q?.question_text || 'Unknown question',
            miss_count: count,
          };
        });
      }

      // Fink's dimension averages across all submissions
      const dimTotals: Record<string, { earned: number; total: number }> = {};
      for (const sub of submissions || []) {
        const answers = sub.answers || [];
        for (const ans of answers) {
          if (!ans) continue;
          // We don't have finks_dimension on answers directly;
          // use a simplified heuristic: count points
        }
      }

      // Get questions with finks dimensions and compute cohort average
      const { data: allQuestions } = await supabase
        .from('pde_assessment_questions')
        .select('id, finks_dimension, points');

      const qMap: Record<string, { dim: string; points: number }> = {};
      for (const q of allQuestions || []) {
        if (q.finks_dimension) {
          qMap[q.id] = { dim: q.finks_dimension, points: q.points || 1 };
        }
      }

      const finksTotals: Record<string, { earned: number; total: number }> = {};
      for (const sub of submissions || []) {
        const answers = sub.answers || [];
        for (const ans of answers) {
          if (!ans) continue;
          const qInfo = qMap[ans.question_id];
          if (!qInfo) continue;
          if (!finksTotals[qInfo.dim]) finksTotals[qInfo.dim] = { earned: 0, total: 0 };
          finksTotals[qInfo.dim].total += qInfo.points;
          finksTotals[qInfo.dim].earned += ans.points_earned || 0;
        }
      }

      const finksAvg: Record<string, number> = {};
      for (const [dim, { earned, total }] of Object.entries(finksTotals)) {
        finksAvg[dim] = total > 0 ? Math.round((earned / total) * 100) : 0;
      }

      return { passRates, missedQuestions, finksAvg };
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================
// Section 7: Impact Board Hook
// ============================================

function useImpactBoard() {
  return useQuery({
    queryKey: ['pde', 'faculty-impact'],
    queryFn: async () => {
      const supabase = getSupabase();

      // Solutions deployed: completed quest submissions
      const { count: solutionsDeployed } = await supabase
        .from('pde_quest_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('passed', true);

      // NIF submissions: quests marked nif_eligible + completed
      const { data: nifQuests } = await supabase
        .from('pde_quests')
        .select('id')
        .eq('nif_eligible', true);

      let nifSubmissions = 0;
      if (nifQuests && nifQuests.length > 0) {
        const nifIds = nifQuests.map((q: { id: string }) => q.id);
        const { count } = await supabase
          .from('pde_quest_submissions')
          .select('id', { count: 'exact', head: true })
          .in('quest_id', nifIds)
          .eq('passed', true);
        nifSubmissions = count || 0;
      }

      // Total certificates
      const { count: totalCertificates } = await supabase
        .from('pde_certificates')
        .select('id', { count: 'exact', head: true });

      // Communities served: count unique source_departments from completed quests
      const { data: completedQuests } = await supabase
        .from('pde_quests')
        .select('source_department')
        .eq('status', 'completed')
        .not('source_department', 'is', null);
      const communities = new Set(
        (completedQuests || []).map(
          (q: { source_department: string }) => q.source_department
        )
      ).size;

      return {
        solutionsDeployed: solutionsDeployed || 0,
        communities,
        nifSubmissions,
        totalCertificates: totalCertificates || 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================
// Shared Components
// ============================================

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  isLoading,
  className,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  isLoading?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32 mt-1" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function questStatusBadge(status: string) {
  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'outline' },
    open: { label: 'Open', variant: 'secondary' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'default' },
    archived: { label: 'Archived', variant: 'outline' },
  };
  const c = config[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function riskBadge(level: RiskLevel) {
  const config: Record<RiskLevel, { label: string; className: string }> = {
    critical: {
      label: 'Critical',
      className:
        'bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200',
    },
    warning: {
      label: 'Warning',
      className:
        'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200',
    },
    struggling: {
      label: 'Struggling',
      className:
        'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200',
    },
    on_track: {
      label: 'On Track',
      className:
        'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200',
    },
  };
  const c = config[level] || config.on_track;
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

// ============================================
// Main Page
// ============================================

export default function FacultyImpactDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  // Data hooks
  const { data: overview, isLoading: overviewLoading } = useFacultyOverviewStats();
  const { data: questProgress, isLoading: questLoading } = useQuestProgress();
  const { data: heatmapData, isLoading: heatmapLoading } = useCapabilityHeatmapData();
  const { data: agencyData, isLoading: agencyLoading } = useAgencyIndexData();
  const { data: assessmentData, isLoading: assessmentLoading } = useAssessmentPerformance();
  const { data: atRiskLearners, isLoading: atRiskLoading } = useAtRiskLearners();
  const { data: impact, isLoading: impactLoading } = useImpactBoard();

  // Sorted at-risk: critical first
  const sortedAtRisk = useMemo(() => {
    const riskOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      struggling: 2,
      on_track: 3,
    };
    return [...(atRiskLearners || [])].sort(
      (a, b) =>
        (riskOrder[a.risk_level] ?? 4) - (riskOrder[b.risk_level] ?? 4)
    );
  }, [atRiskLearners]);

  return (
    <ContentLayout title="Faculty Impact Dashboard">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/vac">PDE</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Faculty Impact Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0b6d41' }}>
            Faculty Impact Dashboard
          </h1>
          <p className="text-muted-foreground">
            Not &ldquo;who completed Lesson 7&rdquo; but &ldquo;who is building
            real things.&rdquo; Track capability, agency, and impact across your
            Learners.
          </p>
        </div>

        {/* ============================================ */}
        {/* Section 1: Overview Cards */}
        {/* ============================================ */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Enrolled"
            value={overview?.totalEnrolled ?? 0}
            description="Learners across your quests"
            icon={Users}
            isLoading={overviewLoading}
          />
          <StatCard
            title="Active This Week"
            value={overview?.activeThisWeek ?? 0}
            description="Logged in last 7 days"
            icon={Activity}
            isLoading={overviewLoading}
          />
          <StatCard
            title="Avg Completion"
            value={`${overview?.avgCompletion ?? 0}%`}
            description="Quest completion rate"
            icon={TrendingUp}
            isLoading={overviewLoading}
          />
          <StatCard
            title="Avg Engagement"
            value={`${overview?.avgEngagement ?? 0}/100`}
            description="Composite engagement score"
            icon={BarChart3}
            isLoading={overviewLoading}
          />
        </div>

        {/* ============================================ */}
        {/* Tabbed Sections */}
        {/* ============================================ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="overview" className="text-xs">
              <BookOpen className="h-3.5 w-3.5 mr-1" />
              Quests
            </TabsTrigger>
            <TabsTrigger value="capabilities" className="text-xs">
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
              Capabilities
            </TabsTrigger>
            <TabsTrigger value="agency" className="text-xs">
              <Brain className="h-3.5 w-3.5 mr-1" />
              Agency
            </TabsTrigger>
            <TabsTrigger value="assessments" className="text-xs">
              <GraduationCap className="h-3.5 w-3.5 mr-1" />
              Assessments
            </TabsTrigger>
            <TabsTrigger value="at-risk" className="text-xs">
              <ShieldAlert className="h-3.5 w-3.5 mr-1" />
              At-Risk
            </TabsTrigger>
            <TabsTrigger value="impact" className="text-xs">
              <Rocket className="h-3.5 w-3.5 mr-1" />
              Impact
            </TabsTrigger>
          </TabsList>

          {/* ============================================ */}
          {/* Tab: Quest Progress */}
          {/* ============================================ */}
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Quest Progress
                </CardTitle>
                <CardDescription>
                  Active quests, enrollment, and completion rates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {questLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : questProgress && questProgress.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quest</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Enrolled</TableHead>
                        <TableHead className="text-right">Submissions</TableHead>
                        <TableHead className="text-right">Completion</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questProgress.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {q.title}
                          </TableCell>
                          <TableCell>{questStatusBadge(q.status)}</TableCell>
                          <TableCell className="text-right">{q.enrolled}</TableCell>
                          <TableCell className="text-right">{q.submissions}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Progress
                                value={q.completionRate}
                                className="w-16 h-2"
                              />
                              <span className="text-sm w-10 text-right">
                                {q.completionRate}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link href={`/admin/pde/quests/${q.id}`}>
                              <Button variant="ghost" size="icon" title="View quest">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No quests found yet.</p>
                    <p className="text-sm">
                      Quests will appear here once created and Learners enroll.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================ */}
          {/* Tab: Capability Heat Map */}
          {/* ============================================ */}
          <TabsContent value="capabilities">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5" />
                  Capability Heat Map
                </CardTitle>
                <CardDescription>
                  Learner progress across all capabilities. Rows = Learners,
                  Columns = Capabilities.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CapabilityHeatmap
                  learners={heatmapData?.learners || []}
                  capabilityNames={heatmapData?.capabilityNames || []}
                  isLoading={heatmapLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================ */}
          {/* Tab: Agency Index */}
          {/* ============================================ */}
          <TabsContent value="agency">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Agency Level Distribution
                  </CardTitle>
                  <CardDescription>
                    How independently Learners direct their AI tools
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AgencyDistributionBar
                    distribution={agencyData?.distribution || {}}
                    isLoading={agencyLoading}
                  />
                  {agencyData && agencyData.dependentCount > 0 && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <p className="text-sm text-red-800 dark:text-red-200">
                          <span className="font-bold">
                            {agencyData.dependentCount}
                          </span>{' '}
                          Learner{agencyData.dependentCount !== 1 ? 's' : ''} at
                          &ldquo;Dependent&rdquo; level &mdash; intervention
                          needed.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Agency Index Trend
                  </CardTitle>
                  <CardDescription>
                    Average Agency Index over time (weekly)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AgencyTrendLine
                    data={agencyData?.trend || []}
                    isLoading={agencyLoading}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ============================================ */}
          {/* Tab: Assessment Performance */}
          {/* ============================================ */}
          <TabsContent value="assessments">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Pass Rates */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Assessment Pass Rates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {assessmentLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : assessmentData &&
                    assessmentData.passRates.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Assessment</TableHead>
                          <TableHead className="text-right">
                            Attempts
                          </TableHead>
                          <TableHead className="text-right">
                            Pass Rate
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessmentData.passRates.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {a.title}
                            </TableCell>
                            <TableCell className="text-right">
                              {a.total}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <Progress
                                  value={a.passRate}
                                  className="w-16 h-2"
                                />
                                <span
                                  className={`text-sm font-medium ${
                                    a.passRate < 50
                                      ? 'text-red-600'
                                      : a.passRate < 75
                                      ? 'text-yellow-600'
                                      : 'text-green-600'
                                  }`}
                                >
                                  {a.passRate}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      No assessment data available yet.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Fink's Radar + Missed Questions */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Fink&apos;s Taxonomy Balance
                    </CardTitle>
                    <CardDescription>
                      Cohort average across 6 Fink&apos;s dimensions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FinksRadar
                      data={assessmentData?.finksAvg || {}}
                      isLoading={assessmentLoading}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">
                      Most Missed Questions (Top 10)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {assessmentLoading ? (
                      <Skeleton className="h-20 w-full" />
                    ) : assessmentData &&
                      assessmentData.missedQuestions.length > 0 ? (
                      <div className="space-y-2">
                        {assessmentData.missedQuestions.map((q, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-sm"
                          >
                            <Badge
                              variant="outline"
                              className="shrink-0 bg-red-50 text-red-700 border-red-200 text-xs"
                            >
                              {q.miss_count}x
                            </Badge>
                            <span className="text-muted-foreground line-clamp-2">
                              {q.question_text}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No missed question data yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ============================================ */}
          {/* Tab: At-Risk Deep View */}
          {/* ============================================ */}
          <TabsContent value="at-risk">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                  At-Risk Learners
                </CardTitle>
                <CardDescription>
                  Learners needing attention based on inactivity, low scores, or
                  engagement patterns.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Summary badges */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm">
                      Critical:{' '}
                      {sortedAtRisk.filter(
                        (l) => l.risk_level === 'critical'
                      ).length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="text-sm">
                      Warning:{' '}
                      {sortedAtRisk.filter(
                        (l) => l.risk_level === 'warning'
                      ).length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-sm">
                      Struggling:{' '}
                      {sortedAtRisk.filter(
                        (l) => l.risk_level === 'struggling'
                      ).length}
                    </span>
                  </div>
                </div>

                {atRiskLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : sortedAtRisk.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">
                          Days Inactive
                        </TableHead>
                        <TableHead className="text-right">Avg Score</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAtRisk.map((learner) => (
                        <TableRow
                          key={`${learner.learner_id}-${learner.course_id}`}
                        >
                          <TableCell className="font-medium">
                            {learner.full_name || 'Unknown'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {learner.email || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                learner.days_inactive > 7
                                  ? 'font-bold text-red-600'
                                  : learner.days_inactive > 3
                                  ? 'font-medium text-yellow-600'
                                  : ''
                              }
                            >
                              {learner.days_inactive}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {learner.avg_score !== null
                              ? `${Math.round(learner.avg_score)}%`
                              : '-'}
                          </TableCell>
                          <TableCell>{riskBadge(learner.risk_level)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                title="Send encouragement nudge"
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Nudge
                              </Button>
                              <Link
                                href={`/vac/progress?user=${learner.learner_id}`}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="View progress"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No at-risk Learners found.</p>
                    <p className="text-sm">
                      All active Learners are on track. Great news!
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================ */}
          {/* Tab: Impact Board */}
          {/* ============================================ */}
          <TabsContent value="impact">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Solutions Deployed"
                value={impact?.solutionsDeployed ?? 0}
                description="Passed quest submissions"
                icon={Rocket}
                isLoading={impactLoading}
                className="border-[#0b6d41]/30"
              />
              <StatCard
                title="Communities Served"
                value={impact?.communities ?? 0}
                description="Unique departments / partners"
                icon={Users}
                isLoading={impactLoading}
                className="border-[#0b6d41]/30"
              />
              <StatCard
                title="NIF Submissions"
                value={impact?.nifSubmissions ?? 0}
                description="Innovation forum eligible"
                icon={Award}
                isLoading={impactLoading}
                className="border-[#ffde59]/50"
              />
              <StatCard
                title="Certificates Issued"
                value={impact?.totalCertificates ?? 0}
                description="Verified completions"
                icon={GraduationCap}
                isLoading={impactLoading}
                className="border-[#ffde59]/50"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
