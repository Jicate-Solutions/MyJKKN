'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CalendarClock,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  PauseCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePreventiveMaintenance } from '@/hooks/campus-living/use-hostel-preventive-maintenance';

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

function scheduleStatus(
  isActive: boolean | null | undefined,
  next: string | null | undefined,
): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  if (isActive === false) {
    return {
      label: 'Inactive',
      className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
      icon: <PauseCircle className="mr-1 h-3 w-3" />,
    };
  }
  const d = daysUntil(next);
  if (d === null) {
    return {
      label: 'No Next Date',
      className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
      icon: <Clock className="mr-1 h-3 w-3" />,
    };
  }
  if (d < 0) {
    return {
      label: `Overdue ${Math.abs(d)}d`,
      className: 'bg-red-100 text-red-800 hover:bg-red-100',
      icon: <AlertTriangle className="mr-1 h-3 w-3" />,
    };
  }
  if (d <= 7) {
    return {
      label: `Due in ${d}d`,
      className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      icon: <Clock className="mr-1 h-3 w-3" />,
    };
  }
  return {
    label: `In ${d}d`,
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
    icon: <CheckCircle2 className="mr-1 h-3 w-3" />,
  };
}

function frequencyLabel(days: number | null | undefined): string {
  if (!days || days <= 0) return '—';
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days === 14) return 'Fortnightly';
  if (days === 30 || days === 31) return 'Monthly';
  if (days === 90 || days === 91 || days === 92) return 'Quarterly';
  if (days === 180) return 'Half-yearly';
  if (days === 365) return 'Yearly';
  return `Every ${days} days`;
}

function locationLabel(
  block?: string | null,
  room?: string | null,
  floor?: string | null,
) {
  const parts = [block, floor, room].filter(Boolean);
  return parts.length ? parts.join(' / ') : '—';
}

export default function CampusLivingPreventiveMaintenancePage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = usePreventiveMaintenance(institutionId);
  const schedules = data ?? [];

  const filtered = schedules.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.resource?.name ?? '').toLowerCase().includes(q) ||
      (s.maintenance_type ?? '').toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.resource?.block_number ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekAhead = new Date(now);
    weekAhead.setDate(weekAhead.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let total = 0;
    let dueThisWeek = 0;
    let overdue = 0;
    let completedThisMonth = 0;

    for (const s of schedules) {
      total += 1;
      const next = s.next_maintenance_date
        ? new Date(s.next_maintenance_date)
        : null;
      if (next && s.is_active !== false) {
        if (next.getTime() < now.getTime()) overdue += 1;
        else if (next.getTime() <= weekAhead.getTime()) dueThisWeek += 1;
      }
      const last = s.last_maintenance_date
        ? new Date(s.last_maintenance_date)
        : null;
      if (last && last.getTime() >= monthStart.getTime()) {
        completedThisMonth += 1;
      }
    }
    return { total, dueThisWeek, overdue, completedThisMonth };
  }, [schedules]);

  return (
    <ContentLayout title="Preventive Maintenance">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Maintenance', href: '/campus-living/maintenance' },
          { label: 'Preventive Maintenance' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-primary" />
              Preventive Maintenance
            </h1>
            <p className="text-muted-foreground">
              Recurring maintenance schedules for hostel infrastructure, powered
              by the Resource Management maintenance engine.
            </p>
          </div>
          <Button asChild>
            <a href="/resource-management">
              <Plus className="mr-2 h-4 w-4" />
              Add Schedule
            </a>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Schedules</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-amber-600">Due This Week</p>
              <p className="text-2xl font-bold text-amber-700">
                {stats.dueThisWeek}
              </p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-red-600">Overdue</p>
              <p className="text-2xl font-bold text-red-700">{stats.overdue}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-green-600">Completed This Month</p>
              <p className="text-2xl font-bold text-green-700">
                {stats.completedThisMonth}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by resource, type, block…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No preventive-maintenance schedules</h3>
                <p className="text-sm text-muted-foreground">
                  No preventive-maintenance schedules yet — define one under each
                  hostel resource.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Schedule Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Last Done</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const st = scheduleStatus(s.is_active, s.next_maintenance_date);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.resource?.name ?? '—'}
                          <span className="block text-xs text-muted-foreground">
                            {locationLabel(
                              s.resource?.block_number,
                              s.resource?.room_number,
                              s.resource?.floor_number,
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="capitalize text-sm">
                          {s.maintenance_type ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {frequencyLabel(s.frequency_days)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.last_maintenance_date
                            ? new Date(s.last_maintenance_date).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.next_maintenance_date
                            ? new Date(s.next_maintenance_date).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.assigned_to_user_id
                            ? s.assigned_to_user_id.slice(0, 8)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={st.className}>
                            {st.icon}
                            {st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
