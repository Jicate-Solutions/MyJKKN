'use client';

/**
 * Result Table — subject-by-subject published result for a semester.
 *
 * Driven by the aggregate result-view payload: each row already carries marks,
 * grade, credit, the publish gate (is_published), and the regular/arrear flag
 * (is_regular === false → re-appear paper, badged "Arrear").
 *
 * Desktop (md+): table. Mobile (<md): accordion cards.
 * Unpublished courses render as "Awaited" (their mark fields are null).
 */

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Flat row shape produced from a ResultViewCourse. */
export interface ResultRowItem {
  key: string;
  course_code: string | null;
  course_name: string | null;
  credit: number | null;
  is_published: boolean;
  is_regular: boolean | null;
  internal_obtained: number | null;
  internal_max: number | null;
  external_obtained: number | null;
  external_max: number | null;
  total_obtained: number | null;
  total_max: number | null;
  letter_grade: string | null;
  is_pass: boolean | null;
  pass_status: string | null;
}

interface Props {
  rows: ResultRowItem[];
}

export function ResultTable({ rows }: Props) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-b from-muted/60 to-muted/20 hover:bg-transparent [&>th]:h-11 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider">
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="whitespace-nowrap">Course Code</TableHead>
                <TableHead className="min-w-[220px]">Course Name</TableHead>
                <TableHead className="text-center whitespace-nowrap">Internal</TableHead>
                <TableHead className="text-center whitespace-nowrap">External</TableHead>
                <TableHead className="text-center whitespace-nowrap">Total</TableHead>
                <TableHead className="text-center whitespace-nowrap">Grade</TableHead>
                <TableHead className="text-center whitespace-nowrap">Credit</TableHead>
                <TableHead className="text-center whitespace-nowrap">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow
                  key={row.key}
                  className="border-border/50 transition-colors hover:bg-muted/40"
                >
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {row.course_code ?? '—'}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{row.course_name ?? '—'}</span>
                      <ArrearBadge isRegular={row.is_regular} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkPair obtained={row.internal_obtained} max={row.internal_max} />
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkPair obtained={row.external_obtained} max={row.external_max} />
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    <MarkPair obtained={row.total_obtained} max={row.total_max} />
                  </TableCell>
                  <TableCell className="text-center">
                    <GradeChip grade={row.letter_grade} isPass={row.is_pass} />
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">
                    {row.credit ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <ResultPill row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {rows.map((row) => (
          <SubjectCardMobile key={row.key} row={row} />
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Mobile card
// ────────────────────────────────────────────────────────────────────────

function SubjectCardMobile({ row }: { row: ResultRowItem }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center justify-between gap-3 p-4 min-h-[60px] transition-colors hover:bg-muted/30 active:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate flex items-center gap-2">
            {row.course_name ?? '—'}
            <ArrearBadge isRegular={row.is_regular} />
          </span>
          <span className="text-xs text-muted-foreground">{row.course_code ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <GradeChip grade={row.letter_grade} isPass={row.is_pass} />
          <div className="text-right">
            <div className="text-base font-bold tabular-nums">
              {row.total_obtained ?? '—'}
              <span className="text-xs font-normal text-muted-foreground">
                {' '}
                / {row.total_max ?? '—'}
              </span>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </div>
      </button>
      {open && (
        <CardContent className="border-t bg-muted/20 pt-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <BreakdownCell label="Internal" obtained={row.internal_obtained} max={row.internal_max} />
            <BreakdownCell label="External" obtained={row.external_obtained} max={row.external_max} />
            <BreakdownCell label="Total" obtained={row.total_obtained} max={row.total_max} />
            <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 border">
              <span className="text-muted-foreground">Credit</span>
              <span className="font-semibold tabular-nums">{row.credit ?? '—'}</span>
            </div>
          </div>
          <div className="mt-2">
            <ResultPill row={row} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function BreakdownCell({
  label,
  obtained,
  max,
}: {
  label: string;
  obtained: number | null;
  max: number | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 border">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">
        <MarkPair obtained={obtained} max={max} />
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Atoms
// ────────────────────────────────────────────────────────────────────────

function MarkPair({ obtained, max }: { obtained: number | null; max: number | null }) {
  if (obtained === null || obtained === undefined) {
    return (
      <span className="text-muted-foreground" title="Result not published yet">
        —
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {obtained}
      {max !== null && max !== undefined && (
        <span className="text-xs font-normal text-muted-foreground"> / {max}</span>
      )}
    </span>
  );
}

/** "Arrear" chip for re-appear papers (is_regular === false). */
function ArrearBadge({ isRegular }: { isRegular: boolean | null }) {
  if (isRegular !== false) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400"
      title="Re-appear / arrear paper"
    >
      Arrear
    </span>
  );
}

function GradeChip({
  grade,
  isPass,
}: {
  grade: string | null;
  isPass: boolean | null;
}) {
  if (!grade) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold',
        isPass === false
          ? 'bg-destructive/10 text-destructive'
          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      )}
    >
      {grade}
    </span>
  );
}

function ResultPill({ row }: { row: ResultRowItem }) {
  if (!row.is_published) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Clock className="h-3 w-3" />
        Awaited
      </span>
    );
  }
  if (row.is_pass) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {row.pass_status ?? 'Pass'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
      <XCircle className="h-3 w-3" />
      {row.pass_status ?? 'Fail'}
    </span>
  );
}
