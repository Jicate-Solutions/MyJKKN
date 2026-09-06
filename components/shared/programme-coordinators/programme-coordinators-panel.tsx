'use client';

// components/shared/programme-coordinators/programme-coordinators-panel.tsx
//
// ONE coordinators screen for EVERY programme.
//
// The platform already had two copies of this UI (induction's coordinators panel
// and the per-programme roster controls), so this is written once, in
// components/shared, and takes the programme as a prop. School of Influence is
// its first consumer; the next programme adds a page, not a component.
//
// It COPIES THE SHAPE of induction's coordinators section — search a person,
// appoint, remove, and show nothing at all to someone who may not manage
// coordinators — but NOT the plumbing of the panel it was modelled on. That one
// (the retired /events/induction list-page panel) wrote a row into user_roles and
// handed out a global role; it was removed on 2026-08-18 in favour of induction's
// per-event section. This panel calls the cohort_coordinator RPCs, which record
// one appointment scoped to a programme, or to a single batch, and grant nothing
// global.
//
// Two rules run through the whole file (CLAUDE.md rule 27):
//   • A refusal is a sentence naming who to ask. Never a redirect.
//   • Absence is stated out loud. "No coordinator yet" and "you cannot see this"
//     are different screens, and a batch with nobody appointed is named.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, UserCog, UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'sonner';

import { MemberPicker, type MemberPickerResult } from '@/components/cohort-core/member-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { programmeLabel } from '@/lib/services/cohorts/programme-coordinator-constants';
import {
  ProgrammeCoordinatorService,
  isCoordinatorAccessDenied,
  type ProgrammeCohort,
  type ProgrammeCoordinator,
  type ProgrammeCoordinatorsView,
} from '@/lib/services/cohorts/programme-coordinator-service';

/** The Select value that means "not one batch — the whole programme". */
const WHOLE_PROGRAMME = '__whole_programme__';

const NO_ACCESS_MESSAGE =
  'You cannot appoint coordinators here — ask the COO. Appointing and removing ' +
  'programme coordinators is checked in the database, so this screen shows nothing ' +
  'rather than a half-list you could act on.';

function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? 'Something went wrong.';
}

function whenText(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function personText(row: ProgrammeCoordinator): string {
  return row.full_name ?? row.email ?? 'Unnamed person';
}

/** Explicit refusal — never a redirect, never an empty list (rule 27). */
function AccessPanel({ message }: { message: string }) {
  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> You do not have access
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export interface ProgrammeCoordinatorsPanelProps {
  /** Which programme this screen manages, e.g. 'school_of_influence'. */
  programmeKind: string;
  /** Pre-select one batch in the appoint form. Leave unset for whole programme. */
  cohortId?: string | null;
  /**
   * Batches to offer. Leave unset and the panel uses the batches the overview
   * itself reports for this programme, which is the honest list.
   */
  cohorts?: ProgrammeCohort[];
  /** Override the heading, for a programme that calls this something else. */
  title?: string;
  description?: string;
}

export function ProgrammeCoordinatorsPanel({
  programmeKind,
  cohortId = null,
  cohorts,
  title,
  description,
}: ProgrammeCoordinatorsPanelProps) {
  const programme = programmeLabel(programmeKind);

  const [view, setView] = useState<ProgrammeCoordinatorsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);

  const [picked, setPicked] = useState<MemberPickerResult | null>(null);
  const [scope, setScope] = useState<string>(cohortId ?? WHOLE_PROGRAMME);
  const [note, setNote] = useState('');
  const [appointing, setAppointing] = useState(false);

  const [removing, setRemoving] = useState<ProgrammeCoordinator | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDenied(null);
    try {
      setView(await ProgrammeCoordinatorService.forProgramme(programmeKind));
    } catch (error) {
      if (isCoordinatorAccessDenied(error)) setDenied(NO_ACCESS_MESSAGE);
      else toast.error(messageOf(error));
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [programmeKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const batches = useMemo<ProgrammeCohort[]>(
    () => cohorts ?? view?.cohorts ?? [],
    [cohorts, view]
  );

  /** Every appointment in force, whole-programme ones first. */
  const active = useMemo<ProgrammeCoordinator[]>(() => {
    if (!view) return [];
    return [
      ...view.programme_coordinators,
      ...view.cohorts.flatMap((c) => c.coordinators),
    ];
  }, [view]);

  const batchNameOf = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return batches.find((b) => b.id === id)?.name ?? 'One batch';
    },
    [batches]
  );

  const uncovered = useMemo(() => {
    if (!view || view.programme_coordinators.length > 0) return [];
    return view.cohorts.filter((c) => c.coordinators.length === 0);
  }, [view]);

  const handleAppoint = useCallback(async () => {
    if (!picked) return;
    setAppointing(true);
    try {
      const appointmentId = await ProgrammeCoordinatorService.appoint({
        userId: picked.id,
        programmeKind,
        cohortId: scope === WHOLE_PROGRAMME ? null : scope,
        note,
      });
      toast.success(
        `${picked.full_name ?? picked.email ?? 'That person'} is now a coordinator.`
      );
      if (appointmentId) {
        await ProgrammeCoordinatorService.announce({ appointmentId, action: 'appointed' });
      }
      setPicked(null);
      setNote('');
      await refresh();
    } catch (error) {
      if (isCoordinatorAccessDenied(error)) setDenied(NO_ACCESS_MESSAGE);
      else toast.error(messageOf(error));
    } finally {
      setAppointing(false);
    }
  }, [note, picked, programmeKind, refresh, scope]);

  const handleRemove = useCallback(async () => {
    if (!removing || reason.trim().length === 0) return;
    setBusyId(removing.id);
    try {
      // The RPC answers false when it changed nothing — an appointment already
      // removed, or one this person may not touch. Saying "removed" on a false
      // would be a lie on screen AND would send the person a message about
      // something that did not happen.
      const done = await ProgrammeCoordinatorService.remove({
        appointmentId: removing.id,
        reason,
      });
      if (!done) {
        toast.error(
          `${personText(removing)} was not removed. Reload the screen — someone may have changed this already.`
        );
        await refresh();
        return;
      }
      toast.success(`${personText(removing)} is no longer a coordinator.`);
      await ProgrammeCoordinatorService.announce({
        appointmentId: removing.id,
        action: 'removed',
      });
      setRemoving(null);
      setReason('');
      await refresh();
    } catch (error) {
      if (isCoordinatorAccessDenied(error)) setDenied(NO_ACCESS_MESSAGE);
      else toast.error(messageOf(error));
    } finally {
      setBusyId(null);
    }
  }, [refresh, removing, reason]);

  const handleReinstate = useCallback(
    async (row: ProgrammeCoordinator) => {
      setBusyId(row.id);
      try {
        // Same as removal: false means nothing changed, so nothing is claimed.
        const done = await ProgrammeCoordinatorService.reinstate(row.id);
        if (!done) {
          toast.error(
            `${personText(row)} was not put back. Reload the screen — someone may have changed this already.`
          );
          await refresh();
          return;
        }
        toast.success(`${personText(row)} is a coordinator again.`);
        await ProgrammeCoordinatorService.announce({
          appointmentId: row.id,
          action: 'appointed',
        });
        await refresh();
      } catch (error) {
        if (isCoordinatorAccessDenied(error)) setDenied(NO_ACCESS_MESSAGE);
        else toast.error(messageOf(error));
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  if (denied) return <AccessPanel message={denied} />;
  if (loading && !view) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-primary" /> {title ?? `${programme} coordinators`}
          </CardTitle>
          <CardDescription>
            {description ??
              `A coordinator runs ${programme} day to day — they read the applications and decide who gets a place. Appoint someone for the whole programme, or for one batch only.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {active.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No coordinator is appointed for {programme} yet. Until someone is
              appointed, nobody is set to read the applications.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coordinator</TableHead>
                    <TableHead>Covers</TableHead>
                    <TableHead>Appointed by</TableHead>
                    <TableHead>Appointed on</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{personText(row)}</div>
                        {row.email && (
                          <div className="text-xs text-muted-foreground">{row.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.cohort_id ? (
                          <Badge variant="secondary">{batchNameOf(row.cohort_id)}</Badge>
                        ) : (
                          <Badge>Whole programme</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.appointed_by_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">{whenText(row.appointed_at)}</TableCell>
                      <TableCell className="max-w-[16rem] text-sm text-muted-foreground">
                        {row.note ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          onClick={() => {
                            setRemoving(row);
                            setReason('');
                          }}
                        >
                          {busyId === row.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserMinus className="mr-1 h-3.5 w-3.5" />
                          )}
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {uncovered.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Batches with nobody appointed:{' '}
              {uncovered.map((b) => b.name ?? 'Unnamed batch').join(', ')}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4 text-primary" /> Appoint a coordinator
          </CardTitle>
          <CardDescription>
            Search for the person by name or email. Only people who already have a
            MyJKKN account can be appointed, and the database has the final say on
            who is allowed to take this on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Person</Label>
            <MemberPicker
              value={picked}
              onSelect={setPicked}
              onClear={() => setPicked(null)}
              excludeIds={active.map((c) => c.user_id).filter((id): id is string => !!id)}
              placeholder="Search by name or email…"
              disabled={appointing}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coordinator-scope">Covers</Label>
              <Select value={scope} onValueChange={setScope} disabled={appointing}>
                <SelectTrigger id="coordinator-scope">
                  <SelectValue placeholder="Whole programme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_PROGRAMME}>Whole programme</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name ?? 'Unnamed batch'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coordinator-note">Note (optional)</Label>
              <Input
                id="coordinator-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this person, in a few words"
                disabled={appointing}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleAppoint} disabled={!picked || appointing}>
              {appointing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-1.5 h-4 w-4" />
              )}
              Appoint
            </Button>
          </div>
        </CardContent>
      </Card>

      {view && view.removed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past coordinators</CardTitle>
            <CardDescription>
              People who used to run {programme}. Put someone back if they were
              removed by mistake.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {view.removed.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5"
              >
                <div className="min-w-0">
                  <div className="font-medium">{personText(row)}</div>
                  <div className="text-xs text-muted-foreground">
                    Removed {whenText(row.removed_at)}
                    {row.removed_by_name ? ` by ${row.removed_by_name}` : ''}
                    {row.removal_reason ? ` — ${row.removal_reason}` : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id}
                  onClick={() => handleReinstate(row)}
                >
                  {busyId === row.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  )}
                  Put back
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Remove {removing ? personText(removing) : 'this coordinator'}
            </DialogTitle>
            <DialogDescription>
              Say why in a few words. The reason is kept on the record and is sent to
              the person, so write something they can read. A removal without a reason
              is refused.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="removal-reason">Reason</Label>
            <Textarea
              id="removal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Handing the batch over to someone else"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRemoving(null);
                setReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={reason.trim().length === 0 || busyId !== null}
            >
              {busyId !== null ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <UserMinus className="mr-1.5 h-4 w-4" />
              )}
              Remove coordinator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProgrammeCoordinatorsPanel;
