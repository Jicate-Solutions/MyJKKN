'use client';

/**
 * Marks Table — the premium centerpiece.
 *
 * Desktop (md+): traditional table with subjects sorted by course_order ASC,
 * component columns derived from the active CiaRound, and a sticky right-aligned
 * Total / Max column.
 *
 * Mobile (<md): accordion subject cards. Tap a subject to expand its component
 * breakdown. Header always shows total/max so students can scan quickly.
 *
 * Empty cells render as em-dash (—) with a tooltip on hover (desktop) /
 * tap (mobile via title attribute).
 *
 * Each subject row issues its own scoped report query — by design — so a slow
 * COE response on one course doesn't block the others.
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
import { Loader2, ChevronDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMyMarksReport } from '@/hooks/learners/use-my-marks';
import type {
  MyMarksRegistration,
  MyMarksSemesterGroup,
} from '@/types/my-marks';
import type { CiaRound } from '@/types/internal-marks';

interface Props {
  semester: MyMarksSemesterGroup;
  round: CiaRound;
  examSessionId: string;
  programCode: string;
}

export function MarksTable({ semester, round, examSessionId, programCode }: Props) {
  const components = round.components ?? [];

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
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
              {semester.registrations.map((reg, idx) => (
                <SubjectRowDesktop
                  key={reg.registration_id}
                  index={idx + 1}
                  registration={reg}
                  round={round}
                  examSessionId={examSessionId}
                  programCode={programCode}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {semester.registrations.map((reg) => (
          <SubjectCardMobile
            key={reg.registration_id}
            registration={reg}
            round={round}
            examSessionId={examSessionId}
            programCode={programCode}
          />
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Desktop row
// ────────────────────────────────────────────────────────────────────────

function SubjectRowDesktop({
  index,
  registration,
  round,
  examSessionId,
  programCode,
}: {
  index: number;
  registration: MyMarksRegistration;
  round: CiaRound;
  examSessionId: string;
  programCode: string;
}) {
  const { data, isLoading, error } = useMyMarksReport({
    examSessionId,
    courseCode: registration.course_code,
    ciaRound: round.round,
    programCode,
  });

  const components = round.components ?? [];
  const totalMax = components.reduce((a, c) => a + (c.max_marks ?? 0), 0);
  const row = data?.row;

  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-sm">{index}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{registration.course_name}</span>
          <span className="text-xs text-muted-foreground">
            {registration.course_code}
          </span>
        </div>
      </TableCell>
      {components.map((c) => (
        <TableCell key={c.code} className="text-center">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
          ) : error ? (
            <AlertCircle
              className="h-3.5 w-3.5 text-destructive mx-auto"
              aria-label="Failed to load"
            />
          ) : (
            <MarkCell value={row?.marks?.[c.code] ?? null} />
          )}
        </TableCell>
      ))}
      <TableCell className="text-center font-semibold">
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
        ) : (
          <span>
            {row?.total ?? '—'}
            <span className="text-xs font-normal text-muted-foreground">
              {' '}
              / {totalMax}
            </span>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Mobile card
// ────────────────────────────────────────────────────────────────────────

function SubjectCardMobile({
  registration,
  round,
  examSessionId,
  programCode,
}: {
  registration: MyMarksRegistration;
  round: CiaRound;
  examSessionId: string;
  programCode: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useMyMarksReport({
    examSessionId,
    courseCode: registration.course_code,
    ciaRound: round.round,
    programCode,
  });

  const components = round.components ?? [];
  const totalMax = components.reduce((a, c) => a + (c.max_marks ?? 0), 0);
  const row = data?.row;

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
        <div className="flex items-center gap-3 flex-shrink-0">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : error ? (
            <span className="text-xs text-destructive">Error</span>
          ) : (
            <div className="text-right">
              <div className="text-base font-bold">
                {row?.total ?? '—'}
                <span className="text-xs font-normal text-muted-foreground">
                  {' '}
                  / {totalMax}
                </span>
              </div>
            </div>
          )}
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
                  <span className="text-[10px] text-muted-foreground">
                    Max {c.max_marks}
                  </span>
                </div>
                <span className="font-semibold tabular-nums">
                  <MarkCell value={row?.marks?.[c.code] ?? null} />
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Mark cell — em-dash with tooltip when not entered
// ────────────────────────────────────────────────────────────────────────

function MarkCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return (
      <span
        className="text-muted-foreground"
        title="Faculty has not entered this mark yet"
      >
        —
      </span>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}
