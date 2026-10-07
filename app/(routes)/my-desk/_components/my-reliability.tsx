'use client';

// app/(routes)/my-desk/_components/my-reliability.tsx
// ============================================================================
// "Your record, last 12 weeks" — a team member's own on-time record on the HR
// duties they decided (migration 20271007161151).
//
// WHO SEES WHAT.
//   * The record card: only the signed-in person, about themselves. The data
//     comes from fn_hr_my_reliability(), which takes no user and filters to
//     auth.uid() in the database — nobody can ask it about someone else. The
//     card is hidden when the person decided no items.
//   * The Director block: only when fn_is_the_director() is true. It holds the
//     earned-trust switch (ships OFF), the suggestion list (Note / Decline) and
//     a per-duty, per-college on-time table that has no people in it. A
//     suggestion shows a name and "steady for 12 weeks" only: never that
//     person's item count, on-time rate or reversed rate.
//   * The 'steady' bar in the footnote is read from the thresholds that come
//     back with the person's own rows, never typed in here.
//
// NOTHING HERE CHANGES WHAT ANYONE MAY DO. Noting a suggestion records that the
// Director saw it; no role, permission or approval chain is touched.
// ============================================================================

import { useState } from 'react';
import { ShieldCheck, Timer } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  useDecideTrustSuggestion,
  useIsTheDirector,
  useMyReliability,
  useTrustDirectorView,
  useTrustSwitch,
} from '@/hooks/hr/use-my-reliability';
import {
  HR_TOWER_DUTY_NAMES,
  formatRate,
  toRate,
  type HrTowerDutyCode,
  type MyReliabilityRow,
  type ReliabilitySignal,
} from '@/types/hr-reliability';

function dutyName(code: string): string {
  return HR_TOWER_DUTY_NAMES[code as HrTowerDutyCode] ?? code;
}

const SIGNAL_STYLE: Record<ReliabilitySignal, string> = {
  steady: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
  building: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
  'too few items': 'border-border bg-muted text-muted-foreground',
};

/** "at least 10 items, at least 90% on time and at most 5% reversed", from the rows' own thresholds. */
function steadyBarSentence(row: MyReliabilityRow | undefined): string {
  const min = toRate(row?.min_items);
  const onTime = toRate(row?.steady_on_time);
  const maxRev = toRate(row?.max_reversal);
  if (min === null || onTime === null || maxRev === null) {
    return "The bar for 'steady' could not be read just now, so nothing reads steady.";
  }
  return `'Steady' needs at least ${min} items, at least ${formatRate(onTime)} on time and at most ${formatRate(maxRev)} reversed.`;
}

function SignalBadge({ signal }: { signal: ReliabilitySignal }) {
  return (
    <Badge variant="outline" className={SIGNAL_STYLE[signal] ?? SIGNAL_STYLE['too few items']}>
      {signal}
    </Badge>
  );
}

export function MyReliability() {
  const mine = useMyReliability();
  const director = useIsTheDirector();
  const rows = (mine.data ?? []).filter((r) => Number(r.items) > 0);

  return (
    <>
      {mine.isError && (
        <p className="text-sm text-muted-foreground" role="status">
          Your 12-week record could not be read just now.
        </p>
      )}
      {rows.length > 0 && (
        <Card data-testid="my-reliability-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Timer className="h-5 w-5 text-primary" />
              Your record, last 12 weeks
            </CardTitle>
            <p className="text-sm text-muted-foreground">Only you can see this.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.duty_code} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">{dutyName(r.duty_code)}</span>
                  <span className="text-muted-foreground">
                    {r.items} {Number(r.items) === 1 ? 'item' : 'items'} · {formatRate(r.on_time_rate)} on time
                    {Number(r.reversal_rate) > 0 ? ` · ${formatRate(r.reversal_rate)} reversed` : ''}
                  </span>
                  <SignalBadge signal={r.signal} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground" data-testid="steady-bar">
              {steadyBarSentence(rows[0])} This record changes nothing about what you can do.
            </p>
          </CardContent>
        </Card>
      )}
      {director.data === true && <DirectorTrustBlock />}
    </>
  );
}

function DirectorTrustBlock() {
  const view = useTrustDirectorView(true);
  const toggle = useTrustSwitch();
  const decide = useDecideTrustSuggestion();
  const [busyId, setBusyId] = useState<string | null>(null);

  const onToggle = (on: boolean) => {
    toggle.mutate(
      { on },
      {
        onSuccess: () => toast.success(on ? 'Earned-trust suggestions are on.' : 'Earned-trust suggestions are off.'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change the switch.'),
      },
    );
  };

  const onDecide = (id: string, status: 'noted' | 'declined') => {
    setBusyId(id);
    decide.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(status === 'noted' ? 'Noted.' : 'Declined.'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not record that.'),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const data = view.data;
  return (
    <Card data-testid="trust-director-block">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          HR duties: on time, by college (Director only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {view.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {view.isError && <p className="text-destructive">This could not be read just now.</p>}

        {data && (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="trust-switch" className="font-medium">
                  Earned-trust suggestions
                </label>
                <Switch
                  id="trust-switch"
                  checked={data.switchOn}
                  disabled={toggle.isPending}
                  onCheckedChange={onToggle}
                />
              </div>
              <p className="text-muted-foreground">
                When on, the weekly run lists team members who have been steady on a duty for 12 weeks. A suggestion
                changes nothing on its own: noting it only records that you saw it. Any lighter check for that person
                would be a separate change you make by hand.
              </p>
            </section>

            {data.suggestions.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-medium">Suggestions waiting</h3>
                <ul className="divide-y divide-border rounded-md border">
                  {data.suggestions.map((s) => (
                    <li
                      key={s.id}
                      data-testid="trust-suggestion"
                      className="flex flex-wrap items-center justify-between gap-2 p-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{s.person_name ?? 'A team member'}</span>
                        <span className="text-muted-foreground">
                          {' '}· {dutyName(s.duty_code)} · steady for {s.evidence.steady_weeks ?? 12} weeks
                        </span>
                      </span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => onDecide(s.id, 'noted')}>
                          Note
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => onDecide(s.id, 'declined')}>
                          Decline
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="font-medium">
                On time last week{data.weekStart ? ` (week of ${data.weekStart})` : ''}
              </h3>
              {data.readings.length === 0 ? (
                <p className="text-muted-foreground">No weekly reading yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Duty</th>
                        <th className="py-1 pr-3 font-medium">College</th>
                        <th className="py-1 pr-3 text-right font-medium">Items</th>
                        <th className="py-1 pr-3 text-right font-medium">On time</th>
                        <th className="py-1 text-right font-medium">Still open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.readings.map((r) => (
                        <tr key={`${r.duty_code}:${r.institution_id ?? 'all'}`}>
                          <td className="py-1 pr-3">{r.duty_code}</td>
                          <td className="py-1 pr-3">{r.institution_id ? r.institution_name ?? 'A college' : 'All colleges'}</td>
                          <td className="py-1 pr-3 text-right">{r.items}</td>
                          <td className="py-1 pr-3 text-right">{formatRate(r.on_time_rate)}</td>
                          <td className="py-1 text-right">{r.open_overdue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
