'use client';

// Year ladders — REFERENCE ONLY (Director ruling 2026-09-18).
// Shows the per-year steps of the JKKN pay band stored as `ladders` inside the
// institution's hr.pay_scales value. Nothing here reads or writes a salary:
// loading or editing a ladder changes nobody's pay. The parent editor owns
// saving; this section only reports changes through onChange.

import { useMemo, useState } from 'react';
import { Info, Download, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PayLadder, PayLadderStep } from '@/types/hr-pay-ladders';

// ---------------------------------------------------------------------------
// Pure merge helpers (tested in __tests__/hr/pay-ladders-merge.test.ts)
// ---------------------------------------------------------------------------

/**
 * Adds every reference ladder whose id is not already stored. An existing
 * ladder is never changed or reordered: existing ladders come first, exactly
 * as they were, then the added ones in reference order.
 */
export function mergeReferenceLadders(
  current: PayLadder[],
  reference: PayLadder[]
): { merged: PayLadder[]; added: PayLadder[]; skipped: PayLadder[] } {
  const present = new Set(current.map((l) => l.id));
  const added: PayLadder[] = [];
  const skipped: PayLadder[] = [];
  for (const ladder of reference) {
    if (present.has(ladder.id)) {
      skipped.push(ladder);
    } else {
      present.add(ladder.id);
      added.push(ladder);
    }
  }
  return { merged: [...current, ...added], added, skipped };
}

/** Union of both note lists, current order first, no duplicates. */
export function mergeNotes(current: string[], reference: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const note of [...current, ...reference]) {
    if (seen.has(note)) continue;
    seen.add(note);
    out.push(note);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function inr(v: number): string {
  return `₹${v.toLocaleString('en-IN')}`;
}

function ladderName(l: PayLadder): string {
  return `${l.designation} · ${l.qualification ?? 'any qualification'}`;
}

/** Unique enough for a screen reader: two versions of one scale can share a
 *  designation and qualification (the 13,000 and 15,000 Science & Humanities
 *  ladders), so the starting amount tells their buttons apart. */
function ladderLabel(l: PayLadder): string {
  const start = l.steps[0]?.basic_pay;
  return start == null ? ladderName(l) : `${ladderName(l)}, starting ${inr(start)}`;
}

function stepRange(steps: PayLadderStep[]): string {
  if (steps.length === 0) return 'no steps';
  const first = steps[0].basic_pay;
  const last = steps[steps.length - 1].basic_pay;
  return steps.length === 1 ? inr(first) : `${inr(first)} → ${inr(last)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PayLaddersSectionProps {
  ladders: PayLadder[];
  notes: string[];
  referenceLadders: PayLadder[];
  referenceNotes: string[];
  onChange: (ladders: PayLadder[], notes: string[]) => void;
  disabled?: boolean;
}

export function PayLaddersSection({
  ladders,
  notes,
  referenceLadders,
  referenceNotes,
  onChange,
  disabled = false,
}: PayLaddersSectionProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const preview = useMemo(
    () => mergeReferenceLadders(ladders, referenceLadders),
    [ladders, referenceLadders]
  );
  const nothingToAdd = preview.added.length === 0;

  const handleStepChange = (
    ladderIndex: number,
    stepIndex: number,
    raw: string
  ) => {
    if (raw.trim() === '') return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const amount = Math.max(0, Math.round(n));
    const next = ladders.map((l, i) =>
      i === ladderIndex
        ? {
            ...l,
            steps: l.steps.map((s, j) =>
              j === stepIndex ? { ...s, basic_pay: amount } : s
            ),
          }
        : l
    );
    onChange(next, notes);
  };

  const handleRemove = (ladderIndex: number) => {
    onChange(
      ladders.filter((_, i) => i !== ladderIndex),
      notes
    );
  };

  const handleConfirmLoad = () => {
    onChange(preview.merged, mergeNotes(notes, referenceNotes));
    setPreviewOpen(false);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6 space-y-4 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Year ladders</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            What a person with a given number of years of service should be
            on, according to the band.
          </p>
        </div>
        <div className="flex-shrink-0">
          {referenceLadders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reference ladders are prepared for this college.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={disabled || nothingToAdd}
            >
              <Download className="h-4 w-4 mr-2" />
              {nothingToAdd
                ? 'All reference ladders are already loaded'
                : 'Load JKKN reference ladders'}
            </Button>
          )}
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Reference only</AlertTitle>
        <AlertDescription>
          These ladders show what the band says. Loading or editing them
          changes nobody&apos;s pay.
        </AlertDescription>
      </Alert>

      {notes.length > 0 && (
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {ladders.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No year ladders stored for this college yet.
        </div>
      ) : (
        <div className="space-y-3">
          {ladders.map((ladder, li) => (
            <div
              key={ladder.id}
              className="rounded-md border border-border bg-background p-3 sm:p-4 space-y-3 min-w-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium break-words">
                      {ladderName(ladder)}
                    </span>
                    <Badge variant="outline" className="font-medium">
                      {ladder.staff_group === 'teaching'
                        ? 'Teaching'
                        : 'Non-teaching'}
                    </Badge>
                  </div>
                  {ladder.note && (
                    <p className="text-sm text-muted-foreground">
                      {ladder.note}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground break-words">
                    Source: {ladder.source}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(li)}
                  disabled={disabled}
                  aria-label={`Remove ladder ${ladderLabel(ladder)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-x-auto">
                <div className="flex gap-2 pb-1 w-max">
                  {ladder.steps.map((step, si) => (
                    <label
                      key={`${ladder.id}-${si}`}
                      className="flex w-28 flex-shrink-0 flex-col gap-1"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {step.label}
                      </span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={step.basic_pay}
                        onChange={(e) =>
                          handleStepChange(li, si, e.target.value)
                        }
                        disabled={disabled}
                        className="h-8 text-right tabular-nums"
                        aria-label={`${ladderLabel(ladder)}, ${step.label}, basic pay in rupees`}
                      />
                      <span className="text-xs text-muted-foreground text-right tabular-nums">
                        {inr(step.basic_pay)}
                      </span>
                    </label>
                  ))}
                  {ladder.steps.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No steps in this ladder.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Load JKKN reference ladders</DialogTitle>
            <DialogDescription>
              {preview.added.length} ladder
              {preview.added.length === 1 ? '' : 's'} will be added.
              {preview.skipped.length > 0 && (
                <>
                  {' '}
                  {preview.skipped.length} already stored will be left exactly
                  as {preview.skipped.length === 1 ? 'it is' : 'they are'}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {preview.added.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {preview.added.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 break-words">{ladderName(l)}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                    {stepRange(l.steps)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-sm text-muted-foreground">
            Nothing is saved until you press Save on the page. Nobody&apos;s pay
            changes.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmLoad}
              disabled={disabled || nothingToAdd}
            >
              Add {preview.added.length} ladder
              {preview.added.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
