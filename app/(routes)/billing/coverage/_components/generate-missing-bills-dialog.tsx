'use client';
/**
 * Preview → confirm → generate for the Fee Structure Match audit.
 *
 * Opening the dialog runs the generator as a DRY RUN (nothing written) and
 * lists exactly which bills would be raised. Only "Generate" writes. The same
 * RPC does both, so the preview can never differ from what is created.
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { formatCurrency, getErrorMessage } from '@/lib/utils';
import { BillCoverageAuditService } from '@/lib/services/billing/coverage/bill-coverage-audit-service';
import type { GenerateMissingBillsResult } from '@/types/billing-coverage';

const SKIP_LABELS: Record<string, string> = {
  nothing_missing: 'Nothing missing — already billed',
  no_institution_access: 'No access to this learner’s institution'
};

const rs = (n: number) => formatCurrency(n, { showDecimals: false });

export function GenerateMissingBillsDialog({
  learnerIds,
  open,
  onOpenChange,
  onGenerated
}: {
  learnerIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: () => void;
}) {
  const [preview, setPreview] = useState<GenerateMissingBillsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || learnerIds.length === 0) return;
    let cancelled = false;
    setPreview(null);
    setError(null);
    setLoading(true);
    BillCoverageAuditService.generateMissingBills(learnerIds, true)
      .then((r) => !cancelled && setPreview(r))
      .catch((e) => !cancelled && setError(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, learnerIds]);

  const handleGenerate = async () => {
    if (running) return;
    setRunning(true);
    try {
      const r = await BillCoverageAuditService.generateMissingBills(learnerIds, false);
      toast.success(
        `Generated ${r.bills} bill${r.bills === 1 ? '' : 's'} (${rs(r.amount)}) for ${r.learners_with_bills} learner${r.learners_with_bills === 1 ? '' : 's'}.`
      );
      onGenerated();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Generation failed: ${getErrorMessage(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const withBills = preview?.learners.filter((l) => l.bills.length > 0) ?? [];
  const skipped = preview?.learners.filter((l) => l.bills.length === 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      {/* DialogContent has no height cap of its own. */}
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Generate missing bills</DialogTitle>
          <DialogDescription>
            Creates only the bills the learner&apos;s fee structure expects and that
            do not exist yet — with the structure&apos;s instalment split and due
            dates. Hostel, mess and transport fees are never created here. Existing
            bills are not changed.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className='flex items-center gap-2 py-8 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Checking {learnerIds.length} learner
            {learnerIds.length === 1 ? '' : 's'}…
          </div>
        )}

        {error && <p className='text-sm text-red-600'>{error}</p>}

        {preview && !loading && (
          <div className='space-y-4'>
            <div className='grid grid-cols-3 gap-3'>
              <div className='rounded-lg border p-3'>
                <p className='text-xs text-muted-foreground'>Bills to create</p>
                <p className='text-2xl font-bold tabular-nums'>{preview.bills}</p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-xs text-muted-foreground'>Total amount</p>
                <p className='text-2xl font-bold tabular-nums'>{rs(preview.amount)}</p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-xs text-muted-foreground'>Learners</p>
                <p className='text-2xl font-bold tabular-nums'>{preview.learners_with_bills}</p>
                {preview.learners_skipped > 0 && (
                  <p className='text-xs text-muted-foreground'>{preview.learners_skipped} skipped</p>
                )}
              </div>
            </div>

            {withBills.length > 0 && (
              <div className='overflow-x-auto rounded-md border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50 text-xs text-muted-foreground'>
                    <tr>
                      <th className='px-3 py-2 text-left'>Learner</th>
                      <th className='px-3 py-2 text-left'>Fee item</th>
                      <th className='px-3 py-2 text-right'>Amount</th>
                      <th className='px-3 py-2 text-center'>Instalments</th>
                      <th className='px-3 py-2 text-left'>First due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withBills.flatMap((l) =>
                      l.bills.map((b, i) => (
                        <tr key={`${l.learner_id}-${b.category_id}`} className='border-t'>
                          <td className='px-3 py-2'>
                            {i === 0 ? (
                              <>
                                <div className='font-medium'>{l.full_name}</div>
                                <div className='font-mono text-xs text-muted-foreground'>
                                  {l.roll_number || 'No roll no.'}
                                </div>
                              </>
                            ) : null}
                          </td>
                          <td className='px-3 py-2'>{b.category_name}</td>
                          <td className='px-3 py-2 text-right tabular-nums'>{rs(b.amount)}</td>
                          <td className='px-3 py-2 text-center tabular-nums'>{b.instalments}</td>
                          <td className='px-3 py-2'>{b.due_date}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {skipped.length > 0 && (
              <div className='space-y-1'>
                <p className='text-xs font-medium text-muted-foreground'>Skipped</p>
                <ul className='space-y-0.5 text-xs text-muted-foreground'>
                  {skipped.map((l) => (
                    <li key={l.learner_id}>
                      {l.full_name} —{' '}
                      {l.skipped
                        .map((s) =>
                          SKIP_LABELS[s.reason] ??
                          (s.reason.startsWith('status_')
                            ? `Status is ${s.reason.slice(7)}`
                            : s.reason)
                        )
                        .join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!preview || preview.bills === 0 || running || loading}>
            {running && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Generate {preview?.bills ?? 0} bill{preview?.bills === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
