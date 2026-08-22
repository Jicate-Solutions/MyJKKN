'use client';

// app/(routes)/meetings/availability/_components/schedules-card.tsx
//
// "My sets of working hours" — lets a host keep MORE THAN ONE set of hours
// (e.g. normal hours plus a separate set for online meetings) and choose which
// one the editor below is editing.
//
// Every host at JKKN had exactly one set until now, because getMySchedule()
// was hard-wired to the default schedule and nothing in the app could create a
// second one. The database and the slot engine already supported it —
// meeting_types.schedule_id resolves "the meeting kind's own schedule, else
// the host's default" — so this card is the missing half.
//
// Director rulings this surfaces:
//   * A NEW set starts as a copy of the host's normal hours, so they trim
//     rather than face a blank week.
//   * Deleting a set that meeting kinds use WARNS FIRST, naming the count.
//     Those kinds simply move back to the host's normal hours.
//
// Pattern mirrors delegates-card.tsx / integration-prefs-card.tsx: client
// mutation through a server action + sonner toast + useTransition. Switching
// which set is being edited is a ?schedule= navigation so the server component
// re-renders the editor for that set.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  countTypesUsingSchedule,
  createSchedule,
  deleteSchedule,
  renameSchedule,
  type HostScheduleSummary,
} from '../actions';

/** "Three of your meeting kinds…" reads better than "3 of your meeting kinds…". */
const SMALL_NUMBERS = [
  'None', 'One', 'Two', 'Three', 'Four', 'Five',
  'Six', 'Seven', 'Eight', 'Nine', 'Ten',
];
function spellCount(n: number): string {
  return SMALL_NUMBERS[n] ?? String(n);
}

interface SchedulesCardProps {
  initial: HostScheduleSummary[];
  /** The set the editor below is currently editing. */
  selectedId: string;
}

export function SchedulesCard({ initial, selectedId }: SchedulesCardProps) {
  const router = useRouter();
  const [schedules, setSchedules] = useState<HostScheduleSummary[]>(initial);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** The set queued for deletion, with the meeting-kind count to warn about. */
  const [pendingDelete, setPendingDelete] = useState<{
    schedule: HostScheduleSummary;
    affected: number;
  } | null>(null);

  const handleAdd = () => {
    const wanted = newName.trim();
    if (!wanted) {
      toast.error('Please give this set of working hours a name.');
      return;
    }
    setBusyId(null);
    startTransition(async () => {
      const res = await createSchedule(wanted);
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Could not add that set of working hours.');
        return;
      }
      setSchedules((prev) => [...prev, res.data!]);
      setNewName('');
      setAdding(false);
      toast.success(`“${res.data.name}” added, copied from your normal hours.`);
      router.refresh();
    });
  };

  const handleRename = (schedule: HostScheduleSummary) => {
    const wanted = renameValue.trim();
    if (!wanted) {
      toast.error('Please give this set of working hours a name.');
      return;
    }
    if (wanted === schedule.name) {
      setRenamingId(null);
      return;
    }
    setBusyId(schedule.id);
    startTransition(async () => {
      const res = await renameSchedule(schedule.id, wanted);
      setBusyId(null);
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Could not rename that set of working hours.');
        return;
      }
      const renamed = res.data;
      setSchedules((prev) =>
        prev.map((s) => (s.id === renamed.id ? { ...s, name: renamed.name } : s)),
      );
      setRenamingId(null);
      toast.success('Renamed.');
      router.refresh();
    });
  };

  /** Ruling 3: read the affected count FIRST, then warn, then delete. */
  const askToDelete = (schedule: HostScheduleSummary) => {
    setBusyId(schedule.id);
    startTransition(async () => {
      const res = await countTypesUsingSchedule(schedule.id);
      setBusyId(null);
      if (!res.success) {
        toast.error(res.error ?? 'Could not check which meeting kinds use these hours.');
        return;
      }
      setPendingDelete({ schedule, affected: res.data ?? 0 });
    });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { schedule } = pendingDelete;
    setPendingDelete(null);
    setBusyId(schedule.id);
    startTransition(async () => {
      const res = await deleteSchedule(schedule.id);
      setBusyId(null);
      if (!res.success) {
        toast.error(res.error ?? 'Could not remove that set of working hours.');
        return;
      }
      setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
      const moved = res.data?.affectedMeetingTypes ?? 0;
      toast.success(
        moved > 0
          ? `“${schedule.name}” removed. ${spellCount(moved)} meeting ${
              moved === 1 ? 'kind' : 'kinds'
            } moved to your normal working hours.`
          : `“${schedule.name}” removed.`,
      );
      // The editor below may have been editing the set that just went away.
      router.push('/meetings/availability');
      router.refresh();
    });
  };

  const selectSchedule = (id: string) => {
    if (id === selectedId) return;
    startTransition(() => {
      router.push(`/meetings/availability?schedule=${encodeURIComponent(id)}`);
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" aria-hidden />
            My sets of working hours
          </CardTitle>
          <CardDescription>
            Most people need just one. Add another if some meetings should only be offered
            at different times — for example online meetings in the evening. Each meeting
            kind can point at whichever set you choose; anything you don&apos;t point
            somewhere else uses your normal hours.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <ul className="divide-y rounded-md border">
            {schedules.map((s) => {
              const isSelected = s.id === selectedId;
              const isBusy = busyId === s.id && isPending;
              return (
                <li
                  key={s.id}
                  className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${
                    isSelected ? 'bg-accent/40' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {renamingId === s.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleRename(s);
                            }
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          disabled={isPending}
                          className="h-8 max-w-xs"
                          aria-label={`New name for ${s.name}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleRename(s)}
                          disabled={isPending}
                          aria-label="Save name"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setRenamingId(null)}
                          disabled={isPending}
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          {s.isDefault ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Normal hours
                            </Badge>
                          ) : null}
                          {isSelected ? (
                            <Badge variant="outline" className="text-[10px]">
                              Editing below
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.windowCount === 0
                            ? 'No hours set — nobody can book on this set'
                            : `${s.windowCount} weekly time ${
                                s.windowCount === 1 ? 'slot' : 'slots'
                              }`}
                          {' · '}
                          {s.meetingTypeCount === 0
                            ? 'no meeting kinds use it'
                            : `${s.meetingTypeCount} meeting ${
                                s.meetingTypeCount === 1 ? 'kind uses' : 'kinds use'
                              } it`}
                        </p>
                      </>
                    )}
                  </div>

                  {renamingId === s.id ? null : (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant={isSelected ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => selectSchedule(s.id)}
                        disabled={isPending || isSelected}
                      >
                        {isSelected ? 'Editing' : 'Edit these hours'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setRenamingId(s.id);
                          setRenameValue(s.name);
                        }}
                        disabled={isPending}
                        aria-label={`Rename ${s.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => askToDelete(s)}
                        // The normal hours must always exist — every meeting kind
                        // with no set of its own falls back to them.
                        disabled={isPending || s.isDefault}
                        title={
                          s.isDefault
                            ? 'Your normal working hours cannot be deleted'
                            : undefined
                        }
                        aria-label={`Delete ${s.name}`}
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {adding ? (
            <div className="space-y-2">
              <Label htmlFor="new-schedule-name" className="text-xs">
                Name this set of hours
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="new-schedule-name"
                  placeholder="e.g. Evening online meetings"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAdd();
                    }
                    if (e.key === 'Escape') setAdding(false);
                  }}
                  disabled={isPending}
                  className="sm:flex-1"
                />
                <Button onClick={handleAdd} disabled={isPending} size="sm">
                  {isPending && busyId === null ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdding(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                It starts as a copy of your normal working hours, so you only have to trim
                it rather than start from an empty week.
              </p>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Add another set of hours
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.schedule.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.affected > 0
                ? `${spellCount(pendingDelete.affected)} of your meeting ${
                    pendingDelete.affected === 1 ? 'kind uses' : 'kinds use'
                  } these hours — ${
                    pendingDelete.affected === 1 ? 'it' : 'they'
                  } will move to your normal working hours. Nothing already booked changes.`
                : 'No meeting kinds use these hours, so nothing else changes.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
