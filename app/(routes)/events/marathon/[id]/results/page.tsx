'use client';

// app/(routes)/events/marathon/[id]/results/page.tsx
// Marathon results management — rankings table, GPS import, manual entry.
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useMarathonResults,
  useCreateResult,
  useRecalculateRankings,
  useMarkDNF,
  useDisqualifyResult,
} from '@/hooks/events/marathon/use-marathon-results';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../_components/marathon-access-denied';
import { ImportGPSResultsDialog } from './_components/import-gps-results';
import {
  Loader2,
  Satellite,
  Plus,
  RefreshCw,
  Trophy,
  Timer,
  Medal,
  MoreHorizontal,
  Pencil,
  Ban,
  Flag,
  Award,
} from 'lucide-react';
import { format } from 'date-fns';
import type { MarathonResult } from '@/types/events-marathon';

// ============================================================================
// Pace helper
// ============================================================================

function formatPace(paceSeconds: number | null, distanceKm: number | null): string {
  if (!paceSeconds || !distanceKm || distanceKm === 0) return '-';
  const perKm = Math.round(paceSeconds / distanceKm);
  const m = Math.floor(perKm / 60);
  const s = perKm % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// ============================================================================
// Stats Cards
// ============================================================================

function ResultsStatsCards({ results }: { results: MarathonResult[] }) {
  const finishers = results.filter((r) => !r.is_dnf && !r.is_disqualified);
  const dnfCount = results.filter((r) => r.is_dnf).length;
  const dqCount = results.filter((r) => r.is_disqualified).length;
  const withCert = results.filter((r) => r.certificate_id).length;

  const cards = [
    { label: 'Total Results', value: results.length, icon: Timer, sub: 'All entries' },
    { label: 'Finishers', value: finishers.length, icon: Trophy, sub: `${dnfCount} DNF, ${dqCount} DQ` },
    { label: 'Ranked', value: finishers.filter((r) => r.rank_overall).length, icon: Medal, sub: 'With rank assigned' },
    { label: 'Certificates', value: withCert, icon: Award, sub: `${finishers.length - withCert} pending` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
// Add Result Dialog
// ============================================================================

function AddResultDialog({
  open,
  onOpenChange,
  eventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
}) {
  const [bibNumber, setBibNumber] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [finishTime, setFinishTime] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useCreateResult();

  const handleSubmit = async () => {
    if (!bibNumber || !registrationId) return;
    await createMutation.mutateAsync({
      registration_id: registrationId,
      event_id: eventId,
      bib_number: bibNumber,
      finish_time: finishTime || undefined,
      notes: notes || undefined,
    });
    onOpenChange(false);
    setBibNumber('');
    setRegistrationId('');
    setFinishTime('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Manual Result</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bib">BIB Number *</Label>
              <Input
                id="bib"
                placeholder="e.g. 042"
                value={bibNumber}
                onChange={(e) => setBibNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finish-time">Finish Time</Label>
              <Input
                id="finish-time"
                placeholder="HH:MM:SS"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-id">Registration ID *</Label>
            <Input
              id="reg-id"
              placeholder="Paste registration UUID"
              value={registrationId}
              onChange={(e) => setRegistrationId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Find in the Registrations tab for the participant.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes…"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!bibNumber || !registrationId || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Disqualify Dialog
// ============================================================================

function DisqualifyDialog({
  open,
  onOpenChange,
  result,
  eventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: MarathonResult | null;
  eventId: string;
}) {
  const [reason, setReason] = useState('');
  const dqMutation = useDisqualifyResult();

  const handleConfirm = async () => {
    if (!result || !reason.trim()) return;
    await dqMutation.mutateAsync({ id: result.id, reason, eventId });
    onOpenChange(false);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-destructive">Disqualify Participant</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Disqualify BIB <strong>{result?.bib_number}</strong>? This will clear their
            ranking.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="dq-reason">Reason *</Label>
            <Textarea
              id="dq-reason"
              placeholder="State the reason for disqualification…"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason.trim() || dqMutation.isPending}
          >
            {dqMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Disqualify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonResultsPage() {
  const params = useParams();
  const eventId = params.id as string;
  const access = useMarathonAccess();

  const [gpsDialogOpen, setGpsDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [dqDialogOpen, setDqDialogOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<MarathonResult | null>(null);

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data: results, isLoading, error, refetch } = useMarathonResults(eventId);

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return <MarathonAccessDenied title="Results" eventId={eventId} />;
  }
  const recalculateMutation = useRecalculateRankings();
  const markDNFMutation = useMarkDNF();

  const columns: PermissionColumnDef<MarathonResult>[] = useMemo(
    () => [
      {
        accessorKey: 'rank_overall',
        header: 'Rank',
        cell: ({ row }) => {
          const rank = row.original.rank_overall;
          if (row.original.is_dnf) {
            return <Badge variant="secondary" className="text-xs">DNF</Badge>;
          }
          if (row.original.is_disqualified) {
            return <Badge variant="destructive" className="text-xs">DQ</Badge>;
          }
          if (!rank) {
            return <span className="text-muted-foreground text-sm">-</span>;
          }
          return (
            <span className="font-bold tabular-nums">
              {rank <= 3 ? (
                <span className={rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : 'text-amber-600'}>
                  #{rank}
                </span>
              ) : (
                `#${rank}`
              )}
            </span>
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
        cell: ({ row }) => {
          const reg = row.original.registration;
          return (
            <div className="font-medium">
              {reg?.participant_name ?? <span className="text-muted-foreground">-</span>}
            </div>
          );
        },
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => {
          const cat = row.original.registration?.category;
          if (!cat) return <span className="text-muted-foreground text-sm">-</span>;
          return (
            <Badge variant="outline" className="text-xs">
              {cat.code ?? cat.name}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'finish_time',
        header: 'Finish Time',
        cell: ({ row }) => {
          const t = row.original.finish_time;
          if (!t) return <span className="text-muted-foreground">-</span>;
          return <span className="font-mono text-sm">{t}</span>;
        },
      },
      {
        id: 'pace',
        header: 'Pace',
        cell: ({ row }) => {
          const distKm = row.original.registration?.category?.distance_km ?? null;
          return (
            <span className="text-sm text-muted-foreground">
              {formatPace(row.original.pace_per_km_seconds, distKm)}
            </span>
          );
        },
      },
      {
        accessorKey: 'rank_category',
        header: 'Cat. Rank',
        cell: ({ row }) => {
          const rank = row.original.rank_category;
          return rank ? (
            <span className="text-sm tabular-nums">#{rank}</span>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          );
        },
      },
      {
        id: 'certificate',
        header: 'Certificate',
        cell: ({ row }) => {
          const certId = row.original.certificate_id;
          return certId ? (
            <Badge variant="default" className="text-xs gap-1">
              <Award className="h-3 w-3" />
              Generated
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Pending
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const result = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedResult(result);
                    setAddDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                {!result.is_dnf && (
                  <DropdownMenuItem
                    onClick={() =>
                      markDNFMutation.mutate({ id: result.id, eventId })
                    }
                  >
                    <Flag className="h-4 w-4 mr-2" />
                    Mark DNF
                  </DropdownMenuItem>
                )}
                {!result.is_disqualified && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setSelectedResult(result);
                        setDqDialogOpen(true);
                      }}
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      Disqualify
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [eventId, markDNFMutation]
  );

  // Global search on name, BIB, cert ID
  const globalFilterFn = (row: any, _: string, filterValue: string): boolean => {
    const q = filterValue.toLowerCase();
    const r = row.original as MarathonResult;
    return (
      (r.bib_number?.toLowerCase().includes(q) ?? false) ||
      (r.registration?.participant_name?.toLowerCase().includes(q) ?? false) ||
      (r.certificate_id?.toLowerCase().includes(q) ?? false)
    );
  };

  if (eventLoading) {
    return (
      <ContentLayout title="Results">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} — Results`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '…', href: `/events/marathon/${eventId}/settings` },
          { label: 'Results' },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">Race Results</h1>
            <p className="text-sm text-muted-foreground">
              Manage finish times, rankings, and disqualifications.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGpsDialogOpen(true)}
            >
              <Satellite className="h-4 w-4 mr-2" />
              Import from GPS
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculateMutation.mutate(eventId)}
              disabled={recalculateMutation.isPending}
            >
              {recalculateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recalculate Rankings
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Result
            </Button>
          </div>
        </div>

        {/* Stats */}
        {results && <ResultsStatsCards results={results} />}

        {/* Table */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load results. Please try again.
          </div>
        )}

        {!isLoading && !error && (
          <DataTable
            columns={columns}
            data={results ?? []}
            searchPlaceholder="Search by name, BIB, or certificate ID…"
            globalFilterFn={globalFilterFn}
            onRefresh={() => refetch()}
          />
        )}
      </div>

      {/* Dialogs */}
      <ImportGPSResultsDialog
        open={gpsDialogOpen}
        onOpenChange={setGpsDialogOpen}
        eventId={eventId}
      />

      <AddResultDialog
        open={addDialogOpen}
        onOpenChange={(v) => {
          setAddDialogOpen(v);
          if (!v) setSelectedResult(null);
        }}
        eventId={eventId}
      />

      <DisqualifyDialog
        open={dqDialogOpen}
        onOpenChange={(v) => {
          setDqDialogOpen(v);
          if (!v) setSelectedResult(null);
        }}
        result={selectedResult}
        eventId={eventId}
      />
    </ContentLayout>
  );
}
