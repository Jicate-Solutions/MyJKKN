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
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCampusLivingOverview, useResidentDemographics,
  useBlockCategoryOccupancy, useInstitutionResidents,
} from '@/hooks/campus-living/use-campus-living-dashboard';
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
  Wallet, TrendingUp, BadgeCheck, UserX, BarChart3, ChevronRight, ChevronDown, School,
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
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  const { data, isLoading, error } = useCampusLivingOverview(institutionId);
  const { data: demo } = useResidentDemographics(institutionId);
  const { data: catRows = [], isLoading: catLoading } = useBlockCategoryOccupancy(institutionId);
  const { data: instRows = [], isLoading: instLoading } = useInstitutionResidents(institutionId);

  // Which block rows are expanded to show their category breakdown.
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const toggleBlock = (id: string) =>
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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

  // permsLoading keeps the spinner up while the viewer's scope resolves. Every
  // query on this page is deliberately disabled until then (useCampusLivingScope),
  // and a DISABLED React Query reports isLoading:false — so without this gate the
  // page renders its zero/empty branches ("No hostel blocks configured", 0%)
  // before the first fetch even starts. That is the visible half of BUG-005831.
  if (isLoading || permsLoading) {
    return (
      <ContentLayout title="Management Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const att = data?.attendance_today;

  // ── Exact allocation counts (from allocation_summary, not mixed sources) ──
  const alloc = data?.allocation_summary;
  const totalHostelites = alloc?.total_hostelites ?? 0;   // all in hostel system
  const allocatedCount  = alloc?.allocated ?? 0;          // active bed right now
  const notAllocated    = alloc?.not_allocated ?? 0;      // in system, no bed yet

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

  // ── Block × category, grouped by gender ───────────────────────────────────
  // Built from v_hostel_block_category_occupancy, which counts REAL bed rows rather than
  // hostel_rooms.capacity. The block totals here are therefore the allocatable inventory,
  // not the stated capacity — the two disagree wherever `drift` is non-zero.
  const genderGroups = (['boys', 'girls'] as const).map((gender) => {
    const rows = catRows.filter((r) => r.hostel_type === gender);
    const byBlock = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byBlock.get(r.block_id) ?? [];
      list.push(r);
      byBlock.set(r.block_id, list);
    }
    const blocksOut = Array.from(byBlock.entries())
      .map(([blockId, cats]) => {
        const sorted = [...cats].sort((a, b) => a.sort_order - b.sort_order);
        const beds = sorted.reduce((s, c) => s + c.beds, 0);
        const filled = sorted.reduce((s, c) => s + c.filled, 0);
        const capacity = sorted.reduce((s, c) => s + c.room_capacity, 0);
        return {
          blockId,
          name: sorted[0].block_name,
          code: sorted[0].block_code,
          rooms: sorted.reduce((s, c) => s + c.rooms, 0),
          beds,
          filled,
          vacant: beds - filled,
          pct: beds > 0 ? Math.round((filled / beds) * 100) : 0,
          drift: capacity - beds,
          categories: sorted,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const beds = blocksOut.reduce((s, b) => s + b.beds, 0);
    const filled = blocksOut.reduce((s, b) => s + b.filled, 0);
    return {
      gender,
      label: gender === 'boys' ? 'Boys' : 'Girls',
      blocks: blocksOut,
      rooms: blocksOut.reduce((s, b) => s + b.rooms, 0),
      beds,
      filled,
      vacant: beds - filled,
      pct: beds > 0 ? Math.round((filled / beds) * 100) : 0,
    };
  }).filter((g) => g.blocks.length > 0);

  const bedTotals = genderGroups.reduce(
    (acc, g) => ({
      rooms: acc.rooms + g.rooms,
      beds: acc.beds + g.beds,
      filled: acc.filled + g.filled,
      vacant: acc.vacant + g.vacant,
    }),
    { rooms: 0, beds: 0, filled: 0, vacant: 0 },
  );
  const bedOccPct = bedTotals.beds > 0 ? Math.round((bedTotals.filled / bedTotals.beds) * 100) : 0;

  // The "Available Beds" KPI reads the SAME real-bed inventory as the table below it, so the
  // headline number and the block rows can never disagree. `o.total_capacity` (the sum of
  // hostel_rooms.capacity) is deliberately not used — it counts beds that do not exist.
  const totalCapacity = bedTotals.beds;
  const availableBeds = bedTotals.vacant;
  const occupancyPct = bedOccPct;

  const instTotals = instRows.reduce(
    (acc, r) => ({ boys: acc.boys + r.boys, girls: acc.girls + r.girls, total: acc.total + r.total }),
    { boys: 0, girls: 0, total: 0 },
  );

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
                <Building2 className="h-4 w-4" /> Block &amp; Category Occupancy
              </CardTitle>
              <CardDescription>
                Rooms, beds, filled and pending per block — expand a block for its category split
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/blocks">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {catLoading ? (
              <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading occupancy…
              </div>
            ) : genderGroups.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] bg-muted/30 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">No hostel blocks configured</p>
              </div>
            ) : (
              <div className="space-y-0">
                {/* Desktop header */}
                <div className="hidden md:grid md:grid-cols-[1.6fr_80px_80px_80px_80px_70px_140px] gap-3 px-3 py-2 text-xs text-muted-foreground font-medium border-b">
                  <span>Block / Category</span>
                  <span className="text-right">Rooms</span>
                  <span className="text-right">Beds</span>
                  <span className="text-right">Filled</span>
                  <span className="text-right">Pending</span>
                  <span className="text-right">Occ. %</span>
                  <span className="text-right">Occupancy</span>
                </div>

                {genderGroups.map((group) => (
                  <div key={group.gender}>
                    {/* Gender band */}
                    <div className={`flex items-center gap-2 px-3 py-2 mt-3 rounded-md ${
                      group.gender === 'boys'
                        ? 'bg-blue-50 dark:bg-blue-950/30'
                        : 'bg-pink-50 dark:bg-pink-950/30'
                    }`}>
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        group.gender === 'boys'
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-pink-700 dark:text-pink-300'
                      }`}>
                        {group.label} Hostels
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.blocks.length} block{group.blocks.length === 1 ? '' : 's'} ·{' '}
                        {group.filled.toLocaleString()} of {group.beds.toLocaleString()} beds filled ·{' '}
                        <span className={group.vacant === 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                          {group.vacant.toLocaleString()} pending
                        </span>
                      </span>
                    </div>

                    {group.blocks.map((block) => {
                      const isOpen = openBlocks.has(block.blockId);
                      const barColor =
                        block.pct >= 95 ? 'bg-red-500' :
                        block.pct >= 80 ? 'bg-amber-500' :
                        block.pct >= 50 ? 'bg-blue-500' : 'bg-green-500';

                      return (
                        <div key={block.blockId}>
                          <button
                            type="button"
                            onClick={() => toggleBlock(block.blockId)}
                            aria-expanded={isOpen}
                            className="w-full text-left grid grid-cols-1 md:grid-cols-[1.6fr_80px_80px_80px_80px_70px_140px] gap-3 px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors items-center border-b last:border-b-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isOpen
                                ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                              <span className="font-medium text-sm truncate">{block.name}</span>
                              {block.code && (
                                <span className="text-xs text-muted-foreground shrink-0">({block.code})</span>
                              )}
                              {block.drift !== 0 && (
                                <span
                                  title={`Stated room capacity is ${(block.beds + block.drift).toLocaleString()} but ${block.beds.toLocaleString()} bed records exist. Figures here count real beds — the number the allocator can actually use.`}
                                  className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {block.drift > 0 ? `−${block.drift}` : `+${Math.abs(block.drift)}`} vs capacity
                                </span>
                              )}
                            </div>

                            <NumCell label="Rooms" value={block.rooms.toLocaleString()} />
                            <NumCell label="Beds" value={block.beds.toLocaleString()} />
                            <NumCell label="Filled" value={block.filled.toLocaleString()} bold />
                            <Cell
                              label="Pending"
                              value={block.vacant.toLocaleString()}
                              className={block.vacant === 0 ? 'text-red-600' : 'text-green-600'}
                              bold
                            />
                            <Cell
                              label="Occupancy"
                              value={`${block.pct}%`}
                              className={block.pct >= 95 ? 'text-red-600' : block.pct >= 80 ? 'text-amber-600' : ''}
                              bold
                            />

                            <div>
                              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${block.pct}%` }} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 text-right">
                                {block.filled}/{block.beds}
                              </p>
                            </div>
                          </button>

                          {/* Category breakdown */}
                          {isOpen && block.categories.map((c) => {
                            const cPct = c.beds > 0 ? Math.round((c.filled / c.beds) * 100) : 0;
                            return (
                              <div
                                key={`${block.blockId}-${c.category_id ?? 'none'}`}
                                className="grid grid-cols-1 md:grid-cols-[1.6fr_80px_80px_80px_80px_70px_140px] gap-3 px-3 py-2 items-center bg-muted/25 border-b last:border-b-0"
                              >
                                <span className="text-sm text-muted-foreground pl-6 truncate">
                                  {c.category_name}
                                </span>
                                <NumCell label="Rooms" value={c.rooms.toLocaleString()} muted />
                                <NumCell label="Beds" value={c.beds.toLocaleString()} muted />
                                <NumCell label="Filled" value={c.filled.toLocaleString()} />
                                <Cell
                                  label="Pending"
                                  value={c.vacant.toLocaleString()}
                                  className={c.vacant === 0 ? 'text-red-600' : 'text-green-600'}
                                  bold
                                />
                                <NumCell label="Occupancy" value={`${cPct}%`} muted />
                                <div>
                                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${cPct >= 95 ? 'bg-red-500' : cPct >= 80 ? 'bg-amber-500' : 'bg-blue-400'}`}
                                      style={{ width: `${cPct}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Gender subtotal */}
                    <div className="grid grid-cols-1 md:grid-cols-[1.6fr_80px_80px_80px_80px_70px_140px] gap-3 px-3 py-2 items-center border-t bg-muted/30">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {group.label} subtotal
                      </span>
                      <NumCell label="Rooms" value={group.rooms.toLocaleString()} bold />
                      <NumCell label="Beds" value={group.beds.toLocaleString()} bold />
                      <NumCell label="Filled" value={group.filled.toLocaleString()} bold />
                      <Cell
                        label="Pending"
                        value={group.vacant.toLocaleString()}
                        className={group.vacant === 0 ? 'text-red-600' : 'text-green-600'}
                        bold
                      />
                      <NumCell label="Occupancy" value={`${group.pct}%`} bold />
                      <div className="hidden md:block" />
                    </div>
                  </div>
                ))}

                {/* Grand total */}
                <div className="grid grid-cols-1 md:grid-cols-[1.6fr_80px_80px_80px_80px_70px_140px] gap-3 px-3 py-3 mt-3 rounded-lg bg-muted/60 items-center border-t-2">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">All hostels</span>
                  <NumCell label="Rooms" value={bedTotals.rooms.toLocaleString()} bold />
                  <NumCell label="Beds" value={bedTotals.beds.toLocaleString()} bold />
                  <NumCell label="Filled" value={bedTotals.filled.toLocaleString()} bold />
                  <Cell
                    label="Pending"
                    value={bedTotals.vacant.toLocaleString()}
                    className={bedTotals.vacant === 0 ? 'text-red-600' : 'text-green-600'}
                    bold
                  />
                  <NumCell label="Occupancy" value={`${bedOccPct}%`} bold />
                  <div className="hidden md:block" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Section 3b: Institution-wise Residents ────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <School className="h-4 w-4" /> Institution-wise Residents
            </CardTitle>
            <CardDescription>
              Learners holding a bed right now, by college and hostel type
            </CardDescription>
          </CardHeader>
          <CardContent>
            {instLoading ? (
              <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading residents…
              </div>
            ) : instRows.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] bg-muted/30 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">No residents allocated</p>
              </div>
            ) : (
              <div className="space-y-0">
                <div className="hidden md:grid md:grid-cols-[2fr_90px_90px_90px_160px] gap-3 px-3 py-2 text-xs text-muted-foreground font-medium border-b">
                  <span>Institution</span>
                  <span className="text-right">Boys</span>
                  <span className="text-right">Girls</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Split</span>
                </div>

                {instRows.map((r) => {
                  const boysPct = r.total > 0 ? Math.round((r.boys / r.total) * 100) : 0;
                  return (
                    <div
                      key={r.institution_id}
                      className="grid grid-cols-1 md:grid-cols-[2fr_90px_90px_90px_160px] gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors items-center border-b last:border-b-0"
                    >
                      <span className="text-sm font-medium truncate">{r.institution_name}</span>
                      <NumCell label="Boys" value={r.boys.toLocaleString()} className="text-blue-600" bold />
                      <NumCell label="Girls" value={r.girls.toLocaleString()} className="text-pink-600" bold />
                      <NumCell label="Total" value={r.total.toLocaleString()} bold />
                      <div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                          <div className="h-full bg-blue-500" style={{ width: `${boysPct}%` }} />
                          <div className="h-full bg-pink-500" style={{ width: `${100 - boysPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="grid grid-cols-1 md:grid-cols-[2fr_90px_90px_90px_160px] gap-3 px-3 py-3 mt-1 rounded-lg bg-muted/50 items-center border-t">
                  <span className="text-xs font-bold uppercase tracking-wider">Total</span>
                  <NumCell label="Boys" value={instTotals.boys.toLocaleString()} className="text-blue-600" bold />
                  <NumCell label="Girls" value={instTotals.girls.toLocaleString()} className="text-pink-600" bold />
                  <NumCell label="Total" value={instTotals.total.toLocaleString()} bold />
                  <div className="hidden md:block" />
                </div>
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

/**
 * One numeric cell in the occupancy / residents tables. Right-aligned on desktop; on mobile
 * the grid collapses to a single column, so the label is shown inline to keep each number
 * readable on its own row.
 */
function NumCell({
  label, value, className = '', bold, muted,
}: {
  label: string; value: string; className?: string; bold?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between md:justify-end gap-1">
      <span className="text-xs text-muted-foreground md:hidden">{label}</span>
      <span
        className={`text-sm ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''} ${className}`}
      >
        {value}
      </span>
    </div>
  );
}

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
                {data.map((_, i) => <NumCell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
                {data.map((_, i) => <NumCell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
