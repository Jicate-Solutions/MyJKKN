'use client';

// Payout batches — the four-stage chain (D10): prepare → review → approve → pay.
// Each stage must be a different person; that is enforced server-side by
// fn_advance_payout_batch, so the UI simply surfaces the error if violated.
// Marking a batch paid is what actually sets its commissions to 'paid'.

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Loader2, Plus, IndianRupee } from 'lucide-react';
import {
  usePayoutBatches, usePayoutInstitutions, useReadyCount, usePayoutMutations,
} from '@/hooks/admission/use-payout-batches';
import type { PayoutBatch, PayoutBatchStatus } from '@/types/payout-batches';

function rupees(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}
const STATUS_META: Record<PayoutBatchStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  prepared: { label: 'Prepared', variant: 'outline' },
  reviewed: { label: 'Reviewed', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  processed: { label: 'Paid', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};
const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'UPI', 'Cash'];

export default function PayoutsPage() {
  const { data: batches, isLoading } = usePayoutBatches();
  const { data: institutions } = usePayoutInstitutions();
  const { createBatch, advance } = usePayoutMutations();

  // create-batch dialog
  const [openCreate, setOpenCreate] = useState(false);
  const [inst, setInst] = useState<string>('');
  const [batchName, setBatchName] = useState('');
  const { data: readyCount } = useReadyCount(inst || null);

  // pay dialog
  const [payBatch, setPayBatch] = useState<PayoutBatch | null>(null);
  const [payMode, setPayMode] = useState('Bank Transfer');
  const [payRef, setPayRef] = useState('');

  const submitCreate = () => {
    if (!inst || !batchName.trim()) return;
    createBatch.mutate({ institutionId: inst, batchName: batchName.trim() }, {
      onSuccess: () => { setOpenCreate(false); setBatchName(''); setInst(''); },
    });
  };

  const submitPay = () => {
    if (!payBatch || !payRef.trim()) return;
    advance.mutate(
      { batchId: payBatch.id, toStatus: 'processed', paymentMode: payMode, bankReference: payRef.trim() },
      { onSuccess: () => { setPayBatch(null); setPayRef(''); } },
    );
  };

  const nextAction = (b: PayoutBatch) => {
    switch (b.status) {
      case 'prepared': return { to: 'reviewed' as const, label: 'Mark reviewed' };
      case 'reviewed': return { to: 'approved' as const, label: 'Approve' };
      case 'approved': return { to: 'pay' as const, label: 'Mark paid' };
      default: return null;
    }
  };

  return (
    <ContentLayout title="Referral Payouts">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Referral Payouts</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Each batch moves through four hands — prepared, reviewed, approved, paid — and every
                stage must be a different person. Marking a batch paid is what actually pays its
                approved commissions.
              </p>
            </div>
            <Button onClick={() => setOpenCreate(true)}><Plus className="h-4 w-4 mr-1" /> New batch</Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payout batches</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !batches?.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No payout batches yet. Create one from approved commissions.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch</TableHead>
                        <TableHead>Institution</TableHead>
                        <TableHead className="text-right">Commissions</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((b) => {
                        const meta = STATUS_META[b.status];
                        const action = nextAction(b);
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-sm">{b.batch_number || b.id.slice(0, 8)}</TableCell>
                            <TableCell>{b.institution?.name || '—'}</TableCell>
                            <TableCell className="text-right">{b.total_transactions ?? '—'}</TableCell>
                            <TableCell className="text-right font-medium">{rupees(b.total_net_amount)}</TableCell>
                            <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                            <TableCell className="text-right">
                              {action ? (
                                action.to === 'pay' ? (
                                  <Button size="sm" onClick={() => { setPayBatch(b); setPayMode('Bank Transfer'); setPayRef(''); }}>
                                    <IndianRupee className="h-3.5 w-3.5 mr-1" /> {action.label}
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" disabled={advance.isPending}
                                    onClick={() => advance.mutate({ batchId: b.id, toStatus: action.to })}>
                                    {action.label}
                                  </Button>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {b.status === 'processed' && b.bank_reference ? b.bank_reference : '—'}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create batch */}
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New payout batch</DialogTitle>
              <DialogDescription>
                Groups every approved, not-yet-batched commission for the chosen institution.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Institution</Label>
                <Select value={inst} onValueChange={setInst}>
                  <SelectTrigger><SelectValue placeholder="Choose an institution" /></SelectTrigger>
                  <SelectContent>
                    {institutions?.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {inst && (
                  <p className="text-xs text-muted-foreground">
                    {readyCount === undefined ? 'Checking…' : `${readyCount} approved commission(s) ready.`}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Batch name</Label>
                <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Agencies — July 2026" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
              <Button onClick={submitCreate} disabled={createBatch.isPending || !inst || !batchName.trim() || readyCount === 0}>
                {createBatch.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create batch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark paid */}
        <Dialog open={!!payBatch} onOpenChange={(o) => !o && setPayBatch(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark {payBatch?.batch_number} paid</DialogTitle>
              <DialogDescription>
                This pays {payBatch?.total_transactions} commission(s), total {rupees(payBatch?.total_net_amount)}.
                Recorded against the payment reference below. You must be a different person from the approver.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Payment mode</Label>
                <Select value={payMode} onValueChange={setPayMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bank / payment reference</Label>
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="NEFT / cheque no. / UPI ref" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayBatch(null)}>Cancel</Button>
              <Button onClick={submitPay} disabled={advance.isPending || !payRef.trim()}>
                {advance.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirm payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PermissionGuard>
    </ContentLayout>
  );
}
