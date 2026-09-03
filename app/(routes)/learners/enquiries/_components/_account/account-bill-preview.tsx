'use client';

// ============================================================================
// AccountBillPreview — the billing schedule section of the Move-to-Account form.
// ----------------------------------------------------------------------------
// Shows the EXACT bills the transition will raise: one row per instalment, with
// its share of the fee, its real due date, and the lifecycle status settling it
// promotes the learner to.
//
// WHY IT READS AN RPC RATHER THAN THE FEE STRUCTURE. The old dialog rendered
// the structure's line items and told the admin "a bill row will be created for
// each" — which stopped being true the moment a fee could split into three
// instalments on three dates. This reads admission_preview_account_bills, which
// runs the same split engine and the same hostel/mess/transport skip rule as
// generation, so what is on screen is what commits. Re-deriving it here would
// be a second implementation of the schedule, free to drift.
//
// Foreign-module fees are shown, greyed, rather than hidden: an admin looking at
// a hosteller should see that Hostel Fee exists and learn that Campus Living
// bills it, instead of wondering why the total does not match the structure.
//
// LAYOUT NOTES (2026-08-21 redesign). Money reads down a column, so every
// numeric cell is right-aligned and tabular-nums — proportional digits make
// ₹1,000 and ₹10,000 impossible to compare at a glance. Instalments of one fee
// are visually bracketed under it rather than repeated, because the question
// being answered is "what does this fee cost and when", not "list 5 bills".
// ============================================================================

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AccountTransitionService,
  type AccountBillPreviewRow,
} from '@/lib/services/admission/account-transition-service';
import { getErrorMessage } from '@/lib/utils';

const OWNER_LABEL: Record<string, string> = {
  campus_living: 'Campus Living',
  tms: 'Transport',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(n: number | null | undefined): string {
  return `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
}

function statusLabel(code: string): string {
  return code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');
}

export interface AccountBillPreviewState {
  loading: boolean;
  error: string | null;
  rows: AccountBillPreviewRow[];
  /**
   * Number of BILLS that will be raised — one per billable fee, regardless of
   * how many tranches it is collectable in. Distinct from rows.length, which
   * counts tranches: a fee split 30/40/30 is three rows but ONE bill.
   * Reporting rows here is what made the dialog promise "5 bills" for three
   * fees.
   */
  billableCount: number;
  /** Tranches across all billable fees, for the schedule summary line. */
  instalmentCount: number;
  total: number;
}

/**
 * Fetches once per `learnerId` + `enabled` transition. The parent needs the
 * same state to decide whether Confirm is allowed, so it is lifted out rather
 * than kept private — a preview showing zero billable rows means the RPC will
 * refuse, and the button must say so before it is clicked.
 */
export function useAccountBillPreview(
  learnerId: string,
  enabled: boolean,
): AccountBillPreviewState {
  // `loading` is DERIVED, not stored. Setting it synchronously inside the
  // effect is what react-hooks/set-state-in-effect forbids, and the obvious
  // workarounds (an initial loading:true, or a flag set before the fetch) both
  // reintroduce it. Stamping each result with the key it was fetched for means
  // "no result for the current key yet" IS the loading state — and it also
  // fixes the stale-result race for free: a result for an older key can never
  // be mistaken for the current one.
  const [result, setResult] = useState<{
    key: string;
    rows: AccountBillPreviewRow[];
    error: string | null;
  } | null>(null);

  const key = `${learnerId}:${enabled}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    AccountTransitionService.previewBills(learnerId)
      .then((rows) => {
        if (!cancelled) setResult({ key, rows, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            key,
            rows: [],
            error: getErrorMessage(err) || 'Could not load the bill preview',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [learnerId, enabled, key]);

  const ready = result?.key === key;
  const rows = ready ? result.rows : [];
  const billable = rows.filter((r) => r.is_billable);

  // One bill per FEE. The preview returns a row per tranche, so the bills are
  // the distinct fees behind those rows — keyed on sort_order as well as
  // category so two items sharing a category can never merge into one.
  const billKeys = new Set(
    billable.map((r) => `${r.sort_order}:${r.category_id ?? 'none'}`),
  );

  return {
    loading: enabled && !ready,
    error: ready ? result.error : null,
    rows,
    billableCount: billKeys.size,
    instalmentCount: billable.length,
    total: billable.reduce((s, r) => s + Number(r.instalment_amount ?? 0), 0),
  };
}

export function AccountBillPreview({ state }: { state: AccountBillPreviewState }) {
  const { loading, error, rows, billableCount, instalmentCount, total } = state;

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-md border border-dashed py-12 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Working out the bills and due dates…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Could not preview the bills</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (billableCount === 0) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>No bills would be generated</AlertTitle>
        <AlertDescription>
          {rows.length === 0
            ? 'No fee structure resolves for this learner’s dimensions, so there is nothing to bill.'
            : 'Every fee on this learner belongs to another module, so this step would raise no bill.'}{' '}
          Confirming would be rejected and the status left unchanged — fix the
          fee structure first under Admission → Settings → Fee Structures.
        </AlertDescription>
      </Alert>
    );
  }

  // Instalments of ONE fee are bracketed under it. Grouped on sort_order as
  // well as category so two items sharing a category can never merge.
  const groups = new Map<string, AccountBillPreviewRow[]>();
  for (const r of rows) {
    const key = `${r.sort_order}:${r.category_id ?? 'none'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900/60 dark:hover:bg-slate-900/60">
                <TableHead className="h-9 w-[34%] text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Fee particulars
                </TableHead>
                <TableHead className="h-9 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Instalment
                </TableHead>
                <TableHead className="h-9 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Share
                </TableHead>
                <TableHead className="h-9 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Amount
                </TableHead>
                <TableHead className="h-9 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Due date
                </TableHead>
                <TableHead className="h-9 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  On payment
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...groups.values()].map((lines, gi) =>
                lines.map((r, i) => {
                  const first = i === 0;
                  const last = i === lines.length - 1;
                  const split = (r.instalment_count ?? 1) > 1;
                  return (
                    <TableRow
                      key={`${r.sort_order}-${r.instalment_no ?? 'x'}-${i}`}
                      className={[
                        // A rule under the LAST line of each fee, not between
                        // instalments — the group reads as one block.
                        last && gi >= 0 ? '' : 'border-b-0',
                        r.is_billable ? '' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      <TableCell className="py-2 align-top">
                        {first ? (
                          <div className="min-w-0">
                            <div className="font-medium leading-tight">
                              {r.category_name ?? 'Fee'}
                            </div>
                            <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                              {money(r.item_amount)} total
                            </div>
                          </div>
                        ) : (
                          <span className="pl-3 text-muted-foreground" aria-hidden="true">
                            ↳
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="py-2 align-top whitespace-nowrap">
                        {!r.is_billable ? (
                          <Badge variant="outline" className="font-normal">
                            {OWNER_LABEL[r.owner_module] ?? 'Billed elsewhere'} bills this
                          </Badge>
                        ) : split ? (
                          <span className="tabular-nums">
                            {r.instalment_no} <span className="text-muted-foreground">of</span>{' '}
                            {r.instalment_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Full amount</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2 align-top text-right tabular-nums">
                        {r.is_billable && r.share_percent != null
                          ? `${Number(r.share_percent)}%`
                          : '—'}
                      </TableCell>

                      <TableCell className="py-2 align-top text-right font-medium tabular-nums whitespace-nowrap">
                        {r.is_billable ? money(r.instalment_amount) : '—'}
                      </TableCell>

                      <TableCell className="py-2 align-top whitespace-nowrap tabular-nums">
                        {r.is_billable ? fmtDate(r.due_date) : '—'}
                      </TableCell>

                      <TableCell className="py-2 align-top">
                        {r.promotes_to_status_code ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 font-normal"
                            title={`Settling this instalment moves the learner to ${statusLabel(r.promotes_to_status_code)}`}
                          >
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            {statusLabel(r.promotes_to_status_code)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }),
              )}
            </TableBody>
          </Table>
        </div>

        {/* Totals band — the one place in the form that carries weight, because
            it is the number the admin is actually signing off on. */}
        <div className="flex items-center justify-between gap-4 border-t bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {billableCount}
            </span>{' '}
            bill{billableCount === 1 ? '' : 's'} will be generated
            {instalmentCount > billableCount && (
              <>
                {', collectable in '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {instalmentCount}
                </span>{' '}
                instalments
              </>
            )}
          </p>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Total payable
            </p>
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {money(total)}
            </p>
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Due dates set as an offset are counted from today. Confirming on a later
        day shifts them accordingly.
      </p>
    </div>
  );
}
