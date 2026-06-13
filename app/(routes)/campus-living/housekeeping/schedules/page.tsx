'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sparkles,
  Search,
  Loader2,
  CalendarDays,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCleaningSchedules } from '@/hooks/campus-living/use-hostel-housekeeping';
import { BlockSelector } from '@/components/campus-living/block-selector';

/**
 * navMeta — invoked from the parent housekeeping page via a "View all
 * schedules" link/button. Required by `scripts/assert-nav-coverage.mjs` for
 * discoverability tracking. Matches parent-page convention.
 */
export const navMeta = {
  invokedFrom: '/campus-living/housekeeping',
} as const;

export default function HousekeepingSchedulesPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const filters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = {};
    if (blockFilter !== 'all') f.block_id = blockFilter;
    if (statusFilter === 'active') f.is_active = true;
    if (statusFilter === 'inactive') f.is_active = false;
    if (dateFrom) f.date_from = new Date(dateFrom).toISOString();
    if (dateTo) {
      // Inclusive end-of-day so a same-day range like 2026-05-19→2026-05-19
      // catches schedules due that day.
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      f.date_to = end.toISOString();
    }
    return Object.keys(f).length ? f : undefined;
  }, [blockFilter, statusFilter, dateFrom, dateTo]);

  const { data, isLoading } = useCleaningSchedules(institutionId, filters);
  const schedules = useMemo(() => data?.data ?? [], [data?.data]);

  const filteredSchedules = schedules.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    // Match against real prod columns (cleaning_type / frequency /
    // assigned_staff) plus legacy aliases (area / cadence / assigned_to) so
    // the search keeps working in either schema state — mirrors the parent
    // page's tolerance pattern.
    return (
      String(s.cleaning_type ?? s.area ?? '').toLowerCase().includes(q) ||
      String(s.frequency ?? s.cadence ?? '').toLowerCase().includes(q) ||
      String(s.assigned_staff ?? s.assigned_to ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(
    () => ({
      total: schedules.length,
      active: schedules.filter((s) => s.is_active).length,
      inactive: schedules.filter((s) => !s.is_active).length,
      daily: schedules.filter((s) => s.frequency === 'daily').length,
    }),
    [schedules]
  );

  const resetFilters = () => {
    setSearchQuery('');
    setBlockFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <ContentLayout title="Housekeeping Schedules">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Schedules' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Cleaning Schedules
            </h1>
            <p className="text-muted-foreground">
              Filterable view of all recurring cleaning plans.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/campus-living/housekeeping">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Housekeeping
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Inactive</p>
              <p className="text-2xl font-bold text-muted-foreground">{stats.inactive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Daily Plans</p>
              <p className="text-2xl font-bold text-blue-600">{stats.daily}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by type, frequency or assigned staff…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label
                  htmlFor="schedules-date-from"
                  className="text-xs text-muted-foreground block mb-1"
                >
                  Created from
                </label>
                <Input
                  id="schedules-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="schedules-date-to"
                  className="text-xs text-muted-foreground block mb-1"
                >
                  Created to
                </label>
                <Input
                  id="schedules-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={resetFilters} className="sm:w-auto w-full">
                Reset filters
              </Button>
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
            ) : filteredSchedules.length === 0 ? (
              <div className="py-16 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No schedules match the filters</h3>
                <p className="text-sm text-muted-foreground">
                  Adjust filters or create a new schedule from the housekeeping page.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Scheduled Time</TableHead>
                    <TableHead>Assigned Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium capitalize">
                        {String(s.cleaning_type ?? s.area ?? '—').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="capitalize">
                        {String(s.frequency ?? s.cadence ?? '—').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        {s.scheduled_time ? (
                          <span className="flex items-center gap-1 text-sm">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {String(s.scheduled_time).slice(0, 5)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {String(s.assigned_staff ?? s.assigned_to ?? '—')}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="mr-1 h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.created_at
                          ? new Date(s.created_at).toLocaleDateString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
