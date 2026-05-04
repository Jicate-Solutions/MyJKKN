'use client';

import { AlertCircle, Building2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupDashboard, groupDashboardKeys } from '@/hooks/admission/use-group-dashboard';
import { admissionAccreditationKeys } from '@/hooks/admission/use-admission-accreditation-report';
import { InstitutionComparisonTable } from './_components/institution-comparison-table';
import { GroupFunnelChart, InstitutionPerformanceChart } from './_components/overview-charts';
import { SeatAnalyticsDashboard } from './_components/seat-analytics-dashboard';
import { SourceAnalyticsTab } from './_components/source-analytics-tab';
import { GeographyAnalyticsTab } from './_components/geography-analytics-tab';
import { InstitutionComparisonAdvanced } from './_components/institution-comparison-advanced';
import { NAACReportGenerator } from './_components/naac-report-generator';
import { GroupAdmissionYearSelect } from './_components/group-admission-year-select';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDashboardDrilldownDestination } from '@/lib/policies/get-policy-client';
import type { DrilldownMetric, DrilldownRole } from '@/lib/policies/dashboard-drilldown-keys';
import { appendDashboardScope } from '@/lib/dashboard/drilldown-scope';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/admission/analytics',
} as const;

const VALID_TABS = ['overview', 'seats', 'sources', 'geography', 'comparison'] as const;
type DashboardTab = (typeof VALID_TABS)[number];

/**
 * Map app-level role flags → DrilldownRole for the policy reader.
 * Director (super-admin / cross-institutional admission) gets the read-only
 * surface. Counselor gets call/whatsapp/update_status action buttons on the
 * destination list. Principal is the institution-scoped fallback.
 */
function resolveDrilldownRole(
  isSuperAdmin: boolean,
  isAdmissionGlobalUser: boolean,
  isCounselorUser: boolean
): DrilldownRole {
  if (isSuperAdmin || isAdmissionGlobalUser) return 'director';
  if (isCounselorUser) return 'counselor';
  return 'principal';
}

/**
 * Cards on the top stat row — paired in label-emit order with their
 * DrilldownMetric. Kept here so adding/reordering cards is one-touch.
 */
const TOP_CARDS: ReadonlyArray<{ label: string; metric: DrilldownMetric }> = [
  { label: 'Total Leads', metric: 'total_leads' },
  { label: 'Applied', metric: 'applied' },
  { label: 'Filled', metric: 'filled' },
  { label: 'Rejected', metric: 'rejected' },
  { label: 'Total Seats', metric: 'total_seats' },
  { label: 'Fill Rate', metric: 'fill_rate' },
];

export default function GroupDashboardPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { institutions: accessibleInstitutions, canAccessAllInstitutions } =
    useUserInstitutionAccess();
  const { isSuperAdmin, isAdmissionGlobalUser, isCounselorUser } = usePermissions();

  const scopedInstitutionIds = useMemo(() => {
    if (canAccessAllInstitutions) return undefined;
    return accessibleInstitutions.map((i) => i.institution_id);
  }, [canAccessAllInstitutions, accessibleInstitutions]);

  const drilldownRole = useMemo(
    () => resolveDrilldownRole(isSuperAdmin, isAdmissionGlobalUser, isCounselorUser),
    [isSuperAdmin, isAdmissionGlobalUser, isCounselorUser]
  );

  // ── URL state (year + tab) ────────────────────────────────────────────────
  // Year + tab live in the URL so middle-click → new tab restores the same
  // view, and browser back from a drill-down lands on the same tab+year.
  // See spec §3.4 + §4.3.
  const yearFromUrl = (() => {
    const raw = searchParams.get('ay');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();
  const tabFromUrl: DashboardTab = (() => {
    const raw = searchParams.get('tab');
    return (VALID_TABS as readonly string[]).includes(raw ?? '')
      ? (raw as DashboardTab)
      : 'overview';
  })();

  const [selectedYear, setSelectedYearState] = useState<number | null>(yearFromUrl);
  const [activeTab, setActiveTabState] = useState<DashboardTab>(tabFromUrl);

  // Sync state → URL (replace, not push, so the dashboard doesn't pollute history).
  const syncUrl = useCallback(
    (year: number | null, tab: DashboardTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (year !== null) sp.set('ay', String(year));
      else sp.delete('ay');
      sp.set('tab', tab);
      const qs = sp.toString();
      router.replace(`/admission/group-dashboard${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleYearChange = useCallback(
    (year: number | null) => {
      setSelectedYearState(year);
      syncUrl(year, activeTab);
    },
    [activeTab, syncUrl]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      const next = (VALID_TABS as readonly string[]).includes(tab)
        ? (tab as DashboardTab)
        : 'overview';
      setActiveTabState(next);
      syncUrl(selectedYear, next);
    },
    [selectedYear, syncUrl]
  );

  const { data, isLoading, isFetching, isError, error } = useGroupDashboard(
    scopedInstitutionIds,
    null,
    selectedYear
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: groupDashboardKeys.all });
    queryClient.invalidateQueries({ queryKey: admissionAccreditationKeys.all });
  };

  // ── Resolve drill-down destinations ──────────────────────────────────────
  // One state slot per metric in TOP_CARDS. Resolves async via the
  // platform_policies reader (60s in-memory cache inside the helper means
  // re-renders don't re-fetch). Fallbacks to the code default if the RPC fails.
  const [destinations, setDestinations] = useState<Record<DrilldownMetric, string | null>>({
    total_leads: null,
    applied: null,
    filled: null,
    rejected: null,
    total_seats: null,
    fill_rate: null,
    seat_balance: null,
    chart_bar: null,
    comparison_row: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        TOP_CARDS.map(async (c) => {
          const url = await getDashboardDrilldownDestination(c.metric);
          return [c.metric, url] as const;
        })
      );
      if (cancelled) return;
      setDestinations((prev) => {
        const next = { ...prev };
        for (const [m, u] of results) next[m] = u;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // drilldownRole is intentionally NOT a dep — destinations are role-agnostic.
    // The role only affects action_buttons on the destination, which the
    // destination page itself reads.
  }, []);

  if (isError) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Group Dashboard">
          <div className="p-6 mx-auto mt-12">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {(error as Error)?.message || 'Failed to load group dashboard.'}
              </AlertDescription>
            </Alert>
            <Button className="mt-4" onClick={handleRefresh}>Try Again</Button>
          </div>
        </ContentLayout>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Group Dashboard">
        <div className="p-4 sm:p-6 mx-auto space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Group Dashboard</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <div>
                <h1 className="text-xl font-bold">Group Dashboard</h1>
                <p className="text-xs text-muted-foreground">Cross-institution admission & seat analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GroupAdmissionYearSelect
                institutionIds={scopedInstitutionIds}
                value={selectedYear}
                onChange={handleYearChange}
              />
              <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Admission funnel summary — always visible, scoped to selected admission year.
            * Cards are clickable per spec §3.1 — destinations resolved from
            * platform_policies (`dashboard.drilldown.<metric>.destination`).
            * Click → drill-down list with year + institution scope appended.
            * Cards with value 0 or '—' remain clickable; the destination shows
            * an empty list with the metric-specific empty-state copy. */}
          {!isLoading && data?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(() => {
                const valueByMetric: Record<DrilldownMetric, string | number> = {
                  total_leads: data.totals.total_leads,
                  applied: data.totals.total_applied,
                  filled: data.totals.total_filled,
                  rejected: data.totals.total_rejected,
                  total_seats: data.totals.total_seats || '—',
                  fill_rate:
                    data.totals.total_seats > 0
                      ? `${data.totals.overall_fill_percentage}%`
                      : '—',
                  // unused on top row but typed-record needs values
                  seat_balance: '',
                  chart_bar: '',
                  comparison_row: '',
                };
                return TOP_CARDS.map((card) => {
                  const resolved = destinations[card.metric];
                  // Pre-resolution: render the card non-clickable (resolves in
                  // <100ms typically; cached on subsequent loads). Avoids
                  // dead-click race where Link has empty href.
                  const href = resolved
                    ? appendDashboardScope(resolved, selectedYear, scopedInstitutionIds)
                    : null;
                  const cardInner = (
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-lg font-bold">{valueByMetric[card.metric]}</p>
                    </CardContent>
                  );
                  if (!href) {
                    return (
                      <Card key={card.label} aria-busy="true">
                        {cardInner}
                      </Card>
                    );
                  }
                  return (
                    <Link
                      key={card.label}
                      href={href}
                      aria-label={`Drill down to ${card.label} (role: ${drilldownRole})`}
                      className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Card className="cursor-pointer transition hover:ring-1 hover:ring-primary/20 hover:shadow-sm">
                        {cardInner}
                      </Card>
                    </Link>
                  );
                });
              })()}
            </div>
          )}

          {/* Main tabs */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="h-9 flex-wrap">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="seats" className="text-xs">Seat Analytics</TabsTrigger>
              <TabsTrigger value="sources" className="text-xs">Source Analytics</TabsTrigger>
              <TabsTrigger value="geography" className="text-xs">Geography</TabsTrigger>
              <TabsTrigger value="comparison" className="text-xs">Comparison</TabsTrigger>
            </TabsList>

            {/* Tab: Overview */}
            <TabsContent value="overview" className="space-y-4">
              {data && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <GroupFunnelChart data={data} />
                  <InstitutionPerformanceChart data={data} />
                </div>
              )}
              <InstitutionComparisonTable institutions={data?.institutions || []} />
              <NAACReportGenerator />
            </TabsContent>

            {/* Tab: Seat Analytics */}
            <TabsContent value="seats">
              <SeatAnalyticsDashboard
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>

            {/* Tab: Source Analytics */}
            <TabsContent value="sources">
              <SourceAnalyticsTab
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>

            {/* Tab: Geography */}
            <TabsContent value="geography">
              <GeographyAnalyticsTab
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>

            {/* Tab: Advanced Comparison */}
            <TabsContent value="comparison">
              <InstitutionComparisonAdvanced
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
              />
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
