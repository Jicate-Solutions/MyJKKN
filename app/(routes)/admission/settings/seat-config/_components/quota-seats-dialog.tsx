'use client';

// quota-seats-dialog.tsx
//
// Configure per-quota seat allocations for a single admission-year cohort.
// Loads all 8 active quotas + any existing admission_year_quota_seats rows
// for this admission_year, presents an editable input per quota, persists
// via upsert on save. Shows the running quota-sum vs the parent
// admission_years.sanctioned_intake total so the admin can see if there's
// uncategorized capacity remaining.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AdmissionFeeQuota } from '@/types/admission';
import type { AdmissionYearRow } from './seat-config-columns';

interface QuotaSeatRow {
  quota_id: string;
  quota_name: string;
  quota_code: string;
  sanctioned_intake: number;
  // Track whether this is a fresh entry (no existing DB row) vs an edit
  existing_row_id: string | null;
  notes: string | null;
}

interface Props {
  row: AdmissionYearRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function QuotaSeatsDialog({ row, open, onOpenChange, onSaved }: Props) {
  const [quotas, setQuotas] = useState<AdmissionFeeQuota[]>([]);
  const [seatRows, setSeatRows] = useState<QuotaSeatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;

    const supabase = createClientSupabaseClient();
    setLoading(true);

    Promise.all([
      LookupService.listQuotas(true),
      supabase
        .from('admission_year_quota_seats')
        .select('id, quota_id, sanctioned_intake, notes')
        .eq('admission_year_id', row.id),
    ])
      .then(([quotaList, existingResult]) => {
        if (existingResult.error) throw existingResult.error;
        setQuotas(quotaList);
        const existing = new Map<
          string,
          { id: string; sanctioned_intake: number; notes: string | null }
        >();
        for (const r of existingResult.data ?? []) {
          existing.set(r.quota_id, {
            id: r.id,
            sanctioned_intake: r.sanctioned_intake,
            notes: r.notes,
          });
        }
        setSeatRows(
          quotaList.map((q) => {
            const existingRow = existing.get(q.id);
            return {
              quota_id: q.id,
              quota_name: q.name,
              quota_code: q.code,
              sanctioned_intake: existingRow?.sanctioned_intake ?? 0,
              existing_row_id: existingRow?.id ?? null,
              notes: existingRow?.notes ?? null,
            };
          }),
        );
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load quotas');
      })
      .finally(() => setLoading(false));
  }, [open, row]);

  const updateSeatCount = (quotaId: string, value: number) => {
    setSeatRows((prev) =>
      prev.map((r) =>
        r.quota_id === quotaId
          ? { ...r, sanctioned_intake: Number.isFinite(value) ? Math.max(0, value) : 0 }
          : r,
      ),
    );
  };

  const handleSave = async () => {
    if (!row) return;
    // Guard against overallocation — UI disables the button, but a programmatic
    // invocation (or keyboard shortcut) could bypass that. Refuse with a toast.
    const sumNow = seatRows.reduce((s, r) => s + r.sanctioned_intake, 0);
    if (sumNow > (row.sanctioned_intake ?? 0)) {
      toast.error(
        `Quota total (${sumNow.toLocaleString()}) exceeds cohort total (${(
          row.sanctioned_intake ?? 0
        ).toLocaleString()}). Reduce values to save.`,
      );
      return;
    }
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      // Upsert all rows in a single batched insert with onConflict
      const payload = seatRows.map((r) => ({
        admission_year_id: row.id,
        quota_id: r.quota_id,
        sanctioned_intake: r.sanctioned_intake,
        notes: r.notes,
      }));

      const { error } = await supabase
        .from('admission_year_quota_seats')
        .upsert(payload, { onConflict: 'admission_year_id,quota_id' });

      if (error) throw error;

      toast.success(`Saved quota allocations for ${row.admission_year_name}`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const quotaTotal = seatRows.reduce((s, r) => s + r.sanctioned_intake, 0);
  const cohortTotal = row?.sanctioned_intake ?? 0;
  const variance = quotaTotal - cohortTotal;
  // Save is blocked while the sum of quota allocations exceeds the
  // cohort total — prevents over-promising seats. Negative variance
  // (uncategorized capacity) is acceptable.
  const isOverallocated = variance > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-2rem)] max-w-lg
          max-h-[min(90vh,720px)]
          flex flex-col gap-0 p-0
          sm:rounded-lg
        "
      >
        {/* Header — always visible */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
          <DialogTitle>
            Quota seat allocation
            {row && (
              <span className="block text-sm font-normal text-muted-foreground mt-1 truncate">
                {row.program_name} · {row.admission_year_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Explanatory text — pinned below header */}
            <p className="shrink-0 text-xs text-muted-foreground px-6 pt-3 pb-2">
              Set the sanctioned seat count per quota for this admission-year cohort.
              The sum should ideally match the cohort total of{' '}
              <span className="font-medium text-foreground">
                {cohortTotal.toLocaleString()}
              </span>{' '}
              seats.
            </p>

            {/* Scrollable list of quota rows — only this region scrolls */}
            <div
              className="flex-1 overflow-y-auto min-h-0 px-6 py-1"
              style={{ scrollbarGutter: 'stable' }}
            >
              <div className="rounded-md border divide-y">
                {seatRows.map((sr) => (
                  <div
                    key={sr.quota_id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Label
                        htmlFor={`q-${sr.quota_id}`}
                        className="text-sm font-medium block truncate"
                      >
                        {sr.quota_name}
                      </Label>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {sr.quota_code}
                      </p>
                    </div>
                    <Input
                      id={`q-${sr.quota_id}`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="w-24 sm:w-28 text-right shrink-0"
                      value={sr.sanctioned_intake}
                      onChange={(e) =>
                        updateSeatCount(sr.quota_id, Number(e.target.value) || 0)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Totals strip — pinned above footer */}
            <div
              className={`
                shrink-0 mx-6 my-3 rounded-md px-3 py-2 text-sm space-y-1 border
                ${
                  isOverallocated
                    ? 'bg-destructive/10 border-destructive/30'
                    : 'bg-muted/50 border-transparent'
                }
              `}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Quota allocations sum</span>
                <span
                  className={`font-semibold tabular-nums ${
                    isOverallocated ? 'text-destructive' : ''
                  }`}
                >
                  {quotaTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Cohort sanctioned total</span>
                <span className="font-semibold tabular-nums">
                  {cohortTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Remaining capacity</span>
                <span
                  className={`font-semibold tabular-nums ${
                    isOverallocated ? 'text-destructive' : 'text-emerald-700'
                  }`}
                >
                  {(cohortTotal - quotaTotal).toLocaleString()}
                </span>
              </div>
              {isOverallocated && (
                <div className="flex items-start gap-2 text-xs pt-1 text-destructive font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Quota total exceeds cohort total by {variance.toLocaleString()} seats —
                    reduce one or more quotas to save.
                  </span>
                </div>
              )}
              {variance < 0 && (
                <div className="flex items-start gap-2 text-xs pt-1 text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    {Math.abs(variance).toLocaleString()} seats unallocated (uncategorized capacity)
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer — pinned bottom, full-width on mobile, right-aligned on desktop */}
        <DialogFooter className="shrink-0 px-6 py-4 border-t flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || isOverallocated}
            className="w-full sm:w-auto"
            title={
              isOverallocated
                ? 'Quota total exceeds cohort total — reduce values to enable save'
                : 'Save quota allocations'
            }
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save quota allocations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
