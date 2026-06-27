'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCampusLivingOverview, useResidentDemographics } from '@/hooks/campus-living/use-campus-living-dashboard';
import { useAttendanceTrend } from '@/hooks/campus-living/use-campus-living-analytics';
import { useCurrentHostelYear, useActiveHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { useHostelYearBillStats } from '@/hooks/campus-living/use-hostel-bill-generation';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Building2, Users, BedDouble, Wrench, ShieldAlert, DoorOpen, ArrowRight, Loader2,
  AlertTriangle, UserCheck, Percent, CalendarOff, Flag, ClipboardCheck, UtensilsCrossed,
  Wallet, TrendingUp, BadgeCheck, UserX, BarChart3,
} from 'lucide-react';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

export default function CampusLivingManagementDashboardPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const { data, isLoading, error } = useCampusLivingOverview(institutionId);
  const { data: demo } = useResidentDemographics(institutionId);

  // Attendance 30-day trend (reuses the analytics service's daily aggregation).
  const dateFrom = useMemo(() => isoDaysAgo(29), []);
  const dateTo = useMemo(() => new Date().toISOString().split('T')[0], []);
  const { data: trend = [] } = useAttendanceTrend(institutionId, dateFrom, dateTo);

  // Fee & billing — defaults to the current hostel year, with a selector.
  const { currentYear } = useCurrentHostelYear();
  const { hostelYears } = useActiveHostelYears();
  const [feeYearId, setFeeYearId] = useState<string | null>(null);
  const effectiveFeeYear = feeYearId ?? currentYear?.id ?? null;
  const { data: billStats, isLoading: feeLoading, error: feeError } = useHostelYearBillStats(effectiveFeeYear);

  if (isLoading) {
    return (
      <ContentLayout title="Management Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const o = data?.occupancy;
  const att = data?.attendance_today;
  const blocks = o?.blocks ?? [];

  // ── Exact allocation counts (from allocation_summary, not mixed sources) ──
  const alloc = data?.allocation_summary;
  const totalHostelites = alloc?.total_hostelites ?? 0;   // all in hostel system
  const allocatedCount  = alloc?.allocated ?? 0;          // active bed right now
  const notAllocated    = alloc?.not_allocated ?? 0;      // in system, no bed yet

  const totalCapacity = o?.total_capacity ?? 0;
  const availableBeds = Math.max(totalCapacity - allocatedCount, 0);
  const occupancyPct = o?.percentage ?? 0;
  const waitlisted = data?.waitlist?.pending ?? 0;

  const attendancePct =
    att && att.present + att.absent + att.on_leave > 0
      ? Math.round((att.present / (att.present + att.absent + att.on_leave)) * 100)
      : 0;

  const criticalMaintenance = data?.maintenance.critical ?? 0;
  const pendingLeaveRequests = data?.leaves.pending_approval ?? 0;
  const overdueGatePasses = data?.gate_passes.overdue ?? 0;
  const activeIncidents = data?.incidents.active ?? 0;

  const trendChart = trend.map((t) => ({
    date: t.date.slice(5), // MM-DD
    Attendance: t.attendance_percentage,
  }));

  const billedCount = billStats?.billed ?? 0;
  const notBilledCount = billStats?.not_billed ?? 0;
  const collected = billStats ? billStats.total_amount - billStats.outstanding_amount : 0;
  const collectedPct =
    billStats && billStats.total_amount > 0
      ? Math.round((collected / billStats.total_amount) * 100) : 0;

  return (
    <ContentLayout title="Management Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Dashboard' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Management Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Executive analytics: occupancy, demographics, fee collection, attendance trends and flagged cases.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/reports"><ClipboardCheck className="mr-2 h-4 w-4" /> Reports</Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living"><ArrowRight className="mr-2 h-4 w-4" /> Operational View</Link>
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="py-4 text-sm text-destructive">Failed to load dashboard data. Please refresh.</CardContent>
          </Card>
        )}

        {/* ── Section 1: Exact Allocation Counts ──────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Resident Allocation Overview
          </p>

          {/* Allocation bar — visual split of total hostelites */}
          {totalHostelites > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{allocatedCount.toLocaleString()} allocated</span>
                <span className="font-medium">{totalHostelites.toLocaleString()} total hostelites</span>
                <span>{notAllocated.toLocaleString()} without bed</span>
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${Math.round((allocatedCount / totalHostelites) * 100)}%` }}
                />
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{ width: `${Math.round((notAllocated / totalHostelites) * 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Allocated</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Not allocated</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Hostelites */}
            <Card className="border-0 bg-blue-50 dark:bg-blue-950/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">Total Hostelites</p>
                  <Users className="h-5 w-5 text-blue-600 opacity-80" />
                </div>
                <div className="text-3xl font-bold text-blue-600">{totalHostelites.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">All students in hostel system</p>
              </CardContent>
            </Card>

            {/* Allocated */}
            <Card className="border-0 bg-green-50 dark:bg-green-950/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">Allocated</p>
                  <BadgeCheck className="h-5 w-5 text-green-600 opacity-80" />
                </div>
                <div className="text-3xl font-bold text-green-600">{allocatedCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active bed assignment
                  {totalHostelites > 0 && (
                    <span className="ml-1 text-green-700 font-medium">
                      ({Math.round((allocatedCount / totalHostelites) * 100)}%)
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Not Allocated */}
            <Card className={`border-0 ${notAllocated > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">Not Allocated</p>
                  <UserX className={`h-5 w-5 opacity-80 ${notAllocated > 0 ? 'text-amber-600' : 'text-green-600'}`} />
                </div>
                <div className={`text-3xl font-bold ${notAllocated > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {notAllocated.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {notAllocated > 0 ? `No bed yet · ${waitlisted} on waitlist` : 'All hostelites have a bed'}
                </p>
              </CardContent>
            </Card>

            {/* Available Beds (capacity-based) */}
            <Card className={`border-0 ${availableBeds === 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/40'}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">Available Beds</p>
                  <BedDouble className={`h-5 w-5 opacity-80 ${availableBeds === 0 ? 'text-red-600' : 'text-blue-600'}`} />
                </div>
                <div className={`text-3xl font-bold ${availableBeds === 0 ? 'text-red-600' : 'text-blue-600'}`}>
                  {availableBeds.toLocaleString()}
                </div>
                <div className="h-1.5 w-full bg-background/60 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${occupancyPct >= 95 ? 'bg-red-500' : occupancyPct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${occupancyPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{occupancyPct}% of {totalCapacity.toLocaleString()} beds used</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Section 2: Operational KPIs (4 tiles) ────────────────── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Operational Status
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Attendance Today</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendancePct}%</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {att?.present ?? 0} present · {att?.absent ?? 0} absent · {att?.on_leave ?? 0} on leave
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Pending Maintenance</CardTitle>
                <Wrench className={`h-4 w-4 ${criticalMaintenance > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.maintenance.pending ?? 0}</div>
                <p className={`text-xs mt-0.5 flex items-center gap-1 ${criticalMaintenance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {criticalMaintenance > 0 && <AlertTriangle className="h-3 w-3" />}
                  {criticalMaintenance > 0 ? `${criticalMaintenance} critical` : 'No critical tickets'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
                <ShieldAlert className={`h-4 w-4 ${activeIncidents > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeIncidents}</div>
                <p className="text-xs text-muted-foreground mt-0.5">Open safety incidents</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
                <CalendarOff className={`h-4 w-4 ${pendingLeaveRequests > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingLeaveRequests}</div>
                <p className={`text-xs mt-0.5 ${overdueGatePasses > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {overdueGatePasses > 0 ? `${overdueGatePasses} overdue gate passes` : 'No overdue gate passes'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Section 3: Block-wise Comprehensive Summary ───────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Block-wise Summary
              </CardTitle>
              <CardDescription>
                Residents allocated, capacity, available beds, and occupancy per hostel block
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/blocks">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {blocks.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] bg-muted/30 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">No hostel blocks configured</p>
              </div>
            ) : (
              <div className="space-y-0">
                {/* Desktop header */}
                <div className="hidden md:grid md:grid-cols-[1.5fr_90px_90px_90px_90px_160px] gap-3 px-3 py-2 text-xs text-muted-foreground font-medium border-b">
                  <span>Block</span>
                  <span className="text-right">Residents</span>
                  <span className="text-right">Capacity</span>
                  <span className="text-right">Available</span>
                  <span className="text-right">Occ. %</span>
                  <span className="text-right">Occupancy Bar</span>
                </div>

                {blocks.map((block) => {
                  const avail = Math.max(block.capacity - block.occupancy, 0);
                  const pct = block.percentage;
                  const barColor =
                    pct >= 95 ? 'bg-red-500' :
                    pct >= 80 ? 'bg-amber-500' :
                    pct >= 50 ? 'bg-blue-500' : 'bg-green-500';
                  const typeLabel =
                    block.type === 'boys' ? 'Boys' :
                    block.type === 'girls' ? 'Girls' : 'Mixed';
                  const typeCls =
                    block.type === 'boys'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : block.type === 'girls'
                      ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';

                  return (
                    <div
                      key={block.id}
                      className="grid grid-cols-1 md:grid-cols-[1.5fr_90px_90px_90px_90px_160px] gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors items-center border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{block.name}</span>
                            {block.code && (
                              <span className="text-xs text-muted-foreground shrink-0">({block.code})</span>
                            )}
                          </div>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${typeCls}`}>
                          {typeLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-1">
                        <span className="text-xs text-muted-foreground md:hidden">Residents</span>
                        <span className="text-sm font-semibold">{block.occupancy.toLocaleString()}</span>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-1">
                        <span className="text-xs text-muted-foreground md:hidden">Capacity</span>
                        <span className="text-sm">{block.capacity.toLocaleString()}</span>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-1">
                        <span className="text-xs text-muted-foreground md:hidden">Available</span>
                        <span className={`text-sm font-medium ${avail === 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {avail.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-1">
                        <span className="text-xs text-muted-foreground md:hidden">Occupancy</span>
                        <span className={`text-sm font-semibold ${pct >= 95 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-foreground'}`}>
                          {pct}%
                        </span>
                      </div>

                      <div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 text-right">
                          {block.occupancy}/{block.capacity}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Totals row */}
                {blocks.length > 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-[1.5fr_90px_90px_90px_90px_160px] gap-3 px-3 py-2 mt-1 rounded-lg bg-muted/40 items-center border-t">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                    <div className="flex items-center justify-between md:justify-end gap-1">
                      <span className="text-xs text-muted-foreground md:hidden">Residents</span>
                      <span className="text-sm font-bold">{(o?.total_occupancy ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-1">
                      <span className="text-xs text-muted-foreground md:hidden">Capacity</span>
                      <span className="text-sm font-bold">{totalCapacity.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-1">
                      <span className="text-xs text-muted-foreground md:hidden">Available</span>
                      <span className={`text-sm font-bold ${availableBeds === 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {availableBeds.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-1">
                      <span className="text-xs text-muted-foreground md:hidden">Occupancy</span>
                      <span className="text-sm font-bold">{occupancyPct}%</span>
                    </div>
                    <div className="hidden md:block" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Section 4: Attendance Trend (30 days) ────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Attendance Trend (30 days)
            </CardTitle>
            <CardDescription>Daily evening-attendance %</CardDescription>
          </CardHeader>
          <CardContent>
            {trendChart.length === 0 ? (
              <EmptyChart label="No attendance recorded in the last 30 days" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v) => [`${v}%`, 'Attendance']} />
                  <Area type="monotone" dataKey="Attendance" stroke="#3b82f6" fill="url(#attFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Section 5: Demographics ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DistributionCard title="By Gender" icon={<Users className="h-4 w-4" />} data={demo?.byGender ?? []} variant="pie" />
          <DistributionCard title="By Room Category" icon={<BedDouble className="h-4 w-4" />} data={demo?.byRoomCategory ?? []} variant="bar" />
          <DistributionCard title="By Mess Category" icon={<UtensilsCrossed className="h-4 w-4" />} data={demo?.byMessCategory ?? []} variant="bar" />
        </div>

        {/* ── Section 6: Hostel Fee Collection ─────────────────────── */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Hostel Fee Collection
              </CardTitle>
              <CardDescription>Billed vs collected for the selected hostel year</CardDescription>
            </div>
            <Select value={effectiveFeeYear ?? undefined} onValueChange={(v) => setFeeYearId(v)}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Hostel year" /></SelectTrigger>
              <SelectContent>
                {hostelYears.map((y: { id: string; name: string; is_current?: boolean }) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {!effectiveFeeYear ? (
              <p className="text-sm text-muted-foreground py-4">No hostel year configured.</p>
            ) : feeError ? (
              <p className="text-sm text-muted-foreground py-4">Fee collection stats are unavailable for your role.</p>
            ) : feeLoading || !billStats ? (
              <div className="flex items-center text-sm text-muted-foreground py-4">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading fee stats…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <FeeTile label="Total Hostellers" value={billStats.total_hostellers.toLocaleString()} icon={Users} />
                  <FeeTile
                    label="Bills Generated"
                    value={billedCount.toLocaleString()}
                    sub={`${notBilledCount} not billed`}
                    icon={BadgeCheck}
                    tone="good"
                  />
                  <FeeTile
                    label="Not Billed"
                    value={notBilledCount.toLocaleString()}
                    icon={UserX}
                    tone={notBilledCount > 0 ? 'warn' : 'good'}
                  />
                  <FeeTile label="Total Billed" value={inr(billStats.total_amount)} icon={Wallet} />
                  <FeeTile
                    label="Collected"
                    value={inr(collected)}
                    sub={`${collectedPct}% collected`}
                    icon={BarChart3}
                    tone="good"
                  />
                  <FeeTile
                    label="Outstanding"
                    value={inr(billStats.outstanding_amount)}
                    icon={AlertTriangle}
                    tone={billStats.outstanding_amount > 0 ? 'bad' : 'good'}
                  />
                </div>

                {/* Institution breakdown for super-admin / multi-institution */}
                {(billStats.by_institution?.length ?? 0) > 1 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">By Institution</p>
                    <div className="space-y-2">
                      {billStats.by_institution.map((inst) => {
                        const instPct = inst.total > 0 ? Math.round((inst.billed / inst.total) * 100) : 0;
                        return (
                          <div key={inst.institution_id} className="flex items-center gap-3">
                            <span className="text-xs flex-1 truncate">{inst.institution_name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {inst.billed}/{inst.total} billed
                            </span>
                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full ${instPct === 100 ? 'bg-green-500' : instPct >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                style={{ width: `${instPct}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8 text-right shrink-0">{instPct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Section 7: Flagged Cases ──────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flag className="h-4 w-4" /> Flagged Cases
            </CardTitle>
            <CardDescription>Cases requiring management review</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {overdueGatePasses > 0 && (
              <FlagRow
                icon={<DoorOpen className="h-5 w-5 text-destructive" />}
                title={`${overdueGatePasses} Overdue Gate Passes`}
                sub="Students not returned"
                href="/campus-living/gate-passes"
                bg="bg-red-50 dark:bg-red-950/40"
              />
            )}
            {pendingLeaveRequests > 0 && (
              <FlagRow
                icon={<CalendarOff className="h-5 w-5 text-amber-600" />}
                title={`${pendingLeaveRequests} Pending Leaves`}
                sub="Awaiting warden approval"
                href="/campus-living/leave"
                bg="bg-amber-50 dark:bg-amber-950/40"
              />
            )}
            {criticalMaintenance > 0 && (
              <FlagRow
                icon={<Wrench className="h-5 w-5 text-orange-600" />}
                title={`${criticalMaintenance} Critical Tickets`}
                sub="Needs immediate action"
                href="/campus-living/maintenance"
                bg="bg-orange-50 dark:bg-orange-950/40"
              />
            )}
            {activeIncidents > 0 && (
              <FlagRow
                icon={<ShieldAlert className="h-5 w-5 text-destructive" />}
                title={`${activeIncidents} Active Incidents`}
                sub="Safety incidents open"
                href="/campus-living/safety/incidents"
                bg="bg-red-50 dark:bg-red-950/40"
              />
            )}
            {!overdueGatePasses && !pendingLeaveRequests && !criticalMaintenance && !activeIncidents && (
              <p className="text-sm text-muted-foreground text-center py-4 sm:col-span-2">No flagged cases. All green.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Section 8: Drill-down navigation ─────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Blocks', href: '/campus-living/blocks', icon: Building2, color: 'text-blue-600' },
            { label: 'Allocations', href: '/campus-living/allocations', icon: BedDouble, color: 'text-green-600' },
            { label: 'Maintenance', href: '/campus-living/maintenance', icon: Wrench, color: 'text-orange-600' },
            { label: 'Incidents', href: '/campus-living/safety/incidents', icon: ShieldAlert, color: 'text-red-600' },
            { label: 'Leave', href: '/campus-living/leave', icon: CalendarOff, color: 'text-amber-600' },
            { label: 'Gate Passes', href: '/campus-living/gate-passes', icon: DoorOpen, color: 'text-purple-600' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <item.icon className={`h-8 w-8 ${item.color} mb-2`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}

// ── Local component helpers ───────────────────────────────────────────────

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[220px] bg-muted/30 rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function DistributionCard({
  title, icon, data, variant,
}: {
  title: string; icon: React.ReactNode;
  data: { name: string; value: number }[]; variant: 'pie' | 'bar';
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyChart label="No data" />
        ) : variant === 'pie' ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function FeeTile({
  label, value, sub, tone, icon: Icon,
}: {
  label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn'; icon: React.ElementType;
}) {
  const cls =
    tone === 'good' ? 'text-green-600' :
    tone === 'bad' ? 'text-red-600' :
    tone === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-lg bg-muted/40 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${cls}`} />
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className={`text-lg font-bold leading-tight ${cls}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FlagRow({
  icon, title, sub, href, bg,
}: {
  icon: React.ReactNode; title: string; sub: string; href: string; bg: string;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${bg}`}>
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <Button variant="ghost" size="sm" asChild><Link href={href}>View</Link></Button>
    </div>
  );
}
