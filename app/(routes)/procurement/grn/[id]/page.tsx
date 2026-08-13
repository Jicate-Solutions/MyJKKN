'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useGrn,
  useVerifyGrn,
  useCancelGrn,
  useReplacements,
  useReceiveReplacement,
  useUpdateGrnItem,
} from '@/hooks/procurement/use-grns';
import { validateLineForVerify } from '@/lib/services/procurement/three-way-match';
import { GRN_STATUS_CONFIG, GRN_MATCH_CONFIG, type ProcurementGrnReplacement } from '@/types/procurement';
import { formatDateDMY, formatDateTimeDMY } from '@/lib/utils/date-format';
import { StatusBadge } from '@/components/procurement/status-badge';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, CheckCircle2, AlertTriangle, PackagePlus } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils/supabase-error';

export default function GrnDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canVerify = isSuperAdmin || canAccess('procurement', 'grn_verify');

  const { data: grn, isLoading, isError } = useGrn(id);
  const { data: replacements = [] } = useReplacements(id);
  const verifyGrn = useVerifyGrn();
  const cancelGrn = useCancelGrn();
  const receiveReplacement = useReceiveReplacement(id);
  const updateItem = useUpdateGrnItem(id);

  // Inline batch/expiry edits (pending GRNs only) — lets the admin satisfy the chemical
  // gate at verify time. Keyed by grn_item id; falls back to the stored value.
  const [edits, setEdits] = useState<Record<string, { batch_number?: string; expiry_date?: string }>>({});
  const effBatch = (it: { id: string; batch_number: string | null }) =>
    edits[it.id]?.batch_number ?? it.batch_number ?? '';
  const effExpiry = (it: { id: string; expiry_date: string | null }) =>
    edits[it.id]?.expiry_date ?? it.expiry_date ?? '';
  const saveField = (grnItemId: string, field: 'batch_number' | 'expiry_date', raw: string, current: string | null) => {
    const value = raw.trim() ? raw.trim() : null;
    if ((current ?? null) === value) return;
    updateItem.mutate({ grnItemId, patch: { [field]: value } });
  };

  // Receive-replacement dialog state.
  const [repTarget, setRepTarget] = useState<ProcurementGrnReplacement | null>(null);
  const [repQty, setRepQty] = useState('');
  const [repBatch, setRepBatch] = useState('');
  const [repExpiry, setRepExpiry] = useState('');
  const [repMfg, setRepMfg] = useState('');

  const openReceive = (r: ProcurementGrnReplacement) => {
    setRepTarget(r);
    setRepQty(String(r.rejected_quantity));
    setRepBatch('');
    setRepExpiry('');
    setRepMfg('');
  };

  if (isLoading) {
    return (
      <ContentLayout title="Goods Receipt">
        <div className="flex items-center justify-center py-16">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }
  if (isError) {
    return (
      <ContentLayout title="Goods Receipt">
        <div className="py-6">
          <AlertBox type="error" message="Failed to load this GRN. Please try again." />
        </div>
      </ContentLayout>
    );
  }
  if (!grn) {
    return (
      <ContentLayout title="Goods Receipt">
        <EmptyState title="GRN not found" description="This goods receipt note may have been removed." />
      </ContentLayout>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e, 'Action failed'));
    }
  };

  const pending = grn.status === 'pending_verification';

  // Whether stock has actually moved is the question a receiver has on this page,
  // and only the badge answered it — in one word, ambiguously.
  const STATUS_HINT: Record<string, string> = {
    draft: 'Not yet submitted for verification.',
    pending_verification:
      'Nothing has reached inventory yet. Verifying checks this against the order and the invoice, then posts the accepted quantities.',
    partially_accepted:
      'Accepted quantities are in inventory. Rejected lines were excluded and are not stock.',
    replacement_requested:
      'Accepted quantities are in inventory. Rejected goods are awaiting a replacement delivery.',
    accepted: 'Verified. Accepted quantities have been posted to inventory.',
    completed: 'Verified and complete. Accepted quantities are in inventory.',
    cancelled: 'Cancelled. Nothing from this receipt reached inventory.',
  };
  const statusHint = STATUS_HINT[grn.status];
  const hasMismatch = grn.items.some((i) => i.mismatch_flag);

  // Chemical lines still missing batch/expiry (using the effective, possibly-edited values)
  // block verification — mirrors the server gate so the button is disabled, not just erroring.
  const chemicalBlocks = grn.items.flatMap((it) =>
    validateLineForVerify({
      item_name: it.item_name,
      is_chemical: it.is_chemical,
      accepted_quantity: Number(it.accepted_quantity),
      batch_number: effBatch(it) || null,
      expiry_date: effExpiry(it) || null,
    })
  );

  return (
    <ContentLayout title={grn.grn_number}>
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" aria-label="Back to goods receipts" onClick={() => router.push('/procurement/grn')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{grn.grn_number}</h2>
              <p className="text-muted-foreground">
                {grn.purchase_order?.po_number ?? ''} · {grn.supplier?.name ?? grn.supplier_id}
              </p>
            </div>
          </div>
          <StatusBadge status={grn.status} config={GRN_STATUS_CONFIG} className="text-sm" />
        </div>

        {/* Invoice + receipt meta */}
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground">Invoice #</p>
              <p className="font-medium">{grn.invoice_number || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Invoice date</p>
              <p className="font-medium">
                {formatDateDMY(grn.invoice_date)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Invoice amount</p>
              <p className="font-medium">
                {grn.invoice_amount != null ? `₹${Number(grn.invoice_amount).toLocaleString()}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Received by</p>
              <p className="font-medium">{grn.received_by_profile?.full_name || '—'}</p>
            </div>
          </CardContent>
        </Card>

        {statusHint && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {statusHint}
          </p>
        )}

        {/* Actions */}
        {pending && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              {canVerify && (
                <Button
                  onClick={() =>
                    run(
                      () => verifyGrn.mutateAsync({ id, userId: profile!.id }),
                      'GRN verified — accepted stock posted to inventory.'
                    )
                  }
                  disabled={verifyGrn.isPending || chemicalBlocks.length > 0}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Verify & post to inventory
                </Button>
              )}
              <Button
                variant="ghost"
                className="sm:ml-auto"
                onClick={() => run(() => cancelGrn.mutateAsync({ id }), 'GRN cancelled')}
              >
                Cancel GRN
              </Button>
              {hasMismatch && (
                <span className="flex items-center gap-1.5 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  A line has a quantity or price mismatch — review before verifying.
                </span>
              )}
            </div>
            {chemicalBlocks.length > 0 && (
              <div className="flex items-start gap-1.5 text-sm text-red-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Verify is blocked until chemical items have a batch number and expiry date.
                  Enter them in the Batch column below.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Three-way match table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Three-way match ({grn.items.length} lines)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each line reconciles three numbers: what the order still expects, what the supplier
              invoiced, and what was physically counted. Only the accepted quantity becomes stock.
            </p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Invoice ₹</TableHead>
                  <TableHead>Batch / Expiry</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grn.items.map((it) => {
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.item_name}
                        {it.is_chemical && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            Chemical
                          </Badge>
                        )}
                        {it.replacement_required && (
                          <span className="block text-xs text-orange-600">Replacement requested</span>
                        )}
                        {Number(it.missing_quantity) > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            Missing: {Number(it.missing_quantity)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{Number(it.ordered_quantity)}</TableCell>
                      <TableCell className="text-right">
                        {it.invoice_quantity != null ? Number(it.invoice_quantity) : '—'}
                      </TableCell>
                      <TableCell className="text-right">{Number(it.received_quantity)}</TableCell>
                      <TableCell className="text-right">{Number(it.accepted_quantity)}</TableCell>
                      <TableCell className="text-right">{Number(it.rejected_quantity)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {it.invoice_unit_price != null ? `₹${Number(it.invoice_unit_price).toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {pending ? (
                          <div className="space-y-1 min-w-[150px]">
                            <Input
                              className="h-7 text-xs"
                              placeholder="Batch no."
                              value={effBatch(it)}
                              onChange={(e) =>
                                setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], batch_number: e.target.value } }))
                              }
                              onBlur={(e) => saveField(it.id, 'batch_number', e.target.value, it.batch_number)}
                            />
                            <Input
                              type="date"
                              className="h-7 text-xs"
                              value={effExpiry(it)}
                              onChange={(e) => {
                                setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], expiry_date: e.target.value } }));
                                saveField(it.id, 'expiry_date', e.target.value, it.expiry_date);
                              }}
                            />
                          </div>
                        ) : (
                          <>
                            {it.batch_number || '—'}
                            {it.expiry_date && (
                              <span className="block text-muted-foreground">
                                exp {formatDateDMY(it.expiry_date)}
                              </span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={it.match_status} config={GRN_MATCH_CONFIG} />
                        {it.mismatch_remarks && (
                          <span className="block text-[11px] text-muted-foreground max-w-[180px]">
                            {it.mismatch_remarks}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Replacements — rejected lines awaiting a replacement delivery */}
        {replacements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Replacements</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Rejected qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {replacements.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.grn_item?.item_name || '—'}</TableCell>
                      <TableCell className="text-right">{Number(r.rejected_quantity)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                        {r.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'received' ? 'default' : 'outline'}>
                          {r.status === 'received' ? 'Received' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === 'pending' && canVerify && (
                          <Button variant="outline" size="sm" onClick={() => openReceive(r)}>
                            <PackagePlus className="mr-2 h-4 w-4" />
                            Receive
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {grn.verified_at && (
          <p className="text-sm text-muted-foreground">
            Verified by {grn.verified_by_profile?.full_name || 'user'} on{' '}
            {formatDateTimeDMY(grn.verified_at)}.
          </p>
        )}
      </div>

      {/* Receive-replacement dialog */}
      <Dialog open={!!repTarget} onOpenChange={(o) => !o && setRepTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive replacement — {repTarget?.grn_item?.item_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Accepted quantity</Label>
              <Input type="number" value={repQty} onChange={(e) => setRepQty(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Up to {repTarget ? Number(repTarget.rejected_quantity) : 0} awaiting replacement.
              </p>
            </div>
            {repTarget?.grn_item?.is_chemical && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                Chemical item — batch number and expiry date are required to post to inventory.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Batch no.</Label>
                <Input value={repBatch} onChange={(e) => setRepBatch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry date</Label>
                <Input type="date" value={repExpiry} onChange={(e) => setRepExpiry(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mfg date</Label>
                <Input type="date" value={repMfg} onChange={(e) => setRepMfg(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={receiveReplacement.isPending || !(Number(repQty) > 0)}
              onClick={async () => {
                if (!repTarget) return;
                await run(
                  () =>
                    receiveReplacement.mutateAsync({
                      input: {
                        replacement_id: repTarget.id,
                        accepted_quantity: Number(repQty),
                        batch_number: repBatch || null,
                        expiry_date: repExpiry || null,
                        manufacturing_date: repMfg || null,
                      },
                      userId: profile!.id,
                    }),
                  'Replacement received — stock posted to inventory.'
                );
                setRepTarget(null);
              }}
            >
              {receiveReplacement.isPending ? 'Receiving…' : 'Receive & post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
