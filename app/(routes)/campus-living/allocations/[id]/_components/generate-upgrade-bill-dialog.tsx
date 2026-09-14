'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowRight, Info, Loader2, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminGenerateUpgradeBill } from '@/hooks/campus-living/use-admin-category-upgrade';
import type { AdminUpgradeBillResult } from '@/types/campus-living/upgrade-admin';

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

/**
 * Raise the upgrade bill for a learner who ALREADY holds a category above their
 * fee band — the case neither existing upgrade path can reach, because both
 * price current → target and that is zero when they are the same.
 *
 * ALWAYS previews first. The underlying _cl_apply_upgrade_fee_bill accumulates
 * onto a live bill rather than refusing, so a blind write can silently double a
 * charge; the confirm button only appears once a dry run has come back ok.
 */
export function GenerateUpgradeBillDialog({
  open,
  onOpenChange,
  learnerProfileId,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerProfileId: string | null;
  onCommitted: () => void;
}) {
  const generate = useAdminGenerateUpgradeBill();
  const [preview, setPreview] = useState<AdminUpgradeBillResult | null>(null);
  const [committing, setCommitting] = useState(false);

  // Re-preview on every open: the fee matrix, the band or the bills may all
  // have moved since this dialog was last shown.
  useEffect(() => {
    if (!open || !learnerProfileId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    generate
      .mutateAsync({ learnerId: learnerProfileId, dryRun: true })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Preview failed');
      });
    return () => {
      cancelled = true;
    };
    // generate.mutateAsync is stable; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, learnerProfileId]);

  const onConfirm = async () => {
    if (!learnerProfileId) return;
    setCommitting(true);
    try {
      const res = await generate.mutateAsync({ learnerId: learnerProfileId, dryRun: false });
      if (res.ok) {
        toast.success(res.message);
        onCommitted();
        onOpenChange(false);
      } else {
        // The state moved between preview and confirm.
        toast.error(res.message);
        setPreview(res);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the bill');
    } finally {
      setCommitting(false);
    }
  };

  const loading = generate.isPending && !committing && !preview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Generate upgrade bill
          </DialogTitle>
          <DialogDescription>
            Charges this learner for the category they already hold, using their
            fee-band entitlement as the starting point. Nothing moves — no room,
            no bed, no allocation.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out what is owed…
          </div>
        ) : !preview ? (
          <p className="py-6 text-sm text-muted-foreground">No preview available.</p>
        ) : preview.ok ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="font-medium">{preview.from_category ?? '—'}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{preview.current_category ?? '—'}</span>
              </div>
              <div className="mt-3 text-center">
                <div className="text-3xl font-semibold tabular-nums">
                  {inr(preview.net_amount)}
                </div>
                {(preview.discount ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {inr(preview.gross_amount)} list, less {inr(preview.discount)} discount
                  </p>
                )}
              </div>
            </div>

            {preview.from_source?.includes('fee_difference') && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  No upgrade price is configured for this pair, so the amount is
                  the difference between the two published room fees.
                </AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">
              A new &quot;Hostel Upgrade Fee&quot; bill will be raised against this
              learner, payable by them. This does not change their room category —
              they already hold it.
            </p>
          </div>
        ) : (
          <Alert variant={preview.reason === 'already_billed' ? 'destructive' : 'default'}>
            {preview.reason === 'already_billed' ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
            <AlertTitle className="capitalize">
              {preview.reason.replace(/_/g, ' ')}
            </AlertTitle>
            <AlertDescription>{preview.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
            Close
          </Button>
          {preview?.ok && (
            <Button onClick={onConfirm} disabled={committing}>
              {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Bill {inr(preview.net_amount)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
