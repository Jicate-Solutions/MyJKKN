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

type Picks = Record<number, string>;
export type PlacingChange = { entryId: string; final_rank: number | null };

function entryLabel(e: TournamentEntry) {
  const name = e.institution_name ? `${e.entry_name} · ${e.institution_name}` : e.entry_name;
  return e.status === 'withdrawn' ? `${name} (withdrawn)` : name;
}

/** The first holder of each place, as the dialog opens (withdrawn holders included). */
export function currentPicks(entries: TournamentEntry[]): Picks {
  const picks: Picks = {};
  for (const { rank } of PLACES) {
    const holder = entries.find((e) => e.final_rank === rank);
    if (holder) picks[rank] = holder.id;
  }
  return picks;
}

/**
 * The writes for the places the organiser actually changed — nothing else.
 * A place left as it opened is never touched, so a second bronze (knockouts
 * give both semi-final losers rank 3) and ranks above 3 survive a plain Save.
 * For a changed place, EVERY entry holding it is cleared, withdrawn ones too,
 * so two entries never share a place. Clears come before sets: a failure
 * part-way leaves a place empty, never doubled.
 */
export function placingChanges(entries: TournamentEntry[], before: Picks, after: Picks): PlacingChange[] {
  const final = new Map<string, number | null>();
  for (const { rank } of PLACES) {
    if ((before[rank] ?? '') === (after[rank] ?? '')) continue;
    for (const e of entries) {
      if (e.final_rank === rank && !final.has(e.id)) final.set(e.id, null);
    }
  }
  for (const { rank } of PLACES) {
    if ((before[rank] ?? '') === (after[rank] ?? '')) continue;
    const id = after[rank];
    if (id) final.set(id, rank);
  }
  const current = new Map(entries.map((e) => [e.id, e.final_rank ?? null]));
  const moving = [...final.entries()].filter(([id, rank]) => current.get(id) !== rank);
  // Phase 1 empties every place that is changing hands (an entry moving from one
  // place to another is emptied too); phase 2 fills them. No prefix of the list
  // ever has two entries on one place.
  const clears = moving
    .filter(([id]) => current.get(id) != null)
    .map(([entryId]) => ({ entryId, final_rank: null }));
  const sets = moving
    .filter(([, rank]) => rank !== null)
    .map(([entryId, final_rank]) => ({ entryId, final_rank }));
  return [...clears, ...sets];
}

export function DivisionPlacings({
  eventId,
  entries,
  canManage = false,
}: {
  eventId: string;
  /** All of this division's entries, withdrawn ones included. */
  entries: TournamentEntry[];
  canManage?: boolean;
}) {
  // Choices: active entries, plus any withdrawn entry that still holds a place,
  // so the organiser can see it and replace it.
  const choices = useMemo(
    () =>
      entries.filter(
        (e) => e.status !== 'withdrawn' || (e.final_rank != null && e.final_rank <= 3),
      ),
    [entries],
  );
  const placed = useMemo(
    () => PLACES.map((p) => ({ ...p, holders: entries.filter((e) => e.final_rank === p.rank) })),
    [entries],
  );
  const record = useRecordPlacings(eventId);
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState<Picks>({});
  const [picks, setPicks] = useState<Picks>({});

  const openDialog = () => {
    const start = currentPicks(entries);
    setBefore(start);
    setPicks(start);
    setOpen(true);
  };

  const chosen = Object.values(picks).filter(Boolean);
  const duplicate = new Set(chosen).size !== chosen.length;

  const save = async () => {
    if (duplicate) return;
    const changes = placingChanges(entries, before, picks);
    if (changes.length > 0) await record.mutateAsync(changes);
    setOpen(false);
  };

  const anyPlaced = placed.some((p) => p.holders.length > 0);
  if (!anyPlaced && !canManage) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="division-placings">
      {anyPlaced ? (
        placed.flatMap((p) =>
          p.holders.map((h) => (
            <span key={`${p.rank}-${h.id}`} className="rounded bg-muted px-1.5 py-0.5">
              {p.icon} {h.entry_name}
            </span>
          )),
        )
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
              on the ground. Only the places you change are saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {PLACES.map((p) => {
              const shared = placed.find((x) => x.rank === p.rank)!.holders.length;
              return (
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
                    {choices.map((e) => (
                      <option key={e.id} value={e.id}>
                        {entryLabel(e)}
                      </option>
                    ))}
                  </select>
                  {shared > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      {shared} entries share this place now. Changing it replaces all of them.
                    </p>
                  )}
                </div>
              );
            })}
            {duplicate && (
              <p className="text-xs text-destructive" role="alert">
                The same entry is chosen for two places.
              </p>
            )}
            {choices.length === 0 && (
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
