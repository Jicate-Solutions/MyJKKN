'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, ReceiptText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AdminCategoryUpgradeService } from '@/lib/services/campus-living/admin-category-upgrade-service';
import type { AdminUpgradeBillResult } from '@/types/campus-living/upgrade-admin';
import type { AllocationAuditRow } from '@/types/campus-living-allocation-audit';

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

interface Line {
  row: AllocationAuditRow;
  result?: AdminUpgradeBillResult;
  error?: string;
  committed?: boolean;
}

/**
 * Raise upgrade bills for the learners the audit has flagged as holding a
 * category above their fee band with no live bill.
 *
 * ALWAYS previews first, one learner at a time, and only commits the lines the
 * dry run approved. The underlying `_cl_apply_upgrade_fee_bill` accumulates
 * onto an existing live bill rather than refusing, so committing blind would
 * silently double somebody's charge — the RPC also refuses a learner who
 * already has one, which is why a line can come back not-ok here.
 *
 * Sequential on purpose: this list is ~15 rows, and a serial loop keeps each
 * refusal attributable to its learner.
 */
export function BulkUpgradeBillsDialog({
  open,
  onOpenChange,
  rows,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: AllocationAuditRow[];
  onCommitted: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'previewed' | 'done'>('idle');

  const runPreview = async () => {
    setBusy(true);
    const out: Line[] = [];
    for (const row of rows) {
      try {
        const result = await AdminCategoryUpgradeService.generateUpgradeBill(
          row.learner_profile_id,
          { dryRun: true },
        );
        out.push({ row, result });
      } catch (e) {
        out.push({ row, error: e instanceof Error ? e.message : 'Preview failed' });
      }
    }
    setLines(out);
    setPhase('previewed');
    setBusy(false);
  };

  const billable = lines.filter((l) => l.result?.ok);
  const total = billable.reduce((s, l) => s + Number(l.result?.net_amount ?? 0), 0);

  const commit = async () => {
    setBusy(true);
    let ok = 0;
    const next = [...lines];
    for (let i = 0; i < next.length; i++) {
      const l = next[i];
      if (!l.result?.ok) continue;
      try {
        const res = await AdminCategoryUpgradeService.generateUpgradeBill(
          l.row.learner_profile_id,
          { dryRun: false },
        );
        next[i] = { ...l, result: res, committed: res.ok };
        if (res.ok) ok += 1;
      } catch (e) {
        next[i] = { ...l, error: e instanceof Error ? e.message : 'Failed' };
      }
    }
    setLines(next);
    setPhase('done');
    setBusy(false);
    toast.success(`${ok} upgrade bill${ok === 1 ? '' : 's'} raised`);
    onCommitted();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-[860px] flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Generate upgrade bills
          </DialogTitle>
          <DialogDescription>
            {rows.length} learner{rows.length === 1 ? '' : 's'} in the current
            filter hold a category above their fee band with no live upgrade
            bill. Each is priced from their entitled category. Nobody is moved.
          </DialogDescription>
        </DialogHeader>

        {/* min-h-0 with overflow on the SAME element — without both, a long list
            paints over the footer instead of scrolling. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {phase === 'idle' ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Preview first to see exactly what each learner would be charged.
            </p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.row.allocation_id}>
                    <TableCell>
                      <div className="text-sm font-medium">{l.row.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.row.roll_number ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.result?.from_category ?? '—'} → {l.result?.current_category ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.result?.ok ? inr(l.result.net_amount) : '—'}
                    </TableCell>
                    <TableCell>
                      {l.error ? (
                        <Badge variant="destructive">{l.error}</Badge>
                      ) : l.committed ? (
                        <Badge variant="success">Billed</Badge>
                      ) : l.result?.ok ? (
                        <Badge variant="outline">Will bill</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {l.result?.message ?? '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {phase === 'previewed' && billable.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              About to raise {billable.length} bill{billable.length === 1 ? '' : 's'}{' '}
              totalling <strong>{inr(total)}</strong>. This charges real learners
              and cannot be undone from here — a mistake has to be cancelled in
              billing.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          {phase === 'idle' && (
            <Button onClick={runPreview} disabled={busy || rows.length === 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Preview {rows.length}
            </Button>
          )}
          {phase === 'previewed' && (
            <Button onClick={commit} disabled={busy || billable.length === 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Raise {billable.length} bill{billable.length === 1 ? '' : 's'} · {inr(total)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
