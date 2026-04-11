'use client';

// app/(routes)/events/marathon/[id]/ops/qr-codes/page.tsx
// QR Codes page — view and download QR codes for all participants.
// Created: 2026-04-11

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, QrCode, Search } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ============================================================================
// Main Page
// ============================================================================

export default function QrCodesPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [searchQuery, setSearchQuery] = useState('');
  const [downloading, setDownloading] = useState(false);

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

  // Fetch registrations with BIB numbers
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['marathon-qr-registrations', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events_registrations')
        .select('id, bib_number, participant_name, stall:events_stalls(stall_code)')
        .eq('event_id', eventId)
        .not('bib_number', 'is', null)
        .order('bib_number');
      return data ?? [];
    },
  });

  // Client-side filter when search has 2+ chars
  const filtered = useMemo(() => {
    if (!registrations) return [];
    if (searchQuery.length < 2) return registrations;
    const q = searchQuery.toLowerCase();
    return registrations.filter(
      (r: any) =>
        r.bib_number?.toLowerCase().includes(q) ||
        r.participant_name?.toLowerCase().includes(q),
    );
  }, [registrations, searchQuery]);

  // Download All as ZIP
  const handleDownloadAll = () => {
    setDownloading(true);
    window.open(`/api/events/marathon/${eventId}/qr/bulk`);
    // Reset after a short delay (download starts in new tab)
    setTimeout(() => setDownloading(false), 3000);
  };

  // Download individual QR code
  const handleDownloadSingle = (bibNumber: string) => {
    const link = document.createElement('a');
    link.href = `/api/events/marathon/${eventId}/qr/${bibNumber}`;
    link.download = `QR-${bibNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <ContentLayout title={`${eventName} - QR Codes`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/settings` },
          { label: 'QR Codes' },
        ]}
      />

      <div className="space-y-4 mt-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">QR Codes</h1>
          {registrations && (
            <Badge variant="secondary" className="ml-1">
              {registrations.length}
            </Badge>
          )}
        </div>
        <Button onClick={handleDownloadAll} disabled={downloading || !registrations?.length}>
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Download All (ZIP)
        </Button>
      </div>

      {/* ── Search / Filter ─────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by BIB or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────────────── */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          {searchQuery.length >= 2
            ? 'No participants match your search.'
            : 'No participants with BIB numbers found.'}
        </div>
      )}

      {/* ── QR Code Grid ────────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((reg: any) => (
            <Card key={reg.id} className="overflow-hidden">
              <CardContent className="p-4 flex flex-col items-center gap-3">
                {/* QR code image */}
                <img
                  src={`/api/events/marathon/${eventId}/qr/${reg.bib_number}`}
                  alt={`QR code for BIB ${reg.bib_number}`}
                  loading="lazy"
                  className="w-full max-w-[180px] aspect-square rounded border bg-white"
                />

                {/* BIB number */}
                <div className="text-lg font-bold font-mono">{reg.bib_number}</div>

                {/* Participant name */}
                <div className="text-sm text-muted-foreground truncate w-full text-center">
                  {reg.participant_name}
                </div>

                {/* Stall assignment badge */}
                {reg.stall?.stall_code && (
                  <Badge variant="outline" className="text-xs">
                    Stall: {reg.stall.stall_code}
                  </Badge>
                )}

                {/* Download button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleDownloadSingle(reg.bib_number)}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </ContentLayout>
  );
}
