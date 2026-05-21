'use client';

import {
  AlertCircle,
  Building2,
  RefreshCw,
  Users,
  HelpCircle,
  Send,
  Landmark,
  BookmarkCheck,
  GraduationCap,
  XCircle,
  LayoutGrid,
  Gauge,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupDashboard, useSeatAnalytics, groupDashboardKeys } from '@/hooks/admission/use-group-dashboard';
import { admissionAccreditationKeys } from '@/hooks/admission/use-admission-accreditation-report';
import { InstitutionComparisonTable } from './_components/institution-comparison-table';
import { GroupFunnelChart, InstitutionPerformanceChart } from './_components/overview-charts';
import { SeatAnalyticsDashboard } from './_components/seat-analytics-dashboard';
import { SourceAnalyticsTab } from './_components/source-analytics-tab';
import { GeographyAnalyticsTab } from './_components/geography-analytics-tab';
import { InstitutionComparisonAdvanced } from './_components/institution-comparison-advanced';
import { NAACReportGenerator } from './_components/naac-report-generator';
import { GroupAdmissionYearSelect } from './_components/group-admission-year-select';
// 2026-05-20: SeatFilledCard removed from the top strip. The new "Admitted"
// KPI (lifecycle_status IN admitted+active) now covers the seat-filled signal.
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
 *
 * 2026-05-20: Reworked to follow the new lifecycle workflow (enquiry →
 * enquiry_submitted → account → reserved → admitted → active). The legacy
 * 'applied' + 'filled' (Enrolled Leads) cards came from
 * admission_leads.funnel_stage; the new lifecycle cards come from
 * learners_profiles.lifecycle_status — the post-workflow source of truth.
 *
 * 'admitted_active' is special: it counts learners_profiles where
 * lifecycle_status IN ('admitted', 'active'). Per spec, anyone currently
 * 'active' previously passed through 'admitted' (sequential gates in the
 * payment-driven RPC), so we sum both for the headline KPI.
 */
// 2026-05-21: each card now carries an icon + tone for visual identity.
// Tones mirror the lifecycle palette used by enquiry status badges +
// billing schedule badges (amber=account, purple=reserved, etc) so the
// dashboard echoes the colour vocabulary users already learned. The three
// non-lifecycle metrics (Total Leads / Total Seats / Fill Rate) get
// distinct hues (indigo / blue / cyan).
type CardTone = {
  /** Tailwind classes for the icon disc background + foreground colour. */
  disc: string;
  /** Tailwind classes for the card's coloured left-border accent. */
  accent: string;
  /** Tailwind classes for the subtle gradient background overlay. */
  bg: string;
  /** Tailwind class for the value text colour. */
  value: string;
};

const TONES: Record<string, CardTone> = {
  indigo:  { disc: 'bg-indigo-100  text-indigo-700',  accent: 'border-l-indigo-400',  bg: 'from-indigo-50/60 to-transparent',  value: 'text-indigo-900' },
  slate:   { disc: 'bg-slate-100   text-slate-700',   accent: 'border-l-slate-400',   bg: 'from-slate-50/60 to-transparent',   value: 'text-slate-900' },
  sky:     { disc: 'bg-sky-100     text-sky-700',     accent: 'border-l-sky-400',     bg: 'from-sky-50/60 to-transparent',     value: 'text-sky-900' },
  amber:   { disc: 'bg-amber-100   text-amber-800',   accent: 'border-l-amber-400',   bg: 'from-amber-50/60 to-transparent',   value: 'text-amber-900' },
  purple:  { disc: 'bg-purple-100  text-purple-700',  accent: 'border-l-purple-400',  bg: 'from-purple-50/60 to-transparent',  value: 'text-purple-900' },
  emerald: { disc: 'bg-emerald-100 text-emerald-700', accent: 'border-l-emerald-500', bg: 'from-emerald-50/60 to-transparent', value: 'text-emerald-900' },
  rose:    { disc: 'bg-rose-100    text-rose-700',    accent: 'border-l-rose-400',    bg: 'from-rose-50/60 to-transparent',    value: 'text-rose-900' },
  blue:    { disc: 'bg-blue-100    text-blue-700',    accent: 'border-l-blue-400',    bg: 'from-blue-50/60 to-transparent',    value: 'text-blue-900' },
  cyan:    { disc: 'bg-cyan-100    text-cyan-700',    accent: 'border-l-cyan-400',    bg: 'from-cyan-50/60 to-transparent',    value: 'text-cyan-900' },
};

const TOP_CARDS: ReadonlyArray<{
  label: string;
  metric: DrilldownMetric;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  tooltip?: string;
}> = [
  { label: 'Total Leads',       metric: 'total_leads',         icon: Users,          tone: 'indigo'  },
  { label: 'Enquiry',           metric: 'enquiry',             icon: HelpCircle,     tone: 'slate'   },
  { label: 'Enquiry Submitted', metric: 'enquiry_submitted',   icon: Send,           tone: 'sky'     },
  { label: 'Account',           metric: 'account',             icon: Landmark,       tone: 'amber'   },
  { label: 'Reserved',          metric: 'reserved',            icon: BookmarkCheck,  tone: 'purple'  },
  { label: 'Admitted',          metric: 'admitted_active',     icon: GraduationCap,  tone: 'emerald', tooltip: 'Includes Active learners (admitted → active is sequential)' },
  { label: 'Rejected',          metric: 'rejected_lifecycle',  icon: XCircle,        tone: 'rose'    },
  { label: 'Total Seats',       metric: 'total_seats',         icon: LayoutGrid,     tone: 'blue'    },
  { label: 'Fill Rate',         metric: 'fill_rate',           icon: Gauge,          tone: 'cyan'    },
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

  // Top KPI strip is leads-sourced by default; on the Seats tab we re-source
  // Filled / Total Seats / Fill Rate from the seat_analytics RPC so the strip
  // and the inner tab can never disagree. useSeatAnalytics takes a *singular*
  // institutionId; passing undefined requests the all-institution rollup
  // (super-admin / multi-institution path).
  const singleInstitutionId =
    scopedInstitutionIds && scopedInstitutionIds.length === 1
      ? scopedInstitutionIds[0]
      : undefined;
  const { data: seatRows } = useSeatAnalytics(singleInstitutionId, selectedYear);
  const seatTotals = useMemo(() => {
    if (!seatRows || seatRows.length === 0) return null;
    let totalSeats = 0;
    let filledSeats = 0;
    for (const r of seatRows) {
      totalSeats += r.total_seats;
      filledSeats += Number(r.filled_seats);
    }
    return {
      totalSeats,
      filledSeats,
      fillPct: totalSeats > 0 ? Math.round((filledSeats / totalSeats) * 100) : 0,
    };
  }, [seatRows]);

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
    // 2026-05-20 lifecycle workflow KPIs
    enquiry: null,
    enquiry_submitted: null,
    account: null,
    reserved: null,
    admitted_active: null,
    rejected_lifecycle: null,
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
              {(() => {
                // On the Seats tab, Total Seats and Fill Rate switch to
                // seat-occupancy sourcing (same RPC the inner tab uses) so the
                // strip can't disagree with the table beneath it. Lifecycle
                // counts stay sourced from learners_profiles because they
                // describe the cohort regardless of which tab is active.
                const useSeatSource = activeTab === 'seats' && seatTotals !== null;
                const valueByMetric: Record<DrilldownMetric, string | number> = {
                  // Legacy funnel_stage KPIs kept in the type for back-compat
                  // but no longer rendered. The new TOP_CARDS uses lifecycle.
                  total_leads: data.totals.total_leads,
                  applied: data.totals.total_applied,
                  filled: data.totals.total_enrolled_leads ?? data.totals.total_filled,
                  rejected: data.totals.total_rejected,
                  total_seats: useSeatSource
                    ? seatTotals!.totalSeats || '—'
                    : data.totals.total_seats || '—',
                  fill_rate: useSeatSource
                    ? seatTotals!.totalSeats > 0
                      ? `${seatTotals!.fillPct}%`
                      : '—'
                    : data.totals.total_seats > 0
                      ? `${data.totals.overall_fill_percentage}%`
                      : '—',
                  // 2026-05-20 lifecycle-status workflow KPIs — primary headline metrics.
                  enquiry: data.totals.total_enquiry,
                  enquiry_submitted: data.totals.total_enquiry_submitted,
                  account: data.totals.total_account,
                  reserved: data.totals.total_reserved,
                  admitted_active: data.totals.total_admitted,
                  rejected_lifecycle: data.totals.total_rejected_lifecycle,
                  // unused on top row but typed-record needs values
                  seat_balance: '',
                  chart_bar: '',
                  comparison_row: '',
                };
                const nodes: ReactNode[] = [];
                TOP_CARDS.forEach((card) => {
                  const resolved = destinations[card.metric];
                  // Pre-resolution: render the card non-clickable (resolves in
                  // <100ms typically; cached on subsequent loads). Avoids
                  // dead-click race where Link has empty href.
                  const href = resolved
                    ? appendDashboardScope(resolved, selectedYear, scopedInstitutionIds)
                    : null;
                  const tone = TONES[card.tone];
                  const Icon = card.icon;
                  // 2026-05-21: redesigned card body — tinted icon disc on top
                  // (or left on wider layouts), big value, label below. Fixed
                  // min-h-[120px] for uniform size across the 9 cards. The
                  // gradient background + coloured left border deliver the
                  // attractive/colour requirement without overpowering the data.
                  const cardInner = (
                    <CardContent
                      className={`flex h-full min-h-[120px] flex-col justify-between gap-2 bg-gradient-to-br ${tone.bg} p-3`}
                      title={card.tooltip}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.disc} shadow-sm`}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                          {card.label}
                        </p>
                      </div>
                      <div className="mt-auto">
                        <p className={`text-2xl font-bold leading-tight ${tone.value} sm:text-3xl`}>
                          {valueByMetric[card.metric]}
                        </p>
                        {card.tooltip && (
                          <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground/70">
                            {card.tooltip}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  );
                  const cardClasses = `h-full overflow-hidden border-l-4 ${tone.accent}`;
                  if (!href) {
                    nodes.push(
                      <Card key={card.label} className={cardClasses} aria-busy="true">
                        {cardInner}
                      </Card>
                    );
                  } else {
                    nodes.push(
                      <Link
                        key={card.label}
                        href={href}
                        aria-label={`Drill down to ${card.label} (role: ${drilldownRole})`}
                        className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Card
                          className={`${cardClasses} cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/20`}
                        >
                          {cardInner}
                        </Card>
                      </Link>
                    );
                  }
                });
                return nodes;
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
              {/*
                Subtitle clarifies which cohort the numbers describe.
                Companion to the leads-only RPC rewrite (PR #847) — once that
                lands, every metric on this tab traces to admission_leads only.
                Direct-admission students who never entered the leads pipeline
                live on the Seat Analytics tab instead.
              */}
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Lead funnel</span> — this admission cycle's prospects walking through the CRM. Counts come from the leads pipeline only.
              </p>
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
            <TabsContent value="seats" className="space-y-4">
              {/*
                Subtitle clarifies which cohort the numbers describe — this tab
                is operational seat occupation across ALL admission paths
                (including legacy direct admissions that never touched the leads
                pipeline). The Filled count here will not match the Filled count
                on the Overview tab post-PR-#847 by design.
              */}
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Seat fills</span> — actual student enrollments across all admission paths, including legacy direct admissions.
              </p>
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
