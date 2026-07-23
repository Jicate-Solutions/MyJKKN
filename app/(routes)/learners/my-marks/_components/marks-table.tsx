'use client';

/**
 * Marks Table — round-wise CIA marks for a semester's subjects.
 *
 * Fed entirely from the aggregate cia-view payload (no per-subject fetching):
 * columns come from the round's components, cells from each course's
 * rounds[r].marks keyed by component code. Arrear papers (is_regular === false)
 * are badged.
 *
 * Desktop (md+): table. Mobile (<md): accordion cards.
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
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CiaViewCourse, CiaViewRound } from '@/types/my-marks';

interface Props {
  courses: CiaViewCourse[];
  round: CiaViewRound;
}

function courseRoundOf(course: CiaViewCourse, round: number) {
  return course.rounds.find((r) => r.round === round) ?? null;
}

export function MarksTable({ courses, round }: Props) {
  const components = round.components ?? [];
  const totalMax = components.reduce((a, c) => a + (c.max_marks ?? 0), 0);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-b from-muted/60 to-muted/20 hover:bg-transparent [&>th]:h-11 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider">
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="min-w-[260px]">Subject</TableHead>
                {components.map((c) => (
                  <TableHead key={c.code} className="text-center whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{c.name}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        / {c.max_marks}
                      </span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-center whitespace-nowrap">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course, idx) => {
                const cr = courseRoundOf(course, round.round);
                return (
                  <TableRow
                    key={`${course.course_code ?? 'c'}-${course.semester_index ?? ''}-${idx}`}
                    className="border-border/50 transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="text-muted-foreground text-sm tabular-nums">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium flex items-center gap-2">
                          {course.course_name ?? course.course_code}
                          <ArrearBadge isRegular={course.is_regular} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {course.course_code}
                        </span>
                      </div>
                    </TableCell>
                    {components.map((c) => (
                      <TableCell key={c.code} className="text-center">
                        <MarkCell value={cr?.marks?.[c.code] ?? null} />
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-semibold">
                      <span>
                        {cr?.total ?? '—'}
                        <span className="text-xs font-normal text-muted-foreground">
                          {' '}
                          / {cr?.max_total ?? totalMax}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {courses.map((course, idx) => (
          <SubjectCardMobile
            key={`${course.course_code ?? 'c'}-${course.semester_index ?? ''}-${idx}`}
            course={course}
            round={round}
            totalMax={totalMax}
          />
        ))}
      </div>
    </>
  );
}

function SubjectCardMobile({
  course,
  round,
  totalMax,
}: {
  course: CiaViewCourse;
  round: CiaViewRound;
  totalMax: number;
}) {
  const [open, setOpen] = useState(false);
  const components = round.components ?? [];
  const cr = courseRoundOf(course, round.round);

  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center justify-between gap-3 p-4 min-h-[60px] transition-colors hover:bg-muted/30 active:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate flex items-center gap-2">
            {course.course_name ?? course.course_code}
            <ArrearBadge isRegular={course.is_regular} />
          </span>
          <span className="text-xs text-muted-foreground">{course.course_code}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="text-base font-bold">
              {cr?.total ?? '—'}
              <span className="text-xs font-normal text-muted-foreground">
                {' '}
                / {cr?.max_total ?? totalMax}
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
          <div className="grid grid-cols-2 gap-2">
            {components.map((c) => (
              <div
                key={c.code}
                className="flex items-center justify-between rounded-md bg-background px-3 py-2 border text-sm"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground">Max {c.max_marks}</span>
                </div>
                <span className="font-semibold tabular-nums">
                  <MarkCell value={cr?.marks?.[c.code] ?? null} />
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MarkCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return (
      <span className="text-muted-foreground" title="Not entered yet">
        —
      </span>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

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
