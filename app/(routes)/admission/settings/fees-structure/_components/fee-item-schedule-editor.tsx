'use client';

// app/(routes)/admission/settings/fees-structure/_components/fee-item-schedule-editor.tsx
//
// Per-fee-item due date, instalment split, and status rules.
//
// WHAT THIS REPLACES. Before 2026-08-21 a generated bill's due date was the
// literal `now() + 30 days`, hardcoded in BOTH generation paths, and the fee
// ladder that moves a learner account -> reserved -> admitted was one pooled
// percentage over their whole bill book. Neither could express what the
// accounts team actually wanted: "Tuition splits 30/30/40 on three dates, and
// the first two instalments move the learner up the ladder."
//
// WHERE THE NUMBERS COME FROM. The amount column is a PREVIEW computed by
// computeInstalmentAmounts() — the documented TypeScript mirror of the SQL
// engine billing_instalment_split_for_learner, which is what actually sizes the
// bills. Both apply the same rule: lines 1..n-1 take their own share, the LAST
// line absorbs rounding, so the instalments sum EXACTLY to the item amount. If
// the preview and the generated bills ever disagree, the SQL engine is right
// and this mirror has drifted.
//
// WHY useWatch AND NOT form.watch. This editor is a nested array inside a form
// that already field-arrays its items. React Compiler bails out on a
// form.watch() over a field array, silently de-optimising the whole tree — the
// parent already carries that cost once and must not compound it here. This
// component therefore holds no react-hook-form subscription at all: it is fully
// controlled by the parent through `value` / `onChange`.

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { computeInstalmentAmounts } from '@/lib/services/billing/instalments/instalment-plan-service';
import type {
  AdmissionFeeStructureItemSchedule,
  FeeItemDueAnchor,
  FeeItemScheduleMode,
} from '@/types/admission';

/** The slice of a draft fee item this editor owns. */
export interface FeeItemScheduleValue {
  schedule_mode: FeeItemScheduleMode;
  due_anchor: FeeItemDueAnchor;
  due_offset_days: number | null;
  due_date: string | null;
  promotes_to_status_code: string | null;
  schedules: AdmissionFeeStructureItemSchedule[];
}

/** One selectable promotion target. `active` and friends are filtered out by
 *  the caller (gates_login = true), matching the database's own refusal. */
export interface PromotableStatus {
  code: string;
  label: string;
}

const NO_RULE = '__none__';

export function emptySchedule(): FeeItemScheduleValue {
  return {
    schedule_mode: 'single',
    due_anchor: 'generation_date',
    due_offset_days: null,
    due_date: null,
    promotes_to_status_code: null,
    schedules: [],
  };
}

/** A fresh 30/30/40 — the shape the accounts team asked for, ready to edit. */
function defaultSplit(): AdmissionFeeStructureItemSchedule[] {
  return [
    { sequence_no: 1, share_percent: 30, fixed_amount: null, due_offset_days: 15, due_date: null, promotes_to_status_code: null, label: null },
    { sequence_no: 2, share_percent: 30, fixed_amount: null, due_offset_days: 90, due_date: null, promotes_to_status_code: null, label: null },
    { sequence_no: 3, share_percent: 40, fixed_amount: null, due_offset_days: 180, due_date: null, promotes_to_status_code: null, label: null },
  ];
}

export function scheduleSummary(
  value: FeeItemScheduleValue,
  defaultOffsetDays: number
): string {
  if (value.schedule_mode === 'split') {
    const n = value.schedules.length;
    const rules = value.schedules.filter((s) => s.promotes_to_status_code).length;
    return `${n} instalment${n === 1 ? '' : 's'}${rules ? ` · ${rules} status rule${rules === 1 ? '' : 's'}` : ''}`;
  }
  if (value.due_anchor === 'fixed_date' && value.due_date) return `Due ${value.due_date}`;
  const days = value.due_offset_days ?? defaultOffsetDays;
  const anchor = value.due_anchor === 'academic_year_start' ? 'academic year start' : 'admission';
  return `Due +${days}d from ${anchor}${value.promotes_to_status_code ? ` · 1 status rule` : ''}`;
}

/**
 * Percent lines must total exactly 100. A schedule mixing percent and fixed
 * amounts is exempt: the last line absorbs whatever remains, which is the point
 * of the last-absorbs rule. Mirrors afsis_validate_schedule_shape() in SQL.
 */
export function scheduleErrors(value: FeeItemScheduleValue): string[] {
  if (value.schedule_mode !== 'split') return [];
  const errs: string[] = [];
  const lines = value.schedules;
  if (lines.length < 2) {
    errs.push('A split needs at least 2 instalments.');
    return errs;
  }
  const allPercent = lines.every((l) => l.share_percent != null);
  if (allPercent) {
    const sum = lines.reduce((s, l) => s + Number(l.share_percent ?? 0), 0);
    if (Math.abs(sum - 100) > 0.0001) {
      errs.push(`Instalment percentages must total 100% (they total ${sum.toFixed(2)}%).`);
    }
  }
  for (const l of lines) {
    if (l.share_percent == null && l.fixed_amount == null) {
      errs.push(`Instalment ${l.sequence_no}: set a percentage or a fixed amount.`);
    }
    if (l.due_offset_days == null && !l.due_date) {
      errs.push(`Instalment ${l.sequence_no}: set a due offset or a due date.`);
    }
  }
  return errs;
}

/**
 * Non-blocking warnings. Kept separate from scheduleErrors() on purpose: these
 * must NOT block a save, because a back-dated structure is legitimate.
 *
 * The case that matters is a CLONE. Cloning a structure to the next admission
 * year copies its schedule verbatim, so a fixed_date schedule arrives carrying
 * last year's calendar dates. Bills generated from it would be due in the past —
 * immediately overdue, and immediately in the denominator of the due-as-on-date
 * threshold that decides whether a learner is delinquent. The clone lands as a
 * draft and a draft never resolves for fee items, so nothing breaks silently;
 * this is what makes the operator notice before they activate it.
 */
function scheduleWarnings(value: FeeItemScheduleValue): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [];

  if (value.schedule_mode !== 'split') {
    if (value.due_date && value.due_date < today) {
      out.push('This due date is in the past — bills would generate already overdue.');
    }
    return out;
  }

  const past = value.schedules
    .filter((l) => l.due_date && l.due_date! < today)
    .map((l) => l.sequence_no);
  if (past.length) {
    out.push(
      `Instalment ${past.join(', ')} ${past.length === 1 ? 'is' : 'are'} dated in the past — bills would generate already overdue. Cloned from an earlier year?`
    );
  }

  // Instalments due out of order. Nothing forbids it — the engine and the
  // database both accept any dates — but 30 / 90 / 30 is a typo far more often
  // than it is a plan, and the consequence is quiet: instalment 3 falls due
  // before instalment 2, so the learner is chased for the wrong one and the
  // due-as-on-date threshold moves earlier than intended.
  const ordered = [...value.schedules].sort((a, b) => a.sequence_no - b.sequence_no);
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const prevKey = prev.due_date ?? prev.due_offset_days;
    const curKey = cur.due_date ?? cur.due_offset_days;
    // Only compare like with like: a date and an offset are not orderable
    // without knowing the anchor date, which is not known until generation.
    const comparable =
      (prev.due_date != null && cur.due_date != null) ||
      (prev.due_offset_days != null && cur.due_offset_days != null);
    if (comparable && prevKey != null && curKey != null && curKey < prevKey) {
      out.push(
        `Instalment ${cur.sequence_no} falls due before instalment ${prev.sequence_no}. Intended?`
      );
    }
  }

  return out;
}

export function FeeItemScheduleEditor({
  value,
  amount,
  defaultOffsetDays,
  statuses,
  onChange,
}: {
  value: FeeItemScheduleValue;
  /** The item's full amount — drives the instalment amount preview. */
  amount: number;
  /** The structure's default_due_offset_days, shown as the fallback hint. */
  defaultOffsetDays: number;
  statuses: PromotableStatus[];
  onChange: (next: FeeItemScheduleValue) => void;
}) {
  const [open, setOpen] = useState(false);

  const errors = useMemo(() => scheduleErrors(value), [value]);
  const warnings = useMemo(() => scheduleWarnings(value), [value]);

  // Preview only — the SQL engine is what actually sizes the bills.
  const previewAmounts = useMemo(() => {
    if (value.schedule_mode !== 'split') return null;
    return computeInstalmentAmounts(
      amount,
      value.schedules.map((s) => ({
        share_percent: s.share_percent,
        fixed_amount: s.fixed_amount,
      }))
    );
  }, [amount, value.schedule_mode, value.schedules]);

  const patch = (p: Partial<FeeItemScheduleValue>) => onChange({ ...value, ...p });

  const patchLine = (index: number, p: Partial<AdmissionFeeStructureItemSchedule>) => {
    const next = value.schedules.map((l, i) => (i === index ? { ...l, ...p } : l));
    onChange({ ...value, schedules: next });
  };

  /**
   * Switches ONE instalment between "after N days" and "on a fixed date".
   *
   * The database models this per line — chk_afsis_due_exactly_one is
   * (due_offset_days IS NULL) <> (due_date IS NULL) on the row, not the item —
   * and the engine already resolves each line as
   * COALESCE(line.due_date, anchor + line.due_offset_days). So a schedule may
   * legitimately mix the two: "+15 days" for the first instalment, then two
   * hard calendar dates for the rest. Only this editor forced one mode on the
   * whole item, by keying the input type off the item-level anchor.
   *
   * Switching to date mode SEEDS a date rather than clearing to null: mode is
   * derived from which column holds a value, so a null due_date would snap the
   * row straight back to days mode and the click would appear to do nothing.
   * The seed is today + whatever offset the row already had, which is also the
   * date the row was going to resolve to anyway.
   */
  const setLineDueMode = (index: number, mode: 'days' | 'date') => {
    const line = value.schedules[index];
    if (!line) return;
    if (mode === 'date') {
      const seed = new Date();
      seed.setDate(seed.getDate() + (line.due_offset_days ?? 30));
      patchLine(index, {
        due_date: seed.toISOString().slice(0, 10),
        due_offset_days: null,
      });
    } else {
      patchLine(index, { due_offset_days: line.due_offset_days ?? 30, due_date: null });
    }
  };

  const addLine = () => {
    const next = [
      ...value.schedules,
      {
        sequence_no: value.schedules.length + 1,
        share_percent: 0,
        fixed_amount: null,
        due_offset_days: 30,
        due_date: null,
        promotes_to_status_code: null,
        label: null,
      } satisfies AdmissionFeeStructureItemSchedule,
    ];
    onChange({ ...value, schedules: next });
  };

  const removeLine = (index: number) => {
    // Renumber so sequence_no stays contiguous from 1 — the engine orders by it
    // and the bill renders "n/N" from it, so a gap mislabels every later
    // instalment. The database rejects gaps outright.
    const next = value.schedules
      .filter((_, i) => i !== index)
      .map((l, i) => ({ ...l, sequence_no: i + 1 }));
    onChange({ ...value, schedules: next });
  };

  const setMode = (mode: FeeItemScheduleMode) => {
    if (mode === 'split' && value.schedules.length === 0) {
      onChange({ ...value, schedule_mode: mode, schedules: defaultSplit() });
      return;
    }
    patch({ schedule_mode: mode });
  };

  const statusSelect = (
    current: string | null,
    onPick: (code: string | null) => void,
    ariaLabel: string
  ) => (
    <Select
      value={current ?? NO_RULE}
      onValueChange={(v) => onPick(v === NO_RULE ? null : v)}
    >
      <SelectTrigger className="h-8 w-40" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_RULE}>— no rule —</SelectItem>
        {statuses.map((s) => (
          <SelectItem key={s.code} value={s.code}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const isConfigured =
    value.schedule_mode === 'split' ||
    value.due_offset_days != null ||
    !!value.due_date ||
    !!value.promotes_to_status_code;

  return (
    <div className="pl-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span>Schedule</span>
        <Badge variant={isConfigured ? 'secondary' : 'outline'} className="font-normal">
          {scheduleSummary(value, defaultOffsetDays)}
        </Badge>
        {errors.length > 0 && (
          <Badge variant="destructive" className="font-normal">
            {errors.length} issue{errors.length === 1 ? '' : 's'}
          </Badge>
        )}
        {errors.length === 0 && warnings.length > 0 && (
          <Badge variant="outline" className="font-normal text-amber-600 border-amber-500">
            check dates
          </Badge>
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                checked={value.schedule_mode === 'single'}
                onChange={() => setMode('single')}
              />
              Single payment
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                checked={value.schedule_mode === 'split'}
                onChange={() => setMode('split')}
              />
              Split into instalments
            </label>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {value.schedule_mode === 'split' ? 'Count "after N days" from' : 'Dates counted from'}
            </span>
            <Select
              value={value.due_anchor}
              onValueChange={(v) => patch({ due_anchor: v as FeeItemDueAnchor })}
            >
              <SelectTrigger className="h-8 w-52" aria-label="Due date anchor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generation_date">Admission date</SelectItem>
                <SelectItem value="academic_year_start">Academic year start</SelectItem>
                {/* A split item picks dates per instalment, so a whole-item
                    "fixed date" anchor has nothing left to mean. Kept
                    selectable only if a row already carries it, so an existing
                    value never becomes unselectable. */}
                {(value.schedule_mode !== 'split' || value.due_anchor === 'fixed_date') && (
                  <SelectItem value="fixed_date">Fixed calendar date</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {value.schedule_mode === 'single' ? (
            <div className="flex items-end gap-3 flex-wrap">
              {value.due_anchor === 'fixed_date' ? (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block">Due date</span>
                  <Input
                    type="date"
                    className="h-8 w-44"
                    value={value.due_date ?? ''}
                    onChange={(e) => patch({ due_date: e.target.value || null })}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block">Due after (days)</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="h-8 w-32"
                    placeholder={String(defaultOffsetDays)}
                    value={value.due_offset_days ?? ''}
                    onChange={(e) =>
                      patch({
                        due_offset_days:
                          e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
              )}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block">On payment → status</span>
                {statusSelect(
                  value.promotes_to_status_code,
                  (code) => patch({ promotes_to_status_code: code }),
                  'Status reached when this fee is paid'
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left">
                      <th className="pb-1 pr-2 font-medium">#</th>
                      <th className="pb-1 pr-2 font-medium">Share %</th>
                      <th className="pb-1 pr-2 font-medium">Amount</th>
                      <th className="pb-1 pr-2 font-medium">Due</th>
                      <th className="pb-1 pr-2 font-medium">On payment → status</th>
                      <th className="pb-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {value.schedules.map((line, i) => {
                      const isLast = i === value.schedules.length - 1;
                      return (
                        <tr key={i} className="align-middle">
                          <td className="py-1 pr-2 text-muted-foreground">{line.sequence_no}</td>
                          <td className="py-1 pr-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              className="h-8 w-24"
                              value={line.share_percent ?? ''}
                              onChange={(e) =>
                                patchLine(i, {
                                  share_percent:
                                    e.target.value === '' ? null : Number(e.target.value),
                                  fixed_amount: null,
                                })
                              }
                            />
                          </td>
                          <td className="py-1 pr-2 tabular-nums whitespace-nowrap">
                            {previewAmounts
                              ? `₹${previewAmounts[i]?.toLocaleString('en-IN') ?? '—'}`
                              : '—'}
                            {isLast && (
                              <span
                                className="ml-1 text-xs text-muted-foreground"
                                title="The last instalment absorbs rounding, so the instalments always sum exactly to the item amount."
                              >
                                ⓘ
                              </span>
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            <div className="flex items-center gap-1">
                              <Select
                                value={line.due_date != null ? 'date' : 'days'}
                                onValueChange={(v) =>
                                  setLineDueMode(i, v as 'days' | 'date')
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-[112px]"
                                  aria-label={`How instalment ${line.sequence_no} is dated`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="days">After N days</SelectItem>
                                  <SelectItem value="date">On date</SelectItem>
                                </SelectContent>
                              </Select>

                              {line.due_date != null ? (
                                <Input
                                  type="date"
                                  className="h-8 w-40"
                                  aria-label={`Due date for instalment ${line.sequence_no}`}
                                  value={line.due_date}
                                  onChange={(e) =>
                                    patchLine(i, {
                                      // Clearing the field would violate
                                      // chk_afsis_due_exactly_one on save, so an
                                      // empty box falls back to days mode rather
                                      // than persisting two NULLs.
                                      due_date: e.target.value || null,
                                      due_offset_days: e.target.value ? null : 30,
                                    })
                                  }
                                />
                              ) : (
                                <>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1}
                                    className="h-8 w-20"
                                    aria-label={`Days after anchor for instalment ${line.sequence_no}`}
                                    value={line.due_offset_days ?? ''}
                                    onChange={(e) =>
                                      patchLine(i, {
                                        due_offset_days:
                                          e.target.value === ''
                                            ? null
                                            : Math.max(0, Number(e.target.value) || 0),
                                        due_date: null,
                                      })
                                    }
                                  />
                                  <span className="text-xs text-muted-foreground">days</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-1 pr-2">
                            {statusSelect(
                              line.promotes_to_status_code,
                              (code) => patchLine(i, { promotes_to_status_code: code }),
                              `Status reached when instalment ${line.sequence_no} is paid`
                            )}
                          </td>
                          <td className="py-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeLine(i)}
                              title="Remove instalment"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add instalment
                </Button>
                <SplitTotals value={value} amount={amount} previewAmounts={previewAmounts} />
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="text-xs text-destructive space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          {warnings.length > 0 && (
            <ul className="text-xs text-amber-600 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SplitTotals({
  value,
  amount,
  previewAmounts,
}: {
  value: FeeItemScheduleValue;
  amount: number;
  previewAmounts: number[] | null;
}) {
  const pctSum = value.schedules.reduce((s, l) => s + Number(l.share_percent ?? 0), 0);
  const allPercent = value.schedules.every((l) => l.share_percent != null);
  const amtSum = previewAmounts?.reduce((s, a) => s + a, 0) ?? 0;
  // Compare in paise: 2dp floats drift, and this badge is the operator's only
  // signal that the split is complete.
  const amountsOk = previewAmounts != null && Math.round(amtSum * 100) === Math.round(amount * 100);
  const pctOk = !allPercent || Math.abs(pctSum - 100) < 0.0001;

  return (
    <p className="text-xs">
      {allPercent && (
        <span className={pctOk ? 'text-muted-foreground' : 'text-destructive font-medium'}>
          Total {pctSum.toFixed(2)}%
        </span>
      )}
      <span className="text-muted-foreground"> · </span>
      <span className={amountsOk ? 'text-muted-foreground' : 'text-destructive font-medium'}>
        ₹{amtSum.toLocaleString('en-IN')} of ₹{amount.toLocaleString('en-IN')}
      </span>
      {pctOk && amountsOk && <span className="text-muted-foreground"> ✓</span>}
    </p>
  );
}
