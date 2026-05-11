'use client';

// ============================================================================
// pre-submit-confirmation-dialog.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 13 — Read-only summary modal shown before final enquiry
// submission. Displays the lead name, the matched fee structure (or warning
// when no match), the resolved fee items table, and the grand total. Per
// spec §7 Decision: read-only summary — no theatre.
//
// NOTE: Step 2 (wiring this dialog into the enquiry form's submit handler)
// is intentionally deferred to Task 14 (the finance-details.tsx refactor),
// which is being executed in a separate batch.
// ----------------------------------------------------------------------------
// Spec §9.3  · Plan: 2026-05-05-admission-fees-plan-03 Task 13
// ============================================================================

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type {
  ResolvedFeeItem,
  AdmissionFeeStructureWithItems,
} from '@/types/admission';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  matchedStructureName: string | null;
  resolvedItems: ResolvedFeeItem[];
  total: number;
  onConfirm: () => void;
  submitting?: boolean;
}

export function PreSubmitConfirmationDialog(props: Props) {
  const {
    open,
    onOpenChange,
    leadName,
    matchedStructureName,
    resolvedItems,
    total,
    onConfirm,
    submitting,
  } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm enquiry submission</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <span className="text-muted-foreground">Lead:</span>{' '}
            <strong>{leadName}</strong>
          </div>
          {matchedStructureName ? (
            <div>
              <span className="text-muted-foreground">Fee Structure:</span>{' '}
              {matchedStructureName}
            </div>
          ) : (
            <div className="text-amber-600">
              No fee structure matched — submission will fail.
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th>Category</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {resolvedItems.map((it, i) => (
                <tr key={`${it.category_id ?? 'global'}-${i}`}>
                  <td>{it.category_name}</td>
                  <td className="text-right">₹{it.amount.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t font-bold">
                <td>Total</td>
                <td className="text-right">₹{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting || !resolvedItems.length}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Note: The signature also accepts a passing reference of
// AdmissionFeeStructureWithItems for callers that have it directly; if they
// only have the name, they can pass matchedStructureName instead.
export type PreSubmitConfirmationStructure = Pick<
  AdmissionFeeStructureWithItems,
  'id' | 'name'
>;
