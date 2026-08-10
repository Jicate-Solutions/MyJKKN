'use client';

/**
 * Re-judge already-imported attendance against the timings now in force.
 * Created: 2026-08-09.
 *
 * Saving a week already recomputes that institution automatically. This card
 * exists for the two cases that cannot cover:
 *   - a backfill across institutions after an evaluator/policy change, where
 *     no single save touches every affected row;
 *   - wanting to SEE the damage before doing it.
 *
 * Preview first is the default posture: this rewrites attendance that feeds
 * payroll, so the apply button stays disabled until a dry run has reported
 * what would move.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import {
  recomputeAttendance,
  todayISO,
  type RecomputeSummary,
} from '@/lib/services/hr/attendance-recompute-service';

const ALL = '__all__';

/** First of the current month — the range an operator wants far more often than not. */
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function RecomputeAttendanceCard({
  institutions,
  defaultInstitutionId,
}: {
  institutions: Array<{ id: string; name: string }>;
  defaultInstitutionId?: string;
}) {
  const [scope, setScope] = useState<string>(defaultInstitutionId ?? ALL);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [preview, setPreview] = useState<RecomputeSummary | null>(null);

  // Any edit invalidates a preview — applying against a stale one would write a
  // different set of rows than the numbers on screen.
  const resetPreview = useCallback(() => setPreview(null), []);

  const run = useCallback(
    async (dryRun: boolean) => {
      if (to < from) {
        toast.error('The end date is before the start date.');
        return;
      }
      setBusy(dryRun ? 'preview' : 'apply');
      try {
        const result = await recomputeAttendance({
          institutionId: scope === ALL ? null : scope,
          from,
          to,
          dryRun,
        });
        if (dryRun) {
          setPreview(result);
          toast.success(result.message);
        } else {
          setPreview(null);
          toast.success(result.message);
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [scope, from, to],
  );

  const transitions = Object.entries(preview?.transitions ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">Recompute imported attendance</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Re-judges biometric days against the timings currently in force, using the stored
          punches — no re-upload needed. Leave, holiday and regularized days are never touched.
          Saving a week above already does this for that institution; use this for a backfill
          across institutions or after a rule change.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="recompute-scope">Institution</Label>
            <Select
              value={scope}
              onValueChange={(v) => { setScope(v); resetPreview(); }}
            >
              <SelectTrigger id="recompute-scope" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value={ALL}>All institutions I can access</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="recompute-from">From</Label>
            <Input
              id="recompute-from"
              type="date"
              className="mt-1"
              value={from}
              onChange={(e) => { setFrom(e.target.value); resetPreview(); }}
            />
          </div>
          <div>
            <Label htmlFor="recompute-to">To</Label>
            <Input
              id="recompute-to"
              type="date"
              className="mt-1"
              value={to}
              onChange={(e) => { setTo(e.target.value); resetPreview(); }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(true)} disabled={busy !== null}>
            {busy === 'preview' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Preview changes
          </Button>
          <Button
            onClick={() => run(false)}
            disabled={busy !== null || !preview || preview.changed === 0}
          >
            {busy === 'apply' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preview && preview.changed > 0
              ? `Apply ${preview.changed} change(s)`
              : 'Apply'}
          </Button>
        </div>

        {preview && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              {preview.examined} day(s) examined · {preview.changed} would change
              {preview.unresolvable > 0 && ` · ${preview.unresolvable} unresolvable`}
            </p>

            {transitions.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {transitions.map(([label, n]) => (
                  <li key={label} className="flex items-center justify-between gap-4">
                    <span className="font-mono text-xs">{label}</span>
                    <span className="tabular-nums font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">
                {preview.changed > 0
                  ? 'Only half-day flags, late minutes or the applied timing change — no status moves.'
                  : 'Everything already agrees with the current timings.'}
              </p>
            )}

            {preview.unresolvable > 0 && (
              <Alert className="mt-3">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  {preview.unresolvable} day(s) have no shift timing in force for that date and were
                  left exactly as they are. Set an <strong>Effective from</strong> that covers them
                  if they should be re-judged.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
