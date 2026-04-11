'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Package,
  ScanLine,
  Search,
  Shirt,
  UserCheck,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { useProcessScan, useOpsStats } from '@/hooks/events/marathon/use-marathon-ops';
import { MarathonAccessDenied } from '../../_components/marathon-access-denied';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { OpsScanResult } from '@/types/events-marathon';

import { BibScanner } from '@/components/marathon/bib-scanner';
import { ScanResultCard } from '@/components/marathon/scan-result-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

const ACTION = 'tshirt' as const;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function TshirtPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();
  const access = useMarathonAccess();

  const [scanResult, setScanResult] = useState<OpsScanResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'collected' | 'not_collected'>('all');
  const [filterInstitution, setFilterInstitution] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const processScan = useProcessScan();
  const { data: stats } = useOpsStats(eventId);

  const { data: event } = useQuery({
    queryKey: ['marathon-event-name', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events')
        .select('name')
        .eq('id', eventId)
        .single();
      return data;
    },
    enabled: !!eventId,
  });
  const eventName = event?.name ?? 'Marathon';

  // Auto-clear scan result after 5 seconds
  useEffect(() => {
    if (!scanResult) return;
    const timer = setTimeout(() => setScanResult(null), 5000);
    return () => clearTimeout(timer);
  }, [scanResult]);

  // Fetch registrations
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['marathon-ops-registrations', eventId, ACTION],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events_registrations')
        .select(`
          id, bib_number, participant_name, participant_phone, participant_email,
          checked_in, checked_in_at,
          tshirt_collected, tshirt_collected_at,
          certificate_issued, certificate_issued_at,
          custom_data,
          category:event_categories(name, code),
          stall:events_stalls(stall_name, stall_code)
        `)
        .eq('event_id', eventId)
        .order('bib_number', { ascending: true });
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: profileMap } = useQuery({
    queryKey: ['marathon-ops-profile-map', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data: profiles } = await (supabase as any)
        .from('profiles')
        .select('id, email, learner_id, institution:institutions(id, name)')
        .not('email', 'is', null)
        .not('institution_id', 'is', null);
      const { data: learners } = await (supabase as any)
        .from('learners_profiles')
        .select('id, department:departments(id, department_name), semester:semesters(id, semester_name)');
      const learnerLookup = new Map<string, { dept_id: string | null; dept_name: string | null; sem_id: string | null; sem_name: string | null }>();
      for (const l of learners ?? []) {
        learnerLookup.set(l.id, {
          dept_id: l.department?.id ?? null,
          dept_name: l.department?.department_name ?? null,
          sem_id: l.semester?.id ?? null,
          sem_name: l.semester?.semester_name ?? null,
        });
      }
      const map = new Map<string, {
        institution_id: string; institution_name: string;
        department_id: string | null; department_name: string | null;
        semester_id: string | null; semester_name: string | null;
      }>();
      for (const p of profiles ?? []) {
        if (!p.email || !p.institution) continue;
        const learner = p.learner_id ? learnerLookup.get(p.learner_id) : null;
        map.set(p.email.toLowerCase(), {
          institution_id: (p.institution as any).id,
          institution_name: (p.institution as any).name,
          department_id: learner?.dept_id ?? null,
          department_name: learner?.dept_name ?? null,
          semester_id: learner?.sem_id ?? null,
          semester_name: learner?.sem_name ?? null,
        });
      }
      return map;
    },
    enabled: !!eventId,
  });

  const enrichedRegistrations = useMemo(() => {
    if (!registrations) return [];
    return registrations.map((r: any) => {
      const profile = r.participant_email
        ? profileMap?.get(r.participant_email.toLowerCase())
        : null;
      return {
        ...r,
        _institution_name: profile?.institution_name ?? null,
        _institution_id: profile?.institution_id ?? null,
        _department_name: profile?.department_name ?? null,
        _department_id: profile?.department_id ?? null,
        _semester_name: profile?.semester_name ?? null,
        _semester_id: profile?.semester_id ?? null,
      };
    });
  }, [registrations, profileMap]);

  const institutionOptions = useMemo(() => {
    const instMap = new Map<string, string>();
    for (const r of enrichedRegistrations) {
      if (r._institution_id && r._institution_name) {
        instMap.set(r._institution_id, r._institution_name);
      }
    }
    return Array.from(instMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedRegistrations]);

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of enrichedRegistrations) {
      if (!r._department_id || !r._department_name) continue;
      if (filterInstitution !== 'all' && filterInstitution !== '_external' && r._institution_id !== filterInstitution) continue;
      map.set(r._department_id, r._department_name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedRegistrations, filterInstitution]);

  const semesterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of enrichedRegistrations) {
      if (!r._semester_id || !r._semester_name) continue;
      if (filterInstitution !== 'all' && filterInstitution !== '_external' && r._institution_id !== filterInstitution) continue;
      if (filterDepartment !== 'all' && r._department_id !== filterDepartment) continue;
      map.set(r._semester_id, r._semester_name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedRegistrations, filterInstitution, filterDepartment]);

  const handleScan = useCallback(
    async (bibNumber: string) => {
      if (!profile?.id) return;
      try {
        const result = await processScan.mutateAsync({
          eventId,
          bibNumber,
          action: ACTION,
          operatorId: profile.id,
        });
        setScanResult(result);
      } catch {
        // Error handled by mutation hook
      }
    },
    [eventId, profile?.id, processScan]
  );

  // Client-side filtering
  const filtered = useMemo(() => {
    return enrichedRegistrations.filter((r: any) => {
      if (searchQuery.length >= 2) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          r.bib_number?.toLowerCase().includes(q) ||
          r.participant_name?.toLowerCase().includes(q) ||
          r.participant_phone?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (filterInstitution === '_external' && r._institution_id) return false;
      if (filterInstitution !== 'all' && filterInstitution !== '_external' && r._institution_id !== filterInstitution) return false;
      if (filterDepartment !== 'all' && r._department_id !== filterDepartment) return false;
      if (filterSemester !== 'all' && r._semester_id !== filterSemester) return false;
      if (filterStatus === 'collected' && !r.tshirt_collected) return false;
      if (filterStatus === 'not_collected' && r.tshirt_collected) return false;
      return true;
    });
  }, [enrichedRegistrations, searchQuery, filterInstitution, filterDepartment, filterSemester, filterStatus]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  // Reset page on filter change
  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery, filterInstitution, filterDepartment, filterSemester, filterStatus, pageSize]);

  useEffect(() => {
    setFilterDepartment('all');
    setFilterSemester('all');
  }, [filterInstitution]);

  useEffect(() => {
    setFilterSemester('all');
  }, [filterDepartment]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const collectedPct = stats ? Math.round(((stats.tshirt_collected ?? 0) / Math.max(stats.total, 1)) * 100) : 0;

  // Block non-admin users
  if (!access.isLoading && !access.canAccessOps) {
    return <MarathonAccessDenied title="T-Shirt Distribution" eventId={eventId} />;
  }

  return (
    <ContentLayout title={`${eventName} - T-Shirt Distribution`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/dashboard` },
          { label: 'T-Shirt' },
        ]}
      />

      <div className="space-y-5 mt-4">
        {/* ── Header with stats ─────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10">
              <Shirt className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">T-Shirt Distribution</h1>
              <p className="text-sm text-muted-foreground">{eventName}</p>
            </div>
          </div>

          {/* Live counter pills */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-sm">
              <Shirt className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-semibold tabular-nums">
                {stats?.tshirt_collected ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                / {stats?.total ?? 0}
              </span>
            </div>
            <div className="rounded-full border bg-purple-50 px-3 py-2 shadow-sm">
              <span className="text-sm font-bold text-purple-700 tabular-nums">{collectedPct}%</span>
            </div>
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT: Scanner + Result */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ScanLine className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">QR Scanner</span>
                </div>
                <BibScanner onScan={handleScan} disabled={processScan.isPending} />
              </CardContent>
            </Card>

            {scanResult && (
              <ScanResultCard result={scanResult} className="animate-in slide-in-from-top-2" />
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Package className="h-4 w-4 mx-auto text-purple-500 mb-1" />
                  <p className="text-2xl font-bold tabular-nums text-purple-600">{stats?.tshirt_collected ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Collected</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Shirt className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-2xl font-bold tabular-nums">{(stats?.total ?? 0) - (stats?.tshirt_collected ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Remaining</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* RIGHT: Filters + Table */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            {/* Filter bar */}
            <Card>
              <CardContent className="p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search BIB, name, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Select value={filterInstitution} onValueChange={(v) => setFilterInstitution(v)}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="Institution" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Institutions</SelectItem>
                      <SelectItem value="_external">External Only</SelectItem>
                      {institutionOptions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name.replace('JKKN ', '')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {filterInstitution !== 'all' && filterInstitution !== '_external' && departmentOptions.length > 0 && (
                    <Select value={filterDepartment} onValueChange={(v) => setFilterDepartment(v)}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {departmentOptions.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {filterDepartment !== 'all' && semesterOptions.length > 0 && (
                    <Select value={filterSemester} onValueChange={(v) => setFilterSemester(v)}>
                      <SelectTrigger className="w-full sm:w-[160px]">
                        <SelectValue placeholder="Semester" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Semesters</SelectItem>
                        {semesterOptions.map((sem) => (
                          <SelectItem key={sem.id} value={sem.id}>
                            {sem.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Participants</SelectItem>
                      <SelectItem value="collected">Collected</SelectItem>
                      <SelectItem value="not_collected">Not Collected</SelectItem>
                    </SelectContent>
                  </Select>

                  <Badge variant="secondary" className="whitespace-nowrap hidden sm:flex">
                    {filtered.length} results
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[80px] font-semibold">BIB</TableHead>
                            <TableHead className="font-semibold">Name</TableHead>
                            <TableHead className="font-semibold">Size</TableHead>
                            <TableHead className="font-semibold">Checked In</TableHead>
                            <TableHead className="font-semibold">T-Shirt</TableHead>
                            <TableHead className="hidden md:table-cell font-semibold">Time</TableHead>
                            <TableHead className="w-[120px] font-semibold text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                                {searchQuery.length >= 2
                                  ? `No results for "${searchQuery}"`
                                  : 'No registrations found.'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedData.map((r: any) => {
                              const customData = r.custom_data as Record<string, unknown> | undefined;
                              const tshirtSize = (customData?.tshirt_size as string) ?? '-';
                              return (
                                <TableRow
                                  key={r.id}
                                  className={cn(
                                    'transition-colors',
                                    r.tshirt_collected && 'bg-purple-50/50 dark:bg-purple-950/10'
                                  )}
                                >
                                  <TableCell className="font-mono font-bold text-sm">
                                    {r.bib_number}
                                  </TableCell>
                                  <TableCell className="font-medium max-w-[180px] truncate">
                                    {r.participant_name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="font-semibold">
                                      {tshirtSize}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {r.checked_in ? (
                                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
                                        <UserCheck className="h-3 w-3 mr-1" />
                                        Yes
                                      </Badge>
                                    ) : (
                                      <div className="flex items-center gap-1 text-yellow-700">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <span className="text-xs font-medium">Not checked in</span>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {r.tshirt_collected ? (
                                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-200">
                                        <Shirt className="h-3 w-3 mr-1" />
                                        Yes
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-muted-foreground">
                                        No
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                                    {formatTime(r.tshirt_collected_at)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant={r.tshirt_collected ? 'ghost' : 'default'}
                                      disabled={r.tshirt_collected || processScan.isPending}
                                      onClick={() => handleScan(r.bib_number)}
                                      className="h-8 text-xs"
                                    >
                                      {processScan.isPending ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : r.tshirt_collected ? (
                                        'Done'
                                      ) : (
                                        'Mark Collected'
                                      )}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ── Pagination ─────────────────────────────── */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t px-4 py-3">
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>
                          Showing {pageIndex * pageSize + 1}-{Math.min((pageIndex + 1) * pageSize, filtered.length)} of{' '}
                          <strong>{filtered.length}</strong>
                        </span>
                        <Select
                          value={String(pageSize)}
                          onValueChange={(v) => setPageSize(Number(v))}
                        >
                          <SelectTrigger className="h-8 w-[75px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="hidden sm:inline">per page</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPageIndex(0)}
                          disabled={pageIndex === 0}
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                          disabled={pageIndex === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <span className="px-3 text-sm font-medium tabular-nums">
                          Page {pageIndex + 1} of {totalPages}
                        </span>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={pageIndex >= totalPages - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPageIndex(totalPages - 1)}
                          disabled={pageIndex >= totalPages - 1}
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
