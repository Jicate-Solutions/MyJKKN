'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Wallet, TrendingUp,
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

  const o = data?.occupancy;
  const att = data?.attendance_today;
  const attendancePct =
    att && att.present + att.absent + att.on_leave > 0
      ? Math.round((att.present / (att.present + att.absent + att.on_leave)) * 100)
      : 0;
  const criticalMaintenance = data?.maintenance.critical ?? 0;
  const pendingLeaveRequests = data?.leaves.pending_approval ?? 0;
  const overdueGatePasses = data?.gate_passes.overdue ?? 0;
  const activeIncidents = data?.incidents.active ?? 0;

  const blockChart = (o?.blocks ?? []).map((b) => ({
    name: b.code || b.name,
    Occupied: b.occupancy,
    Available: Math.max(b.capacity - b.occupancy, 0),
  }));
  const trendChart = trend.map((t) => ({
    date: t.date.slice(5), // MM-DD
    Attendance: t.attendance_percentage,
  }));

  const collected = billStats ? billStats.total_amount - billStats.outstanding_amount : 0;
  const collectedPct = billStats && billStats.total_amount > 0
    ? Math.round((collected / billStats.total_amount) * 100)
    : 0;

  const kpis = [
    { label: 'Hostellers', value: (demo?.total ?? o?.total_occupancy ?? 0).toLocaleString(),
      sub: `${(o?.total_capacity ?? 0).toLocaleString()} capacity`, icon: Users },
    { label: 'Occupancy %', value: `${o?.percentage ?? 0}%`,
      sub: `${(o?.available ?? 0).toLocaleString()} beds free`, icon: Percent },
    { label: 'Attendance Today', value: `${attendancePct}%`,
      sub: `${att?.present ?? 0} present, ${att?.absent ?? 0} absent`, icon: UserCheck },
    { label: 'Pending Maintenance', value: data?.maintenance.pending ?? 0,
      sub: `${criticalMaintenance} critical`, icon: Wrench, danger: criticalMaintenance > 0 },
    { label: 'Active Incidents', value: activeIncidents, sub: 'Open safety incidents', icon: ShieldAlert },
    { label: 'Critical Alerts', value: overdueGatePasses + pendingLeaveRequests + criticalMaintenance,
      sub: 'Items needing attention', icon: Flag },
  ];

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

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">{k.label}</CardTitle>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{k.value}</div>
                <p className={`text-xs ${k.danger ? 'text-destructive flex items-center gap-1' : 'text-muted-foreground'}`}>
                  {k.danger && <AlertTriangle className="h-3 w-3" />}{k.sub}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Occupancy by block + Attendance trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Occupancy by Block</CardTitle>
              <CardDescription>Live beds occupied vs available, per block</CardDescription>
            </CardHeader>
            <CardContent>
              {blockChart.length === 0 ? (
                <EmptyChart label="No hostel blocks configured" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={blockChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Occupied" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Available" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Attendance Trend (30 days)</CardTitle>
              <CardDescription>Daily evening-attendance %</CardDescription>
            </CardHeader>
            <CardContent>
              {trendChart.length === 0 ? (
                <EmptyChart label="No attendance recorded in the last 30 days" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
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
        </div>

        {/* Demographics & category mix */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DistributionCard title="By Gender" icon={<Users className="h-4 w-4" />} data={demo?.byGender ?? []} variant="pie" />
          <DistributionCard title="By Room Category" icon={<BedDouble className="h-4 w-4" />} data={demo?.byRoomCategory ?? []} variant="bar" />
          <DistributionCard title="By Mess Category" icon={<UtensilsCrossed className="h-4 w-4" />} data={demo?.byMessCategory ?? []} variant="bar" />
        </div>

        {/* Fee & billing */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Hostel Fee Collection</CardTitle>
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
              <div className="flex items-center text-sm text-muted-foreground py-4"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading fee stats…</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <FeeTile label="Hostellers" value={billStats.total_hostellers.toLocaleString()} />
                <FeeTile label="Billed" value={billStats.billed.toLocaleString()} sub={`${billStats.not_billed} not billed`} />
                <FeeTile label="Billed Amount" value={inr(billStats.total_amount)} />
                <FeeTile label="Collected" value={inr(collected)} tone="good" />
                <FeeTile label="Outstanding" value={inr(billStats.outstanding_amount)} tone={billStats.outstanding_amount > 0 ? 'bad' : 'good'} />
                <FeeTile label="% Collected" value={`${collectedPct}%`} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Flagged cases */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Flag className="h-4 w-4" /> Flagged Cases</CardTitle>
            <CardDescription>Cases requiring management review</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {overdueGatePasses > 0 && <FlagRow icon={<DoorOpen className="h-5 w-5 text-destructive" />} title={`${overdueGatePasses} Overdue Gate Passes`} sub="Students not returned" href="/campus-living/gate-passes" />}
            {pendingLeaveRequests > 0 && <FlagRow icon={<CalendarOff className="h-5 w-5 text-amber-600" />} title={`${pendingLeaveRequests} Pending Leaves`} sub="Awaiting warden approval" href="/campus-living/leave" />}
            {criticalMaintenance > 0 && <FlagRow icon={<Wrench className="h-5 w-5 text-orange-600" />} title={`${criticalMaintenance} Critical Tickets`} sub="Needs immediate action" href="/campus-living/maintenance" />}
            {activeIncidents > 0 && <FlagRow icon={<ShieldAlert className="h-5 w-5 text-destructive" />} title={`${activeIncidents} Active Incidents`} sub="Safety incidents open" href="/campus-living/safety/incidents" />}
            {!overdueGatePasses && !pendingLeaveRequests && !criticalMaintenance && !activeIncidents && (
              <p className="text-sm text-muted-foreground text-center py-4 sm:col-span-2">No flagged cases. All green.</p>
            )}
          </CardContent>
        </Card>

        {/* Drill-downs */}
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

// ── Local components ──────────────────────────────────────────────────────

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[280px] bg-muted/30 rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function DistributionCard({
  title, icon, data, variant,
}: {
  title: string; icon: React.ReactNode; data: { name: string; value: number }[]; variant: 'pie' | 'bar';
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
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
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

function FeeTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const cls = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-foreground';
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function FlagRow({ icon, title, sub, href }: { icon: React.ReactNode; title: string; sub: string; href: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <Button variant="ghost" size="sm" asChild><Link href={href}>View</Link></Button>
    </div>
  );
}
