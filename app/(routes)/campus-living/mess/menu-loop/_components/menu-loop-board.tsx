'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, Pencil, Inbox, ShieldQuestion } from 'lucide-react';
import {
  MessMenuLoopService,
  type ProposedRecommendation,
  type CausalGuardRow,
  type VerdictStatus,
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

export function MenuLoopBoard() {
  const [tier, setTier] = useState('all');
  const [proposals, setProposals] = useState<ProposedRecommendation[]>([]);
  const [guard, setGuard] = useState<CausalGuardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

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
              {proposals.map((rec) => (
                <li
                  key={rec.id}
                  className='flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between'
                >
                  <div className='space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant='secondary' className='capitalize'>
                        {rec.tier_key}
                      </Badge>
                      <Badge variant='outline' className='capitalize'>
                        {rec.meal_type}
                      </Badge>
                      <span className='text-sm font-medium'>Week of {rec.week_start_date}</span>
                    </div>
                    <p className='text-sm text-muted-foreground'>
                      {rec.recommended_count} promoted · {rec.demoted_count} demoted · prior-cycle
                      lift {fmtLift(rec.rating_lift)}
                      {rec.baseline_avg_rating !== null && (
                        <> · baseline {rec.baseline_avg_rating.toFixed(2)} (n={rec.baseline_rating_n ?? 0})</>
                      )}
                    </p>
                  </div>
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
                </li>
              ))}
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
