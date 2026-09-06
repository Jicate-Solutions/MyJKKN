'use client';

/**
 * MBA Data-Gap — managers-only contributor scoreboard (decision #10/#11).
 *
 * Ranks contributors by REAL improvements produced (a filed gap that reached an
 * APPLIED idea), NOT raw volume — 3 gaps that all led to fixes outrank 30 that
 * went nowhere. Offers BOTH views: combined all-JKKN and per-college (a toggle
 * that filters the one server-ranked list client-side).
 *
 * Rendered inside the manager-gated Data Gaps page, so it needs no gate of its
 * own; the RPC (fn_mba_gap_contributor_ranking) is manager-only regardless.
 * Lazily loads on first expand so it never taxes a plain triage visit.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  MbaDataGapService,
  type MbaGapContributor
} from '@/lib/services/mba-data-gap/mba-data-gap-service';

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export function ContributorScoreboard() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MbaGapContributor[] | null>(null);
  const [college, setCollege] = useState('all');

  useEffect(() => {
    if (!open || rows !== null) return;
    let alive = true;
    MbaDataGapService.getContributorRanking()
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(
          e instanceof Error ? e.message : 'Could not load the scoreboard.'
        );
        setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [open, rows]);

  const colleges = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? [])
      if (r.institution_id && r.institution_name)
        m.set(r.institution_id, r.institution_name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [rows]);

  // Server already orders by produced_improvement DESC; filtering by college
  // preserves that order, so display rank = position in the filtered list.
  const filtered = useMemo(() => {
    const base = rows ?? [];
    return college === 'all'
      ? base
      : base.filter((r) => r.institution_id === college);
  }, [rows, college]);

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="text-primary h-4 w-4" />
            Contributor scoreboard
            <span className="text-muted-foreground font-normal">
              — ranked by real improvements
            </span>
          </span>
          {open ? (
            <ChevronUp className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          )}
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            {/* College toggle: combined all-JKKN vs one college */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">View:</span>
              <div className="w-56">
                <Select value={college} onValueChange={setCollege}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All colleges (combined)</SelectItem>
                    {colleges.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rows === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No contributors yet — this fills in as Associates file gaps and
                those gaps turn into applied improvements.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="py-1.5 pr-2 font-medium">#</th>
                      <th className="py-1.5 pr-2 font-medium">Contributor</th>
                      {college === 'all' && (
                        <th className="py-1.5 pr-2 font-medium">College</th>
                      )}
                      <th className="py-1.5 pr-2 text-right font-medium">
                        Improvements
                      </th>
                      <th className="py-1.5 pr-2 text-right font-medium">
                        Accepted
                      </th>
                      <th className="py-1.5 text-right font-medium">Filed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={r.associate_id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 tabular-nums">{medal(i + 1)}</td>
                        <td className="py-1.5 pr-2">
                          {r.associate_name ?? 'An Associate'}
                        </td>
                        {college === 'all' && (
                          <td className="text-muted-foreground py-1.5 pr-2">
                            {r.institution_name ?? '—'}
                          </td>
                        )}
                        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-emerald-700">
                          {r.produced_improvement}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {r.accepted}
                        </td>
                        <td className="text-muted-foreground py-1.5 text-right tabular-nums">
                          {r.filed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Ranked by <strong>improvements produced</strong> (a filed gap that
              became an applied fix), then accepted, then filed — quality over
              volume. Managers only.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ContributorScoreboard;
