'use client';

// Heats (group rounds) for athletics-style divisions — Athletics, Shot Put,
// Long Jump, Swimming. 1-vs-1 fixtures make no sense there: 5-10 athletes
// compete in the same round and are ranked by position / mark.
// The organizer either auto-splits the entries by "athletes per heat" or builds
// heats by hand (add empty heat, add / move / remove athletes), then records
// position + mark per athlete and finalizes to award the top 3.

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarClock, Loader2, Medal, Plus, RefreshCw, Trash2, UsersRound, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TournamentEntry, TournamentHeat, TournamentHeatAthlete } from '@/types/tournament';
import {
  useAddHeat,
  useDeleteHeat,
  useFinalizeHeats,
  useGenerateHeats,
  useUpdateHeat,
} from '@/hooks/events/use-tournament-fixtures';

/** "11.82s" → 11.82, "7.45 m" → 7.45, "1:02.5" → 62.5. null when there is no number. */
export function parseMark(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const clock = s.match(/^(\d+):(\d+(?:\.\d+)?)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const num = s.match(/-?\d+(?:\.\d+)?/);
  return num ? Number(num[0]) : null;
}

type RowEdit = { position: string; mark: string; status: TournamentHeatAthlete['result_status'] };

const STATUS_LABEL: Record<TournamentHeatAthlete['result_status'], string> = {
  ok: 'Finished',
  dns: 'DNS (did not start)',
  dnf: 'DNF (did not finish)',
  dq: 'Disqualified',
};

function ScheduleHeatDialog({
  eventId,
  heat,
  open,
  onOpenChange,
}: {
  eventId: string;
  heat: TournamentHeat;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const update = useUpdateHeat(eventId);
  const [when, setWhen] = useState('');
  const [venue, setVenue] = useState(heat.venue_text ?? '');

  async function submit() {
    if (!when) return;
    await update.mutateAsync({
      heatId: heat.id,
      dto: { scheduled_at: new Date(when).toISOString(), venue_text: venue },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule {heat.label ?? `Heat ${heat.heat_no}`}</DialogTitle>
          <DialogDescription>{heat.athletes.length} athletes</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Date &amp; time</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Venue / track</Label>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Main ground" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending || !when}>
            {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeatCard({
  eventId,
  heat,
  unassigned,
  elsewhere,
  canManage,
}: {
  eventId: string;
  heat: TournamentHeat;
  unassigned: TournamentEntry[];
  /** entries sitting in a different heat — pickable too (adding MOVES them here). */
  elsewhere: TournamentEntry[];
  canManage: boolean;
}) {
  const update = useUpdateHeat(eventId);
  const remove = useDeleteHeat(eventId);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [scheduling, setScheduling] = useState(false);
  const [pick, setPick] = useState('');

  const rowOf = (a: TournamentHeatAthlete): RowEdit =>
    edits[a.id] ?? {
      position: a.position != null ? String(a.position) : '',
      mark: a.mark ?? '',
      status: a.result_status,
    };
  const setRow = (a: TournamentHeatAthlete, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({ ...prev, [a.id]: { ...rowOf(a), ...patch } }));

  const dirty = Object.keys(edits).length > 0;

  async function saveResults() {
    await update.mutateAsync({
      heatId: heat.id,
      dto: {
        results: heat.athletes.map((a) => {
          const r = rowOf(a);
          return {
            heat_entry_id: a.id,
            position: r.position ? Number(r.position) : null,
            mark: r.mark,
            mark_value: parseMark(r.mark),
            result_status: r.status,
          };
        }),
      },
    });
    setEdits({});
  }

  async function addAthlete() {
    if (!pick) return;
    await update.mutateAsync({ heatId: heat.id, dto: { add_entry_ids: [pick] } });
    setPick('');
  }

  const statusTone =
    heat.status === 'completed'
      ? 'bg-emerald-50 text-emerald-700'
      : heat.status === 'scheduled'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-gray-100 text-gray-600';

  return (
    <div className="rounded-md border p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {heat.label ?? `Heat ${heat.heat_no}`}
        </p>
        <Badge className={`${statusTone} text-[10px]`}>{heat.status}</Badge>
        <span className="text-[11px] text-muted-foreground">{heat.athletes.length} athletes</span>
        {heat.scheduled_at && (
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(heat.scheduled_at), 'd MMM, h:mma')}
            {heat.venue_text ? ` · ${heat.venue_text}` : ''}
          </span>
        )}
        {canManage && (
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7" title="Schedule" onClick={() => setScheduling(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-destructive"
              title="Delete heat (athletes become unassigned)"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm('Delete this heat? Its athletes go back to unassigned.')) remove.mutate(heat.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {heat.athletes.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">No athletes in this heat yet.</p>
      ) : (
        <div className="divide-y">
          {heat.athletes.map((a) => {
            const r = rowOf(a);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="w-6 text-center text-[11px] text-muted-foreground">{a.lane_no ?? '–'}</span>
                <span className="min-w-0 flex-1 truncate">
                  {a.entry_name ?? 'Unknown'}
                  {a.institution_name && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{a.institution_name}</span>
                  )}
                </span>
                {canManage ? (
                  <>
                    <Input
                      className="h-7 w-16"
                      type="number"
                      min={1}
                      placeholder="Pos"
                      value={r.position}
                      onChange={(e) => setRow(a, { position: e.target.value })}
                    />
                    <Input
                      className="h-7 w-24"
                      placeholder="Time / dist."
                      value={r.mark}
                      onChange={(e) => setRow(a, { mark: e.target.value })}
                    />
                    <Select value={r.status} onValueChange={(v) => setRow(a, { status: v as RowEdit['status'] })}>
                      <SelectTrigger className="h-7 w-[150px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5"
                      title="Remove from heat"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ heatId: heat.id, dto: { remove_entry_ids: [a.entry_id] } })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {a.result_status !== 'ok'
                      ? a.result_status.toUpperCase()
                      : [a.position != null ? `#${a.position}` : null, a.mark].filter(Boolean).join(' · ') || '—'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[260px]">
              <SelectValue placeholder="Add athlete…" />
            </SelectTrigger>
            <SelectContent>
              {unassigned.length === 0 && elsewhere.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No other entries.</div>
              )}
              {unassigned.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.entry_name}
                </SelectItem>
              ))}
              {elsewhere.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.entry_name} (move here)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" disabled={!pick || update.isPending} onClick={addAthlete}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
          <Button
            size="sm"
            className="ml-auto h-8"
            disabled={!dirty || update.isPending || heat.athletes.length === 0}
            onClick={saveResults}
          >
            {update.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save results
          </Button>
        </div>
      )}

      {scheduling && (
        <ScheduleHeatDialog eventId={eventId} heat={heat} open onOpenChange={(v) => !v && setScheduling(false)} />
      )}
    </div>
  );
}

export function DivisionHeats({
  eventId,
  divisionId,
  heats,
  entries,
  canManage = true,
}: {
  eventId: string;
  divisionId: string;
  /** Heats of THIS division, ordered by heat_no. */
  heats: TournamentHeat[];
  /** Entries of THIS division (any status — withdrawn ones are filtered here). */
  entries: TournamentEntry[];
  canManage?: boolean;
}) {
  const generate = useGenerateHeats(eventId);
  const addHeat = useAddHeat(eventId);
  const finalize = useFinalizeHeats(eventId);
  const [heatSize, setHeatSize] = useState('8');

  const active = useMemo(
    () => entries.filter((e) => e.status === 'registered' || e.status === 'confirmed'),
    [entries],
  );
  const placedIds = useMemo(
    () => new Set(heats.flatMap((h) => h.athletes.map((a) => a.entry_id))),
    [heats],
  );
  const unassigned = active.filter((e) => !placedIds.has(e.id));
  const size = Math.floor(Number(heatSize));
  const sizeOk = Number.isFinite(size) && size >= 1 && size <= 100;
  const hasResults = heats.some((h) => h.athletes.some((a) => a.position != null || a.mark_value != null));
  const busy = generate.isPending || addHeat.isPending;

  const sizeControl = (
    <div className="flex items-center gap-1.5">
      <Label className="whitespace-nowrap text-xs">Athletes per heat</Label>
      <Input
        className="h-8 w-16"
        type="number"
        min={1}
        max={100}
        value={heatSize}
        onChange={(e) => setHeatSize(e.target.value)}
      />
    </div>
  );

  if (heats.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed p-3 text-center">
        <p className="mb-2 text-xs text-muted-foreground">
          No heats yet ({active.length} {active.length === 1 ? 'entry' : 'entries'}).
        </p>
        {canManage && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {sizeControl}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || active.length < 1 || !sizeOk}
              onClick={() => generate.mutate({ divisionId, heatSize: size })}
            >
              {generate.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <UsersRound className="mr-1 h-3.5 w-3.5" />
              )}
              Generate heats
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => addHeat.mutate(divisionId)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add heat manually
            </Button>
          </div>
        )}
        {canManage && active.length < 1 && (
          <p className="mt-1 text-[11px] text-muted-foreground">Need at least 1 entry.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <UsersRound className="h-3.5 w-3.5" /> Heats
          {unassigned.length > 0 && (
            <Badge className="bg-amber-50 text-[10px] text-amber-700">{unassigned.length} unassigned</Badge>
          )}
        </span>
        {canManage && (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => addHeat.mutate(divisionId)}
            >
              <Plus className="mr-1 h-3 w-3" /> Add heat
            </Button>
            {hasResults && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={finalize.isPending}
                title="Rank everyone, record final places and award gold/silver/bronze"
                onClick={() => {
                  if (confirm('Finalize this division and write achievements to the winners’ athlete profiles?')) {
                    finalize.mutate(divisionId);
                  }
                }}
              >
                {finalize.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Medal className="mr-1 h-3 w-3" />
                )}
                Finalize &amp; Award
              </Button>
            )}
            {sizeControl}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={busy || !sizeOk}
              onClick={() => {
                if (confirm('Regenerate heats? This deletes the current heats and any results entered.')) {
                  generate.mutate({ divisionId, heatSize: size, regenerate: true });
                }
              }}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Regenerate
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {heats.map((h) => (
          <HeatCard
            key={h.id}
            eventId={eventId}
            heat={h}
            canManage={canManage}
            unassigned={unassigned}
            elsewhere={active.filter((e) => placedIds.has(e.id) && !h.athletes.some((a) => a.entry_id === e.id))}
          />
        ))}
      </div>
    </div>
  );
}
