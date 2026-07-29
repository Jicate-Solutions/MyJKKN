'use client';

// Facilitator Pulse — work-evidenced presence, for leadership.
//
// Director decision (2026-07-08): biometric attendance becomes the customary
// record (15-day batch import, separate lane); the PRIMARY presence record is
// the work itself. This board aggregates every facilitator work-signal MyJKKN
// captures — marked sessions (their act), witnessed sessions (>=3 students
// confirmed via feedback — the crowd witness), live pulses, lesson links,
// notes received, verdicts given.
//
// NOT A SCOREBOARD: neutral name order, no understanding scores, no ranks
// (anti-gaming — same doctrine as the band rule). The interesting read is the
// marked-vs-witnessed GAP: classes marked but never confirmed by the room.
//
// SELF-CONTAINED: own fetch + loading/error/empty shells; same from/to props
// as the sibling cards so all cards describe the same teaching period.
// Leadership-gated server-side: fn_scf_facilitator_pulse raises for
// non-leadership callers — this card is only mounted on the admin page.

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type {
  FacilitatorPulseRow,
  MarksCoverageResponse,
} from '@/types/session-feedback';

type PulseState = { key: string; rows?: FacilitatorPulseRow[]; error?: string };
type CoverageState = { key: string; data: MarksCoverageResponse | null };

export function FacilitatorPulseCard({
  from,
  to,
  institutionId,
}: {
  from: string;
  to: string;
  /** Narrow to one college. The RPC already scopes rows to what the caller may
   *  see, so this is a filter, never a widening. */
  institutionId?: string | null;
}) {
  // Stale-key pattern: state is only ever set asynchronously (no sync setState
  // in the effect body); a range change makes the previous result stale, which
  // reads as "loading" until the new fetch resolves.
  const [state, setState] = useState<PulseState | null>(null);
  // Signal 8 (marks coverage) is decorative to the board: it loads separately
  // and the whole column stays hidden until (unless) it resolves with data.
  const [coverage, setCoverage] = useState<CoverageState | null>(null);
  const rangeKey = `${from}|${to}`;

  useEffect(() => {
    let cancelled = false;
    SessionFeedbackService.getFacilitatorPulse(from, to)
      .then((r) => {
        if (!cancelled) setState({ key: `${from}|${to}`, rows: r });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            key: `${from}|${to}`,
            error: e instanceof Error ? e.message : 'Failed to load',
          });
      });
    SessionFeedbackService.getMarksCoverage(from, to).then((c) => {
      if (!cancelled) setCoverage({ key: `${from}|${to}`, data: c });
    });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const current = state?.key === rangeKey ? state : null;
  const allRows = current?.rows ?? null;
  // null = still loading (keep the spinner); only filter once rows exist.
  const rows = useMemo(() => {
    if (!allRows) return allRows;
    return institutionId
      ? allRows.filter((r) => r.institution_id === institutionId)
      : allRows;
  }, [allRows, institutionId]);
  const error = current?.error ?? null;

  const rawCov = coverage?.key === rangeKey ? coverage.data : null;
  // Narrowed handle: non-null only when the route resolved with a live cycle.
  const cov = rawCov?.session_code ? rawCov : null;
  const covByEmail = new Map(
    (cov?.rows ?? []).map((c) => [c.faculty_email, c]),
  );

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Activity className='h-4 w-4 text-sky-600' aria-hidden />
          Facilitator Pulse — presence proven by work
        </CardTitle>
        <CardDescription>
          Each row is a facilitator&apos;s work-signals for this period: sessions they
          marked, sessions the room confirmed (&ge;3 learner responses), live pulses,
          lesson links, loop verdicts and student votes answered on their loop notes
          (volume only — never how they voted). The customary biometric record stays
          separate — this is what the work itself evidences. Watch the gap between
          marked and witnessed.
          {cov && (
            <>
              {' '}
              &ldquo;Marks in&rdquo; is the {cov.session_code}{' '}exam cycle: of the
              courses each facilitator is planned to teach that COE examines, how
              many have internal marks entered. Marks are entered by the exam
              cell in COE — this is course completeness, never proof the
              facilitator entered them. &ldquo;&mdash;&rdquo; means none of their
              planned courses sit in this cycle.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <AlertTriangle className='h-4 w-4 text-amber-500' aria-hidden />
            {error}
          </div>
        ) : rows === null ? (
          <div className='flex justify-center py-6'>
            <BeatLoader size={8} color='#0ea5e9' />
          </div>
        ) : rows.length === 0 ? (
          <p className='py-4 text-sm text-muted-foreground'>
            No facilitator activity in this period yet.
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facilitator</TableHead>
                  <TableHead className='text-right'>Marked</TableHead>
                  <TableHead className='text-right'>Witnessed</TableHead>
                  <TableHead className='text-right'>Live pulses</TableHead>
                  <TableHead className='text-right'>Lessons</TableHead>
                  <TableHead className='text-right'>Notes</TableHead>
                  <TableHead className='text-right'>Verdicts</TableHead>
                  <TableHead
                    className='text-right'
                    title='Student Better/Same/Worse answers received on this facilitator&apos;s loop notes — count only, never the split'
                  >
                    Student votes
                  </TableHead>
                  {cov && (
                    <TableHead
                      className='text-right'
                      title={`Courses with internal marks in for the ${cov.session_code} cycle — entered by the exam cell, not the facilitator`}
                    >
                      Marks in{' '}
                      <span className='block text-[10px] font-normal text-muted-foreground'>
                        exam cell
                      </span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const unwitnessed =
                    r.sessions_marked >= 3 && r.sessions_witnessed === 0;
                  return (
                    <TableRow key={r.faculty_email}>
                      <TableCell className='max-w-[220px]'>
                        <span className='block truncate font-medium'>{r.faculty_name}</span>
                        {unwitnessed && (
                          <Badge
                            variant='outline'
                            className='mt-0.5 border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          >
                            marked, never witnessed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{r.sessions_marked}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.sessions_witnessed}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.pulses_run}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.lessons_linked}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.notes_received}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.verdicts_given}</TableCell>
                      <TableCell className='text-right tabular-nums'>{r.votes_received}</TableCell>
                      {cov &&
                        (() => {
                          const c = covByEmail.get(r.faculty_email.toLowerCase());
                          return (
                            <TableCell className='text-right tabular-nums'>
                              {c && c.courses_expected > 0
                                ? `${c.courses_marks_in}/${c.courses_expected}`
                                : '—'}
                            </TableCell>
                          );
                        })()}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
