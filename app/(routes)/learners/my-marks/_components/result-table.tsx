'use client';

/**
 * Result Table — subject-by-subject published result for a semester.
 *
 * Desktop (md+): table sorted by course_order ASC with Internal / External /
 * Total columns, a Grade chip, Credit, and a Pass/Fail status pill.
 *
 * Mobile (<md): one card per subject. The grade + result pill stay on the
 * collapsed header so students can scan pass/fail at a glance; tapping a card
 * expands the internal/external/total breakdown.
 *
 * Subjects whose result COE hasn't published yet render a muted "Pending" row
 * rather than disappearing — so the student always sees the full subject list.
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
import type { MyMarksRegistration, MyMarksResultRow } from '@/types/my-marks';

export interface ResultRowItem {
  registration: MyMarksRegistration;
  result: MyMarksResultRow | null;
}

interface Props {
  rows: ResultRowItem[];
}

export function ResultTable({ rows }: Props) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
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
              {rows.map(({ registration, result }, idx) => (
                <TableRow key={registration.registration_id}>
                  <TableCell className="text-muted-foreground text-sm">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {registration.course_code}
                  </TableCell>
                  <TableCell className="font-medium">
                    {registration.course_name}
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkPair
                      obtained={result?.internal_obtained}
                      max={result?.internal_max}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <MarkPair
                      obtained={result?.external_obtained}
                      max={result?.external_max}
                    />
                  </TableCell>
                  <TableCell className="text-center font-semibold">
                    <MarkPair
                      obtained={result?.total_obtained}
                      max={result?.total_max}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <GradeChip grade={result?.letter_grade} isPass={result?.is_pass} />
                      {result?.letter_grade && (
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {result.grade_points ?? '—'} pts
                          {result.grade_description ? ` · ${result.grade_description}` : ''}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">
                    {result?.credit ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <ResultPill result={result} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {rows.map(({ registration, result }) => (
          <SubjectCardMobile
            key={registration.registration_id}
            registration={registration}
            result={result}
          />
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Mobile card
// ────────────────────────────────────────────────────────────────────────

function SubjectCardMobile({
  registration,
  result,
}: {
  registration: MyMarksRegistration;
  result: MyMarksResultRow | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center justify-between gap-3 p-4 min-h-[60px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate">{registration.course_name}</span>
          <span className="text-xs text-muted-foreground">
            {registration.course_code}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <GradeChip grade={result?.letter_grade} isPass={result?.is_pass} />
          <div className="text-right">
            <div className="text-base font-bold tabular-nums">
              {result?.total_obtained ?? '—'}
              <span className="text-xs font-normal text-muted-foreground">
                {' '}
                / {result?.total_max ?? '—'}
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
            <BreakdownCell
              label="Internal"
              obtained={result?.internal_obtained}
              max={result?.internal_max}
            />
            <BreakdownCell
              label="External"
              obtained={result?.external_obtained}
              max={result?.external_max}
            />
            <BreakdownCell
              label="Total"
              obtained={result?.total_obtained}
              max={result?.total_max}
            />
            <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 border">
              <span className="text-muted-foreground">Credit</span>
              <span className="font-semibold tabular-nums">
                {result?.credit ?? '—'}
              </span>
            </div>
          </div>
          {result?.letter_grade && (
            <div className="mt-2 flex items-center justify-between rounded-md bg-background px-3 py-2 border text-sm">
              <span className="text-muted-foreground">Grade</span>
              <span className="flex items-center gap-2">
                <GradeChip grade={result.letter_grade} isPass={result.is_pass} />
                <span className="text-xs text-muted-foreground">
                  {result.grade_points ?? '—'} pts
                  {result.grade_description ? ` · ${result.grade_description}` : ''}
                </span>
              </span>
            </div>
          )}
          <div className="mt-2">
            <ResultPill result={result} />
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
  obtained: number | null | undefined;
  max: number | null | undefined;
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

/** "48 / 60" with the max in muted text, or "—" when the result is pending. */
function MarkPair({
  obtained,
  max,
}: {
  obtained: number | null | undefined;
  max: number | null | undefined;
}) {
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

function GradeChip({
  grade,
  isPass,
}: {
  grade: string | null | undefined;
  isPass: boolean | null | undefined;
}) {
  if (!grade) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums',
        isPass === false
          ? 'bg-destructive/10 text-destructive'
          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      )}
    >
      {grade}
    </span>
  );
}

function ResultPill({ result }: { result: MyMarksResultRow | null }) {
  if (!result) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  }
  if (result.is_pass) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        {result.pass_status ?? 'Pass'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
      <XCircle className="h-3 w-3" />
      {result.pass_status ?? 'Fail'}
    </span>
  );
}
