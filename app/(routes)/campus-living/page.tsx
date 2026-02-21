'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import {
  Building2,
  Users,
  BedDouble,
  ClipboardCheck,
  CalendarOff,
  Wrench,
  UtensilsCrossed,
  ShieldAlert,
  DoorOpen,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertTriangle,
  UserCheck,
  Percent
} from 'lucide-react';

// Placeholder stats until hooks are available
const useCampusLivingDashboard = (institutionId: string | null) => {
  // This will be replaced with a real React Query hook
  return {
    data: {
      totalHostellers: 4280,
      totalCapacity: 5000,
      occupancyRate: 85.6,
      todayPresent: 3920,
      todayAbsent: 180,
      todayOnLeave: 180,
      pendingLeaveRequests: 23,
      pendingMaintenance: 12,
      criticalMaintenance: 3,
      activeGatePasses: 45,
      overdueGatePasses: 2,
      messRating: 3.8,
      feeCollected: 78,
      recentIncidents: 2,
      blocks: [
        { id: '1', name: 'Boys Hostel A', code: 'BHA', type: 'boys', capacity: 800, occupied: 720, status: 'active' },
        { id: '2', name: 'Boys Hostel B', code: 'BHB', type: 'boys', capacity: 600, occupied: 540, status: 'active' },
        { id: '3', name: 'Girls Hostel A', code: 'GHA', type: 'girls', capacity: 1000, occupied: 880, status: 'active' },
        { id: '4', name: 'Girls Hostel B', code: 'GHB', type: 'girls', capacity: 800, occupied: 700, status: 'active' },
        { id: '5', name: 'Girls Hostel C', code: 'GHC', type: 'girls', capacity: 900, occupied: 780, status: 'active' },
        { id: '6', name: 'PG Hostel', code: 'PGH', type: 'mixed', capacity: 400, occupied: 340, status: 'active' },
        { id: '7', name: 'New Wing', code: 'NW', type: 'boys', capacity: 500, occupied: 320, status: 'under_maintenance' },
      ],
    },
    isLoading: false,
    error: null,
  };
};

export default function CampusLivingDashboardPage() {
  const { profile } = useAuth();
  const { data: stats, isLoading, error } = useCampusLivingDashboard(profile?.institution_id ?? null);

  if (isLoading) {
    return (
      <ContentLayout title="Campus Living">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Campus Living">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Campus Living Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Hostel management, attendance, leave, and facility overview
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/attendance/mark">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Mark Attendance
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/allocations/new">
                <BedDouble className="mr-2 h-4 w-4" />
                Allocate Bed
              </Link>
            </Button>
          </div>
        </div>

        {/* Primary Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Hostellers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalHostellers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                of {stats?.totalCapacity.toLocaleString()} capacity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.occupancyRate}%</div>
              <p className="text-xs text-green-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                +2.1% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Today&apos;s Attendance</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.todayPresent.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.todayAbsent} absent, {stats?.todayOnLeave} on leave
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Pending Maintenance</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingMaintenance}</div>
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {stats?.criticalMaintenance} critical
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Active Leaves</CardTitle>
              <CalendarOff className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.todayOnLeave}</div>
              <p className="text-xs text-amber-600 flex items-center gap-1">
                {stats?.pendingLeaveRequests} pending approval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Mess Rating</CardTitle>
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.messRating}/5</div>
              <p className="text-xs text-muted-foreground">
                This week&apos;s average
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions + Alerts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alerts */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Alerts</CardTitle>
              <CardDescription>Items requiring attention</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats?.overdueGatePasses && stats.overdueGatePasses > 0 && (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.overdueGatePasses} Overdue Gate Passes</p>
                    <p className="text-xs text-muted-foreground">Students haven&apos;t returned</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/campus-living/gate-passes">View</Link>
                  </Button>
                </div>
              )}

              {stats?.pendingLeaveRequests && stats.pendingLeaveRequests > 0 && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                  <CalendarOff className="h-5 w-5 text-amber-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.pendingLeaveRequests} Pending Leave Requests</p>
                    <p className="text-xs text-muted-foreground">Awaiting warden approval</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/campus-living/leave">View</Link>
                  </Button>
                </div>
              )}

              {stats?.criticalMaintenance && stats.criticalMaintenance > 0 && (
                <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <Wrench className="h-5 w-5 text-orange-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.criticalMaintenance} Critical Maintenance</p>
                    <p className="text-xs text-muted-foreground">Requires immediate action</p>
                  </div>
                </div>
              )}

              {stats?.recentIncidents && stats.recentIncidents > 0 && (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.recentIncidents} Incidents (7 days)</p>
                    <p className="text-xs text-muted-foreground">Safety incidents reported</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Block-wise Occupancy */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Block-wise Occupancy</CardTitle>
                <CardDescription>Current occupancy across all hostel blocks</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/campus-living/blocks">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.blocks.map((block) => {
                  const percentage = Math.round((block.occupied / block.capacity) * 100);
                  const barColor =
                    percentage >= 95 ? 'bg-red-500' :
                    percentage >= 80 ? 'bg-green-500' :
                    percentage >= 50 ? 'bg-blue-500' :
                    'bg-amber-500';

                  return (
                    <div key={block.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{block.name}</span>
                          <Badge
                            variant={block.type === 'boys' ? 'default' : block.type === 'girls' ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {block.type}
                          </Badge>
                          {block.status === 'under_maintenance' && (
                            <Badge variant="destructive" className="text-xs">
                              Maintenance
                            </Badge>
                          )}
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
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Blocks', href: '/campus-living/blocks', icon: Building2, color: 'text-blue-600' },
            { label: 'Allocations', href: '/campus-living/allocations', icon: BedDouble, color: 'text-green-600' },
            { label: 'Attendance', href: '/campus-living/attendance', icon: ClipboardCheck, color: 'text-purple-600' },
            { label: 'Leave', href: '/campus-living/leave', icon: CalendarOff, color: 'text-amber-600' },
            { label: 'Gate Passes', href: '/campus-living/gate-passes', icon: DoorOpen, color: 'text-orange-600' },
            { label: 'Waitlist', href: '/campus-living/allocations/waitlist', icon: Users, color: 'text-rose-600' },
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
