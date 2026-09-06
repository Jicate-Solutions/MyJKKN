'use client';

// "CLAIMS vs NUMBERS" — leadership-only verdict integrity (Director interview,
// 2026-07-09: what if the facilitator bluffed?). A verdict is testimony; the
// measured lift (whole-class next-session ratings) is the independent witness.
//
//   • CONTRADICTION ALERT: rows where a facilitator said "tried it and it
//     helped" but the measured lift stayed flat or negative. Quiet flag — an
//     accusation is never automated; leadership draws the conclusion.
//   • TRACK RECORD: per facilitator, "claims matched numbers N of M measured".
//     LEADERSHIP-ONLY by decision — the facilitator never sees a score kept on
//     them, so this card must never be embedded on a faculty-facing surface.
//
// Honest-empty: renders NOTHING until at least one verdict has a measured
// outcome (dark-until-data, like every sibling card). Self-hides on the
// leadership-gate error — the sibling escalations table already explains
// access denial to unauthorized callers.

import { useMemo } from 'react';
import { Scale, AlertTriangle } from 'lucide-react';
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
import {
  useVerdictTrackRecord,
  useVerdictContradictions,
} from '@/hooks/use-scf-verdict-integrity';

const BRAND_GREEN = '#0b6d41';

export function ScfVerdictIntegrityCard({ from, to }: { from?: string; to?: string }) {
  // Default window uses the browser's local date; the SQL side anchors verdict
  // dates AT TIME ZONE 'Asia/Kolkata' (deep-review 2026-07-09 LOW), so for IST
  // users the day boundary matches exactly. A ±1-day skew for a rare non-IST
  // leadership viewer only widens/narrows a 90-day default — accepted.
  const range = useMemo(() => {
    if (from && to) return { from, to };
    const today = new Date();
    return { from: format(subDays(today, 90), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  }, [from, to]);

  const { data: track, error: trackError } = useVerdictTrackRecord(range.from, range.to);
  const { data: contradictions, error: contraError } = useVerdictContradictions(
    range.from,
    range.to,
  );

  const rows = (track ?? []).filter((r) => r.measured > 0);
  const alerts = contradictions ?? [];

  // Gate-denied (non-leadership caller) → self-hide, as designed. Any OTHER
  // error must NOT read as an all-clear (deep-review r2 MEDIUM): a transient
  // RPC/network failure on an integrity surface gets an explicit notice.
  const firstError = trackError ?? contraError;
  if (firstError) {
    if (String(firstError.message).includes('not authorized')) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" style={{ color: BRAND_GREEN }} aria-hidden />
            Claims vs numbers
          </CardTitle>
          <CardDescription className="text-amber-700 dark:text-amber-400">
            Couldn&apos;t load the verdict-integrity data right now — this is a loading
            problem, not an all-clear. Refresh to retry.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Dark until at least one verdict has been independently measured.
  if (rows.length === 0 && alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" style={{ color: BRAND_GREEN }} aria-hidden />
          Claims vs numbers
        </CardTitle>
        <CardDescription>
          A facilitator&apos;s verdict (&quot;tried it — it helped&quot;) checked against the
          independently measured next-class understanding. Visible to leadership only; an
          accusation is never automated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alerts.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {alerts.length === 1
                ? 'One claim disagrees with the measured numbers'
                : `${alerts.length} claims disagree with the measured numbers`}
            </p>
            <ul className="space-y-1 text-xs text-amber-900/90 dark:text-amber-200/90">
              {alerts.map((a, i) => (
                // key = suggestion uuid (deep-review 2026-07-09 MEDIUM): a composite
                // course+email+date key is NOT unique — two same-verdict suggestions
                // on the same day would collapse and silently drop an alert row.
                // Index fallback covers the deploy gap while the live fn still
                // returns the id-less old shape (deep-review r2 LOW).
                <li key={a.id ?? `${a.course_code}-${a.faculty_email}-${a.verdict_on}-${i}`}>
                  <span className="font-medium">{a.course_code}</span> · {a.faculty_email} said
                  &quot;helped&quot; on {a.verdict_on}, but the class&apos;s measured understanding
                  did not rise. Worth a conversation, not a conclusion.
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facilitator</TableHead>
                <TableHead className="text-right">Claims matched numbers</TableHead>
                <TableHead className="text-right">Awaiting measurement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.faculty_email}-${r.institution_id}`}>
                  <TableCell className="text-sm">{r.faculty_email}</TableCell>
                  <TableCell className="text-right text-sm">
                    {r.agreed} of {r.measured}
                    {r.contradicted > 0 && (
                      <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700 dark:text-amber-400 text-[10px]">
                        {r.contradicted} contradicted
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {r.verdicts - r.measured || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
