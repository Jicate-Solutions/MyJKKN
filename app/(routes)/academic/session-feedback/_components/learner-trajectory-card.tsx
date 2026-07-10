'use client';

// PER-LEARNER TRAJECTORY / AT-RISK EARLY WARNING (#3a) — a self-contained card that
// surfaces learners whose understanding is SLIDING across recent sessions, so a
// facilitator / HOD / principal can reach out before the term-end grade confirms it.
//
// PRIVACY: this view shows a DERIVED trend (slope) + an at-risk flag + the identity a
// facilitator needs to reach the learner — and NOTHING ELSE. It never shows any raw
// per-session rating. The trend is computed from >= 3 of the learner's own rows
// (privacy floor), and only sliding learners are listed (minimal disclosure — a help
// list, not a surveillance list). See the migration header for the full rationale.
//
// Mountable with no props (defaults to last 30 days) or with a shared { from, to }.
// On RPC error (non-authorized caller) it renders an EXPLICIT access-denied message —
// never a silent redirect (CLAUDE.md #27).

import { useMemo } from 'react';
import { AlertTriangle, TrendingDown, ShieldAlert } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { format, subDays } from 'date-fns';
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
import { useLearnerTrajectory } from '@/hooks/use-learner-trajectory';
import type { LearnerTrajectoryRow } from '@/types/learner-trajectory';

const BRAND_GREEN = '#0b6d41';

export function LearnerTrajectoryCard({
  from,
  to,
  institutionId,
}: {
  from?: string;
  to?: string;
  /** Narrow to one college. The RPC already scopes rows to what the caller may
   *  see, so this is a filter, never a widening. */
  institutionId?: string | null;
}) {
  const range = useMemo(() => {
    if (from && to) return { from, to };
    const today = new Date();
    return { from: format(subDays(today, 30), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  }, [from, to]);

  const { data, isLoading, isError, error } = useLearnerTrajectory(range.from, range.to);
  const rows = useMemo(() => {
    const all = (data ?? []) as LearnerTrajectoryRow[];
    return institutionId
      ? all.filter((r) => r.institution_id === institutionId)
      : all;
  }, [data, institutionId]);
  const atRiskCount = rows.filter((r) => r.at_risk).length;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          Learners Sliding — Early Warning
        </CardTitle>
        <CardDescription>
          {rows.length > 0 ? (
            <>
              <span className="font-medium text-foreground">{rows.length}</span> learner
              {rows.length === 1 ? '' : 's'} whose understanding is declining across recent
              sessions
              {atRiskCount > 0 ? (
                <>
                  {' '}—{' '}
                  <span className="font-medium text-red-600">
                    {atRiskCount} at risk
                  </span>{' '}
                  (also struggling now)
                </>
              ) : null}
              . A derived trend only — never an individual learner&apos;s session ratings.
            </>
          ) : (
            'Learners whose understanding is declining across recent sessions — a derived trend only, never an individual learner’s session ratings.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <BeatLoader color={BRAND_GREEN} />
            <p className="mt-4 text-sm text-muted-foreground">Loading early warnings…</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="max-w-md text-sm font-medium text-foreground">
              You don&apos;t have access to the early-warning view — contact your
              administrator.
            </p>
            {error instanceof Error && error.message ? (
              <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              No learners are sliding in this period.
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Understanding is holding steady — no learner shows a declining trend across
              3+ of their own sessions. (Needs at least 3 sessions per learner to assess.)
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Trend / session</TableHead>
                  <TableHead className="text-center">At risk</TableHead>
                  <TableHead className="text-right">Last session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={`${r.student_id}-${r.course_code}`}
                    className={r.at_risk ? 'bg-red-50/50' : undefined}
                  >
                    <TableCell className="font-medium">
                      {r.learner_name ?? (
                        <span className="italic text-muted-foreground">Unknown</span>
                      )}
                      {r.register_number ? (
                        <span className="block font-mono text-xs font-normal text-muted-foreground">
                          {r.register_number}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.department_name ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.course_code}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.sessions}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1 font-semibold text-red-600">
                        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                        {/* Coarse band, NOT the 2dp slope: at exactly 3 sessions a precise
                            slope equals (last−first)/2 and would leak the exact rating delta.
                            The band conveys severity without reconstructing candid ratings. */}
                        {r.slope <= -1 ? 'Steep' : r.slope <= -0.5 ? 'Moderate' : 'Gentle'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.at_risk ? (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          At risk
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">sliding</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <span className="whitespace-nowrap text-muted-foreground">
                        {r.last_session}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingDown className="h-3.5 w-3.5" aria-hidden />
          Trend = change in understanding per session (negative = sliding), from the
          learner&apos;s own 3+ sessions. &ldquo;At risk&rdquo; = sliding and recently
          struggling. Raw per-session ratings are never shown.
        </p>
      </CardContent>
    </Card>
  );
}
