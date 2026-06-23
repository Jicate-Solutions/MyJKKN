'use client';

// components/events/shared/qr-board.tsx
// Shared QR-pass board for ANY event type (Events Platform Promotion PR5).
// Lists registrations with BIB numbers, shows their QR pass (generated or pending), and lets a manager
// generate passes (server-side, via the event-agnostic QR generate route) or download per-pass / all-as-ZIP.
// Read-only (download only) when canManage=false.

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Clock, Download, Loader2, Lock, QrCode, RefreshCw, Search, Users } from 'lucide-react';
import {
  useEventQrRegistrations,
  useGenerateQrPasses,
} from '@/hooks/events/shared/use-event-ops';

const qrSrc = (eventId: string, bib: string, refreshKey: number) =>
  `/api/events/marathon/${eventId}/qr/${bib}${refreshKey > 0 ? `?v=${refreshKey}` : ''}`;

export function QrBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { data: registrations, isLoading } = useEventQrRegistrations(eventId);
  const generate = useGenerateQrPasses(eventId);

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const filtered = useMemo(() => {
    const rows = (registrations ?? []) as any[];
    if (searchQuery.length < 2) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) => r.bib_number?.toLowerCase().includes(q) || r.participant_name?.toLowerCase().includes(q)
    );
  }, [registrations, searchQuery]);

  const generatedCount = (registrations ?? []).filter((r: any) => r.qr_code_url).length;
  const pendingCount = (registrations ?? []).length - generatedCount;

  const handleGenerate = () => {
    generate.mutate({ force: false }, { onSuccess: () => setRefreshKey((k) => k + 1) });
  };

  const handleRegenerateSingle = (bib: string) => {
    generate.mutate({ force: true, bibNumbers: [bib] }, { onSuccess: () => setRefreshKey((k) => k + 1) });
  };

  const handleDownloadAll = () => {
    setDownloading(true);
    window.open(`/api/events/marathon/${eventId}/qr/bulk`);
    setTimeout(() => setDownloading(false), 5000);
  };

  const handleDownloadSingle = (bib: string) => {
    const link = document.createElement('a');
    link.href = qrSrc(eventId, bib, refreshKey);
    link.download = `QR-${bib}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">QR Passes</h3>
          <p className="text-sm text-muted-foreground">
            {registrations?.length ?? 0} with BIB
            {(registrations?.length ?? 0) > 0 && (
              <span> &middot; {generatedCount} generated, {pendingCount} pending</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={generate.isPending || !registrations?.length}
              className="gap-1.5"
            >
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Generate New
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleDownloadAll}
            disabled={downloading || !generatedCount}
            className="gap-1.5"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download All (ZIP)
          </Button>
        </div>
      </div>

      {/* Generation result */}
      {generate.isSuccess && generate.data && (
        <div className="flex items-center gap-2 rounded-lg border bg-green-50 px-4 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Generated {generate.data.generated} QR pass{generate.data.generated === 1 ? '' : 'es'}
          {generate.data.failed > 0 && `, ${generate.data.failed} failed`}
        </div>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by BIB or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary" className="whitespace-nowrap">
              <Users className="mr-1 h-3 w-3" />
              {filtered.length}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <QrCode className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">
              {searchQuery.length >= 2
                ? `No participants match "${searchQuery}"`
                : 'No participants with BIB numbers found.'}
            </p>
            <p className="mt-1 text-sm">Assign BIB numbers to registrations first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((reg: any) => (
            <Card key={reg.id} className="group overflow-hidden transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col items-center gap-2 p-3">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={reg.qr_code_url || qrSrc(eventId, reg.bib_number, refreshKey)}
                    alt={`QR pass for BIB ${reg.bib_number}`}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-end justify-center gap-1 bg-black/0 pb-2 opacity-0 transition-colors group-hover:bg-black/5 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs shadow-sm"
                      onClick={() => handleDownloadSingle(reg.bib_number)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </Button>
                    {canManage && reg.qr_code_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleRegenerateSingle(reg.bib_number)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Regen
                      </Button>
                    )}
                  </div>
                </div>
                <div className="w-full space-y-0.5 text-center">
                  <p className="font-mono text-base font-bold">{reg.bib_number}</p>
                  {reg.qr_code_url ? (
                    <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-[10px] text-green-700">
                      <Lock className="h-2.5 w-2.5" /> Generated
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" /> Pending
                    </Badge>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{reg.participant_name}</p>
                  {reg.stall?.stall_code && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      Stall {reg.stall.stall_code}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
