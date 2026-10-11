'use client';

import type { SupplierInvoiceGrn } from '@/lib/services/procurement/grn-service';
import { GRN_STATUS_CONFIG } from '@/types/procurement';
import { formatDateDMY } from '@/lib/utils/date-format';

const rupees = (v: number | string | null | undefined) =>
  v != null && v !== '' && Number.isFinite(Number(v))
    ? `₹${Number(v).toLocaleString('en-IN')}`
    : 'No amount';

/**
 * Invoice check I1: the earlier receipt(s) carrying the same invoice number from the same
 * supplier, side by side with this one. Used by the Record delivery form (before saving
 * on hold) and by the receipt page (where the verifier confirms or not).
 */
export function DuplicateInvoiceCompare({
  earlier,
  current,
  hiddenElsewhere,
  checkFailed,
}: {
  earlier: SupplierInvoiceGrn[];
  current: { invoice_number: string | null; invoice_date: string | null; invoice_amount: number | string | null };
  /** True when the database found a repeat the viewer cannot see (another college). */
  hiddenElsewhere?: boolean;
  /**
   * Deep-panel round 3 (U-L4): the list of earlier receipts could not be read. An empty
   * list then says so, instead of claiming the repeat is at a college the viewer cannot open.
   */
  checkFailed?: boolean;
}) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="space-y-1 rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Already recorded
        </p>
        {earlier.map((g) => (
          <div key={g.id} className="space-y-0.5 border-t pt-2 first:border-t-0 first:pt-0">
            <a
              href={`/procurement/grn/${g.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              {g.grn_number}
            </a>
            <p>Invoice {g.invoice_number || '—'}</p>
            <p>Dated {formatDateDMY(g.invoice_date)}</p>
            <p>{rupees(g.invoice_amount)}</p>
            <p className="text-muted-foreground">
              {(g.status && GRN_STATUS_CONFIG[g.status as keyof typeof GRN_STATUS_CONFIG]?.label) ||
                g.status}
              {' · '}recorded {formatDateDMY(g.created_at)}
              {g.received_by_profile?.full_name ? ` by ${g.received_by_profile.full_name}` : ''}
            </p>
          </div>
        ))}
        {earlier.length === 0 && checkFailed && (
          <p className="text-muted-foreground">
            Could not load the earlier receipt. Reload the page to compare the two bills.
          </p>
        )}
        {earlier.length === 0 && !checkFailed && hiddenElsewhere && (
          <p className="text-muted-foreground">
            Recorded at a college you cannot open. Ask an admin to compare the two bills.
          </p>
        )}
      </div>
      <div className="space-y-1 rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          This delivery
        </p>
        <p>Invoice {current.invoice_number || '—'}</p>
        <p>Dated {formatDateDMY(current.invoice_date)}</p>
        <p>{rupees(current.invoice_amount)}</p>
      </div>
    </div>
  );
}
