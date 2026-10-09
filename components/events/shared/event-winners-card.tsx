'use client';

// Winners card for a CULTURAL event (BUG-006273). The COO asked for the same
// Winner / Runner-up provision sports tournaments have (#4222's
// division-placings.tsx, whose UX this mirrors). Places are recorded on the
// event's registrations (events_registrations.final_rank), one set per
// registration form when the event runs several competitions.

import { useMemo, useState } from 'react';
import { Medal, Loader2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  useEventWinners,
  useRecordEventWinners,
  type WinnerChange,
  type WinnerRegistration,
} from '@/hooks/events/use-event-winners';

export const PLACES = [
  { rank: 1, label: 'Winner', icon: '🥇', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
  { rank: 2, label: 'Runner-up', icon: '🥈', className: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200' },
  { rank: 3, label: 'Third place', icon: '🥉', className: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200' },
] as const;

type Picks = Record<number, string>;

const isOut = (r: WinnerRegistration) => r.status === 'cancelled';

function regLabel(r: WinnerRegistration) {
  const where = r.institution_name || r.department;
  const name = where ? `${r.participant_name} · ${where}` : r.participant_name;
  return isOut(r) ? `${name} (cancelled)` : name;
}

/** The holder of each place as the dialog opens. */
export function currentPicks(regs: WinnerRegistration[]): Picks {
  const picks: Picks = {};
  for (const { rank } of PLACES) {
    const holder = regs.find((r) => r.final_rank === rank);
    if (holder) picks[rank] = holder.id;
  }
  return picks;
}

/**
 * The writes for the places that changed — nothing else. For a changed place
 * every registration holding it is cleared, so two people never share it.
 * Clears come before sets (the database also orders them that way).
 */
export function winnerChanges(regs: WinnerRegistration[], before: Picks, after: Picks): WinnerChange[] {
  const final = new Map<string, number | null>();
  for (const { rank } of PLACES) {
    if ((before[rank] ?? '') === (after[rank] ?? '')) continue;
    for (const r of regs) if (r.final_rank === rank && !final.has(r.id)) final.set(r.id, null);
  }
  for (const { rank } of PLACES) {
    if ((before[rank] ?? '') === (after[rank] ?? '')) continue;
    const id = after[rank];
    if (id) final.set(id, rank);
  }
  const current = new Map(regs.map((r) => [r.id, r.final_rank ?? null]));
  const moving = [...final.entries()].filter(([id, rank]) => current.get(id) !== rank);
  const clears = moving
    .filter(([id]) => current.get(id) != null)
    .map(([registrationId]) => ({ registrationId, final_rank: null }));
  const sets = moving
    .filter(([, rank]) => rank !== null)
    .map(([registrationId, final_rank]) => ({ registrationId, final_rank }));
  return [...clears, ...sets];
}

function WinnersGroup({
  eventId,
  groupKey,
  title,
  regs,
  canManage,
}: {
  eventId: string;
  groupKey: string;
  title: string | null;
  regs: WinnerRegistration[];
  canManage: boolean;
}) {
  const record = useRecordEventWinners(eventId);
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState<Picks>({});
  const [picks, setPicks] = useState<Picks>({});

  const choices = useMemo(() => regs.filter((r) => !isOut(r) || r.final_rank != null), [regs]);
  const placed = PLACES.map((p) => ({ ...p, holders: regs.filter((r) => r.final_rank === p.rank) }));
  const anyPlaced = placed.some((p) => p.holders.length > 0);

  const chosen = Object.values(picks).filter(Boolean);
  const duplicate = new Set(chosen).size !== chosen.length;

  const openDialog = () => {
    const start = currentPicks(regs);
    setBefore(start);
    setPicks(start);
    setOpen(true);
  };

  const save = async () => {
    if (duplicate) return;
    const changes = winnerChanges(regs, before, picks);
    if (changes.length > 0) {
      try {
        await record.mutateAsync(changes);
      } catch {
        // The hook has already shown why (no access, place taken, ...). Keep the
        // dialog open so the organiser can adjust and try again.
        return;
      }
    }
    setOpen(false);
  };

  return (
    <div className="space-y-2" data-testid="event-winners-group">
      {title && <p className="text-sm font-medium">{title}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {anyPlaced ? (
          placed.flatMap((p) =>
            p.holders.map((h) => (
              <span key={`${p.rank}-${h.id}`} className={`rounded px-2 py-0.5 ${p.className}`}>
                {p.icon} {p.label}: {h.participant_name}
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
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record winners{title ? ` — ${title}` : ''}</DialogTitle>
            <DialogDescription>
              Choose who came first, second and third. Only the places you change are saved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {PLACES.map((p) => (
              <div key={p.rank} className="space-y-1">
                <Label htmlFor={`winner-${groupKey}-${p.rank}`}>
                  {p.icon} {p.label}
                </Label>
                <select
                  id={`winner-${groupKey}-${p.rank}`}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={picks[p.rank] ?? ''}
                  onChange={(ev) => setPicks((cur) => ({ ...cur, [p.rank]: ev.target.value }))}
                >
                  <option value="">— none —</option>
                  {choices.map((r) => (
                    <option key={r.id} value={r.id}>
                      {regLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {duplicate && (
              <p className="text-xs text-destructive" role="alert">
                The same person is chosen for two places.
              </p>
            )}
            {choices.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nobody has registered yet. Winners can be chosen once people register.
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

export function EventWinnersCard({ eventId }: { eventId: string }) {
  const { data } = useEventWinners(eventId);
  if (!data) return null;

  const { canManage, forms, registrations } = data;
  const anyPlaced = registrations.some((r) => r.final_rank != null);
  if (!canManage && !anyPlaced) return null;

  // One set of places per registration form — the database's no-tie index uses
  // the same key (event, form). A single-form event shows one untitled set.
  const formName = new Map(forms.map((f) => [f.id, f.name]));
  const usedFormIds = [...new Set(registrations.map((r) => r.form_id ?? ''))];
  const titled = usedFormIds.length > 1;
  const groups =
    usedFormIds.length === 0
      ? [{ key: 'all', title: null as string | null, regs: registrations }]
      : usedFormIds.map((fid) => ({
          key: fid || 'none',
          title: titled ? (fid && formName.get(fid)) || 'Other registrations' : null,
          regs: registrations.filter((r) => (r.form_id ?? '') === fid),
        }));

  return (
    <Card data-testid="event-winners-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          Winners
        </CardTitle>
        <CardDescription>
          {canManage
            ? 'Record who won 1st, 2nd and 3rd place.'
            : 'The places recorded by the organisers.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((g) => (
          <WinnersGroup key={g.key} groupKey={g.key} eventId={eventId} title={g.title} regs={g.regs} canManage={canManage} />
        ))}
      </CardContent>
    </Card>
  );
}
