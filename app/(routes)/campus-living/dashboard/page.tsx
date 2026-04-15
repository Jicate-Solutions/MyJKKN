'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useCampusLivingOverview } from '@/hooks/campus-living/use-campus-living-dashboard';
import {
  Building2,
  Users,
  BedDouble,
  Wrench,
  ShieldAlert,
  DoorOpen,
  ArrowRight,
  Loader2,
  AlertTriangle,
  UserCheck,
  Percent,
  CalendarOff,
  Flag,
  ClipboardCheck,
} from 'lucide-react';

/**
 * Management Dashboard — management-facing operational view of campus living.
 * Mirrors the root /campus-living overview but positions itself as an
 * executive drill-down console with KPI tiles, block breakdown,
 * and flagged-cases list.
 */
export default function CampusLivingManagementDashboardPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const { data, isLoading, error } = useCampusLivingOverview(institutionId);

  if (isLoading) {
    return (
      <ContentLayout title="Management Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  const stats = data
    ? {
        totalHostellers: data.occupancy.total_occupancy,
        totalCapacity: data.occupancy.total_capacity,
        occupancyRate: data.occupancy.percentage,
        todayPresent: data.attendance_today.present,
        todayAbsent: data.attendance_today.absent,
        todayOnLeave: data.attendance_today.on_leave,
        attendancePct:
          data.attendance_today.present + data.attendance_today.absent + data.attendance_today.on_leave > 0
            ? Math.round(
                (data.attendance_today.present /
                  (data.attendance_today.present +
                    data.attendance_today.absent +
                    data.attendance_today.on_leave)) *
                  100,
              )
            : 0,
        pendingMaintenance: data.maintenance.pending,
        criticalMaintenance: data.maintenance.critical,
        pendingLeaveRequests: data.leaves.pending_approval,
        overdueGatePasses: data.gate_passes.overdue,
        recentIncidents: data.incidents.active,
        blocks: data.occupancy.blocks.map((b) => ({
          id: b.id,
          name: b.name,
          code: b.code,
          type: b.type,
          capacity: b.capacity,
          occupied: b.occupancy,
        })),
      }
    : null;

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
              Executive view with KPI tiles, block-level breakdown, and flagged cases across hostels.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/reports">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Reports
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living">
                <ArrowRight className="mr-2 h-4 w-4" />
                Operational View
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="py-4 text-sm text-destructive">
              Failed to load dashboard data. Please refresh.
            </CardContent>
          </Card>
        )}

        {/* KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Hostellers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalHostellers.toLocaleString() ?? '—'}</div>
              <p className="text-xs text-muted-foreground">
                of {stats?.totalCapacity.toLocaleString() ?? '—'} capacity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Occupancy %</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.occupancyRate ?? 0}%</div>
              <p className="text-xs text-muted-foreground">Current occupancy rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Attendance Today</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.attendancePct ?? 0}%</div>
              <p className="text-xs text-muted-foreground">
                {stats?.todayPresent ?? 0} present, {stats?.todayAbsent ?? 0} absent
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Pending Maintenance</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingMaintenance ?? 0}</div>
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {stats?.criticalMaintenance ?? 0} critical
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.recentIncidents ?? 0}</div>
              <p className="text-xs text-muted-foreground">Open safety incidents</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
              <Flag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats?.overdueGatePasses ?? 0) +
                  (stats?.pendingLeaveRequests ?? 0) +
                  (stats?.criticalMaintenance ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">Items needing attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Trend chart placeholder + Flagged cases */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Trends (Last 30 Days)</CardTitle>
              <CardDescription>Occupancy, attendance, and incident trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-dashed">
                <p className="text-sm text-muted-foreground">
                  Trend charts will appear here once analytics pipeline is wired.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="h-4 w-4" />
                Flagged Cases
              </CardTitle>
              <CardDescription>Cases requiring management review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats && stats.overdueGatePasses > 0 && (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <DoorOpen className="h-5 w-5 text-destructive shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.overdueGatePasses} Overdue Gate Passes</p>
                    <p className="text-xs text-muted-foreground">Students not returned</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/campus-living/gate-passes">View</Link>
                  </Button>
                </div>
              )}
              {stats && stats.pendingLeaveRequests > 0 && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <CalendarOff className="h-5 w-5 text-amber-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.pendingLeaveRequests} Pending Leaves</p>
                    <p className="text-xs text-muted-foreground">Awaiting warden approval</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/campus-living/leave">View</Link>
                  </Button>
                </div>
              )}
              {stats && stats.criticalMaintenance > 0 && (
                <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                  <Wrench className="h-5 w-5 text-orange-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.criticalMaintenance} Critical Tickets</p>
                    <p className="text-xs text-muted-foreground">Needs immediate action</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/campus-living/maintenance">View</Link>
                  </Button>
                </div>
              )}
              {stats && stats.recentIncidents > 0 && (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.recentIncidents} Active Incidents</p>
                    <p className="text-xs text-muted-foreground">Safety incidents open</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/campus-living/safety/incidents">View</Link>
                  </Button>
                </div>
              )}
              {stats &&
                !stats.overdueGatePasses &&
                !stats.pendingLeaveRequests &&
                !stats.criticalMaintenance &&
                !stats.recentIncidents && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No flagged cases. All green.
                  </p>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Block-wise Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Block-wise Occupancy</CardTitle>
              <CardDescription>Per-block capacity utilization</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/blocks">
                View All Blocks <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.blocks.map((block) => {
                const percentage =
                  block.capacity > 0 ? Math.round((block.occupied / block.capacity) * 100) : 0;
                const barColor =
                  percentage >= 95
                    ? 'bg-red-500'
                    : percentage >= 80
                      ? 'bg-green-500'
                      : percentage >= 50
                        ? 'bg-blue-500'
                        : 'bg-amber-500';

                return (
                  <div key={block.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{block.name}</span>
                        <Badge
                          variant={
                            block.type === 'boys'
                              ? 'default'
                              : block.type === 'girls'
                                ? 'secondary'
                                : 'outline'
                          }
                          className="text-xs"
                        >
                          {block.type}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {block.occupied}/{block.capacity} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!stats?.blocks || stats.blocks.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hostel blocks configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Drill-downs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Blocks', href: '/campus-living/blocks', icon: Building2, color: 'text-blue-600' },
            {
              label: 'Allocations',
              href: '/campus-living/allocations',
              icon: BedDouble,
              color: 'text-green-600',
            },
            {
              label: 'Maintenance',
              href: '/campus-living/maintenance',
              icon: Wrench,
              color: 'text-orange-600',
            },
            {
              label: 'Incidents',
              href: '/campus-living/safety/incidents',
              icon: ShieldAlert,
              color: 'text-red-600',
            },
            {
              label: 'Leave',
              href: '/campus-living/leave',
              icon: CalendarOff,
              color: 'text-amber-600',
            },
            {
              label: 'Gate Passes',
              href: '/campus-living/gate-passes',
              icon: DoorOpen,
              color: 'text-purple-600',
            },
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
