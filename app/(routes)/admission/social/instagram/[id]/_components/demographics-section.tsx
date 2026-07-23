'use client';

/**
 * Follower demographics section (contract C6).
 *
 * GET /api/social/instagram/insights/demographics?account_id (REQUIRED)
 *   data: { updated_at: string | null, raw: object | null }
 *
 * `raw` is Meta's follower_demographics payload PASSED THROUGH UNCHANGED, so
 * every access is guarded. Three shapes are handled:
 *  (a) Graph API passthrough:
 *      { data: [{ name/title, total_value: { breakdowns: [{ dimension_keys,
 *        results: [{ dimension_values, value }] }] } }] }
 *  (b) Poller keyed map (instagram-metrics-poller DEMOGRAPHIC_BREAKDOWNS —
 *      the shape actually stored in ig_account_metrics.follower_demographics):
 *      { age_gender: <insight entry>, city: <insight entry> } where each
 *      entry is one Graph API insight object with total_value.breakdowns.
 *  (c) Pre-grouped maps: { age: {"18-24": 10, ...}, gender: {...}, city: {...} }
 * Anything unrecognised falls back to a truncated raw JSON dump so the data
 * is still inspectable instead of silently blank.
 *
 * raw === null → Meta withholds demographics below 100 followers; an explicit
 * empty-state says so.
 */

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { PieChart } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ─── Contract types ─────────────────────────────────────────────────────────

interface DemographicsData {
  updated_at: string | null;
  raw: Record<string, unknown> | null;
}

async function getInsights<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

// ─── Defensive parsing of Meta's raw shape ──────────────────────────────────

interface DemoGroup {
  title: string;
  entries: { label: string; value: number }[];
}

function titleCase(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Meta's gender dimension codes → readable labels. Unknown codes pass through. */
const GENDER_LABELS: Record<string, string> = { F: 'Female', M: 'Male', U: 'Unknown' };

/**
 * Parse ONE Graph API insight entry — { name/title, total_value: { breakdowns:
 * [{ dimension_keys, results: [{ dimension_values, value }] }] } } — into
 * DemoGroups. Shared by the passthrough shape (a) and the poller keyed
 * shape (b).
 */
function parseInsightEntry(rec: Record<string, unknown>): DemoGroup[] {
  const groups: DemoGroup[] = [];
  const totalValue = rec.total_value;
  if (typeof totalValue !== 'object' || totalValue === null) return groups;
  const breakdowns = (totalValue as Record<string, unknown>).breakdowns;
  if (!Array.isArray(breakdowns)) return groups;

  for (const breakdown of breakdowns) {
    if (typeof breakdown !== 'object' || breakdown === null) continue;
    const bd = breakdown as Record<string, unknown>;
    const dimKeys = Array.isArray(bd.dimension_keys)
      ? bd.dimension_keys.filter((k): k is string => typeof k === 'string')
      : [];
    const results = Array.isArray(bd.results) ? bd.results : [];
    const entries: { label: string; value: number }[] = [];

    for (const result of results) {
      if (typeof result !== 'object' || result === null) continue;
      const r = result as Record<string, unknown>;
      const dims = Array.isArray(r.dimension_values)
        ? r.dimension_values.filter((v): v is string => typeof v === 'string')
        : [];
      if (typeof r.value === 'number' && dims.length > 0) {
        const label = dims
          .map((v, i) => (dimKeys[i] === 'gender' ? GENDER_LABELS[v] ?? v : v))
          .join(' · ');
        entries.push({ label, value: r.value });
      }
    }

    if (entries.length > 0) {
      const fallbackTitle =
        (typeof rec.title === 'string' && rec.title) ||
        (typeof rec.name === 'string' && rec.name) ||
        'Breakdown';
      groups.push({
        title: dimKeys.length > 0 ? dimKeys.map(titleCase).join(' × ') : fallbackTitle,
        entries,
      });
    }
  }
  return groups;
}

/** Shape (a): Graph API insights passthrough with total_value.breakdowns. */
function parseGraphShape(raw: Record<string, unknown>): DemoGroup[] {
  const dataArr = raw.data;
  if (!Array.isArray(dataArr)) return [];

  const groups: DemoGroup[] = [];
  for (const item of dataArr) {
    if (typeof item !== 'object' || item === null) continue;
    groups.push(...parseInsightEntry(item as Record<string, unknown>));
  }
  return groups;
}

/** Preferred display order for poller keyed-map breakdowns (else alphabetical tail). */
const KEYED_ORDER = ['age_gender', 'age', 'gender', 'country', 'city'];

/**
 * Shape (b): poller keyed map — { age_gender: <insight entry>, city: <insight
 * entry> } as written by instagram-metrics-poller's fetchFollowerDemographics
 * (DEMOGRAPHIC_BREAKDOWNS). Age/gender renders before city regardless of
 * JSONB key ordering.
 */
function parseKeyedShape(raw: Record<string, unknown>): DemoGroup[] {
  const rank = (key: string) => {
    const i = KEYED_ORDER.indexOf(key);
    return i === -1 ? KEYED_ORDER.length : i;
  };
  const groups: DemoGroup[] = [];
  const keys = Object.keys(raw).sort((a, b) => rank(a) - rank(b));
  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    groups.push(...parseInsightEntry(value as Record<string, unknown>));
  }
  return groups;
}

/** Shape (c): pre-grouped maps like { age: { "18-24": 10 }, city: {...} }. */
function parseGroupedShape(raw: Record<string, unknown>): DemoGroup[] {
  const groups: DemoGroup[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const entries: { label: string; value: number }[] = [];
    for (const [label, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'number') entries.push({ label, value: v });
    }
    if (entries.length > 0) groups.push({ title: titleCase(key), entries });
  }
  return groups;
}

function parseDemographics(raw: Record<string, unknown>): DemoGroup[] {
  const graph = parseGraphShape(raw);
  if (graph.length > 0) return graph;
  // raw may itself be a single insight entry (defensive passthrough variant).
  const single = parseInsightEntry(raw);
  if (single.length > 0) return single;
  const keyed = parseKeyedShape(raw);
  if (keyed.length > 0) return keyed;
  return parseGroupedShape(raw);
}

// ─── Component ──────────────────────────────────────────────────────────────

const MAX_ENTRIES_PER_GROUP = 12;

interface DemographicsSectionProps {
  accountId: string;
}

export function DemographicsSection({ accountId }: DemographicsSectionProps) {
  const { data, isLoading, isError, error } = useQuery<DemographicsData, Error>({
    queryKey: ['ig-insights-demographics', accountId],
    queryFn: () =>
      getInsights<DemographicsData>(
        `/api/social/instagram/insights/demographics?account_id=${encodeURIComponent(accountId)}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const groups = data?.raw ? parseDemographics(data.raw) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <PieChart className="h-4 w-4" /> Follower Demographics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load demographics: {error.message}</AlertDescription>
          </Alert>
        ) : !data?.raw ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No demographics available. Meta requires at least 100 followers before it
            reports follower demographics for an account.
          </p>
        ) : groups.length === 0 ? (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Unrecognised demographics shape — raw payload shown for inspection.
            </p>
            <pre className="text-xs bg-muted/40 rounded-md p-3 max-h-64 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(data.raw, null, 2).slice(0, 4000)}
            </pre>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              const sorted = [...group.entries]
                .sort((a, b) => b.value - a.value)
                .slice(0, MAX_ENTRIES_PER_GROUP);
              const max = Math.max(...sorted.map((e) => e.value), 1);
              return (
                <div key={group.title}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {group.title}
                  </p>
                  <div className="space-y-1.5">
                    {sorted.map((entry) => (
                      <div key={entry.label} className="flex items-center gap-2">
                        <span className="text-xs w-28 truncate" title={entry.label}>
                          {entry.label}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${Math.max((entry.value / max) * 100, 2)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums w-12 text-right">
                          {entry.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {data.updated_at && (
              <p className="text-xs text-muted-foreground">
                Updated {formatDistanceToNow(new Date(data.updated_at), { addSuffix: true })}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
