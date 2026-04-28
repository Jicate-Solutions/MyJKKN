'use client';

/**
 * Tab 4 — Layer 3 Behavior (PRIVACY-CRITICAL)
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 tab 4
 * Permission: attention_bar.audit.view
 *
 * PRIVACY CONTRACT (enforced by API + reinforced here):
 *   - This tab NEVER renders individual user_ids, specific tap rows,
 *     or per-user confidence scores.
 *   - Data source: GET /api/attention-bar/admin/behavior/aggregate which
 *     returns ONLY aggregate counts, distributions, and histograms.
 *   - If new fields ever appear in the API payload that could identify
 *     a specific user, this component MUST filter them out before
 *     rendering. The render-time guard `assertNoUserIdentifiers` enforces
 *     this in dev (runtime warn) and is documented in the PR description.
 *
 * Q2 twin-check: tab-overview.tsx in same folder is the closest twin
 * (same Card/grid/useQuery pattern). Bespoke widgets justified —
 * different data shape and explicit privacy guard.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  Users,
  Activity,
  BarChart3,
  RefreshCw,
  Lock,
  TrendingUp,
} from 'lucide-react';

interface AggregateResponse {
  consent: {
    on: number;
    off: number;
    total: number;
    rate: number;
  };
  topActions: { action_id: string; count: number }[];
  confidenceHistogram: { label: string; count: number }[];
  privacyNote?: string;
}

const FORBIDDEN_KEYS = ['user_id', 'userId', 'profile_id', 'email'];

/**
 * Defensive guard: scan response for any keys that could leak user identity.
 * Logs in dev; never throws (we still render the safe aggregate widgets).
 */
function assertNoUserIdentifiers(payload: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  const seen = new Set<string>();
  function walk(v: unknown) {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    for (const key of Object.keys(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(key) && !seen.has(key)) {
        seen.add(key);
        console.warn(
          `[tab-behavior] Privacy contract violated: aggregate API returned forbidden key "${key}". ` +
          `Tab 4 will not render this field but the API needs a server-side fix.`
        );
      }
      walk((v as Record<string, unknown>)[key]);
    }
  }
  walk(payload);
}

async function fetchAggregate(): Promise<AggregateResponse> {
  const res = await fetch('/api/attention-bar/admin/behavior/aggregate');
  if (!res.ok) throw new Error('Failed to fetch behavior aggregate');
  const json = await res.json();
  assertNoUserIdentifiers(json);
  return json;
}

export function TabBehavior() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['attention-bar-behavior-aggregate'],
    queryFn: fetchAggregate,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) assertNoUserIdentifiers(data);
  }, [data]);

  // Histogram max for chart scaling
  const histMax = data
    ? Math.max(1, ...data.confidenceHistogram.map(b => b.count))
    : 1;

  // Top-action max for bar scaling
  const topMax = data
    ? Math.max(1, ...data.topActions.map(a => a.count))
    : 1;

  // Total taps across the histogram is the sum of bucket counts
  // (each action_id contributes 1 to one bucket, so this is "actions tracked")
  const actionsTracked = data
    ? data.confidenceHistogram.reduce((acc, b) => acc + b.count, 0)
    : 0;

  return (
    <div className='space-y-6 py-4'>
      {/* Privacy banner */}
      <Card className='border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30'>
        <CardContent className='py-3 flex items-start gap-3'>
          <ShieldCheck className='h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0' />
          <div className='space-y-1'>
            <p className='text-sm font-medium text-emerald-900 dark:text-emerald-200'>
              Privacy contract: aggregate widgets only
            </p>
            <p className='text-xs text-emerald-800 dark:text-emerald-300'>
              This tab never displays individual user IDs, specific taps, or per-user
              confidence scores. All numbers below are aggregated across the user base.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold flex items-center gap-2'>
          <Activity className='h-5 w-5 text-teal-500' />
          Layer 3 Behavior — Aggregates
        </h3>
        <Button variant='ghost' size='sm' onClick={() => refetch()}>
          <RefreshCw className='h-4 w-4' />
        </Button>
      </div>

      {isLoading && (
        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
          {[...Array(3)].map((_, i) => (
            <Card key={i} className='animate-pulse'>
              <CardContent className='pt-6 h-28' />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className='border-destructive'>
          <CardContent className='pt-6'>
            <p className='text-destructive text-sm'>
              Failed to load behavior aggregates. Check server logs.
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* KPI big-number cards */}
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            {/* Consent rate */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <Users className='h-4 w-4' /> Consent Rate
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-3xl font-bold'>
                  {Math.round(data.consent.rate * 100)}%
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  {data.consent.on.toLocaleString()} opted in /{' '}
                  {data.consent.total.toLocaleString()} total users
                </p>
              </CardContent>
            </Card>

            {/* Tracked actions */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <BarChart3 className='h-4 w-4' /> Tracked Actions
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-3xl font-bold'>
                  {actionsTracked.toLocaleString()}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  distinct action_ids in last 30d (Layer 3)
                </p>
              </CardContent>
            </Card>

            {/* Top-action taps (last 30d, Layer 3) */}
            <Card>
              <CardHeader className='pb-2 pt-4 px-4'>
                <CardTitle className='text-sm font-medium text-muted-foreground flex items-center gap-1.5'>
                  <TrendingUp className='h-4 w-4' /> Top-Action Taps (30d)
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 pb-4'>
                <div className='text-3xl font-bold'>
                  {data.topActions
                    .reduce((acc, a) => acc + a.count, 0)
                    .toLocaleString()}
                </div>
                <p className='text-xs text-muted-foreground mt-1'>
                  total taps across top {data.topActions.length} actions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Consent split (visual pie-substitute: side-by-side bar) */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base flex items-center gap-2'>
                <Lock className='h-5 w-5 text-emerald-500' />
                Layer 3 Consent Split
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.consent.total === 0 ? (
                <p className='text-sm text-muted-foreground py-4'>
                  No users have set a consent value yet.
                </p>
              ) : (
                <div className='space-y-3'>
                  <div className='flex h-8 w-full overflow-hidden rounded-md border'>
                    <div
                      className='bg-emerald-500 flex items-center justify-center text-xs font-medium text-white'
                      style={{
                        width: `${(data.consent.on / data.consent.total) * 100}%`,
                      }}
                      title={`Opted in: ${data.consent.on}`}
                    >
                      {data.consent.on > 0 &&
                        ((data.consent.on / data.consent.total) * 100 >= 8) && (
                          <span>{data.consent.on}</span>
                        )}
                    </div>
                    <div
                      className='bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-800 dark:text-slate-200'
                      style={{
                        width: `${(data.consent.off / data.consent.total) * 100}%`,
                      }}
                      title={`Opted out: ${data.consent.off}`}
                    >
                      {data.consent.off > 0 &&
                        ((data.consent.off / data.consent.total) * 100 >= 8) && (
                          <span>{data.consent.off}</span>
                        )}
                    </div>
                  </div>
                  <div className='flex flex-wrap gap-4 text-xs text-muted-foreground'>
                    <span className='flex items-center gap-1.5'>
                      <span className='h-3 w-3 rounded-sm bg-emerald-500' />
                      Opted in: {data.consent.on.toLocaleString()}
                    </span>
                    <span className='flex items-center gap-1.5'>
                      <span className='h-3 w-3 rounded-sm bg-slate-300 dark:bg-slate-700' />
                      Opted out: {data.consent.off.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Confidence histogram */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base flex items-center gap-2'>
                <BarChart3 className='h-5 w-5 text-teal-500' />
                Confidence Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-xs text-muted-foreground mb-4'>
                Distribution of computed confidences across all tracked action_ids
                (last 30 days, Layer 3 taps only). Confidence = taps/impressions
                weighted by sample size.
              </p>
              <div className='space-y-3'>
                {data.confidenceHistogram.map(bucket => {
                  const pct = (bucket.count / histMax) * 100;
                  return (
                    <div key={bucket.label} className='space-y-1'>
                      <div className='flex justify-between items-center text-sm'>
                        <span className='font-mono text-xs text-muted-foreground'>
                          {bucket.label}
                        </span>
                        <span className='text-muted-foreground'>
                          {bucket.count.toLocaleString()} action
                          {bucket.count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className='w-full bg-muted rounded-full h-2'>
                        <div
                          className='bg-teal-500 h-2 rounded-full transition-all duration-500'
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top global action_ids */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base flex items-center gap-2'>
                <TrendingUp className='h-5 w-5 text-teal-500' />
                Top Global Actions (Layer 3, last 30d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-xs text-muted-foreground mb-4'>
                Most-frequently-tapped action_ids across the user base.
                <span className='block mt-1 italic'>
                  Note: counts are total taps; switching to count-of-distinct-users-who-tapped
                  is a planned API upgrade and tracked in the PR description.
                </span>
              </p>
              {data.topActions.length === 0 ? (
                <p className='text-sm text-muted-foreground py-4'>
                  No Layer 3 taps recorded in the last 30 days.
                </p>
              ) : (
                <div className='space-y-2'>
                  {data.topActions.map((action, i) => {
                    const pct = (action.count / topMax) * 100;
                    return (
                      <div
                        key={action.action_id}
                        className='space-y-1 py-1.5 border-b last:border-0'
                      >
                        <div className='flex items-center justify-between text-sm'>
                          <div className='flex items-center gap-2 min-w-0'>
                            <span className='text-muted-foreground text-xs w-6 shrink-0'>
                              #{i + 1}
                            </span>
                            <span
                              className='font-mono text-xs truncate'
                              title={action.action_id}
                            >
                              {action.action_id}
                            </span>
                          </div>
                          <Badge variant='secondary' className='shrink-0 ml-2'>
                            {action.count.toLocaleString()}
                          </Badge>
                        </div>
                        <div className='w-full bg-muted rounded-full h-1.5'>
                          <div
                            className='bg-teal-400 h-1.5 rounded-full transition-all duration-500'
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {data.privacyNote && (
            <p className='text-xs text-muted-foreground italic text-center'>
              {data.privacyNote}
            </p>
          )}
        </>
      )}
    </div>
  );
}
