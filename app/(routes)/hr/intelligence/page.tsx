'use client';

/**
 * HR Intelligence — Super-Module Container
 *
 * Single route `/hr/intelligence` with tabbed sections.
 * Recruitment Need Signal is tab 1 of 15 Tier A features.
 * Remaining tabs render "Coming Soon" placeholders until built.
 *
 * Spec: specs/hr-recruitment-need-signal-2026-05-24.md
 * Decision: HR Intelligence super-module, single route with tabbed sections.
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Brain,
  Users,
  BarChart3,
  TrendingUp,
  Target,
  ShieldAlert,
  GraduationCap,
  Clock,
  Award,
  Briefcase,
  LineChart,
  PieChart,
  Zap,
  FileSearch,
  Building,
  RefreshCw,
  ArrowLeftRight,
  History,
} from 'lucide-react';
import {
  useRecruitmentSignals,
  useComputeSignal,
  useSuppressions,
  useEscalations,
} from '@/hooks/hr/recruitment-need/use-recruitment-signal';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { SignalCard } from '@/components/hr/recruitment-need/signal-card';
import { SignalCardSkeleton } from '@/components/hr/recruitment-need/signal-card-skeleton';
import { EscalationQueue } from '@/components/hr/recruitment-need/escalation-queue';
import { ChangeTrackingBadge } from '@/components/hr/recruitment-need/change-tracking-badge';
import { ComparisonView } from '@/components/hr/recruitment-need/comparison-view';
import { YoYComparison } from '@/components/hr/recruitment-need/yoy-comparison';
import { OVERALL_STATUS_COLORS } from '@/components/hr/recruitment-need/signal-helpers';
import {
  BudgetVsActualsTab,
  TrainingBudgetTab,
  CompetencyMatrixTab,
  SkillsMatrixTab,
  TimesheetSummaryTab,
  ResourceUtilizationTab,
  CapacityPlanningTab,
  ComplianceReadinessTab,
  DiversityMetricsTab,
  EngagementPulseTab,
  RecruitmentAnalyticsTab,
  BenchStrengthTab,
  CrossInstitutionTab,
  PredictiveModelsTab,
} from '@/components/hr/intelligence';
import { MobileTabNav } from '@/components/hr/intelligence/mobile-tab-nav';
import { SetupWizardEnhanced } from '@/components/hr/intelligence/setup-wizard-enhanced';
import { SignalSummaryCard } from '@/components/hr/intelligence/signal-summary-card';
import type { OverallSignalStatus, SignalFilters } from '@/types/hr-recruitment-need';

const INTELLIGENCE_TABS = [
  { id: 'recruitment-need', label: 'Recruitment Need', icon: Users, ready: true },
  { id: 'budget-vs-actuals', label: 'Budget vs Actuals', icon: BarChart3, ready: true },
  { id: 'training-budget', label: 'Training Budget', icon: GraduationCap, ready: true },
  { id: 'competency-matrix', label: 'Competency Matrix', icon: Target, ready: true },
  { id: 'skills-matrix', label: 'Skills Matrix', icon: Award, ready: true },
  { id: 'timesheet-summary', label: 'Timesheet Summary', icon: Clock, ready: true },
  { id: 'resource-utilization', label: 'Utilization', icon: TrendingUp, ready: true },
  { id: 'capacity-planning', label: 'Capacity Planning', icon: Briefcase, ready: true },
  { id: 'compliance-readiness', label: 'Compliance', icon: FileSearch, ready: true },
  { id: 'diversity-metrics', label: 'Diversity', icon: PieChart, ready: true },
  { id: 'engagement-pulse', label: 'Engagement', icon: Zap, ready: true },
  { id: 'recruitment-analytics', label: 'Recruitment Analytics', icon: ShieldAlert, ready: true },
  { id: 'bench-strength', label: 'Bench Strength', icon: LineChart, ready: true },
  { id: 'cross-institution', label: 'Cross-Institution', icon: Building, ready: true },
  { id: 'predictive-models', label: 'Predictive Models', icon: Brain, ready: true },
] as const;

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'red', label: 'Critical' },
  { value: 'amber', label: 'Needs Attention' },
  { value: 'green', label: 'Healthy' },
  { value: 'blocked', label: 'Blocked' },
];

export default function HRIntelligencePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(
    searchParams.get('tab') ?? 'recruitment-need'
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  return (
    <ContentLayout title="HR Intelligence">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Intelligence</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* Mobile: dropdown selector */}
          <MobileTabNav
            tabs={INTELLIGENCE_TABS}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />

          {/* Desktop: horizontal tab strip */}
          <TabsList className="hidden md:flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {INTELLIGENCE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {!tab.ready && (
                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                      Soon
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="recruitment-need" className="mt-6">
            <RecruitmentNeedTab />
          </TabsContent>

          <TabsContent value="budget-vs-actuals" className="mt-6">
            <BudgetVsActualsTab />
          </TabsContent>

          <TabsContent value="training-budget" className="mt-6">
            <TrainingBudgetTab />
          </TabsContent>

          <TabsContent value="competency-matrix" className="mt-6">
            <CompetencyMatrixTab />
          </TabsContent>

          <TabsContent value="skills-matrix" className="mt-6">
            <SkillsMatrixTab />
          </TabsContent>

          <TabsContent value="timesheet-summary" className="mt-6">
            <TimesheetSummaryTab />
          </TabsContent>

          <TabsContent value="resource-utilization" className="mt-6">
            <ResourceUtilizationTab />
          </TabsContent>

          <TabsContent value="capacity-planning" className="mt-6">
            <CapacityPlanningTab />
          </TabsContent>

          <TabsContent value="compliance-readiness" className="mt-6">
            <ComplianceReadinessTab />
          </TabsContent>

          <TabsContent value="diversity-metrics" className="mt-6">
            <DiversityMetricsTab />
          </TabsContent>

          <TabsContent value="engagement-pulse" className="mt-6">
            <EngagementPulseTab />
          </TabsContent>

          <TabsContent value="recruitment-analytics" className="mt-6">
            <RecruitmentAnalyticsTab />
          </TabsContent>

          <TabsContent value="bench-strength" className="mt-6">
            <BenchStrengthTab />
          </TabsContent>

          <TabsContent value="cross-institution" className="mt-6">
            <CrossInstitutionTab />
          </TabsContent>

          <TabsContent value="predictive-models" className="mt-6">
            <PredictiveModelsTab />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

// ─── Recruitment Need Tab (full dashboard) ──────────────────────────────────────

function RecruitmentNeedTab() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Filters from URL + localStorage (SSR-safe)
  const [institutionFilter, setInstitutionFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    return searchParams.get('institution') ?? localStorage.getItem('rns-institution') ?? 'all';
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    return searchParams.get('status') ?? localStorage.getItem('rns-status') ?? 'all';
  });

  // Comparison mode
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const showComparison = compareIds.length === 2;

  // Year-over-Year mode
  const [showYoY, setShowYoY] = useState(false);

  // Build query filters
  const queryFilters: SignalFilters = {};
  if (institutionFilter !== 'all') queryFilters.institution_id = institutionFilter;
  if (statusFilter !== 'all') queryFilters.overall_status = statusFilter as OverallSignalStatus;

  // Queries
  const { data: signals, isLoading: signalsLoading, isError } = useRecruitmentSignals(queryFilters);
  const { data: suppressions } = useSuppressions();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });
  const computeSignal = useComputeSignal();

  // Build institution name lookup
  const institutionNames: Record<string, string> = {};
  institutions?.forEach((inst) => {
    institutionNames[inst.id] = inst.name;
  });

  // Build suppression lookup by institution_id
  const suppressionMap: Record<string, NonNullable<typeof suppressions>[number]> = {};
  suppressions?.forEach((s) => {
    if (s.is_active) suppressionMap[s.institution_id] = s;
  });

  // Persist filters to URL + localStorage
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (institutionFilter !== 'all') {
      params.set('institution', institutionFilter);
    } else {
      params.delete('institution');
    }
    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    } else {
      params.delete('status');
    }
    params.set('tab', 'recruitment-need');
    router.replace(`?${params.toString()}`, { scroll: false });

    if (typeof window !== 'undefined') {
      localStorage.setItem('rns-institution', institutionFilter);
      localStorage.setItem('rns-status', statusFilter);
    }
  }, [institutionFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCompareToggle(instId: string) {
    setCompareIds((prev) => {
      if (prev.includes(instId)) return prev.filter((id) => id !== instId);
      if (prev.length >= 2) return [prev[1], instId];
      return [...prev, instId];
    });
  }

  function handleForceRefresh() {
    if (institutionFilter !== 'all') {
      computeSignal.mutate({ institution_id: institutionFilter });
    }
  }

  const isEmpty = !signalsLoading && (!signals || signals.length === 0);

  return (
    <div className="space-y-4">
      {/* Dashboard header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Recruitment Need Signal
              </CardTitle>
              <CardDescription className="mt-1">
                Composite signal (0-100) from 7 inputs: sanctioned gap, SFR, specialization
                coverage, workload, projected intake, attrition pipeline, and peer benchmarks.
              </CardDescription>
            </div>
            <ChangeTrackingBadge />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder="All Institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions?.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {institutionFilter !== 'all' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={handleForceRefresh}
                disabled={computeSignal.isPending}
              >
                <RefreshCw className={`h-3 w-3 ${computeSignal.isPending ? 'animate-spin' : ''}`} />
                {computeSignal.isPending ? 'Computing...' : 'Refresh Signal'}
              </Button>
            )}

            <Button
              size="sm"
              variant={showYoY ? 'default' : 'outline'}
              className="h-8 text-xs gap-1.5"
              onClick={() => setShowYoY((v) => !v)}
            >
              <History className="h-3 w-3" />
              {showYoY ? 'Hide YoY' : 'Compare with Last AY'}
            </Button>

            {compareIds.length > 0 && !showComparison && (
              <Badge variant="secondary" className="text-xs gap-1">
                <ArrowLeftRight className="h-3 w-3" />
                {compareIds.length}/2 selected
              </Badge>
            )}

            {!signalsLoading && signals && signals.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                {(['red', 'amber', 'green', 'blocked'] as const).map((st) => {
                  const count = signals.filter((s) => s.overall_status === st).length;
                  if (count === 0) return null;
                  const colors = OVERALL_STATUS_COLORS[st];
                  return (
                    <Badge
                      key={st}
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${colors.text} ${colors.border}`}
                    >
                      {count} {colors.label}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showComparison && (
        <ComparisonView
          institutionIds={compareIds as [string, string]}
          institutionNames={institutionNames}
          onClose={() => setCompareIds([])}
        />
      )}

      {showYoY && signals && signals.length > 0 && (
        <YoYComparison signals={signals} />
      )}

      {isEmpty ? (
        <SetupWizardEnhanced />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Mobile: compact summary cards */}
          <div className="block md:hidden space-y-2">
            {signalsLoading ? (
              <SignalCardSkeleton count={4} />
            ) : isError ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Failed to load signals. Please try again.
                </CardContent>
              </Card>
            ) : (
              signals?.map((signal) => (
                <SignalSummaryCard
                  key={signal.id}
                  signal={signal}
                  institutionName={institutionNames[signal.institution_id]}
                />
              ))
            )}
          </div>

          {/* Desktop: full signal cards grid */}
          <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {signalsLoading ? (
              <SignalCardSkeleton count={6} />
            ) : isError ? (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Failed to load signals. Please try again.
                </CardContent>
              </Card>
            ) : (
              signals?.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  institutionName={institutionNames[signal.institution_id]}
                  suppression={suppressionMap[signal.institution_id]}
                  isSelected={compareIds.includes(signal.institution_id)}
                  onSelect={handleCompareToggle}
                />
              ))
            )}
          </div>

          <div className="space-y-4">
            <EscalationQueue />
          </div>
        </div>
      )}
    </div>
  );
}

function ComingSoonPlaceholder({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Icon className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm font-medium">Coming Soon</p>
          <p className="text-xs mt-1 opacity-75">
            This intelligence module is planned for a future sprint.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
