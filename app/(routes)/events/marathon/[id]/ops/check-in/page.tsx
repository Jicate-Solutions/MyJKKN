'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Search,
  UserCheck,
  Users,
  ScanLine,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

const ACTION = 'check_in' as const;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function CheckInPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();
  const access = useMarathonAccess();

  const [scanResult, setScanResult] = useState<OpsScanResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked_in' | 'not_checked_in'>('all');
  const [filterInstitution, setFilterInstitution] = useState<string>('all');
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
          id, bib_number, participant_name, participant_email, participant_phone,
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

  // Fetch institution mapping: email → institution name via profiles table
  const { data: institutionMap } = useQuery({
    queryKey: ['marathon-ops-institution-map', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      // Get all JKKN emails from registrations, then match to profiles → institutions
      const { data } = await (supabase as any)
        .from('profiles')
        .select('email, institution:institutions(id, name)')
        .not('email', 'is', null)
        .not('institution_id', 'is', null);

      // Build email → institution map
      const map = new Map<string, { id: string; name: string }>();
      for (const p of data ?? []) {
        if (p.email && p.institution) {
          map.set(p.email.toLowerCase(), {
            id: (p.institution as any).id,
            name: (p.institution as any).name,
          });
        }
      }
      return map;
    },
    enabled: !!eventId,
  });

  // Enrich registrations with institution info
  const enrichedRegistrations = useMemo(() => {
    if (!registrations) return [];
    return registrations.map((r: any) => {
      const inst = r.participant_email
        ? institutionMap?.get(r.participant_email.toLowerCase())
        : null;
      return {
        ...r,
        _institution_name: inst?.name ?? null,
        _institution_id: inst?.id ?? null,
      };
    });
  }, [registrations, institutionMap]);

  // Extract unique institutions for the filter dropdown
  const institutionOptions = useMemo(() => {
    const instMap = new Map<string, string>();
    for (const r of enrichedRegistrations) {
      if (r._institution_id && r._institution_name) {
        instMap.set(r._institution_id, r._institution_name);
      }
    }
    // Sort alphabetically
    return Array.from(instMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedRegistrations]);

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
      // Text search
      if (searchQuery.length >= 2) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          r.bib_number?.toLowerCase().includes(q) ||
          r.participant_name?.toLowerCase().includes(q) ||
          r.participant_email?.toLowerCase().includes(q) ||
          r.participant_phone?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      // Status filter
      if (filterStatus === 'checked_in' && !r.checked_in) return false;
      if (filterStatus === 'not_checked_in' && r.checked_in) return false;
      // Institution filter
      if (filterInstitution === '_external' && r._institution_id) return false;
      if (filterInstitution !== 'all' && filterInstitution !== '_external' && r._institution_id !== filterInstitution) return false;
      return true;
    });
  }, [enrichedRegistrations, searchQuery, filterStatus, filterInstitution]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery, filterStatus, filterInstitution, pageSize]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const checkedInPct = stats ? Math.round(((stats.checked_in ?? 0) / Math.max(stats.total, 1)) * 100) : 0;

  // Block non-admin users
  if (!access.isLoading && !access.canAccessOps) {
    return <MarathonAccessDenied title="Check-in" eventId={eventId} />;
  }

  return (
    <ContentLayout title={`${eventName} - Check-in`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/dashboard` },
          { label: 'Check-in' },
        ]}
      />

      <div className="space-y-5 mt-4">
        {/* ── Header with stats ─────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-500/10">
              <UserCheck className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Check-in Station</h1>
              <p className="text-sm text-muted-foreground">{eventName}</p>
            </div>
          </div>

          {/* Action buttons + Live counter */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Scan QR button → opens scanner dialog */}
            <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700">
                  <ScanLine className="h-4 w-4" />
                  Scan QR Code
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ScanLine className="h-5 w-5" />
                    QR Scanner
                  </DialogTitle>
                </DialogHeader>
                <BibScanner onScan={handleScan} disabled={processScan.isPending} />
              </DialogContent>
            </Dialog>

            {/* Live counters */}
            <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-sm">
              <UserCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm font-semibold tabular-nums">
                {stats?.checked_in ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">
                / {stats?.total ?? 0}
              </span>
            </div>
            <div className="rounded-full border bg-green-50 px-3 py-2 shadow-sm">
              <span className="text-sm font-bold text-green-700 tabular-nums">{checkedInPct}%</span>
            </div>
          </div>
        </div>

        {/* ── Scan Result (inline, above table) ────────────────── */}
        {scanResult && (
          <ScanResultCard result={scanResult} className="animate-in slide-in-from-top-2" />
        )}

        {/* ── Full-width: Filters + Table ──────────────────────── */}
        <div className="space-y-4">
            {/* Filter bar */}
            <Card>
              <CardContent className="p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Search input */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search BIB, name, or phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Institution filter */}
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

                  {/* Status filter */}
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Participants</SelectItem>
                      <SelectItem value="checked_in">Checked In</SelectItem>
                      <SelectItem value="not_checked_in">Not Checked In</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Result count */}
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
                            <TableHead className="hidden xl:table-cell font-semibold">Phone</TableHead>
                            <TableHead className="hidden lg:table-cell font-semibold">Category</TableHead>
                            <TableHead className="hidden xl:table-cell font-semibold">Institution</TableHead>
                            <TableHead className="font-semibold">Stall</TableHead>
                            <TableHead className="font-semibold">Status</TableHead>
                            <TableHead className="hidden md:table-cell font-semibold">Time</TableHead>
                            <TableHead className="w-[100px] font-semibold text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                                {searchQuery.length >= 2
                                  ? `No results for "${searchQuery}"`
                                  : 'No registrations found.'}
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedData.map((r: any) => (
                              <TableRow
                                key={r.id}
                                className={cn(
                                  'transition-colors',
                                  r.checked_in && 'bg-green-50/50 dark:bg-green-950/10'
                                )}
                              >
                                <TableCell className="font-mono font-bold text-sm">
                                  {r.bib_number}
                                </TableCell>
                                <TableCell className="max-w-[200px]">
                                  <div className="font-medium truncate">{r.participant_name}</div>
                                  {r.participant_email && (
                                    <div className="text-xs text-muted-foreground truncate">{r.participant_email}</div>
                                  )}
                                </TableCell>
                                <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                                  {r.participant_phone ?? '-'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  <Badge variant="outline" className="text-xs">
                                    {r.category?.code ?? r.category?.name ?? '-'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="hidden xl:table-cell">
                                  {r._institution_name ? (
                                    <Badge variant="secondary" className="text-[10px] font-medium">
                                      <Building2 className="h-2.5 w-2.5 mr-1" />
                                      {r._institution_name.replace('JKKN ', '')}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">External</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {r.stall?.stall_name ? (
                                    <Badge variant="secondary" className="text-xs font-medium">
                                      {r.stall.stall_name}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {r.checked_in ? (
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
                                      <UserCheck className="h-3 w-3 mr-1" />
                                      Yes
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-muted-foreground">
                                      No
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                                  {formatTime(r.checked_in_at)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant={r.checked_in ? 'ghost' : 'default'}
                                    disabled={r.checked_in || processScan.isPending}
                                    onClick={() => handleScan(r.bib_number)}
                                    className="h-8 text-xs"
                                  >
                                    {processScan.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : r.checked_in ? (
                                      'Done'
                                    ) : (
                                      'Check In'
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ── Pagination ─────────────────────────────── */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t px-4 py-3">
                      {/* Left: rows info + page size */}
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

                      {/* Right: page controls */}
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
    </ContentLayout>
  );
}
