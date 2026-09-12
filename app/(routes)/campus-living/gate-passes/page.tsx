'use client';

/**
 * /campus-living/gate-passes — the warden's queue.
 *
 * Six tabs over one advanced DataTable (URL state, sort, column visibility,
 * resizing, real CSV/XLS export). The page this replaced hand-rolled a
 * <Table>, filtered it with a client-side `.filter()` over whatever the first
 * page happened to contain, and had an Export button that raised a
 * "ships next" toast.
 *
 * Approve and Reject are available inline as shortcuts, each behind a
 * confirmation. The decision this page is really for happens one click deeper,
 * on the detail page, where the learner's dossier and the parent's phone
 * number are — a warden approving from a row has not read either.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Clock,
  DoorOpen,
  Loader2,
  ScanLine,
  X,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useApproveGatePass, useRejectGatePass } from '@/hooks/campus-living/use-gate-passes';
import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { GatePassListRow, GatePassStatus } from '@/types/campus-living';
import { getGatePassColumns } from './_components/columns';

/** Which statuses each tab shows. `null` means every status. */
const TABS: { value: string; label: string; statuses: GatePassStatus[] | null }[] = [
  { value: 'pending', label: 'Pending', statuses: ['requested'] },
  { value: 'approved', label: 'Approved', statuses: ['issued'] },
  { value: 'out', label: 'Out now', statuses: ['active', 'overdue'] },
  { value: 'returned', label: 'Returned', statuses: ['returned'] },
  { value: 'rejected', label: 'Rejected', statuses: ['rejected', 'cancelled'] },
  { value: 'all', label: 'All', statuses: null },
];

export default function GatePassesPage() {
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const searchParams = useSearchParams();
  const learnerFilter = searchParams.get('learner') ?? undefined;

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  /**
   * The institutions this user can actually see, passed through explicitly.
   *
   * NOT `isSuperAdmin ? undefined : profile.institution_id`. That branch
   * silently strips access from a secondary role carrying scope='all', and RLS
   * gates the rows regardless — so the caller says what it can see and the
   * service does not second-guess it.
   */
  const institutionIds = useMemo(
    () => institutions.map((i) => i.id),
    [institutions],
  );

  const canDecide = isSuperAdmin || canAccess('campus_living.gate_passes', 'approve');
  const canIssue = canDecide;
  const canScan = isSuperAdmin || canAccess('campus_living.gate_passes', 'edit');

  const [activeTab, setActiveTab] = useState(learnerFilter ? 'all' : 'pending');
  const [refetchKey, setRefetchKey] = useState(0);

  const approve = useApproveGatePass();
  const reject = useRejectGatePass();

  const [approveTarget, setApproveTarget] = useState<GatePassListRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<GatePassListRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const statuses = TABS.find((t) => t.value === activeTab)?.statuses ?? null;

  const fetchData = useCallback(
    async (params: { page: number; limit: number; search: string }) => {
      try {
        const { data, count } = await GatePassService.getGatePasses(
          institutionIds,
          {
            ...(statuses ? { status: statuses } : {}),
            ...(learnerFilter ? { learner_id: learnerFilter } : {}),
          },
          params.page,
          params.limit,
        );

        // Search is client-side over the page the server returned. The queue
        // is a working set of pending decisions, not an archive — a warden
        // searching it is looking for a name they know is in front of them.
        const q = params.search.trim().toLowerCase();
        const rows = q
          ? data.filter(
              (r) =>
                r.learner_name.toLowerCase().includes(q) ||
                (r.pass_number ?? '').toLowerCase().includes(q) ||
                r.destination.toLowerCase().includes(q) ||
                r.leave_type_name.toLowerCase().includes(q),
            )
          : data;

        return {
          success: true,
          data: rows,
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: Math.max(1, Math.ceil(count / params.limit)),
            total_items: count,
          },
        };
      } catch (error) {
        logger.error('campus-living/gate-passes', 'Failed to load the queue', error);
        throw error;
      }
    },
    [institutionIds, statuses, learnerFilter],
  );

  const columns = useMemo(
    () =>
      getGatePassColumns({
        canDecide,
        onApprove: (row) => setApproveTarget(row),
        onReject: (row) => {
          setRejectReason('');
          setRejectTarget(row);
        },
      }),
    [canDecide],
  );

  async function confirmApprove() {
    if (!approveTarget || !profile?.id) return;
    try {
      await approve.mutateAsync({ id: approveTarget.id, approverId: profile.id });
      setRefetchKey((k) => k + 1);
    } catch {
      // the mutation's onError toast is the operator-facing report
    } finally {
      setApproveTarget(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget || !profile?.id || !rejectReason.trim()) return;
    try {
      await reject.mutateAsync({
        id: rejectTarget.id,
        rejectedBy: profile.id,
        reason: rejectReason.trim(),
      });
      setRefetchKey((k) => k + 1);
    } catch {
      // same
    } finally {
      setRejectTarget(null);
      setRejectReason('');
    }
  }

  const notReady = permsLoading || institutionsLoading;

  return (
    <ContentLayout title="Gate Passes">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Gate Passes' },
        ]}
      />

      <div className="mt-4 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="py-1 text-2xl font-bold">Gate Passes</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Residents apply, you decide, and the gate records the movement when they scan
              their MyJKKN QR.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canScan && (
              <Button asChild>
                <Link href="/campus-living/gate-passes/scan">
                  <ScanLine className="mr-2 h-4 w-4" />
                  Scan at Gate
                </Link>
              </Button>
            )}
            {canIssue && (
              <Button variant="outline" asChild>
                <Link href="/campus-living/gate-passes/new">
                  <DoorOpen className="mr-2 h-4 w-4" />
                  Issue directly
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Deep link from the residents drawer (?learner=…). */}
        {learnerFilter && (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Showing one learner&apos;s passes only.</span>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" asChild>
              <Link href="/campus-living/gate-passes">
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Link>
            </Button>
          </div>
        )}

        {/* A learner deep-link is a history view; the tabs are a queue view.
            Mixing them is how the old page ended up showing "Pending (0)" for
            a learner who had pending requests. */}
        {!learnerFilter && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v);
              setRefetchKey((k) => k + 1);
            }}
          >
            <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.value === 'pending' && <Clock className="mr-1.5 h-3.5 w-3.5" />}
                  {t.value === 'out' && <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />}
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {notReady ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-64" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : institutionIds.length === 0 ? (
          // An empty institution list and an empty queue look identical, and
          // only one of them is a permissions problem. Say which.
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You have no institution access, so no gate passes can be listed. Ask an
              administrator to grant your role access to an institution.
            </CardContent>
          </Card>
        ) : (
          <DataTable<GatePassListRow, unknown>
            fetchDataFn={fetchData}
            getColumns={() => columns}
            idField="id"
            refetchKey={refetchKey}
            exportConfig={{
              entityName: 'gate-passes',
              columnMapping: {
                learner_name: 'Learner',
                learner_email: 'Email',
                leave_type_name: 'Type',
                destination: 'Destination',
                reason: 'Reason',
                planned_out_at: 'Planned out',
                expected_return: 'Due back',
                out_time: 'Left at',
                actual_return: 'Back at',
                parent_confirmed_at: 'Parent called',
                pass_number: 'Pass number',
                status: 'Status',
                created_at: 'Requested at',
              },
              columnWidths: [
                { wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 32 },
                { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
                { wch: 22 }, { wch: 14 }, { wch: 20 },
              ],
              headers: [
                'learner_name', 'learner_email', 'leave_type_name', 'destination', 'reason',
                'planned_out_at', 'expected_return', 'out_time', 'actual_return',
                'parent_confirmed_at', 'pass_number', 'status', 'created_at',
              ],
            }}
            config={{
              enableUrlState: true,
              enableDateFilter: false,
              enableExport: true,
              enableRowSelection: true,
              enableSearch: true,
              enableColumnFilters: false,
              enableColumnVisibility: true,
              enableColumnResizing: true,
              columnResizingTableId: 'gate-passes-table',
            }}
          />
        )}
      </div>

      {/* ── Approve, behind a confirmation ─────────────────────────── */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this gate pass?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong>{approveTarget?.learner_name}</strong> will be allowed out to{' '}
                  <strong>{approveTarget?.destination}</strong>, due back{' '}
                  {approveTarget?.expected_return
                    ? new Date(approveTarget.expected_return).toLocaleString('en-IN')
                    : '—'}
                  .
                </p>
                {/* Advisory, never a block: a parent who cannot be reached must
                    not make the decision impossible. */}
                {!approveTarget?.parent_confirmed_at && (
                  <p className="text-amber-700 dark:text-amber-400">
                    No parent call has been recorded for this request. Open the request to
                    call the parent first, or approve without it.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approve.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApprove} disabled={approve.isPending}>
              {approve.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject, reason required ────────────────────────────────── */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectTarget?.learner_name}&apos;s request</DialogTitle>
            <DialogDescription>
              The learner reads this reason, so say what would change your answer.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectReason.trim() || reject.isPending}
            >
              {reject.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
