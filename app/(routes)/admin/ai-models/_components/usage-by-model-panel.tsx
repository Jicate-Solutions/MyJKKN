'use client';

// ============================================================================
// Usage by model — per-(provider, model) rollup of ai_model_usage over a
// rolling window (Hour = last 24h, Day = last 7 days, Week = last 8 weeks).
// Sits above the AI Models table so the Director sees WHICH models actually
// burn calls / cost, independent of the per-feature config rows.
//
// Honest free-lane label: calls served by the subscription (Max) worker WERE
// logged under provider 'claude_code' / model 'max-subscription'. We do NOT
// pretend that is a specific Claude model. The drain update has since landed,
// so free-lane calls now record the real model id (claude-sonnet-5,
// claude-opus-5, ...); only historical rows still carry the placeholder.
//
// GET /api/admin/ai-models/usage-summary?period=hour|day|week
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Info, RefreshCw } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getModelLabel } from '@/lib/services/platform/ai-providers';

type Period = 'hour' | 'day' | 'week';

interface UsageRow {
  provider: string;
  model_id: string;
  calls: number;
  tokens: number;
  cost_inr: number;
  last_used: string | null;
}

const PERIOD_LABELS: Record<Period, string> = {
  hour: 'Last 24 hours',
  day: 'Last 7 days',
  week: 'Last 8 weeks',
};

// Same rupee formatting as the AI Models table so the two read as one surface.
function formatInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// The subscription (Max) worker used to log its calls under this synthetic
// provider/model pair, before per-model tracking landed. Rows matching it are
// historical; current free-lane calls carry the real Claude model id.
const FREE_LANE_PROVIDER = 'claude_code';
const FREE_LANE_MODEL = 'max-subscription';

function isFreeLaneRow(r: UsageRow): boolean {
  return r.model_id === FREE_LANE_MODEL && r.provider === FREE_LANE_PROVIDER;
}

function modelLabel(r: UsageRow): string {
  if (isFreeLaneRow(r)) {
    return 'Claude — Max subscription (historical rows; exact model was not recorded then)';
  }
  return getModelLabel(r.provider, r.model_id);
}

export function UsageByModelPanel() {
  const [period, setPeriod] = useState<Period>('day');
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-models/usage-summary?period=${p}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't load usage by model.";
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const hasFreeLane = useMemo(() => (rows ?? []).some(isFreeLaneRow), [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Usage by model</CardTitle>
            <p className="text-xs text-muted-foreground">
              Which AI models actually ran — calls, cost and tokens, rolled up across
              every feature. {PERIOD_LABELS[period]}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={period}
              onValueChange={(v) => {
                if (v) setPeriod(v as Period);
              }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="hour" aria-label="Last 24 hours">
                Hour
              </ToggleGroupItem>
              <ToggleGroupItem value="day" aria-label="Last 7 days">
                Day
              </ToggleGroupItem>
              <ToggleGroupItem value="week" aria-label="Last 8 weeks">
                Week
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(period)}
              disabled={loading}
              aria-label="Refresh usage by model"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !rows ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No AI model calls recorded in this window yet.
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Cost (₹)</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Last used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const free = isFreeLaneRow(r);
                    return (
                      <TableRow key={`${r.provider}|${r.model_id}`}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">{modelLabel(r)}</div>
                            {free ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Info className="h-3 w-3 shrink-0" />
                                Free subscription lane — the exact Claude model is not
                                recorded yet.
                              </div>
                            ) : (
                              <div className="font-mono text-xs text-muted-foreground">
                                {r.provider} · {r.model_id}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {r.calls.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right">{formatInr(r.cost_inr)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.tokens.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.last_used ? format(parseISO(r.last_used), 'd MMM, HH:mm') : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {hasFreeLane && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Max rows are earlier calls the free (Max) worker served at ₹0, logged
                before per-model tracking; newer free-lane calls record the exact
                Claude model.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
