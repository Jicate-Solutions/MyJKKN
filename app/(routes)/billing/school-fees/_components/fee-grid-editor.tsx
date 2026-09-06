'use client';

// fee-grid-editor.tsx
//
// The heads x terms grid — the shape both fee sheets actually have.
//
//   HEAD                 Term I  Term II  Term III    TOTAL
//   Tuition Fee            7600    12780     12780    33160
//   Skill Development         -      420       420      840
//   Books & Notebooks      3405        -         -     3405   (one-time)
//   Uniform Kit            3995        -         -     3995   (one-time)
//   ECA                    1000     1000      1000     3000
//   TERM TOTAL            16000    14200     14200    44400
//
// A BLANK cell is not a zero — it means the head is not charged that term, and
// it produces NO school_fee_plan_items row at all. That distinction is how
// "Books & Notebooks — with Term I fee" is represented, and why the editor
// keeps raw strings rather than numbers: '' and 0 must stay distinguishable.

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

import {
  termLabel,
  type CreateSchoolFeePlanItemDto,
  type SchoolFeeHead,
  type SchoolFeePlanItem,
} from '@/types/school-fees';

export interface FeeGridEditorRow {
  billing_category_id: string;
  category_name: string;
  is_one_time: boolean;
  /** term_number -> raw input text. Missing or '' means "not charged". */
  amounts: Record<number, string>;
}

interface FeeGridEditorProps {
  heads: SchoolFeeHead[];
  /** Term numbers to render as columns — driven by the year's term calendar. */
  terms: number[];
  rows: FeeGridEditorRow[];
  canEdit: boolean;
  onChange: (rows: FeeGridEditorRow[]) => void;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function cellValue(row: FeeGridEditorRow, term: number): number {
  const raw = row.amounts[term];
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function rowTotal(row: FeeGridEditorRow, terms: number[]): number {
  return terms.reduce((sum, t) => sum + cellValue(row, t), 0);
}

/** Drop blank cells — they must not become zero-amount DB rows. */
export function editorRowsToItems(
  rows: FeeGridEditorRow[],
  terms: number[],
): CreateSchoolFeePlanItemDto[] {
  const items: CreateSchoolFeePlanItemDto[] = [];
  rows.forEach((row, index) => {
    for (const term of terms) {
      const raw = row.amounts[term];
      if (raw === undefined || raw.trim() === '') continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount)) continue;
      items.push({
        billing_category_id: row.billing_category_id,
        term_number: term,
        amount,
        is_one_time: row.is_one_time,
        sort_order: index,
      });
    }
  });
  return items;
}

/** Rehydrate saved items into editor rows, preserving head order. */
export function itemsToEditorRows(
  items: SchoolFeePlanItem[],
  heads: SchoolFeeHead[],
): FeeGridEditorRow[] {
  const byHead = new Map<string, FeeGridEditorRow>();
  const nameOf = (id: string) =>
    heads.find((h) => h.id === id)?.category_name ??
    items.find((i) => i.billing_category_id === id)?.billing_category?.category_name ??
    'Unknown head';

  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order);
  for (const item of ordered) {
    let row = byHead.get(item.billing_category_id);
    if (!row) {
      row = {
        billing_category_id: item.billing_category_id,
        category_name: nameOf(item.billing_category_id),
        is_one_time: item.is_one_time,
        amounts: {},
      };
      byHead.set(item.billing_category_id, row);
    }
    row.amounts[item.term_number] = String(item.amount);
    row.is_one_time = row.is_one_time || item.is_one_time;
  }
  return [...byHead.values()];
}

export function FeeGridEditor({ heads, terms, rows, canEdit, onChange }: FeeGridEditorProps) {
  const usedHeadIds = useMemo(() => new Set(rows.map((r) => r.billing_category_id)), [rows]);
  const availableHeads = useMemo(
    () => heads.filter((h) => !usedHeadIds.has(h.id)),
    [heads, usedHeadIds],
  );

  const termTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const t of terms) totals[t] = rows.reduce((sum, r) => sum + cellValue(r, t), 0);
    return totals;
  }, [rows, terms]);

  const grandTotal = useMemo(
    () => terms.reduce((sum, t) => sum + (termTotals[t] ?? 0), 0),
    [terms, termTotals],
  );

  function patchRow(index: number, patch: Partial<FeeGridEditorRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function setCell(index: number, term: number, raw: string) {
    const row = rows[index];
    const amounts = { ...row.amounts };
    if (raw.trim() === '') delete amounts[term];
    else amounts[term] = raw;
    patchRow(index, { amounts });
  }

  function addHead(headId: string) {
    const head = heads.find((h) => h.id === headId);
    if (!head) return;
    onChange([
      ...rows,
      {
        billing_category_id: head.id,
        category_name: head.category_name,
        // Seed the flag from the catalogue so Books and Uniform Kit come in
        // correctly marked without the operator having to know.
        is_one_time: /books|uniform/i.test(head.category_name),
        amounts: {},
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Fee head</TableHead>
              {terms.map((t) => (
                <TableHead key={t} className="text-right min-w-[120px]">
                  {termLabel(t)}
                </TableHead>
              ))}
              <TableHead className="text-right min-w-[120px]">Total</TableHead>
              <TableHead className="w-[120px] text-center">One-time</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={terms.length + 4}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  No fee heads yet. Add one below to start building the grid.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={row.billing_category_id}>
                  <TableCell className="font-medium">{row.category_name}</TableCell>

                  {terms.map((t) => (
                    <TableCell key={t} className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        className="text-right"
                        placeholder="—"
                        disabled={!canEdit}
                        value={row.amounts[t] ?? ''}
                        onChange={(e) => setCell(index, t, e.target.value)}
                      />
                    </TableCell>
                  ))}

                  <TableCell className="text-right font-semibold tabular-nums">
                    {inr.format(rowTotal(row, terms))}
                  </TableCell>

                  <TableCell className="text-center">
                    <Switch
                      checked={row.is_one_time}
                      disabled={!canEdit}
                      onCheckedChange={(checked) => patchRow(index, { is_one_time: checked })}
                      aria-label={`${row.category_name} charged once per year`}
                    />
                  </TableCell>

                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!canEdit}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      aria-label={`Remove ${row.category_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>

          {rows.length > 0 ? (
            <TableBody>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Term total</TableCell>
                {terms.map((t) => (
                  <TableCell key={t} className="text-right tabular-nums">
                    {inr.format(termTotals[t] ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{inr.format(grandTotal)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          ) : null}
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Select value="" onValueChange={addHead} disabled={availableHeads.length === 0}>
            <SelectTrigger className="w-[260px]">
              <SelectValue
                placeholder={
                  availableHeads.length === 0 ? 'All fee heads added' : 'Add a fee head…'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableHeads.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {canEdit ? (
          <Badge variant="outline" className="gap-1">
            <Plus className="h-3 w-3" />
            {availableHeads.length} head{availableHeads.length === 1 ? '' : 's'} available
          </Badge>
        ) : null}

        <div className="flex-1" />

        <div className="text-sm text-muted-foreground">
          Year total{' '}
          <span className="font-semibold text-foreground tabular-nums">
            ₹{inr.format(grandTotal)}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Leave a cell <strong>blank</strong> for a head that is not charged in that term — a blank is
        not the same as 0 and creates no row. Mark <strong>one-time</strong> for heads charged once
        a year, such as Books &amp; Notebooks and the Uniform Kit; those follow a mid-year joiner to
        their first generated term instead of being skipped.
      </p>
    </div>
  );
}
