'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../../_components/marathon-access-denied';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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


const PAGE_SIZE_OPTIONS = [20, 40, 80];

export default function QrCodesPage() {
  const params = useParams();
  const eventId = params.id as string;
  const queryClient = useQueryClient();
  const access = useMarathonAccess();

  const [searchQuery, setSearchQuery] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0); // cache-bust for QR images
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<{
    generated: number;
    skipped: number;
    failed: number;
  } | null>(null);

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
  const { data: registrations, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['marathon-qr-registrations', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events_registrations')
        .select('id, bib_number, participant_name, qr_code_url, qr_generated_at, stall:events_stalls(stall_code)')
        .eq('event_id', eventId)
        .not('bib_number', 'is', null)
        .order('bib_number');
      return data ?? [];
    },
  });

  // Client-side filter
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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  // Reset page on filter/size change
  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery, pageSize]);

  // Refresh: re-fetch registrations + cache-bust QR images
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['marathon-qr-registrations', eventId] });
    setRefreshKey((k) => k + 1); // forces new image URLs
  };

  // Download All as ZIP
  const handleDownloadAll = () => {
    setDownloading(true);
    window.open(`/api/events/marathon/${eventId}/qr/bulk`);
    setTimeout(() => setDownloading(false), 5000);
  };

  // Download individual QR code
  const handleDownloadSingle = (bibNumber: string) => {
    const link = document.createElement('a');
    link.href = `/api/events/marathon/${eventId}/qr/${bibNumber}?v=${refreshKey}`;
    link.download = `QR-${bibNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate QR codes (only ungenerated)
  const handleGenerate = async () => {
    setGenerating(true);
    setGenerationResult(null);
    try {
      const res = await fetch(`/api/events/marathon/${eventId}/qr/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      });
      const result = await res.json();
      setGenerationResult(result);
      queryClient.invalidateQueries({ queryKey: ['marathon-qr-registrations', eventId] });
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to generate QR codes');
    } finally {
      setGenerating(false);
    }
  };

  // Regenerate a single QR code
  const handleRegenerateSingle = async (bibNumber: string) => {
    try {
      const res = await fetch(`/api/events/marathon/${eventId}/qr/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, bibNumbers: [bibNumber] }),
      });
      const result = await res.json();
      if (result.generated > 0) {
        toast.success(`Regenerated QR for ${bibNumber}`);
        queryClient.invalidateQueries({ queryKey: ['marathon-qr-registrations', eventId] });
        setRefreshKey((k) => k + 1);
      }
    } catch {
      toast.error(`Failed to regenerate QR for ${bibNumber}`);
    }
  };

  // Stats
  const generatedCount = (registrations ?? []).filter((r: any) => r.qr_code_url).length;
  const pendingCount = (registrations ?? []).length - generatedCount;

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  }) : null;

  // Block non-admin users
  if (!access.isLoading && !access.canAccessOps) {
    return <MarathonAccessDenied title="QR Codes" eventId={eventId} />;
  }

  return (
    <ContentLayout title={`${eventName} - QR Codes`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/dashboard` },
          { label: 'QR Codes' },
        ]}
      />

      <div className="space-y-5 mt-4">
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <QrCode className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">QR Codes</h1>
              <p className="text-sm text-muted-foreground">
                {registrations?.length ?? 0} participants
                {registrations && registrations.length > 0 && (
                  <span> &middot; {generatedCount} generated, {pendingCount} pending</span>
                )}
                {lastUpdated && <span> &middot; Updated {lastUpdated}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={generating || !registrations?.length}
              className="gap-1.5"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4" />
              )}
              Generate New
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadAll}
              disabled={downloading || !registrations?.length}
              className="gap-1.5"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download All (ZIP)
            </Button>
          </div>
        </div>

        {/* ── Generation result banner ──────────────────────────── */}
        {generationResult && (
          <div className="flex items-center gap-2 rounded-lg border bg-green-50 px-4 py-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            Generated {generationResult.generated} QR codes
            {generationResult.failed > 0 && `, ${generationResult.failed} failed`}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 text-xs"
              onClick={() => setGenerationResult(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* ── Filter bar ───────────────────────────────────────── */}
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

              <div className="flex items-center gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger className="w-[90px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Badge variant="secondary" className="whitespace-nowrap">
                  <Users className="h-3 w-3 mr-1" />
                  {filtered.length}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Loading ──────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── Empty State ──────────────────────────────────────── */}
        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <QrCode className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">
                {searchQuery.length >= 2
                  ? `No participants match "${searchQuery}"`
                  : 'No participants with BIB numbers found.'}
              </p>
              <p className="text-sm mt-1">Register participants and assign BIB numbers first.</p>
            </CardContent>
          </Card>
        )}

        {/* ── QR Code Grid ─────────────────────────────────────── */}
        {!isLoading && paginatedData.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {paginatedData.map((reg: any) => (
                <Card key={reg.id} className="group overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-3 flex flex-col items-center gap-2">
                    {/* QR code image */}
                    <div className="relative w-full aspect-[4/5] bg-white rounded-md border overflow-hidden">
                      <img
                        src={reg.qr_code_url || `/api/events/marathon/${eventId}/qr/${reg.bib_number}${refreshKey > 0 ? `?v=${refreshKey}` : ''}`}
                        alt={`QR code for BIB ${reg.bib_number}`}
                        loading="lazy"
                        className="w-full h-full object-contain"
                      />
                      {/* Download overlay on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-end justify-center gap-1 pb-2 opacity-0 group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs shadow-sm"
                          onClick={() => handleDownloadSingle(reg.bib_number)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                        {reg.qr_code_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegenerateSingle(reg.bib_number);
                            }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Regen
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="w-full text-center space-y-0.5">
                      <p className="text-base font-bold font-mono">{reg.bib_number}</p>
                      {reg.qr_code_url ? (
                        <Badge variant="outline" className="text-[10px] text-green-700 border-green-200 bg-green-50 gap-1">
                          <Lock className="h-2.5 w-2.5" /> Generated
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                          <Clock className="h-2.5 w-2.5" /> Pending
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground truncate">{reg.participant_name}</p>
                      {reg.stall?.stall_code && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Stall {reg.stall.stall_code}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Pagination ──────────────────────────────────── */}
            <Card>
              <CardContent className="p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {pageIndex * pageSize + 1}-{Math.min((pageIndex + 1) * pageSize, filtered.length)} of{' '}
                    <strong>{filtered.length}</strong> participants
                  </span>

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
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
