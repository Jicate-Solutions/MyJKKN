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
  Plus,
  Search,
  Loader2,
  CalendarDays,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCleaningSchedules } from '@/hooks/campus-living/use-hostel-housekeeping';
import { BlockSelector } from '@/components/campus-living/block-selector';

export default function HousekeepingPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = {};
    if (blockFilter !== 'all') f.block_id = blockFilter;
    if (activeFilter === 'active') f.is_active = true;
    if (activeFilter === 'inactive') f.is_active = false;
    return Object.keys(f).length ? f : undefined;
  }, [blockFilter, activeFilter]);

  const { data, isLoading } = useCleaningSchedules(institutionId, filters);
  const schedules = data?.data ?? [];

  const filteredSchedules = schedules.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.area ?? '').toLowerCase().includes(q) ||
      (s.cadence ?? '').toLowerCase().includes(q) ||
      (s.assigned_to ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(
    () => ({
      total: schedules.length,
      active: schedules.filter((s) => s.is_active).length,
      inactive: schedules.filter((s) => !s.is_active).length,
    }),
    [schedules]
  );

  return (
    <ContentLayout title="Housekeeping">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Housekeeping Schedules
            </h1>
            <p className="text-muted-foreground">
              Recurring cleaning plans across blocks and common areas.
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Schedule
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Schedules</p>
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
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search schedules…"
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
              <Select value={activeFilter} onValueChange={setActiveFilter}>
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
                <h3 className="font-medium">No cleaning schedules yet</h3>
                <p className="text-sm text-muted-foreground">
                  Create a schedule to set up recurring cleaning tasks.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.area ?? '—'}</TableCell>
                      <TableCell className="capitalize">{s.cadence ?? '—'}</TableCell>
                      <TableCell>
                        {s.next_due_at ? (
                          <span className="flex items-center gap-1 text-sm">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {new Date(s.next_due_at).toLocaleDateString()}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{s.assigned_to ?? '—'}</TableCell>
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
