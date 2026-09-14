'use client';

// app/(routes)/billing/schedule/_components/bill-instalment-editor.tsx
//
// The payment schedule of ONE manually-raised bill.
//
// RELATIONSHIP TO THE FEE-STRUCTURE EDITOR. This is deliberately NOT
// FeeItemScheduleEditor. That component is typed to
// AdmissionFeeStructureItemSchedule and owns due_anchor, due_offset_days and
// promotes_to_status_code — three fields a manual bill must not carry (an
// operator raising a bill must not be able to promote a learner up the
// lifecycle ladder). Adding hide-this-column props to a 635-line component
// serving a different schema would couple the two.
//
// What IS shared is the part that matters: both call computeInstalmentAmounts,
// the documented TypeScript mirror of the SQL engine, so the rupees previewed
// here are the rupees billing_instalment_split_for_learner would produce. The
// widgets differ; the arithmetic cannot.
//
// Fully controlled through `value` / `onChange` — it holds no react-hook-form
// subscription, for the same React Compiler reason the fee-structure editor
// documents: a form.watch() over a field array de-optimises the whole tree.

import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { computeInstalmentAmounts } from '@/lib/services/billing/instalments/instalment-arithmetic';
import type { BillInstalmentLine } from '@/lib/services/billing/instalments/bill-instalment-writer';

function money(n: number): string {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A fresh 50/50 — the smallest real split, ready to edit. */
export function defaultBillSplit(): BillInstalmentLine[] {
  const d = todayISO();
  return [
    { share_percent: 50, due_date: d },
    { share_percent: 50, due_date: d },
  ];
}

export function BillInstalmentEditor({
  amount,
  value,
  onChange,
  readOnly = false,
  sourceNote,
  onApplyFeeStructure,
  canApplyFeeStructure = false,
}: {
  /** The bill's final amount — what the shares are taken of. */
  amount: number;
  value: BillInstalmentLine[];
  onChange: (lines: BillInstalmentLine[]) => void;
  /** Money has landed on this bill; the split is frozen. */
  readOnly?: boolean;
  /** e.g. "Prefilled from this learner's fee structure." */
  sourceNote?: string | null;
  onApplyFeeStructure?: () => void;
  canApplyFeeStructure?: boolean;
}) {
  const enabled = value.length > 0;

  // null when the split cannot be sized (fewer than 2 lines, or a tranche
  // computing to <= 0). The preview then shows a dash rather than a wrong
  // number, and the parent's validatePlanLines produces the actual message.
  const amounts = enabled ? computeInstalmentAmounts(amount, value) : null;

  const shareTotal = value.reduce(
    (sum, l) => sum + (Number.isFinite(l.share_percent) ? l.share_percent : 0),
    0
  );
  // Exactly 100 is what validatePlanLines demands at save time. Showing the
  // running total here is the difference between seeing 99.99 now and seeing a
  // form error after pressing Save.
  const shareOk = Math.abs(shareTotal - 100) <= 0.005;

  const setLine = (i: number, patch: Partial<BillInstalmentLine>) => {
    onChange(value.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    const last = value[value.length - 1];
    onChange([
      ...value,
      { share_percent: 0, due_date: last?.due_date ?? todayISO() },
    ]);
  };

  const removeLine = (i: number) => {
    const next = value.filter((_, idx) => idx !== i);
    // One tranche is not a schedule. Dropping to a single line clears it
    // entirely rather than leaving a split that the engine would reject.
    onChange(next.length < 2 ? [] : next);
  };

  if (!enabled) {
    return (
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={readOnly || !(amount > 0)}
          onClick={() => onChange(defaultBillSplit())}
        >
          <CalendarClock className='mr-2 h-3.5 w-3.5' />
          Split into instalments
        </Button>
        {canApplyFeeStructure && onApplyFeeStructure && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={readOnly}
            onClick={onApplyFeeStructure}
          >
            Use fee structure schedule
          </Button>
        )}
        {!(amount > 0) && (
          <span className='text-xs text-muted-foreground'>
            Enter an amount first.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className='rounded-md border bg-muted/30'>
      <div className='flex flex-wrap items-center gap-2 border-b px-3 py-2'>
        <CalendarClock className='h-3.5 w-3.5 text-muted-foreground' aria-hidden='true' />
        <span className='text-xs font-medium'>Payment schedule</span>
        <Badge variant={shareOk ? 'secondary' : 'destructive'} className='font-normal'>
          {shareTotal.toFixed(2)}% of {money(amount)}
        </Badge>
        {sourceNote && (
          <span className='text-xs text-muted-foreground'>{sourceNote}</span>
        )}
        <div className='ml-auto flex items-center gap-1'>
          {canApplyFeeStructure && onApplyFeeStructure && !readOnly && (
            <Button type='button' variant='ghost' size='sm' onClick={onApplyFeeStructure}>
              Reset to fee structure
            </Button>
          )}
          {!readOnly && (
            <Button type='button' variant='ghost' size='sm' onClick={() => onChange([])}>
              Remove schedule
            </Button>
          )}
        </div>
      </div>

      <div className='overflow-x-auto'>
        <table className='w-full text-xs'>
          <thead>
            <tr className='text-left text-muted-foreground'>
              <th className='px-3 py-1.5 font-medium'>#</th>
              <th className='px-3 py-1.5 font-medium'>Share %</th>
              <th className='px-3 py-1.5 font-medium'>Due date</th>
              <th className='px-3 py-1.5 text-right font-medium'>Amount</th>
              <th className='px-3 py-1.5' />
            </tr>
          </thead>
          <tbody className='divide-y'>
            {value.map((line, i) => (
              <tr key={i}>
                <td className='px-3 py-1.5 tabular-nums'>{i + 1}</td>
                <td className='px-3 py-1.5'>
                  <Input
                    type='number'
                    min={0}
                    max={100}
                    step='0.01'
                    className='h-8 w-24'
                    disabled={readOnly}
                    value={Number.isFinite(line.share_percent) ? line.share_percent : ''}
                    onChange={(e) =>
                      setLine(i, { share_percent: Number(e.target.value) })
                    }
                  />
                </td>
                <td className='px-3 py-1.5'>
                  <Input
                    type='date'
                    className='h-8 w-40'
                    disabled={readOnly}
                    value={line.due_date ?? ''}
                    onChange={(e) => setLine(i, { due_date: e.target.value })}
                  />
                </td>
                <td className='px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap'>
                  {/* The LAST line absorbs rounding, which is why this column
                      is computed rather than share% x amount per row. */}
                  {amounts ? money(amounts[i]) : '—'}
                </td>
                <td className='px-3 py-1.5 text-right'>
                  {!readOnly && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-7 w-7 p-0'
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                      <span className='sr-only'>Remove instalment {i + 1}</span>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className='flex items-center gap-2 border-t px-3 py-1.5'>
        {!readOnly && (
          <Button type='button' variant='ghost' size='sm' onClick={addLine}>
            <Plus className='mr-1 h-3.5 w-3.5' />
            Add instalment
          </Button>
        )}
        <p className='text-[11px] text-muted-foreground'>
          {readOnly
            ? 'This bill has payments against it, so its schedule can no longer be changed.'
            : 'Shares must total 100%. The last instalment absorbs rounding, so the parts always sum to the bill.'}
        </p>
      </div>
    </div>
  );
}
