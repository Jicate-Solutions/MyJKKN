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
} from '@/hooks/procurement/use-grns';
import { GRN_STATUS_CONFIG, GRN_MATCH_CONFIG, type ProcurementGrnReplacement } from '@/types/procurement';
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

export default function GrnDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canVerify = isSuperAdmin || canAccess('procurement', 'grn_verify');

  const { data: grn, isLoading } = useGrn(id);
  const { data: replacements = [] } = useReplacements(id);
  const verifyGrn = useVerifyGrn();
  const cancelGrn = useCancelGrn();
  const receiveReplacement = useReceiveReplacement(id);

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
  if (!grn) {
    return (
      <ContentLayout title="Goods Receipt">
        <p className="text-muted-foreground py-12 text-center">GRN not found.</p>
      </ContentLayout>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const pending = grn.status === 'pending_verification';
  const hasMismatch = grn.items.some((i) => i.mismatch_flag);

  return (
    <ContentLayout title={grn.grn_number}>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/procurement/grn')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{grn.grn_number}</h2>
              <p className="text-muted-foreground">
                {grn.purchase_order?.po_number ?? ''} · {grn.supplier?.name ?? grn.supplier_id}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm">
            {GRN_STATUS_CONFIG[grn.status].label}
          </Badge>
        </div>

        {/* Invoice + receipt meta */}
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground">Invoice #</p>
              <p className="font-medium">{grn.invoice_number || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Invoice date</p>
              <p className="font-medium">
                {grn.invoice_date ? new Date(grn.invoice_date).toLocaleDateString() : '—'}
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

        {/* Actions */}
        {pending && (
          <div className="flex flex-wrap items-center gap-3">
            {canVerify && (
              <Button
                onClick={() =>
                  run(
                    () => verifyGrn.mutateAsync({ id, userId: profile!.id }),
                    'GRN verified — accepted stock posted to inventory.'
                  )
                }
                disabled={verifyGrn.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Verify & post to inventory
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => run(() => cancelGrn.mutateAsync({ id }), 'GRN cancelled')}
            >
              Cancel GRN
            </Button>
            {hasMismatch && (
              <span className="flex items-center gap-1.5 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                One or more lines have a quantity mismatch — review before verifying.
              </span>
            )}
          </div>
        )}

        {/* Three-way match table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Three-way match</CardTitle>
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
                  <TableHead>Batch</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grn.items.map((it) => {
                  const cfg = GRN_MATCH_CONFIG[it.match_status];
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
                      </TableCell>
                      <TableCell className="text-right">{Number(it.ordered_quantity)}</TableCell>
                      <TableCell className="text-right">
                        {it.invoice_quantity != null ? Number(it.invoice_quantity) : '—'}
                      </TableCell>
                      <TableCell className="text-right">{Number(it.received_quantity)}</TableCell>
                      <TableCell className="text-right">{Number(it.accepted_quantity)}</TableCell>
                      <TableCell className="text-right">{Number(it.rejected_quantity)}</TableCell>
                      <TableCell className="text-xs">
                        {it.batch_number || '—'}
                        {it.expiry_date && (
                          <span className="block text-muted-foreground">
                            exp {new Date(it.expiry_date).toLocaleDateString()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{cfg.label}</Badge>
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
            {new Date(grn.verified_at).toLocaleString()}.
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
