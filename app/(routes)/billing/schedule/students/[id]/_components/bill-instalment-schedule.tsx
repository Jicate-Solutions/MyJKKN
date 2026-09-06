'use client';

// ============================================================================
// BillInstalmentSchedule — the payment schedule sitting INSIDE one bill.
// ----------------------------------------------------------------------------
// A fee collectable in tranches is ONE bill of the full amount, not N bills.
// That is right for the ledger and for the cashier, but it left the bills table
// showing "1 Year Tuition Fee · ₹1,00,000 · due 06 Sept" with no sign that the
// ₹1,00,000 is actually collectable in three parts on three dates — the bill's
// due_date is only the NEXT unsettled tranche.
//
// Allocation shown here is the waterfall: money settles the oldest tranche
// first. It is read from vw_bill_instalment_state, the same view the promotion
// engine and the fee-paid threshold use, rather than recomputed — a third
// implementation would be free to disagree with the two that decide money and
// lifecycle status.
// ============================================================================

import { ArrowRight, CalendarClock, CheckCircle2, CircleDashed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BillInstalmentState } from '@/lib/services/billing/schedule/student-bill-service';

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(n: number): string {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function statusLabel(code: string): string {
  return code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');
}

/** Compact one-liner for the Due Date cell: "3 instalments · 1 settled". */
export function instalmentSummary(rows: BillInstalmentState[]): string {
  const settled = rows.filter((r) => r.is_settled).length;
  return `${rows.length} instalments${settled > 0 ? ` · ${settled} settled` : ''}`;
}

export function BillInstalmentSchedule({
  rows,
  className = '',
}: {
  rows: BillInstalmentState[];
  className?: string;
}) {
  if (!rows.length) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={`rounded-md border bg-muted/30 ${className}`}>
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium">Payment schedule</span>
        <span className="text-xs text-muted-foreground">{instalmentSummary(rows)}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              <th className="px-3 py-1.5 font-medium">Due</th>
              <th className="px-3 py-1.5 text-right font-medium">Paid</th>
              <th className="px-3 py-1.5 text-right font-medium">Outstanding</th>
              <th className="px-3 py-1.5 font-medium">On payment</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              // Overdue is the tranche's own date, not the bill's: the bill
              // carries only the NEXT unsettled date, so it cannot tell you an
              // earlier tranche is already late.
              const overdue = !r.is_settled && r.due_date < today;
              return (
                <tr key={r.instalment_id} className={r.is_settled ? 'text-muted-foreground' : ''}>
                  <td className="px-3 py-1.5 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {r.is_settled ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                          aria-label="Settled"
                        />
                      ) : (
                        <CircleDashed
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-label="Outstanding"
                        />
                      )}
                      {r.sequence_no}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                    {money(r.amount)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                    {fmtDate(r.due_date)}
                    {overdue && (
                      <Badge variant="destructive" className="ml-2 font-normal">
                        Overdue
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {r.allocated_amount > 0 ? money(r.allocated_amount) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {r.outstanding > 0 ? money(r.outstanding) : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.promotes_to_status_code ? (
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        {statusLabel(r.promotes_to_status_code)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        Payments settle the earliest instalment first. The bill&apos;s own due date
        is whichever instalment is next unsettled.
      </p>
    </div>
  );
}
