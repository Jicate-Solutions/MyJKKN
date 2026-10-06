'use client';

// Winner / runner-up / third place for one division, recorded straight on the
// entries (BUG-006252, option b). For results that never went through a match
// row: days already played before fixtures were drawn, timed sports, and draws
// played differently on the ground. Writes tournament_entries.final_rank, which
// the public results page, certificates and medals already read.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Medal } from 'lucide-react';
import type { TournamentEntry } from '@/types/tournament';
import { useRecordPlacings } from '@/hooks/events/use-tournament-registrations';

const PLACES = [
  { rank: 1, label: 'Winner', icon: '🥇' },
  { rank: 2, label: 'Runner-up', icon: '🥈' },
  { rank: 3, label: 'Third place', icon: '🥉' },
] as const;

function entryLabel(e: TournamentEntry) {
  return e.institution_name ? `${e.entry_name} · ${e.institution_name}` : e.entry_name;
}

/** Which entry changes rank, given the picks. Exported for tests. */
export function placingChanges(
  entries: TournamentEntry[],
  picks: Record<number, string>,
): { entryId: string; final_rank: number | null }[] {
  const wanted = new Map<string, number>();
  for (const { rank } of PLACES) {
    const id = picks[rank];
    if (id) wanted.set(id, rank);
  }
  const changes: { entryId: string; final_rank: number | null }[] = [];
  for (const e of entries) {
    const next = wanted.get(e.id) ?? null;
    if ((e.final_rank ?? null) !== next) changes.push({ entryId: e.id, final_rank: next });
  }
  return changes;
}

export function DivisionPlacings({
  eventId,
  entries,
  canManage = false,
}: {
  eventId: string;
  /** This division's entries (withdrawn ones are ignored). */
  entries: TournamentEntry[];
  canManage?: boolean;
}) {
  const active = useMemo(() => entries.filter((e) => e.status !== 'withdrawn'), [entries]);
  const placed = useMemo(
    () =>
      PLACES.map((p) => ({ ...p, entry: active.find((e) => e.final_rank === p.rank) ?? null })),
    [active],
  );
  const record = useRecordPlacings(eventId);
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<Record<number, string>>({});

  const openDialog = () => {
    const start: Record<number, string> = {};
    for (const p of placed) if (p.entry) start[p.rank] = p.entry.id;
    setPicks(start);
    setOpen(true);
  };

  const chosen = Object.values(picks).filter(Boolean);
  const duplicate = new Set(chosen).size !== chosen.length;

  const save = async () => {
    if (duplicate) return;
    const changes = placingChanges(active, picks);
    if (changes.length > 0) await record.mutateAsync(changes);
    setOpen(false);
  };

  const anyPlaced = placed.some((p) => p.entry);
  if (!anyPlaced && !canManage) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="division-placings">
      {anyPlaced ? (
        placed
          .filter((p) => p.entry)
          .map((p) => (
            <span key={p.rank} className="rounded bg-muted px-1.5 py-0.5">
              {p.icon} {p.entry!.entry_name}
            </span>
          ))
      ) : (
        <span className="text-muted-foreground">No winners recorded yet.</span>
      )}
      {canManage && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openDialog}>
          <Medal className="mr-1 h-3.5 w-3.5" /> Record winners
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record winners</DialogTitle>
            <DialogDescription>
              Use this when the result was decided outside the match list, such as a day
              played before fixtures were drawn, a timed event, or a draw played differently
              on the ground. Leave a place empty if it was not awarded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {PLACES.map((p) => (
              <div key={p.rank} className="space-y-1">
                <Label htmlFor={`place-${p.rank}`}>
                  {p.icon} {p.label}
                </Label>
                <select
                  id={`place-${p.rank}`}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={picks[p.rank] ?? ''}
                  onChange={(ev) => setPicks((cur) => ({ ...cur, [p.rank]: ev.target.value }))}
                >
                  <option value="">— none —</option>
                  {active.map((e) => (
                    <option key={e.id} value={e.id}>
                      {entryLabel(e)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {duplicate && (
              <p className="text-xs text-destructive" role="alert">
                The same entry is chosen for two places.
              </p>
            )}
            {active.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This division has no entries yet. Add the competitors under Registrations first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={duplicate || record.isPending}>
              {record.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
