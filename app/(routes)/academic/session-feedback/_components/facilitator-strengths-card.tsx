'use client';

// SCF learning-facilitator STRENGTHS board — the POSITIVE mirror of the
// "Feedback Coverage by Learning Facilitator" card on the admin dashboard.
//
// Where the coverage card shows who is DRIVING the feedback loop vs not, this
// card shows WHAT WORKED: the standout teaching patterns the learn-from-positive
// loop captures (scf_ai_suggestions rows with kind='success'). The purpose is to
// replicate what works and share it with peers teaching the same course.
//
// SELF-CONTAINED: own data hook (useFacilitatorStrengths) + own loading/error/
// empty shell, so it can be dropped onto the admin page without touching that
// page's TableShell or use-session-feedback hook. Same from/to props as the
// coverage card, so both cards describe the same teaching period.
//
// ANONYMITY: every value here is an aggregate success-pattern artifact
// (counts, an average understanding, a generated coaching highlight). No
// per-student feedback content is ever fetched or shown.
//
// HONEST EMPTY STATE: scf_ai_suggestions has no success rows until the generator
// cron captures one, so this renders a clear "none yet" state rather than a fake.

import { useMemo } from 'react';
import { Sparkles, AlertTriangle, Award } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { format, parseISO } from 'date-fns';
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
import { useFacilitatorStrengths } from '@/hooks/use-facilitator-strengths';
import type { FacilitatorStrengthRow } from '@/types/facilitator-strengths';
import { UnderstandingBand } from '@/components/session-feedback/understanding-band';

const BRAND_GREEN = '#0b6d41';

/** Format an ISO timestamp to a plain date; tolerate nulls/bad values. */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'yyyy-MM-dd');
  } catch {
    return iso.slice(0, 10);
  }
}

export function FacilitatorStrengthsCard({
  from,
  to,
  institutionId,
}: {
  from: string;
  to: string;
  /** Narrow to one college. The RPC already scopes rows to what the caller may
   *  see, so this is a filter, never a widening — same doctrine as the
   *  college/faculty tables on the Feedback Confirmation tab. */
  institutionId?: string | null;
}) {
  const strengths = useFacilitatorStrengths(from, to);
  const rows = useMemo(() => {
    const all = (strengths.data ?? []) as FacilitatorStrengthRow[];
    return institutionId
      ? all.filter((r) => r.institution_id === institutionId)
      : all;
  }, [strengths.data, institutionId]);

  // Headline: how many facilitators have standout patterns, and how many patterns.
  const totals = useMemo(() => {
    const facilitators = rows.length;
    const patterns = rows.reduce((sum, r) => sum + (r.success_patterns ?? 0), 0);
    return { facilitators, patterns };
  }, [rows]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          Standout Patterns by Learning Facilitator
        </CardTitle>
        <CardDescription>
          {totals.facilitators > 0 ? (
            <>
              <span className="font-medium text-foreground">
                {totals.facilitators}
              </span>{' '}
              learning {totals.facilitators === 1 ? 'facilitator has' : 'facilitators have'}{' '}
              standout teaching patterns —{' '}
              <span className="font-medium text-foreground">{totals.patterns}</span>{' '}
              {totals.patterns === 1 ? 'pattern' : 'patterns'} captured. These are
              classes that landed exceptionally well; replicate them and share with
              peers teaching the same course.
            </>
          ) : (
            'Classes that landed exceptionally well — what worked, so it can be replicated and shared with peers teaching the same course.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StrengthsShell
          isLoading={strengths.isLoading}
          isError={strengths.isError}
          error={strengths.error}
          isEmpty={rows.length === 0}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learning facilitator</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Patterns</TableHead>
                  <TableHead className="text-right">Understanding</TableHead>
                  <TableHead className="w-[42%]">What worked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.institution_id ?? 'global'}:${r.faculty_email}`}>
                    <TableCell className="font-medium align-top">
                      {r.facilitator_name ?? (
                        <span className="italic text-muted-foreground">
                          {r.faculty_email}
                        </span>
                      )}
                      {r.designation ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {r.designation}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground align-top">
                      {r.department_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <span className="inline-flex items-center gap-1 tabular-nums font-semibold">
                        <Award className="h-3.5 w-3.5" style={{ color: BRAND_GREEN }} />
                        {r.success_patterns}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {r.course_count} {r.course_count === 1 ? 'course' : 'courses'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <UnderstandingBand avg={r.avg_understood} />
                    </TableCell>
                    <TableCell className="align-top">
                      {r.latest_what_worked ? (
                        <div className="space-y-1">
                          <p className="text-sm text-foreground">{r.latest_what_worked}</p>
                          {r.latest_share_with_peers ? (
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                Share with peers:
                              </span>{' '}
                              {r.latest_share_with_peers}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {r.latest_course_code ? (
                              <Badge variant="secondary" className="font-normal">
                                {r.latest_course_code}
                              </Badge>
                            ) : null}
                            {fmtDate(r.latest_generated_at) ? (
                              <span className="text-xs text-muted-foreground">
                                captured {fmtDate(r.latest_generated_at)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          Pattern captured — highlight pending.
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </StrengthsShell>
      </CardContent>
    </Card>
  );
}

/** Self-contained loading / error / empty shell — mirrors the admin page's
 *  TableShell (which is private to that page) with strengths-board copy. */
function StrengthsShell({
  isLoading,
  isError,
  error,
  isEmpty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BeatLoader color={BRAND_GREEN} />
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="max-w-md text-sm font-medium text-foreground">
          You don&apos;t have access to the all-college dashboard — contact your
          administrator.
        </p>
        {error instanceof Error && error.message ? (
          <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Sparkles className="h-9 w-9 text-muted-foreground/50" />
        <p className="max-w-md text-sm text-muted-foreground">
          No standout patterns captured yet — they&apos;ll appear here as classes
          land exceptionally well.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
