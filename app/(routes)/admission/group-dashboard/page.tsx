'use client';

import {
  AlertCircle,
  Building2,
  RefreshCw,
  Landmark,
  School,
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
import { EntityOverviewSection } from './_components/entity-overview-section';
import { TONES, LIFECYCLE_KPI_CARDS } from './_components/kpi-config';
import { SeatAnalyticsDashboard } from './_components/seat-analytics-dashboard';
import { SourceAnalyticsTab } from './_components/source-analytics-tab';
import { GeographyAnalyticsTab } from './_components/geography-analytics-tab';
import { InstitutionComparisonAdvanced } from './_components/institution-comparison-advanced';
import { NAACReportGenerator } from './_components/naac-report-generator';
import { GroupAdmissionYearSelect } from './_components/group-admission-year-select';
import { ArpsPaceOverview } from './_components/arps-pace-overview';
// 2026-05-20: SeatFilledCard removed from the top strip. The new "Admitted"
// KPI (lifecycle_status IN admitted+active) now covers the seat-filled signal.
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
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

const VALID_TABS = ['overview', 'seats', 'pace', 'sources', 'geography', 'comparison'] as const;
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
// Card tones + the lifecycle KPI card list live in ./_components/kpi-config so
// the page header strip and the per-entity Overview sections share one
// definition. (2026-06-17, when the Overview tab was split into Institution /
// School sections.)

// ──────────────────────────────────────────────────────────────────────────
// DateRangeFilter — segmented "All time / Today / Custom range" toggle.
// 2026-05-21: drives the Overview tab's optional date filter. Today mode
// pins from=to=current IST date so the dashboard always shows "today" in
// the operator's local timezone (the RPC already interprets dates in
// Asia/Kolkata).
// ──────────────────────────────────────────────────────────────────────────
function todayIsoIST(): string {
  // Get YYYY-MM-DD for today in IST regardless of the user's browser TZ.
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60_000);
  return ist.toISOString().slice(0, 10);
}

function DateRangeFilter({
  fromDate,
  toDate,
  onChange,
}: {
  fromDate: string | null;
  toDate: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const today = todayIsoIST();
  // Derive the active mode from the URL state alone — no separate state
  // needed; the URL is the single source of truth.
  const mode: 'all' | 'today' | 'custom' = (() => {
    if (!fromDate && !toDate) return 'all';
    if (fromDate === today && toDate === today) return 'today';
    return 'custom';
  })();

  const dateRangeValue: DateRange | undefined = (() => {
    if (!fromDate && !toDate) return undefined;
    return {
      from: fromDate ? new Date(`${fromDate}T00:00:00`) : undefined,
      to: toDate ? new Date(`${toDate}T00:00:00`) : undefined,
    };
  })();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
      <span className="ml-2 text-xs font-medium text-muted-foreground">Show:</span>
      {/* Segmented toggle */}
      <div className="inline-flex overflow-hidden rounded-md border bg-background">
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          aria-pressed={mode === 'all'}
        >
          All time
        </button>
        <button
          type="button"
          onClick={() => onChange(today, today)}
          className={`border-l px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'today' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          aria-pressed={mode === 'today'}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => {
            // When entering Custom from All/Today, seed the picker with
            // today's date so the calendar opens in a useful state. The
            // user can immediately pick a different range.
            if (mode !== 'custom') onChange(today, today);
          }}
          className={`border-l px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'custom' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          }`}
          aria-pressed={mode === 'custom'}
        >
          Custom range
        </button>
      </div>
      {/* Calendar appears only in Custom mode */}
      {mode === 'custom' && (
        <DatePickerWithRange
          value={dateRangeValue}
          onChange={(range) => {
            const fmt = (d: Date | undefined) =>
              d
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
                    d.getDate(),
                  ).padStart(2, '0')}`
                : null;
            // Single click = `from` set, `to` undefined → treat as a one-day
            // window for consistency with Today mode.
            const from = fmt(range?.from);
            const to = fmt(range?.to ?? range?.from);
            onChange(from, to);
          }}
          placeholder="Pick a range"
          className="w-auto"
        />
      )}
      {/* Helper hint shows the active range */}
      {mode !== 'all' && fromDate && toDate && (
        <span className="ml-1 text-xs text-muted-foreground">
          {fromDate === toDate ? `On ${fromDate}` : `${fromDate} → ${toDate}`}
        </span>
      )}
    </div>
  );
}

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
    // `ay` is this page's own param. `admission_year` is what
    // appendDashboardScope() emits, so a drill-down that lands back on this
    // dashboard (the Admitted KPI → ?tab=sources) carries its cohort through.
    // Without the alias the year would silently reset to the default cohort
    // and the drilled-into list would describe a different year than the card.
    const raw = searchParams.get('ay') ?? searchParams.get('admission_year');
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
  // 2026-05-21: optional date-range filter on the Overview tab. URL state
  // mirrors how ?ay= and ?tab= already work so middle-click + browser-back
  // restore the same view.
  const fromDateFromUrl = searchParams.get('from'); // ISO 'YYYY-MM-DD' or null
  const toDateFromUrl = searchParams.get('to');

  const [selectedYear, setSelectedYearState] = useState<number | null>(yearFromUrl);
  const [activeTab, setActiveTabState] = useState<DashboardTab>(tabFromUrl);
  const [fromDate, setFromDateState] = useState<string | null>(fromDateFromUrl);
  const [toDate, setToDateState] = useState<string | null>(toDateFromUrl);

  // Sync state → URL (replace, not push, so the dashboard doesn't pollute history).
  const syncUrl = useCallback(
    (
      year: number | null,
      tab: DashboardTab,
      from: string | null,
      to: string | null,
    ) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (year !== null) sp.set('ay', String(year));
      else sp.delete('ay');
      sp.set('tab', tab);
      if (from) sp.set('from', from);
      else sp.delete('from');
      if (to) sp.set('to', to);
      else sp.delete('to');
      const qs = sp.toString();
      router.replace(`/admission/group-dashboard${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleYearChange = useCallback(
    (year: number | null) => {
      setSelectedYearState(year);
      syncUrl(year, activeTab, fromDate, toDate);
    },
    [activeTab, fromDate, toDate, syncUrl]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      const next = (VALID_TABS as readonly string[]).includes(tab)
        ? (tab as DashboardTab)
        : 'overview';
      setActiveTabState(next);
      syncUrl(selectedYear, next, fromDate, toDate);
    },
    [selectedYear, fromDate, toDate, syncUrl]
  );

  // 2026-05-21: date-range handler. NULL on both = "All time" mode.
  // Today mode sets from=to=current IST date. Custom range sets both.
  const handleDateRangeChange = useCallback(
    (from: string | null, to: string | null) => {
      setFromDateState(from);
      setToDateState(to);
      syncUrl(selectedYear, activeTab, from, to);
    },
    [selectedYear, activeTab, syncUrl]
  );

  const { data, isLoading, isFetching, isError, error } = useGroupDashboard(
    scopedInstitutionIds,
    null,
    selectedYear,
    fromDate,
    toDate,
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
        LIFECYCLE_KPI_CARDS.map(async (c) => {
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
          {/* Combined KPI strip — shown on every tab EXCEPT Overview, where the
              per-entity Institution / School sections carry their own cards. */}
          {activeTab !== 'overview' && !isLoading && data?.totals && (
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
                LIFECYCLE_KPI_CARDS.forEach((card) => {
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
              <TabsTrigger value="pace" className="text-xs">Pace</TabsTrigger>
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
                <span className="font-medium text-foreground">Admissions by organisation</span> — split into Institutions and Schools below. Companies and admin offices are excluded. (Schools enrol learners directly, so their lead count is 0.)
              </p>

              {/* 2026-05-21: date-range segmented filter. Drives every KPI on
               *  the Overview tab via ?from / ?to URL params. NULL on both =
               *  cumulative (preserves prior behaviour). */}
              <DateRangeFilter
                fromDate={fromDate}
                toDate={toDate}
                onChange={handleDateRangeChange}
              />
              {/* 2026-06-17: Overview split into two independent sections by
                  organisation entity_type — Institutions first, then Schools.
                  company / admin_office are filtered out in the service. */}
              {data && (
                <div className="space-y-8">
                  <EntityOverviewSection
                    title="Institutions"
                    unitLabel="institution"
                    icon={Landmark}
                    rows={data.institutions.filter((i) => i.entity_type === 'institution')}
                    destinations={destinations}
                    drilldownRole={drilldownRole}
                    selectedYear={selectedYear}
                  />
                  <EntityOverviewSection
                    title="Schools"
                    unitLabel="school"
                    icon={School}
                    rows={data.institutions.filter((i) => i.entity_type === 'school')}
                    destinations={destinations}
                    drilldownRole={drilldownRole}
                    selectedYear={selectedYear}
                  />
                </div>
              )}
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

            {/* Tab: Pace (ARPS Phase 1 — Director-locked 2026-06-07) */}
            <TabsContent value="pace" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Admission Revenue Pace</span> — actual fill % vs the average of 2024 and 2025 same-day pace, per institution family. Alerts fire when the gap exceeds the stage threshold (10pp early, 15pp mid, 20pp late).
              </p>
              <ArpsPaceOverview />
            </TabsContent>

            {/* Tab: Source Analytics */}
            <TabsContent value="sources">
              {/* totalAdmittedAllPaths drives the attribution-coverage line.
                  The tab's own numbers are lead-anchored; this KPI is
                  profile-anchored, so passing it down lets the tab state how
                  much of the admitted cohort it can actually explain. */}
              <SourceAnalyticsTab
                institutionIds={scopedInstitutionIds}
                programStartYear={selectedYear}
                totalAdmittedAllPaths={data?.totals?.total_admitted ?? null}
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
