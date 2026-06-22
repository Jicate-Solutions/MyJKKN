'use client';

// Per-division fixtures: generate the bracket, list matches by round, schedule each
// (Sports Tournament PR3). Rendered inside each division card on the detail page.
// Created: 2026-06-22 (Sports Tournament PR3).

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, GitBranch, CalendarClock, RefreshCw, Swords } from 'lucide-react';
import { format } from 'date-fns';
import type { TournamentMatch } from '@/types/tournament';
import { useGenerateFixtures, useScheduleMatch } from '@/hooks/events/use-tournament-fixtures';

function MatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-50 text-blue-700',
    completed: 'bg-emerald-50 text-emerald-700',
    walkover: 'bg-amber-50 text-amber-700',
    disqualified: 'bg-red-50 text-red-700',
    bye: 'bg-violet-50 text-violet-700',
  };
  return <Badge className={`${map[status] ?? 'bg-gray-100'} text-[10px]`}>{status}</Badge>;
}

function ScheduleDialog({
  eventId,
  match,
  open,
  onOpenChange,
}: {
  eventId: string;
  match: TournamentMatch;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const schedule = useScheduleMatch(eventId);
  const [when, setWhen] = useState('');
  const [venue, setVenue] = useState('');
  const [official, setOfficial] = useState('');

  async function submit() {
    if (!when) return;
    await schedule.mutateAsync({
      matchId: match.id,
      dto: {
        scheduled_at: new Date(when).toISOString(),
        venue_text: venue.trim() || null,
        official_name: official.trim() || null,
      },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule match</DialogTitle>
          <DialogDescription>
            {(match.side_a_name ?? 'TBD')} vs {(match.side_b_name ?? 'TBD')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Date &amp; time</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Venue / court</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Court 1" />
          </div>
          <div className="space-y-1.5">
            <Label>Official (umpire/referee)</Label>
            <Input value={official} onChange={(e) => setOfficial(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={schedule.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={schedule.isPending || !when}>
            {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DivisionFixtures({
  eventId,
  divisionId,
  matches,
  entryCount,
}: {
  eventId: string;
  divisionId: string;
  matches: TournamentMatch[];
  entryCount: number;
}) {
  const generate = useGenerateFixtures(eventId);
  const [scheduling, setScheduling] = useState<TournamentMatch | null>(null);

  const byRound = useMemo(() => {
    const m = new Map<number, TournamentMatch[]>();
    for (const x of matches) {
      const arr = m.get(x.round_no) ?? [];
      arr.push(x);
      m.set(x.round_no, arr);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  if (matches.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed p-3 text-center">
        <p className="mb-2 text-xs text-muted-foreground">
          No fixtures yet ({entryCount} {entryCount === 1 ? 'entry' : 'entries'}).
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={generate.isPending || entryCount < 2}
          onClick={() => generate.mutate({ divisionId })}
        >
          {generate.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitBranch className="mr-1 h-3.5 w-3.5" />
          )}
          Generate Fixtures
        </Button>
        {entryCount < 2 && (
          <p className="mt-1 text-[11px] text-muted-foreground">Need at least 2 entries.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Swords className="h-3.5 w-3.5" /> Fixtures
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={generate.isPending}
          onClick={() => {
            if (confirm('Regenerate fixtures? This deletes existing matches for this division.')) {
              generate.mutate({ divisionId, regenerate: true });
            }
          }}
        >
          <RefreshCw className="mr-1 h-3 w-3" /> Regenerate
        </Button>
      </div>

      <div className="space-y-3">
        {byRound.map(([round, ms]) => (
          <div key={round}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ms[0]?.round_label || `Round ${round}`}
              {ms[0]?.pool ? ` · Pool ${ms[0].pool}` : ''}
            </p>
            <div className="divide-y">
              {ms.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className={m.winner_entry_id === m.side_a_entry_id ? 'font-semibold' : ''}>
                      {m.side_a_name ?? <span className="text-muted-foreground">TBD / bye</span>}
                    </span>
                    <span className="px-1.5 text-xs text-muted-foreground">vs</span>
                    <span className={m.winner_entry_id === m.side_b_entry_id ? 'font-semibold' : ''}>
                      {m.side_b_name ?? <span className="text-muted-foreground">TBD / bye</span>}
                    </span>
                  </span>
                  {m.scheduled_at && (
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(m.scheduled_at), 'd MMM, h:mma')}
                    </span>
                  )}
                  <MatchStatusBadge status={m.status} />
                  {m.status !== 'bye' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => setScheduling(m)}
                      title="Schedule"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {scheduling && (
        <ScheduleDialog
          eventId={eventId}
          match={scheduling}
          open={!!scheduling}
          onOpenChange={(v) => !v && setScheduling(null)}
        />
      )}
    </div>
  );
}
