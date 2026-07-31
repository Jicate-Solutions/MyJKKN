'use client';

// ============================================================================
// Model Switch Watch — Feature A auto-compare warning surface on /admin/ai-models.
// Added 2026-07-23.
//
// When the Director changes a job's model, the auto-compare loop runs the OLD and
// NEW models on the same real inputs, lets a neutral judge pick better per pair,
// and — after enough comparisons — sets a CONSERVATIVE verdict. This card surfaces
// that verdict so a switch that HURT quality nags for attention (amber/red). It is
// RECOMMENDATION-ONLY: nothing here reverts a switch; the Director decides.
//
// Reads /api/admin/ai-models/switches (super_admin-gated). The page already wraps
// this in <SuperAdminOnly>. If there are no switches, the card renders nothing so
// it never clutters the page. Degrades to a quiet error line if the fetch fails.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale, TrendingUp } from 'lucide-react';

interface SwitchRow {
  id: string;
  job_type: string;
  old_model_id: string | null;
  new_model_id: string | null;
  switched_at: string;
  status: 'collecting' | 'verdict_ready';
  comparisons_done: number;
  comparisons_target: number;
  new_wins: number;
  old_wins: number;
  ties: number;
  verdict: 'new_better' | 'new_worse' | 'tie' | null;
  verdict_at: string | null;
  in_flight: number;
}

function shortModel(m: string | null): string {
  if (!m) return 'default';
  // claude-opus-4-8 → opus 4-8; claude-sonnet-4-6 → sonnet 4-6
  const s = m.replace(/^claude-/, '').replace(/-(\d)/, ' $1');
  return s;
}

export function ModelSwitchWatchCard() {
  const [rows, setRows] = useState<SwitchRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/admin/ai-models/switches', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch {
      setError(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Nothing to show and no error → render nothing (keep the page clean).
  if (!loading && !error && (rows?.length ?? 0) === 0) return null;

  const warnings = (rows ?? []).filter((r) => r.status === 'verdict_ready' && r.verdict === 'new_worse');

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-muted-foreground" />
          Model switch quality watch
          <span className="text-xs font-normal text-muted-foreground">
            old vs new, judged automatically — recommendation only
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load model switches right now.</p>
        )}

        {/* Prominent warning for any switch the judge found made things worse. */}
        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-950/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {warnings.length === 1 ? 'A model switch may have hurt quality' : `${warnings.length} model switches may have hurt quality`}
                </p>
                {warnings.map((w) => (
                  <p key={w.id} className="text-amber-800 dark:text-amber-300">
                    <span className="font-mono">{w.job_type}</span>: switching to{' '}
                    <span className="font-medium">{shortModel(w.new_model_id)}</span> lost to{' '}
                    <span className="font-medium">{shortModel(w.old_model_id)}</span> ({w.old_wins} vs {w.new_wins} of{' '}
                    {w.comparisons_done}). Consider switching back — nothing was changed automatically.
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Full list: every recent switch with its tally/verdict. */}
        <div className="divide-y divide-border rounded-md border border-border">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-mono text-xs text-foreground">{r.job_type}</span>
                <span className="ml-2 text-muted-foreground">
                  {shortModel(r.old_model_id)} → {shortModel(r.new_model_id)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDistanceToNow(parseISO(r.switched_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {r.old_wins}·{r.ties}·{r.new_wins} (old·tie·new)
                </span>
                {r.status === 'collecting' ? (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    comparing {r.comparisons_done}/{r.comparisons_target}
                    {r.in_flight > 0 ? ` · ${r.in_flight} in flight` : ''}
                  </Badge>
                ) : r.verdict === 'new_worse' ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    new model worse
                  </Badge>
                ) : r.verdict === 'new_better' ? (
                  <Badge className="gap-1 border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <TrendingUp className="h-3 w-3" />
                    new model better
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    no clear difference
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
