'use client';

/**
 * Institution-wise leave provisioning analytics.
 *
 * COLOR — every value here was produced by the dataviz validator against this
 * app's own surfaces (light card #ffffff, dark card hsl(240 7% 8%) ≈ #131316),
 * not eyeballed:
 *
 *  - Magnitude charts (days by institution) use ONE hue — the JKKN brand green.
 *    Light hsl(150 78% 26%) = 5.69:1 on white. That same green is only 3.26:1 on
 *    the dark surface, so dark mode gets a SELECTED lighter step
 *    hsl(150 65% 38%) = 5.54:1. Dark is never an automatic flip of light.
 *  - Identity charts (leave-type mix) use a validated 6-slot categorical
 *    palette. Light: worst adjacent CVD ΔE 9.1, normal-vision ΔE 19.6.
 *    Dark: CVD ΔE 8.4, normal-vision ΔE 19.3, all ≥ 3:1 contrast.
 *    Three light slots fall under 3:1, which triggers the relief rule — this
 *    page discharges it with direct value labels AND the full detail table.
 *
 * The leave types' own `color_code` column is deliberately NOT used as the
 * palette: three of the six ship the identical default #6B7280, so identity
 * would collapse.
 */

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  CircleSlash,
  Info,
  Layers,
  RefreshCw,
  TriangleAlert,
  UserCheck,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import { cn, getErrorMessage } from '@/lib/utils';
import { useLeaveBalanceAnalytics } from '@/hooks/hr/use-hr-leave-types';
import type { HRLeaveInstitutionAnalytics } from '@/types/hr-leave-analytics';

import { BLOCKED, STATUS_META, fmt } from './coverage-status';

/** Validated categorical slots — see the file header for the measured figures. */
const SERIES = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
  { light: '#008300', dark: '#008300' },
] as const;

/** Single-hue brand green for magnitude. Dark step selected, not flipped. */
const BRAND = { light: 'hsl(150 78% 26%)', dark: 'hsl(150 65% 38%)' };

// Status vocabulary lives in coverage-status.ts — the Generate tab renders the
// same badges, and a second copy would drift.


/**
 * `year` is owned by the page, not by this component. Both tabs read the same
 * selection, so switching to Generate does not silently change which year you
 * are looking at — and the gaps listed here are the ones Generate preselects.
 * Null means "the year containing today", resolved inside the RPC.
 */
export function LeaveBalanceAnalytics({ year }: { year: string | null }) {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useLeaveBalanceAnalytics(year);

  // Memoized: a bare `?? []` mints a new array every render, which would
  // invalidate the useMemo blocks below on every pass.
  const institutions = useMemo(() => data?.institutions ?? [], [data?.institutions]);
  const totals = data?.totals;

  // Only institutions that actually provision days belong on the magnitude
  // chart; the zero-day orgs are the gap panel's job, not a row of empty bars.
  const byInstitution = useMemo(
    () =>
      institutions
        .filter((i) => i.entitled > 0)
        .map((i) => ({
          name: i.institution_name.replace(/^JKKN\s+/, ''),
          full: i.institution_name,
          days: Number(i.entitled),
          staff: i.staff_covered,
        })),
    [institutions]
  );

  const byType = useMemo(
    () =>
      (data?.leave_types ?? [])
        .filter((t) => t.entitled > 0)
        .map((t, idx) => ({
          name: t.name,
          code: t.code,
          days: Number(t.entitled),
          perHead: Number(t.default_days),
          // Cycle: an org with more than 6 active types would otherwise
          // reference an undefined --color-s6+ and render an unfilled bar.
          fill: `var(--color-s${idx % SERIES.length})`,
        })),
    [data?.leave_types]
  );

  const blocked = institutions.filter((i) => BLOCKED.includes(i.status));
  const pending = institutions.filter(
    (i) => i.status === 'not_generated' || i.status === 'partial'
  );

  const typeConfig = useMemo(() => {
    const cfg: ChartConfig = { days: { label: 'Days' } };
    SERIES.forEach((s, i) => {
      cfg[`s${i}`] = { label: byType[i]?.name ?? `Series ${i + 1}`, theme: s };
    });
    return cfg;
  }, [byType]);

  const instConfig: ChartConfig = { days: { label: 'Days provisioned', theme: BRAND } };

  if (isLoading) return <AnalyticsSkeleton />;

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load analytics</AlertTitle>
        {/* Supabase errors are plain objects, not Error instances. */}
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  const coverage = totals && totals.active_staff > 0
    ? Math.round((totals.staff_covered / totals.active_staff) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Controls (the year selector lives on the page) ────────── */}
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* ── KPI tiles: hero numbers, no plot ─────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<Layers className="h-4 w-4" />}
          label="Leave days provisioned"
          value={fmt(totals?.entitled ?? 0)}
          sub={`${fmt(totals?.balance_rows ?? 0)} balance rows`}
        />
        <Kpi
          icon={<UserCheck className="h-4 w-4" />}
          label="Team members covered"
          value={`${fmt(totals?.staff_covered ?? 0)} / ${fmt(totals?.active_staff ?? 0)}`}
          sub={`${coverage}% of active team members`}
          progress={coverage}
        />
        <Kpi
          icon={<Building2 className="h-4 w-4" />}
          label="Institutions covered"
          value={`${totals?.institutions_covered ?? 0} / ${totals?.institutions ?? 0}`}
          sub={
            blocked.length
              ? `${blocked.length} blocked by missing setup`
              : 'All institutions provisioned'
          }
        />
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Team members without balances"
          value={fmt(totals?.uncovered_staff ?? 0)}
          sub="Approving leave for these creates a negative balance"
          tone={totals && totals.uncovered_staff > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* ── Gap panel: the actionable part ───────────────────────── */}
      {(blocked.length > 0 || pending.length > 0) && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              Provisioning gaps
            </CardTitle>
            <CardDescription>
              Team members with no balance row get a permanently negative balance the first time
              leave is approved — the generator cannot repair it afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blocked.map((i) => (
              <GapRow key={i.org_id} inst={i} blocking />
            ))}
            {pending.map((i) => (
              <GapRow key={i.org_id} inst={i} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Charts ───────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leave days by institution</CardTitle>
            <CardDescription>
              Total entitlement days provisioned for {data?.year_name ?? 'the selected year'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byInstitution.length === 0 ? (
              <EmptyPlot message="No institution has provisioned days for this year yet." />
            ) : (
              <ChartContainer
                config={instConfig}
                className="aspect-auto w-full"
                style={{ height: Math.max(220, byInstitution.length * 34) }}
              >
                <BarChart
                  data={byInstitution}
                  layout="vertical"
                  margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="days" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={150}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelKey="full"
                        formatter={(v, _n, item) => (
                          <span className="text-xs">
                            <strong>{fmt(Number(v))}</strong> days ·{' '}
                            {fmt(item?.payload?.staff ?? 0)} staff
                          </span>
                        )}
                      />
                    }
                  />
                  {/* 4px rounded data-end anchored to the baseline. */}
                  <Bar dataKey="days" fill="var(--color-days)" radius={[0, 4, 4, 0]} barSize={18}>
                    {/* Direct labels — also discharges the light-mode relief rule. */}
                    <LabelList
                      dataKey="days"
                      position="right"
                      className="fill-foreground"
                      fontSize={11}
                      formatter={(v: number) => fmt(v)}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Entitlement mix by leave type</CardTitle>
            <CardDescription>
              How the {fmt(totals?.entitled ?? 0)} provisioned days split across types
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <EmptyPlot message="No leave types have provisioned days for this year." />
            ) : (
              <>
                <ChartContainer
                  config={typeConfig}
                  className="aspect-auto w-full"
                  style={{ height: Math.max(220, byType.length * 40) }}
                >
                  <BarChart
                    data={byType}
                    layout="vertical"
                    margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="days" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      width={140}
                      tick={{ fontSize: 12 }}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(v, _n, item) => (
                            <span className="text-xs">
                              <strong>{fmt(Number(v))}</strong> days total ·{' '}
                              {item?.payload?.perHead} per person
                            </span>
                          )}
                        />
                      }
                    />
                    <Bar dataKey="days" radius={[0, 4, 4, 0]} barSize={18}>
                      {byType.map((t) => (
                        <Cell key={t.code} fill={t.fill} />
                      ))}
                      <LabelList
                        dataKey="days"
                        position="right"
                        className="fill-foreground"
                        fontSize={11}
                        formatter={(v: number) => fmt(v)}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
                {/* Legend: identity is never carried by color alone. */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
                  {byType.map((t, i) => (
                    <span key={t.code} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ background: `var(--color-s${i})` }}
                      />
                      <span className="text-muted-foreground">
                        {t.name} · {t.perHead}d
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Utilization: activates automatically once approvals begin ── */}
      <UtilizationCard
        entitled={totals?.entitled ?? 0}
        used={totals?.used ?? 0}
        carried={totals?.carried ?? 0}
      />

      {/* ── Detail table — also the accessible view of both charts ──── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Institution detail</CardTitle>
          <CardDescription>
            Days per head is the sum of each organization&apos;s active leave type defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institution</TableHead>
                  <TableHead className="text-right">Team Members</TableHead>
                  <TableHead className="text-right">Covered</TableHead>
                  <TableHead className="text-right">Types</TableHead>
                  <TableHead className="text-right">Days / head</TableHead>
                  <TableHead className="text-right">Total days</TableHead>
                  {/* No per-row year column: one HR year covers every
                      institution, and it is already named in the switcher. */}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {institutions.map((i) => {
                  const meta = STATUS_META[i.status];
                  const pct =
                    i.active_staff > 0
                      ? Math.round((i.staff_covered / i.active_staff) * 100)
                      : 0;
                  return (
                    <TableRow key={i.org_id}>
                      <TableCell className="font-medium">{i.institution_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(i.active_staff)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <span className={cn(pct < 100 && 'text-amber-600 dark:text-amber-400')}>
                            {fmt(i.staff_covered)}
                          </span>
                          <Progress value={pct} className="h-1.5 w-12" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.active_types === 0 ? (
                          <span className="text-red-600 dark:text-red-400">0</span>
                        ) : (
                          i.active_types
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.days_per_head > 0 ? fmt(i.days_per_head) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {i.entitled > 0 ? fmt(i.entitled) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('font-normal', meta.tone)}
                          title={meta.hint}
                        >
                          {meta.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Cadre health: explains the generator's fallback message ── */}
      <CadreHealth
        withCadre={totals?.staff_with_cadre ?? 0}
        total={totals?.active_staff ?? 0}
      />
    </div>
  );
}

/* ────────────────────────── pieces ────────────────────────── */

function Kpi({
  icon, label, value, sub, progress, tone = 'ok',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  tone?: 'ok' | 'warn';
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={cn(tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>
            {icon}
          </span>
          {label}
        </div>
        <div
          className={cn(
            'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
            tone === 'warn' && 'text-amber-600 dark:text-amber-400'
          )}
        >
          {value}
        </div>
        {typeof progress === 'number' && <Progress value={progress} className="mt-2 h-1.5" />}
        {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function GapRow({
  inst, blocking = false,
}: {
  inst: HRLeaveInstitutionAnalytics;
  blocking?: boolean;
}) {
  const meta = STATUS_META[inst.status];
  const Icon = inst.status === 'no_types' ? CircleSlash : AlertTriangle;
  const missing = inst.active_staff - inst.staff_covered;

  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          blocking ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{inst.institution_name}</span>
          <Badge variant="outline" className={cn('font-normal', meta.tone)}>
            {meta.label}
          </Badge>
          {missing > 0 && (
            <span className="text-xs text-muted-foreground">
              {fmt(missing)} team members unprovisioned
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>
      </div>
    </div>
  );
}

function UtilizationCard({
  entitled, used, carried,
}: {
  entitled: number;
  used: number;
  carried: number;
}) {
  const available = entitled + carried;
  const pct = available > 0 ? Math.round((used / available) * 100) : 0;

  if (used === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leave utilization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-md border border-dashed p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No leave consumed yet</p>
              <p className="mt-0.5 text-xs">
                All {fmt(available)} provisioned days are unused. Utilization figures appear
                here automatically once leave applications start being approved.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Leave utilization</CardTitle>
        <CardDescription>
          {fmt(used)} of {fmt(available)} available days consumed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} className="h-2" />
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat label="Entitled" value={fmt(entitled)} />
          <Stat label="Carried forward" value={fmt(carried)} />
          <Stat label="Used" value={`${fmt(used)} (${pct}%)`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function CadreHealth({ withCadre, total }: { withCadre: number; total: number }) {
  const pct = total > 0 ? Math.round((withCadre / total) * 100) : 0;
  const none = withCadre === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cadre entitlement resolution</CardTitle>
        <CardDescription>
          Why the generator reports &ldquo;used the leave type default&rdquo;
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{fmt(withCadre)}</span>
          <span className="text-sm text-muted-foreground">
            of {fmt(total)} team members have a cadre assigned ({pct}%)
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
        {none && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              No team member has a cadre, so every balance falls back to the leave type&apos;s
              default entitlement. The generator lists all of them as
              &ldquo;no cadre assigned&rdquo; — that is the normal path here, not an error.
              Entitlements are effectively flat per institution.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyPlot({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed">
      <p className="max-w-xs text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
