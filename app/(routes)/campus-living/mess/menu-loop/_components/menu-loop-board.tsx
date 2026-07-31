'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, Pencil, Inbox, ShieldQuestion, ChevronDown } from 'lucide-react';
import {
  MessMenuLoopService,
  type ProposedRecommendation,
  type CausalGuardRow,
  type VerdictStatus,
  type MenuLoopItemLite,
} from '@/lib/services/campus-living/mess-menu-loop-service';

// Tier filter — native <select> only (never Radix Select). 'all' = no filter.
const TIER_OPTIONS = [
  { value: 'all', label: 'All tiers' },
  { value: 'classic', label: 'Classic' },
  { value: 'premium', label: 'Premium' },
];

function fmtLift(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

/** Per-dish resident signal stored in rationale keyed by item UUID: { picks, net_votes }. */
function readDishSignal(
  rationale: Record<string, unknown>,
  itemId: string
): { netVotes: number | null; picks: number | null } {
  const raw = rationale[itemId];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { netVotes: null, picks: null };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { netVotes: num(o['net_votes']), picks: num(o['picks']) };
}

/** Plain-text rendering of rationale.feed_forward (shape varies by generator cycle). */
function feedForwardText(ff: unknown): string | null {
  if (ff === null || ff === undefined) return null;
  if (typeof ff === 'string') return ff || null;
  if (Array.isArray(ff)) return ff.length > 0 ? JSON.stringify(ff) : null;
  if (typeof ff === 'object') {
    const parts = Object.entries(ff as Record<string, unknown>).map(
      ([k, v]) =>
        `${k.replace(/_/g, ' ')}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`
    );
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  return String(ff);
}

/** Dish list inside the expanded panel — Tamil primary, English subtitle (mess menu idiom). */
function DishList({
  title,
  ids,
  rationale,
  itemCache,
  loading,
}: {
  title: string;
  ids: string[];
  rationale: Record<string, unknown>;
  itemCache: Record<string, MenuLoopItemLite>;
  loading: boolean;
}) {
  return (
    <div>
      <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{title}</p>
      {loading ? (
        // Fixed-height skeleton per dish — content swaps in without a layout jump.
        <div className='mt-2 space-y-2'>
          {ids.map((id) => (
            <Skeleton key={id} className='h-9 w-full max-w-md' />
          ))}
        </div>
      ) : ids.length === 0 ? (
        <p className='mt-2 text-xs italic text-muted-foreground'>None</p>
      ) : (
        <ul className='mt-2 space-y-2'>
          {ids.map((id) => {
            const item = itemCache[id];
            const signal = readDishSignal(rationale, id);
            const meta = item
              ? [item.category, ...item.dietary_tags].filter(Boolean).join(' · ')
              : '';
            return (
              <li key={id} className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                <div className='min-w-0'>
                  {item?.name_tamil ? (
                    <>
                      <p className='text-sm leading-snug'>{item.name_tamil}</p>
                      <p className='text-xs leading-snug text-muted-foreground'>
                        {item.name_english}
                      </p>
                    </>
                  ) : (
                    <p className='text-sm leading-snug'>{item?.name_english || 'Unknown dish'}</p>
                  )}
                </div>
                {signal.netVotes !== null && (
                  <Badge variant='outline' className='text-xs tabular-nums'>
                    net votes: {signal.netVotes}
                    {signal.picks !== null && signal.picks > 0 ? ` · picks: ${signal.picks}` : ''}
                  </Badge>
                )}
                {meta && <span className='text-xs text-muted-foreground'>{meta}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MenuLoopBoard() {
  const [tier, setTier] = useState('all');
  const [proposals, setProposals] = useState<ProposedRecommendation[]>([]);
  const [guard, setGuard] = useState<CausalGuardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  // Detail expansion: which rows are open, the shared id→library-item cache,
  // and which rows are still resolving names (skeleton state).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [itemCache, setItemCache] = useState<Record<string, MenuLoopItemLite>>({});
  const [namesLoading, setNamesLoading] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [props, g] = await Promise.all([
        MessMenuLoopService.listProposed(tier === 'all' ? undefined : tier),
        MessMenuLoopService.getCausalGuard(),
      ]);
      setProposals(props);
      setGuard(g);
    } finally {
      setLoading(false);
    }
  }, [tier]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Lazily resolve this row's dish names on first expand (cache is shared across rows). */
  const ensureItemNames = async (rec: ProposedRecommendation) => {
    const needed = [...rec.recommended_item_ids, ...rec.demoted_item_ids].filter(
      (id) => !(id in itemCache)
    );
    if (needed.length === 0) return;
    setNamesLoading((prev) => new Set(prev).add(rec.id));
    try {
      const items = await MessMenuLoopService.getItemsByIds(needed);
      if (items.length > 0) {
        setItemCache((prev) => {
          const next = { ...prev };
          for (const it of items) next[it.id] = it;
          return next;
        });
      }
    } finally {
      setNamesLoading((prev) => {
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });
    }
  };

  const toggleExpand = (rec: ProposedRecommendation) => {
    const willOpen = !expandedIds.has(rec.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rec.id)) next.delete(rec.id);
      else next.add(rec.id);
      return next;
    });
    if (willOpen) void ensureItemNames(rec);
  };

  const handleVerdict = async (rec: ProposedRecommendation, status: VerdictStatus) => {
    setActingId(rec.id);
    try {
      await MessMenuLoopService.setVerdict(rec.id, status);
      toast.success(`Recommendation marked ${status}.`);
      // Drop it from the proposed list immediately; refresh guard from server.
      setProposals((prev) => prev.filter((p) => p.id !== rec.id));
      setGuard(await MessMenuLoopService.getCausalGuard());
    } catch (e) {
      toast.error('Could not record the verdict. Please try again.');
      // eslint-disable-next-line no-console
      console.error('[campus-living/mess-menu-loop] verdict failed', e);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className='space-y-6'>
      {/* ── Proposals awaiting a verdict ─────────────────────────────────── */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-4 space-y-0'>
          <div>
            <CardTitle className='text-lg'>Proposals awaiting your verdict</CardTitle>
            <p className='text-sm text-muted-foreground mt-1'>
              Each row is one (tier, meal, week) the loop proposed from resident signal.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <label htmlFor='tier-filter' className='text-sm text-muted-foreground'>
              Tier
            </label>
            <select
              id='tier-filter'
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className='h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            >
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='space-y-3'>
              <Skeleton className='h-20 w-full' />
              <Skeleton className='h-20 w-full' />
            </div>
          ) : proposals.length === 0 ? (
            <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center'>
              <Inbox className='h-8 w-8 text-muted-foreground' />
              <p className='mt-3 font-medium'>No proposals waiting</p>
              <p className='mt-1 max-w-md text-sm text-muted-foreground'>
                The loop is dark until a pilot hostel is fueled. Once the weekly generator runs on a
                tier with enough votes and ratings, its menu proposals appear here for you to accept,
                reject, or edit.
              </p>
            </div>
          ) : (
            <ul className='divide-y'>
              {proposals.map((rec) => {
                const isExpanded = expandedIds.has(rec.id);
                const ffRaw = rec.rationale['feed_forward'];
                const hasFeedForward = ffRaw !== null && ffRaw !== undefined;
                const feedForward = hasFeedForward ? feedForwardText(ffRaw) : null;
                return (
                  <li key={rec.id} className='py-4'>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                      {/* Row body toggles the dish detail; verdict buttons are siblings and never toggle. */}
                      <button
                        type='button'
                        onClick={() => toggleExpand(rec)}
                        aria-expanded={isExpanded}
                        className='flex flex-1 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                      >
                        <ChevronDown
                          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                            isExpanded ? '' : '-rotate-90'
                          }`}
                        />
                        <span className='space-y-1'>
                          <span className='flex flex-wrap items-center gap-2'>
                            <Badge variant='secondary' className='capitalize'>
                              {rec.tier_key}
                            </Badge>
                            <Badge variant='outline' className='capitalize'>
                              {rec.meal_type}
                            </Badge>
                            <span className='text-sm font-medium'>Week of {rec.week_start_date}</span>
                          </span>
                          <span className='block text-sm text-muted-foreground'>
                            {rec.recommended_count} promoted · {rec.demoted_count} demoted · prior-cycle
                            lift {fmtLift(rec.rating_lift)}
                            {rec.baseline_avg_rating !== null && (
                              <> · baseline {rec.baseline_avg_rating.toFixed(2)} (n={rec.baseline_rating_n ?? 0})</>
                            )}
                          </span>
                        </span>
                      </button>
                      <div className='flex items-center gap-2'>
                        <Button
                          size='sm'
                          variant='default'
                          disabled={actingId === rec.id}
                          onClick={() => handleVerdict(rec, 'accepted')}
                        >
                          <Check className='mr-1 h-4 w-4' /> Accept
                        </Button>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={actingId === rec.id}
                          onClick={() => handleVerdict(rec, 'edited')}
                        >
                          <Pencil className='mr-1 h-4 w-4' /> Edited
                        </Button>
                        <Button
                          size='sm'
                          variant='destructive'
                          disabled={actingId === rec.id}
                          onClick={() => handleVerdict(rec, 'rejected')}
                        >
                          <X className='mr-1 h-4 w-4' /> Reject
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className='ml-6 mt-3 space-y-4 rounded-lg border bg-muted/20 p-4'>
                        <DishList
                          title='Promoted dishes'
                          ids={rec.recommended_item_ids}
                          rationale={rec.rationale}
                          itemCache={itemCache}
                          loading={namesLoading.has(rec.id)}
                        />
                        {rec.demoted_item_ids.length > 0 && (
                          <DishList
                            title='Demoted dishes'
                            ids={rec.demoted_item_ids}
                            rationale={rec.rationale}
                            itemCache={itemCache}
                            loading={namesLoading.has(rec.id)}
                          />
                        )}
                        <p className='text-xs text-muted-foreground'>
                          {rec.baseline_avg_rating === null
                            ? 'First cycle — no baseline yet; lift can only be measured from cycle 2.'
                            : `Baseline avg ${rec.baseline_avg_rating.toFixed(2)} across ${rec.baseline_rating_n ?? 0} ratings.`}
                        </p>
                        {hasFeedForward && (
                          <p className='text-xs text-muted-foreground'>
                            Carries forward from last cycle&apos;s outcome
                            {feedForward ? ` — ${feedForward}` : '.'}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Causal-validity guard ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <ShieldQuestion className='h-5 w-5 text-muted-foreground' />
            Causal-validity guard
          </CardTitle>
          <p className='text-sm text-muted-foreground mt-1'>
            If rejected slots show the same lift as accepted, the improvement is
            regression-to-the-mean, not the recommendation.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className='h-24 w-full' />
          ) : guard.length === 0 ? (
            <div className='rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground'>
              No measured cycles yet. Once recommendations are accepted or rejected and their lift is
              measured, this table will compare the two — a real moat needs the accepted lift to beat
              the rejected (control) lift.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b text-left text-muted-foreground'>
                    <th className='py-2 pr-4 font-medium'>Verdict</th>
                    <th className='py-2 pr-4 font-medium'>Slots</th>
                    <th className='py-2 pr-4 font-medium'>Avg lift</th>
                    <th className='py-2 pr-4 font-medium'>Std dev</th>
                  </tr>
                </thead>
                <tbody>
                  {guard.map((row) => (
                    <tr key={row.status} className='border-b last:border-0'>
                      <td className='py-2 pr-4 capitalize'>{row.status}</td>
                      <td className='py-2 pr-4'>{row.n}</td>
                      <td className='py-2 pr-4'>{fmtLift(row.avg_lift)}</td>
                      <td className='py-2 pr-4'>{row.sd === null ? '—' : row.sd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
