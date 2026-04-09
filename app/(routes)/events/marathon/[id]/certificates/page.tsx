'use client';

// app/(routes)/events/marathon/[id]/certificates/page.tsx
// Marathon certificate generation and management page.
// Created: 2026-04-07

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DataTable, type PermissionColumnDef } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useCertificateStats,
  useCertificateList,
  useGenerateCertificates,
} from '@/hooks/events/marathon/use-marathon-results';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import {
  Loader2,
  Award,
  Users,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';

// ============================================================================
// Stats Cards
// ============================================================================

function CertStatsCards({ eventId }: { eventId: string }) {
  const { data: stats, isLoading } = useCertificateStats(eventId);

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Finishers',
      value: stats.total_finishers,
      icon: Users,
      sub: 'Eligible for certificate',
    },
    {
      label: 'Generated',
      value: stats.generated,
      icon: CheckCircle2,
      sub:
        stats.total_finishers > 0
          ? `${Math.round((stats.generated / stats.total_finishers) * 100)}% complete`
          : '0%',
    },
    {
      label: 'Pending',
      value: stats.pending,
      icon: Clock,
      sub: stats.pending > 0 ? 'Click "Generate All" to create' : 'All done!',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Generate Confirmation Dialog
// ============================================================================

function GenerateCertificatesDialog({
  open,
  onOpenChange,
  eventId,
  pendingCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  pendingCount: number;
}) {
  const generateMutation = useGenerateCertificates();

  const handleGenerate = async () => {
    await generateMutation.mutateAsync(eventId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Certificates
          </DialogTitle>
          <DialogDescription>
            Generate certificate IDs for {pendingCount} eligible finisher
            {pendingCount !== 1 ? 's' : ''} who don&apos;t have one yet.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm text-muted-foreground">
            Each certificate ID is unique and can be used for public verification.
            This action cannot be undone.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generateMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Award className="h-4 w-4 mr-2" />
                Generate {pendingCount} Certificate{pendingCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

type CertRow = {
  id: string;
  bib_number: string;
  finish_time: string | null;
  rank_overall: number | null;
  certificate_id: string;
  certificate_generated_at: string | null;
  registration: { participant_name: string } | null;
};

export default function MarathonCertificatesPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data: stats } = useCertificateStats(eventId);
  const { data: certList, isLoading, error, refetch } = useCertificateList(eventId);

  const columns: PermissionColumnDef<CertRow>[] = useMemo(
    () => [
      {
        accessorKey: 'rank_overall',
        header: 'Rank',
        cell: ({ row }) => {
          const rank = row.original.rank_overall;
          return rank ? (
            <span className="font-bold tabular-nums">
              {rank <= 3 ? (
                <span
                  className={
                    rank === 1
                      ? 'text-yellow-500'
                      : rank === 2
                      ? 'text-gray-400'
                      : 'text-amber-600'
                  }
                >
                  #{rank}
                </span>
              ) : (
                `#${rank}`
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: 'bib_number',
        header: 'BIB',
        cell: ({ row }) => (
          <span className="font-mono font-medium text-sm">{row.original.bib_number}</span>
        ),
      },
      {
        id: 'participant_name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="font-medium">
            {row.original.registration?.participant_name ?? (
              <span className="text-muted-foreground">-</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'finish_time',
        header: 'Finish Time',
        cell: ({ row }) => {
          const t = row.original.finish_time;
          return t ? (
            <span className="font-mono text-sm">{t}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: 'certificate_id',
        header: 'Certificate ID',
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-xs">
            {row.original.certificate_id}
          </Badge>
        ),
      },
      {
        accessorKey: 'certificate_generated_at',
        header: 'Generated At',
        cell: ({ row }) => {
          const d = row.original.certificate_generated_at;
          if (!d) return <span className="text-muted-foreground">-</span>;
          try {
            return (
              <span className="text-sm text-muted-foreground">
                {format(new Date(d), 'dd MMM yyyy, HH:mm')}
              </span>
            );
          } catch {
            return d;
          }
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              const certId = row.original.certificate_id;
              window.open(`/verify/certificate/${certId}`, '_blank');
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Verify
          </Button>
        ),
      },
    ],
    []
  );

  // Search on name, BIB, cert ID
  const globalFilterFn = (row: any, _: string, filterValue: string): boolean => {
    const q = filterValue.toLowerCase();
    const r = row.original as CertRow;
    return (
      (r.bib_number?.toLowerCase().includes(q) ?? false) ||
      (r.registration?.participant_name?.toLowerCase().includes(q) ?? false) ||
      (r.certificate_id?.toLowerCase().includes(q) ?? false)
    );
  };

  const pendingCount = stats?.pending ?? 0;

  if (eventLoading) {
    return (
      <ContentLayout title="Certificates">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} — Certificates`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '…', href: `/events/marathon/${eventId}/settings` },
          { label: 'Certificates' },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">Certificates</h1>
            <p className="text-sm text-muted-foreground">
              Generate and manage participation certificates for finishers.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setGenerateDialogOpen(true)}
            disabled={pendingCount === 0}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate All Certificates
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {pendingCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Stats */}
        <CertStatsCards eventId={eventId} />

        {/* Table */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load certificates. Please try again.
          </div>
        )}

        {!isLoading && !error && (
          <>
            {(certList ?? []).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground space-y-2">
                <Award className="h-8 w-8 mx-auto opacity-40" />
                <p className="text-sm">No certificates generated yet.</p>
                {pendingCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGenerateDialogOpen(true)}
                  >
                    Generate {pendingCount} Certificate{pendingCount !== 1 ? 's' : ''}
                  </Button>
                )}
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={certList ?? []}
                searchPlaceholder="Search by name, BIB, or certificate ID…"
                globalFilterFn={globalFilterFn}
                onRefresh={() => refetch()}
              />
            )}
          </>
        )}
      </div>

      <GenerateCertificatesDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        eventId={eventId}
        pendingCount={pendingCount}
      />
    </ContentLayout>
  );
}
