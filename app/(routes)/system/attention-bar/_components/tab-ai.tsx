'use client';

/**
 * Tab 5 - Layer 4 AI Dashboard
 *
 * Widgets:
 *  - Today / 7-day / 30-day spend (from quick_action_ai_cache.cost_usd)
 *  - Cache hit rate (cache hits / total Layer 4 calls)
 *  - Last circuit-breaker trip (if any) with reason + timestamp
 *  - Allowlist (current Layer 1 + Layer 2 candidates per page x role) - read-only
 *  - Kill-switch toggle with TYPED CONFIRMATION ("DISABLE")
 *  - Daily budget input (saves to quick_action_config.layer_4.daily_budget_usd)
 *
 * Spec: specs/attention-bar-5-layer-system.md section 6 Tab 5
 * Permission: attention_bar.config.manage
 *
 * Wave 3 follow-on to PR #566 (Wave 2 admin shell).
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  Brain,
  CircleSlash,
  DollarSign,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface TabAiProps {
  isSuperAdmin: boolean;
}

interface MetricsResponse {
  range: string;
  totalRenders: number;
  rendersByLayer: Record<number, number>;
  ai: {
    costTotal: number;
    dailyBudgetUsd: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
  };
}

interface ConfigEntry {
  key: string;
  value: unknown;
  updated_at: string;
}

interface ConfigResponse {
  config: ConfigEntry[];
}

const KILL_SWITCH_CONFIRMATION = 'DISABLE';

async function fetchMetrics(range: '24h' | '7d' | '30d'): Promise<MetricsResponse> {
  const res = await fetch(`/api/attention-bar/admin/metrics?range=${range}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load metrics');
  return res.json();
}

async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch('/api/attention-bar/admin/config', {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load config');
  return res.json();
}

async function patchConfig(key: string, value: unknown): Promise<void> {
  const res = await fetch('/api/attention-bar/admin/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Config update failed');
  }
}

interface TripRecord {
  reason: string;
  at: string;
}

function isTripRecord(v: unknown): v is TripRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.reason === 'string' && typeof r.at === 'string';
}

export function TabAi({ isSuperAdmin: _isSuperAdmin }: TabAiProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Spend data: 24h, 7d, 30d in parallel.
  const today = useQuery({
    queryKey: ['attention-bar-metrics', '24h'],
    queryFn: () => fetchMetrics('24h'),
    staleTime: 60_000,
  });
  const week = useQuery({
    queryKey: ['attention-bar-metrics', '7d'],
    queryFn: () => fetchMetrics('7d'),
    staleTime: 60_000,
  });
  const month = useQuery({
    queryKey: ['attention-bar-metrics', '30d'],
    queryFn: () => fetchMetrics('30d'),
    staleTime: 60_000,
  });

  const config = useQuery({
    queryKey: ['attention-bar-config'],
    queryFn: fetchConfig,
    staleTime: 30_000,
  });

  // Map config rows to a lookup.
  const configMap = useMemo(() => {
    const m = new Map<string, ConfigEntry>();
    for (const row of config.data?.config ?? []) {
      m.set(row.key, row);
    }
    return m;
  }, [config.data]);

  const layer4Enabled =
    configMap.get('layer_4.enabled')?.value === true ||
    configMap.get('layer_4.enabled')?.value === 'true' ||
    // Default to enabled if missing (matches isLayer4Enabled fail-open).
    !configMap.has('layer_4.enabled');

  const lastTrip = useMemo(() => {
    const v = configMap.get('layer_4.last_breaker_trip')?.value;
    return isTripRecord(v) ? v : null;
  }, [configMap]);

  const dailyBudgetFromConfig = Number(
    configMap.get('layer_4.daily_budget_usd')?.value ?? 5,
  );

  // Local input state for the budget editor.
  const [budgetInput, setBudgetInput] = useState<string>('');
  useEffect(() => {
    if (config.data) {
      setBudgetInput(String(dailyBudgetFromConfig));
    }
  }, [config.data, dailyBudgetFromConfig]);

  // Kill-switch confirmation modal state.
  const [killSwitchOpen, setKillSwitchOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // ─── Mutations ──────────────────────────────────────────────────────────
  const flipKillSwitchMutation = useMutation({
    mutationFn: (next: boolean) => patchConfig('layer_4.enabled', next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['attention-bar-config'] });
      const prev = queryClient.getQueryData<ConfigResponse>([
        'attention-bar-config',
      ]);
      if (prev) {
        const filtered = prev.config.filter(
          (c) => c.key !== 'layer_4.enabled',
        );
        queryClient.setQueryData<ConfigResponse>(['attention-bar-config'], {
          config: [
            ...filtered,
            {
              key: 'layer_4.enabled',
              value: next,
              updated_at: new Date().toISOString(),
            },
          ],
        });
      }
      return { prev };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['attention-bar-config'], ctx.prev);
      }
      toast({
        variant: 'destructive',
        title: 'Could not flip kill-switch',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
    onSuccess: (_data, next) => {
      toast({
        title: next ? 'Layer 4 re-enabled' : 'Layer 4 DISABLED',
        description: next
          ? 'AI fallback will resume on the next resolve.'
          : 'AI fallback is OFF. Kill-switch tripped.',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-bar-config'] });
    },
  });

  const saveBudgetMutation = useMutation({
    mutationFn: (next: number) => patchConfig('layer_4.daily_budget_usd', next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['attention-bar-config'] });
      const prev = queryClient.getQueryData<ConfigResponse>([
        'attention-bar-config',
      ]);
      if (prev) {
        const filtered = prev.config.filter(
          (c) => c.key !== 'layer_4.daily_budget_usd',
        );
        queryClient.setQueryData<ConfigResponse>(['attention-bar-config'], {
          config: [
            ...filtered,
            {
              key: 'layer_4.daily_budget_usd',
              value: next,
              updated_at: new Date().toISOString(),
            },
          ],
        });
      }
      return { prev };
    },
    onError: (err, _next, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['attention-bar-config'], ctx.prev);
      }
      toast({
        variant: 'destructive',
        title: 'Budget update failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
    onSuccess: (_data, next) => {
      toast({
        title: 'Daily budget updated',
        description: `New cap: $${next.toFixed(2)} per UTC day`,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-bar-config'] });
    },
  });

  function handleKillSwitchToggle() {
    if (layer4Enabled) {
      // About to DISABLE -> require typed confirmation.
      setKillSwitchOpen(true);
      setConfirmText('');
    } else {
      // Re-enabling does not require typed confirmation (less destructive).
      flipKillSwitchMutation.mutate(true);
    }
  }

  function handleConfirmDisable() {
    if (confirmText.trim() !== KILL_SWITCH_CONFIRMATION) return;
    flipKillSwitchMutation.mutate(false);
    setKillSwitchOpen(false);
    setConfirmText('');
  }

  function handleSaveBudget() {
    const next = Number(budgetInput);
    if (Number.isNaN(next) || next < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid budget',
        description: 'Enter a non-negative number.',
      });
      return;
    }
    saveBudgetMutation.mutate(next);
  }

  function refetchAll() {
    today.refetch();
    week.refetch();
    month.refetch();
    config.refetch();
  }

  const isLoading =
    today.isLoading || week.isLoading || month.isLoading || config.isLoading;
  const isFetching =
    today.isFetching ||
    week.isFetching ||
    month.isFetching ||
    config.isFetching;

  return (
    <div className='space-y-6 py-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold flex items-center gap-2'>
          <Brain className='h-5 w-5 text-purple-500' />
          Layer 4 — AI
        </h3>
        <Button variant='ghost' size='sm' onClick={refetchAll}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Spend KPIs */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <Card>
          <CardHeader className='pb-2 pt-4 px-4'>
            <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
              <DollarSign className='h-4 w-4' /> Today (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className='px-4 pb-4'>
            <div className='text-2xl font-bold'>
              {isLoading
                ? '…'
                : `$${(today.data?.ai.costTotal ?? 0).toFixed(3)}`}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              budget: ${dailyBudgetFromConfig.toFixed(2)}/day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2 pt-4 px-4'>
            <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
              <DollarSign className='h-4 w-4' /> 7-day
            </CardTitle>
          </CardHeader>
          <CardContent className='px-4 pb-4'>
            <div className='text-2xl font-bold'>
              {isLoading
                ? '…'
                : `$${(week.data?.ai.costTotal ?? 0).toFixed(3)}`}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2 pt-4 px-4'>
            <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
              <DollarSign className='h-4 w-4' /> 30-day
            </CardTitle>
          </CardHeader>
          <CardContent className='px-4 pb-4'>
            <div className='text-2xl font-bold'>
              {isLoading
                ? '…'
                : `$${(month.data?.ai.costTotal ?? 0).toFixed(3)}`}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Cache hit rate */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Zap className='h-5 w-5 text-amber-500' />
            Cache Hit Rate (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='h-12 bg-muted animate-pulse rounded' />
          ) : (
            <div className='space-y-2'>
              <div className='flex items-baseline justify-between'>
                <span className='text-3xl font-bold'>
                  {Math.round((today.data?.ai.hitRate ?? 0) * 100)}%
                </span>
                <span className='text-xs text-muted-foreground'>
                  {today.data?.ai.cacheHits ?? 0} hits /{' '}
                  {(today.data?.ai.cacheHits ?? 0) +
                    (today.data?.ai.cacheMisses ?? 0)}{' '}
                  Layer 4 renders
                </span>
              </div>
              <div className='w-full bg-muted rounded-full h-2'>
                <div
                  className='bg-amber-500 h-2 rounded-full transition-all duration-500'
                  style={{
                    width: `${Math.round((today.data?.ai.hitRate ?? 0) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Circuit-breaker status */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            {layer4Enabled ? (
              <ShieldCheck className='h-5 w-5 text-green-500' />
            ) : (
              <ShieldAlert className='h-5 w-5 text-destructive' />
            )}
            Circuit-Breaker
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastTrip ? (
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <Badge variant='destructive'>Last trip</Badge>
                <span className='text-xs text-muted-foreground'>
                  {new Date(lastTrip.at).toLocaleString()}
                </span>
              </div>
              <p className='text-sm'>{lastTrip.reason}</p>
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              No circuit-breaker trips on record.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Kill-switch */}
      <Card
        className={
          layer4Enabled
            ? 'border-green-200 dark:border-green-900'
            : 'border-destructive'
        }
      >
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <CircleSlash className='h-5 w-5' />
            Layer 4 Kill-Switch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <p className='text-sm font-medium'>
                Status:{' '}
                {layer4Enabled ? (
                  <span className='text-green-600 dark:text-green-400'>
                    ENABLED
                  </span>
                ) : (
                  <span className='text-destructive'>DISABLED</span>
                )}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                When disabled, the resolver skips Layer 4 entirely - users see
                Layer 1 defaults instead of AI fallback.
              </p>
            </div>
            <Button
              variant={layer4Enabled ? 'destructive' : 'default'}
              size='sm'
              onClick={handleKillSwitchToggle}
              disabled={flipKillSwitchMutation.isPending}
            >
              {layer4Enabled ? 'Disable Layer 4' : 'Re-enable Layer 4'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily budget editor */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <DollarSign className='h-5 w-5' />
            Daily Budget Cap (USD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex items-end gap-3'>
            <div className='flex-1 max-w-xs'>
              <Label htmlFor='daily_budget'>Per UTC day</Label>
              <Input
                id='daily_budget'
                type='number'
                step='0.5'
                min='0'
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder='5.00'
              />
            </div>
            <Button
              onClick={handleSaveBudget}
              disabled={
                saveBudgetMutation.isPending ||
                Number(budgetInput) === dailyBudgetFromConfig ||
                Number.isNaN(Number(budgetInput))
              }
            >
              {saveBudgetMutation.isPending ? 'Saving…' : 'Save budget'}
            </Button>
          </div>
          <p className='text-xs text-muted-foreground mt-2'>
            Auto-trip threshold: 5 consecutive days at cap (configured in
            circuit-breaker.ts).
          </p>
        </CardContent>
      </Card>

      {/* Allowlist note */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>
            Layer 4 Allowlist (read-only)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            Layer 4 candidates are restricted to the union of Layer 1 static
            defaults and Layer 2 active rules for the current{' '}
            <code>page x role</code>. Edit those layers (Tab 2 / Tab 3) to
            change what Layer 4 may surface.
          </p>
        </CardContent>
      </Card>

      {/* Kill-switch typed-confirmation modal */}
      <AlertDialog open={killSwitchOpen} onOpenChange={setKillSwitchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-destructive' />
              Disable Layer 4 AI fallback?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will <strong>turn off Layer 4 globally</strong> for all users.
              Pages without a matching Layer 0/2/3 candidate will fall back to
              Layer 1 static defaults instead of AI suggestions.
              <br />
              <br />
              Type <code className='font-mono font-bold'>{KILL_SWITCH_CONFIRMATION}</code> below
              to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className='py-2'>
            <Label htmlFor='kill_confirm'>Type DISABLE to confirm</Label>
            <Input
              id='kill_confirm'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={KILL_SWITCH_CONFIRMATION}
              autoComplete='off'
              autoFocus
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisable}
              disabled={
                confirmText.trim() !== KILL_SWITCH_CONFIRMATION ||
                flipKillSwitchMutation.isPending
              }
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Disable Layer 4
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
