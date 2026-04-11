'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, UserCheck } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useProcessScan, useOpsStats } from '@/hooks/events/marathon/use-marathon-ops';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { OpsScanResult } from '@/types/events-marathon';

import { BibScanner } from '@/components/marathon/bib-scanner';
import { ScanResultCard } from '@/components/marathon/scan-result-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ACTION = 'check_in' as const;

export default function CheckInPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();

  const [scanResult, setScanResult] = useState<OpsScanResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Fetch registrations for the table
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['marathon-ops-registrations', eventId, ACTION],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events_registrations')
        .select(`
          id, bib_number, participant_name, participant_phone,
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

  const handleManualMark = useCallback(
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
  const filtered = (registrations ?? []).filter((r: any) => {
    if (searchQuery.length < 2) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.bib_number?.toLowerCase().includes(q) ||
      r.participant_name?.toLowerCase().includes(q) ||
      r.participant_phone?.toLowerCase().includes(q)
    );
  });

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ContentLayout title={`${eventName} - Check-in`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/settings` },
          { label: 'Check-in' },
        ]}
      />

      <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Check-in Station</h1>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2">
          <UserCheck className="h-5 w-5 text-green-600" />
          <span className="text-lg font-semibold">
            {stats?.checked_in ?? 0} / {stats?.total ?? 0}
          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Scanner + Result */}
        <div className="flex flex-col gap-4 lg:w-1/3">
          <BibScanner onScan={handleScan} disabled={processScan.isPending} />
          <ScanResultCard result={scanResult} />
        </div>

        {/* Right: Search + Table */}
        <div className="flex flex-col gap-4 lg:w-2/3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by BIB, name, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">BIB</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden lg:table-cell">Stall</TableHead>
                    <TableHead>Checked In</TableHead>
                    <TableHead className="hidden sm:table-cell">Time</TableHead>
                    <TableHead className="w-[120px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No registrations found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono font-bold">{r.bib_number}</TableCell>
                        <TableCell>{r.participant_name}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {r.participant_phone ?? '-'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {r.category?.name ?? r.category?.code ?? '-'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {r.stall?.stall_name ?? '-'}
                        </TableCell>
                        <TableCell>
                          {r.checked_in ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {formatTime(r.checked_in_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            disabled={r.checked_in || processScan.isPending}
                            onClick={() => handleManualMark(r.bib_number)}
                          >
                            Check In
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
      </div>
    </ContentLayout>
  );
}
