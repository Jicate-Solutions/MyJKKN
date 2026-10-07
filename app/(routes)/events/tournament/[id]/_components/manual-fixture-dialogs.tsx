'use client';

// Manual fixtures (2026-10-07): an in-charge builds a division's matches round
// by round instead of using the generated draw.
//   - ManualMatchDialog: add or edit one match (round, label, both sides);
//   - FixtureModeDialog: switch to manual, or back to an auto-generated draw;
//   - DeleteManualMatchDialog: remove a match that has no result.
// The server holds every rule (fn_tournament_manual_match_save / _delete /
// fn_tournament_set_fixture_mode); the helpers here only shape what is offered.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  useDeleteManualMatch,
  useSaveManualMatch,
  useSetFixtureMode,
} from '@/hooks/events/use-tournament-fixtures';
import type { FixtureMode, TournamentEntry, TournamentMatch } from '@/types/tournament';

const ACTIVE = new Set(['registered', 'confirmed']);
const AUTO_LABEL = '__auto__';
const LABEL_PRESETS = ['Quarterfinal', 'Semifinal', 'Final'];

/** A match the organiser may still edit or delete: no result recorded. */
export function isManualEditable(m: TournamentMatch): boolean {
  if (m.status === 'bye') return true;
  return (m.status === 'pending' || m.status === 'scheduled') && !m.winner_entry_id;
}

export function ManualMatchDialog({
  eventId,
  divisionId,
  match,
  matches,
  entries,
  open,
  onOpenChange,
}: {
  eventId: string;
  divisionId: string;
  /** Present when editing; absent when adding. */
  match?: TournamentMatch | null;
  matches: TournamentMatch[];
  entries: TournamentEntry[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const save = useSaveManualMatch(eventId);
  const maxRound = matches.reduce((n, m) => Math.max(n, m.round_no), 0);
  const presetOf = (label: string | null | undefined, round: number) =>
    !label || label === `Round ${round}` ? AUTO_LABEL : label;

  const [round, setRound] = useState(String(match?.round_no ?? Math.max(maxRound, 1)));
  const [label, setLabel] = useState(presetOf(match?.round_label, match?.round_no ?? 0));
  const [sideA, setSideA] = useState(match?.side_a_entry_id ?? '');
  const [sideB, setSideB] = useState(match?.side_b_entry_id ?? '');

  const roundNo = Number(round);
  const roundOk = Number.isInteger(roundNo) && roundNo >= 1 && roundNo <= 20;
  const labelOptions = useMemo(() => {
    const extra = match?.round_label && !LABEL_PRESETS.includes(match.round_label)
      && match.round_label !== `Round ${match.round_no}` ? [match.round_label] : [];
    return [...LABEL_PRESETS, ...extra];
  }, [match]);

  // Entries already playing another match in the chosen round.
  const busy = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) {
      if (m.round_no !== roundNo || m.id === match?.id) continue;
      if (m.side_a_entry_id) s.add(m.side_a_entry_id);
      if (m.side_b_entry_id) s.add(m.side_b_entry_id);
    }
    return s;
  }, [matches, roundNo, match?.id]);
  const active = entries.filter((e) => ACTIVE.has(e.status));

  const canSave = roundOk && !!sideA && !!sideB && sideA !== sideB && !save.isPending;

  function submit() {
    if (!canSave) return;
    save.mutate(
      {
        matchId: match?.id,
        dto: {
          division_id: divisionId,
          round_no: roundNo,
          round_label: label === AUTO_LABEL ? null : label,
          side_a_entry_id: sideA,
          side_b_entry_id: sideB,
          // The sides this dialog showed; a match changed meanwhile is refused.
          ...(match
            ? { expected_side_a: match.side_a_entry_id, expected_side_b: match.side_b_entry_id }
            : {}),
        },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  const sideSelect = (value: string, onChange: (v: string) => void, other: string, placeholder: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {active.map((e) => (
          <SelectItem key={e.id} value={e.id} disabled={e.id === other || busy.has(e.id)}>
            {e.entry_name}
            {e.institution_name ? ` · ${e.institution_name}` : ''}
            {busy.has(e.id) ? ' (already in this round)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{match ? 'Edit match' : 'Add match'}</DialogTitle>
          <DialogDescription>
            Set who plays whom. Winners do not move on automatically in manual fixtures; add the next
            round&apos;s matches yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Round *</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={round}
                onChange={(e) => setRound(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Select value={label} onValueChange={setLabel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_LABEL}>{roundOk ? `Round ${roundNo}` : 'Round number'}</SelectItem>
                  {labelOptions.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            For medals the final must be the highest round: its winner gets gold and the other side
            silver; the losers of the round before it get bronze.
          </p>

          <div className="space-y-1.5">
            <Label>Side A *</Label>
            {sideSelect(sideA, setSideA, sideB, 'Pick an entry')}
          </div>
          <div className="space-y-1.5">
            <Label>Side B *</Label>
            {sideSelect(sideB, setSideB, sideA, 'Pick an entry')}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {match ? 'Save' : 'Add match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FixtureModeDialog({
  eventId,
  divisionId,
  to,
  matchCount,
  open,
  onOpenChange,
}: {
  eventId: string;
  divisionId: string;
  to: FixtureMode;
  matchCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const setMode = useSetFixtureMode(eventId);
  return (
    <Dialog open={open} onOpenChange={(v) => !setMode.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{to === 'manual' ? 'Set fixtures manually?' : 'Auto-generate the fixtures?'}</DialogTitle>
          <DialogDescription>
            {to === 'manual'
              ? matchCount > 0
                ? 'You will add, edit and delete every match yourself. The current round-1 pairings stay as a starting point; the empty later-round slots are removed, and winners no longer move on automatically.'
                : 'You will add every match yourself, round by round.'
              : `This deletes all ${matchCount} match${matchCount === 1 ? '' : 'es'} in this division, including any results, and draws a new bracket.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setMode.isPending}>
            Cancel
          </Button>
          <Button
            variant={to === 'auto' && matchCount > 0 ? 'destructive' : 'default'}
            disabled={setMode.isPending}
            onClick={() =>
              setMode.mutate({ division_id: divisionId, mode: to }, { onSettled: () => onOpenChange(false) })
            }
          >
            {setMode.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {to === 'manual' ? 'Switch to manual' : 'Delete and generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteManualMatchDialog({
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
  const del = useDeleteManualMatch(eventId);
  return (
    <Dialog open={open} onOpenChange={(v) => !del.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this match?</DialogTitle>
          <DialogDescription>
            {(match.side_a_name ?? 'TBD')} vs {(match.side_b_name ?? 'TBD')}
            {match.round_label ? ` · ${match.round_label}` : ''}. Both entries stay registered.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() =>
              del.mutate(
                {
                  matchId: match.id,
                  expected: { expected_side_a: match.side_a_entry_id, expected_side_b: match.side_b_entry_id },
                },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete match
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
