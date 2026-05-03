'use client';

/**
 * Tab 1 — Overview
 *
 * Last-24h metrics: renders/layer, top-firing rules, AI cost, consent stats.
 * Data source: GET /api/attention-bar/admin/metrics?range=24h|7d|30d
 *
 * Q2 twin-check: tab-overview.tsx - no existing file in system <_components>. Bespoke justified.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  DollarSign,
  Layers,
  Power,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

type Range = '24h' | '7d' | '30d';

interface MetricsResponse {
  range: string;
  totalRenders: number;
  rendersByLayer: Record<number, number>;
  topRules: { rule_id: string; rule_name: string; count: number }[];
  ai: {
    costTotal: number;
    dailyBudgetUsd: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
  };
  consent: {
    on: number;
    off: number;
    total: number;
    rate: number;
  };
}

const LAYER_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Layer 0 — Urgent', color: 'bg-red-500' },
  2: { label: 'Layer 2 — Rules', color: 'bg-amber-500' },
  3: { label: 'Layer 3 — Behavior', color: 'bg-teal-500' },
  1: { label: 'Layer 1 — Defaults', color: 'bg-blue-500' },
  4: { label: 'Layer 4 — AI', color: 'bg-purple-500' },
};

const PRIORITY_ORDER = [0, 2, 3, 1, 4];

async function fetchMetrics(range: Range): Promise<MetricsResponse> {
  const res = await fetch(`/api/attention-bar/admin/metrics?range=${range}`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

export function TabOverview() {
  const [range, setRange] = useState<Range>('24h');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['attention-bar-metrics', range],
    queryFn: () => fetchMetrics(range),
    staleTime: 60_000,
  });

  return (
    <div className='space-y-6 py-4'>
      {/* Layer kill switches — system state at-a-glance. Director can disable
          any layer here without a deploy. Resolver picks up flips within 60s
          (cache TTL); same-instance PATCH path invalidates immediately. */}
      <LayerKillSwitchPanel />

      {/* Range selector */}
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold flex items-center gap-2'>
          <Activity className='h-5 w-5 text-indigo-500' />
          System Overview
        </h3>
        <div className='flex items-center gap-2'>
          {(['24h', '7d', '30d'] as Range[]).map(r => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'outline'}
              size='sm'
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
          <Button variant='ghost' size='sm' onClick={() => refetch()}>
            <RefreshCw className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
          {[...Array(6)].map((_, i) => (
            <Card key={i} className='animate-pulse'>
              <CardContent className='pt-6 h-28' />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className='border-destructive'>
          <CardContent className='pt-6'>
            <p className='text-destructive text-sm'>Failed to load metrics. Check server logs.</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* KPI cards row */}
          <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
            {/* Total renders */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <Layers className='h-4 w-4' /> Total Renders
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-2xl font-bold'>{data.totalRenders.toLocaleString()}</div>
                <p className='text-xs text-muted-foreground mt-1'>in last {range}</p>
              </CardContent>
            </Card>

            {/* Layer 1 (defaults) rate */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <TrendingUp className='h-4 w-4' /> Rules Hit Rate
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-2xl font-bold'>
                  {data.totalRenders > 0
                    ? `${Math.round(((data.rendersByLayer[2] ?? 0) / data.totalRenders) * 100)}%`
                    : '—'}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>Layer 2 fired / total renders</p>
              </CardContent>
            </Card>

            {/* AI cost */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <DollarSign className='h-4 w-4' /> AI Spend
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-2xl font-bold'>${data.ai.costTotal.toFixed(3)}</div>
                <p className='text-xs text-muted-foreground mt-1'>
                  budget: ${data.ai.dailyBudgetUsd}/day
                </p>
              </CardContent>
            </Card>

            {/* AI cache hit rate */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <Zap className='h-4 w-4' /> AI Cache Hit Rate
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-2xl font-bold'>
                  {Math.round(data.ai.hitRate * 100)}%
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  {data.ai.cacheHits} hits / {data.ai.cacheHits + data.ai.cacheMisses} L4 renders
                </p>
              </CardContent>
            </Card>

            {/* Consent rate */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <Users className='h-4 w-4' /> L3 Consent Rate
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-2xl font-bold'>
                  {Math.round(data.consent.rate * 100)}%
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  {data.consent.on} of {data.consent.total} users opted in
                </p>
              </CardContent>
            </Card>

            {/* Defaults fallback rate */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <Brain className='h-4 w-4' /> Defaults Fallback
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-2xl font-bold'>
                  {data.totalRenders > 0
                    ? `${Math.round(((data.rendersByLayer[1] ?? 0) / data.totalRenders) * 100)}%`
                    : '—'}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>Layer 1 fallback / total</p>
              </CardContent>
            </Card>
          </div>

          {/* Renders by layer — horizontal bar chart */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base flex items-center gap-2'>
                <BarChart3 className='h-5 w-5 text-indigo-500' />
                Renders by Layer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                {PRIORITY_ORDER.map(layer => {
                  const count = data.rendersByLayer[layer] ?? 0;
                  const pct = data.totalRenders > 0 ? (count / data.totalRenders) * 100 : 0;
                  const def = LAYER_LABELS[layer];
                  return (
                    <div key={layer} className='space-y-1'>
                      <div className='flex justify-between items-center text-sm'>
                        <span className='font-medium'>{def.label}</span>
                        <span className='text-muted-foreground'>
                          {count.toLocaleString()} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className='w-full bg-muted rounded-full h-2'>
                        <div
                          className={`${def.color} h-2 rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top-firing rules */}
          {data.topRules.length > 0 && (
            <Card>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base'>Top-Firing Rules (Layer 2)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {data.topRules.map((rule, i) => (
                    <div
                      key={rule.rule_id}
                      className='flex items-center justify-between py-2 border-b last:border-0'
                    >
                      <div className='flex items-center gap-3'>
                        <span className='text-muted-foreground text-sm w-6'>#{i + 1}</span>
                        <span className='text-sm font-medium'>{rule.rule_name}</span>
                      </div>
                      <Badge variant='secondary'>{rule.count.toLocaleString()} renders</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.topRules.length === 0 && (
            <Card>
              <CardContent className='py-6 text-center text-muted-foreground text-sm'>
                No Layer 2 rules have fired in this period. Rules engine defaults to Layer 1.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// LayerKillSwitchPanel — 5 toggles for layer_N.enabled config keys.
// Reads/writes /api/attention-bar/admin/config (PATCH allowlists these keys).
// Resolver entry point picks up flips via getEnabledLayersFromConfig() — see
// lib/attention-bar/layer-enabled-config.ts. Same-Lambda PATCH invalidates
// the cache immediately; cross-Lambda picks up within 60s TTL.
// ============================================================================

interface ConfigRow {
  key: string;
  value: unknown;
  updated_at?: string;
}

const LAYER_TOGGLES: { key: string; layer: number; label: string; description: string }[] = [
  {
    key: 'layer_0.enabled',
    layer: 0,
    label: 'Layer 0 — Urgent',
    description: 'Real-time urgent notifications (Realtime listener + is_layer_0 query).',
  },
  {
    key: 'layer_1.enabled',
    layer: 1,
    label: 'Layer 1 — Defaults',
    description: 'Per-page × role static defaults — the safe-set fallback.',
  },
  {
    key: 'layer_2.enabled',
    layer: 2,
    label: 'Layer 2 — Rules',
    description: 'State-aware admin rules engine (Tab 3).',
  },
  {
    key: 'layer_3.enabled',
    layer: 3,
    label: 'Layer 3 — Behavior',
    description: 'Behavioral learning + DPDPA-gated personalization.',
  },
  {
    key: 'layer_4.enabled',
    layer: 4,
    label: 'Layer 4 — AI',
    description: 'LLM fallback when nothing else matches (rare in practice).',
  },
];

const LAYER_BG: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-blue-500',
  2: 'bg-amber-500',
  3: 'bg-teal-500',
  4: 'bg-purple-500',
};

async function fetchConfig(): Promise<ConfigRow[]> {
  const res = await fetch('/api/attention-bar/admin/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  const j = await res.json();
  return (j?.config ?? []) as ConfigRow[];
}

async function patchConfig(key: string, value: unknown): Promise<void> {
  const res = await fetch('/api/attention-bar/admin/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? `Save failed: HTTP ${res.status}`);
  }
}

function isEnabledFromValue(v: unknown): boolean {
  // Default-ON when absent (matches resolver fallback). Accept boolean or "true" text.
  if (v === undefined || v === null) return true;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return true;
}

function LayerKillSwitchPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['attention-bar-config'],
    queryFn: fetchConfig,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) => patchConfig(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-bar-config'] });
      // Also invalidate the bar's resolver cache so the user sees the flip on
      // their own session (otherwise their browser keeps the resolved action
      // until staleTime expires).
      queryClient.invalidateQueries({ queryKey: ['attention-bar'] });
    },
    onError: (err: Error) =>
      toast({
        title: 'Save failed',
        description: err.message,
        variant: 'destructive',
      }),
  });

  const valueByKey = new Map<string, unknown>();
  for (const r of rows ?? []) valueByKey.set(r.key, r.value);

  const enabledCount = LAYER_TOGGLES.filter((t) => isEnabledFromValue(valueByKey.get(t.key))).length;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Power className='h-5 w-5 text-indigo-500' />
            Layer Kill Switches
          </CardTitle>
          <Badge variant={enabledCount === 5 ? 'outline' : 'destructive'} className='text-xs'>
            {enabledCount}/5 enabled
          </Badge>
        </div>
        <p className='text-xs text-muted-foreground pt-1'>
          Disable any layer to take it out of the cascade without a deploy. Resolver picks up changes within ~60 seconds.
        </p>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          {LAYER_TOGGLES.map((toggle) => {
            const isEnabled = isEnabledFromValue(valueByKey.get(toggle.key));
            const isPending =
              mutation.isPending && (mutation.variables as { key?: string } | undefined)?.key === toggle.key;
            return (
              <div
                key={toggle.key}
                className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  !isEnabled && !isLoading ? 'border-destructive/40 bg-destructive/5' : ''
                }`}
              >
                <div className='flex items-start gap-2 min-w-0'>
                  <div className={`mt-1 h-2 w-2 rounded-full ${LAYER_BG[toggle.layer]} shrink-0`} />
                  <div className='min-w-0'>
                    <div className='text-sm font-medium flex items-center gap-1.5'>
                      {toggle.label}
                      {!isEnabled && !isLoading && (
                        <AlertTriangle className='h-3 w-3 text-destructive' aria-label='disabled' />
                      )}
                    </div>
                    <p className='text-xs text-muted-foreground line-clamp-2'>{toggle.description}</p>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  disabled={isLoading || isPending}
                  onCheckedChange={(checked) =>
                    mutation.mutate({ key: toggle.key, value: checked })
                  }
                  aria-label={`Toggle ${toggle.label}`}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
