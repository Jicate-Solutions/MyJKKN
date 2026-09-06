'use client';

// app/(routes)/admission/settings/fees-structure/_components/fee-item-schedule-summary.tsx
//
// READ-ONLY rendering of a fee item's billing schedule, for the detail page.
// The editable counterpart is fee-item-schedule-editor.tsx; this shares its
// vocabulary but none of its state.
//
// WHY IT EXISTS. The detail page showed a fee item as name + frequency +
// amount. Once a due date, an instalment split and a status rule can all hang
// off that item, the page was reporting a fraction of the configuration — and
// the missing part is exactly the part that decides WHEN a learner is billed
// and WHEN they move up the lifecycle. A structure whose Tuition is split
// 30/30/40 looked identical to one billed in full at +30 days.
//
// The percentages shown are the CONFIGURED shares. The rupee amounts beside
// them are computed by computeInstalmentAmounts() — the TypeScript mirror of
// the SQL engine — so the last instalment shows the rounding it will actually
// absorb, not `amount * pct` (which would not sum to the total).

import { CalendarClock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { computeInstalmentAmounts } from '@/lib/services/billing/instalments/instalment-plan-service';
import type {
  AdmissionFeeStructureItemSchedule,
  FeeItemDueAnchor,
  FeeItemScheduleMode,
} from '@/types/admission';

export interface ScheduleSummaryItem {
  schedule_mode?: FeeItemScheduleMode | null;
  due_anchor?: FeeItemDueAnchor | null;
  due_offset_days?: number | null;
  due_date?: string | null;
  promotes_to_status_code?: string | null;
  schedules?: AdmissionFeeStructureItemSchedule[] | null;
  amount: number;
}

const ANCHOR_LABEL: Record<FeeItemDueAnchor, string> = {
  generation_date: 'admission',
  academic_year_start: 'academic year start',
  fixed_date: 'a fixed date',
};

/** Human date, or the raw string if it is not parseable — never "Invalid Date". */
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * How one due date is expressed. An absolute date wins; otherwise it is an
 * offset from the item's anchor. A null offset means the item defers to the
 * structure default, so that number is shown rather than a blank.
 */
export function describeDue(
  anchor: FeeItemDueAnchor,
  offsetDays: number | null | undefined,
  dueDate: string | null | undefined,
  defaultOffsetDays: number
): string {
  if (dueDate) return fmtDate(dueDate);
  const days = offsetDays ?? defaultOffsetDays;
  const suffix = offsetDays == null ? ' (structure default)' : '';
  return `+${days} day${days === 1 ? '' : 's'} from ${ANCHOR_LABEL[anchor] ?? 'admission'}${suffix}`;
}

/** Title-cases a lifecycle code for display: 'reserved' -> 'Reserved'. */
function statusLabel(code: string, lookup?: Record<string, string>): string {
  return lookup?.[code] ?? code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');
}

export function FeeItemScheduleSummary({
  item,
  defaultOffsetDays,
  statusLabels,
}: {
  item: ScheduleSummaryItem;
  defaultOffsetDays: number;
  /** code -> label from admission_statuses, so the page shows what the admin configured. */
  statusLabels?: Record<string, string>;
}) {
  const anchor = item.due_anchor ?? 'generation_date';
  const isSplit = item.schedule_mode === 'split' && (item.schedules?.length ?? 0) > 0;

  if (!isSplit) {
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <span>
          Due {describeDue(anchor, item.due_offset_days, item.due_date, defaultOffsetDays)}
        </span>
        {item.promotes_to_status_code && (
          <Badge variant="secondary" className="font-normal gap-1">
            <ArrowRight className="h-3 w-3" />
            {statusLabel(item.promotes_to_status_code, statusLabels)}
          </Badge>
        )}
      </div>
    );
  }

  const lines = [...(item.schedules ?? [])].sort((a, b) => a.sequence_no - b.sequence_no);
  const amounts = computeInstalmentAmounts(
    Number(item.amount) || 0,
    lines.map((l) => ({ share_percent: l.share_percent, fixed_amount: l.fixed_amount }))
  );

  return (
    <div className="mt-2 rounded-md border bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b bg-muted/30">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium">
          Split into {lines.length} instalment{lines.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="px-2.5 py-1.5 font-medium">#</th>
              <th className="px-2.5 py-1.5 font-medium">Share</th>
              <th className="px-2.5 py-1.5 font-medium">Amount</th>
              <th className="px-2.5 py-1.5 font-medium">Due</th>
              <th className="px-2.5 py-1.5 font-medium">On payment → status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td className="px-2.5 py-1.5 text-muted-foreground tabular-nums">
                  {l.sequence_no}
                </td>
                <td className="px-2.5 py-1.5 tabular-nums">
                  {l.share_percent != null
                    ? `${Number(l.share_percent)}%`
                    : l.fixed_amount != null
                      ? 'fixed'
                      : '—'}
                </td>
                <td className="px-2.5 py-1.5 tabular-nums font-medium whitespace-nowrap">
                  {amounts?.[i] != null
                    ? `₹${amounts[i].toLocaleString('en-IN')}`
                    : l.fixed_amount != null
                      ? `₹${Number(l.fixed_amount).toLocaleString('en-IN')}`
                      : '—'}
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  {describeDue(anchor, l.due_offset_days, l.due_date, defaultOffsetDays)}
                </td>
                <td className="px-2.5 py-1.5">
                  {l.promotes_to_status_code ? (
                    <Badge variant="secondary" className="font-normal gap-1">
                      <ArrowRight className="h-3 w-3" />
                      {statusLabel(l.promotes_to_status_code, statusLabels)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Roll-up for the structure-level summary card. */
export function summariseSchedules(items: ScheduleSummaryItem[]) {
  let splitItems = 0;
  let instalments = 0;
  let statusRules = 0;
  let customDates = 0;

  for (const it of items) {
    const lines = it.schedules ?? [];
    if (it.schedule_mode === 'split' && lines.length > 0) {
      splitItems += 1;
      instalments += lines.length;
      statusRules += lines.filter((l) => l.promotes_to_status_code).length;
      customDates += lines.length;
    } else {
      // An unsplit item still bills once, on one date.
      instalments += 1;
      if (it.promotes_to_status_code) statusRules += 1;
      if (it.due_offset_days != null || it.due_date) customDates += 1;
    }
  }

  return { splitItems, instalments, statusRules, customDates };
}
