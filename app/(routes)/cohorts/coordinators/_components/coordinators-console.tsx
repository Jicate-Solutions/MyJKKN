'use client';

// Cohort Coordinators console — the whole screen, grouped by programme.
//
// Shape follows the closest existing twin, the induction coordinators panel
// (app/(routes)/events/induction/_components/coordinators-panel.tsx): a
// searchable person picker, a badge per appointee, a remove affordance. It is
// widened here because this console covers SIX programmes rather than one, and
// because an appointment can be programme-wide or pinned to a single cohort —
// a distinction the badges have to make obvious, since it is the answer to
// "why do I have access to this?".
//
// The person picker is the shared components/cohort-core/member-picker.tsx.
// There is deliberately no free-text identifier field anywhere on this page: a
// raw-UUID picker is what blocked Learners Council rotation for weeks.
//
// Empty states are the honest reality of 2026-08-02, not edge cases:
//   • foundations / cdc / trainer have ZERO cohorts
//   • all three School of Influence batches have ZERO members
//   • every one of the five live cohorts has ZERO coordinators — which is the
//     whole reason this page exists.

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Globe2,
  Loader2,
  Pin,
  RotateCcw,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CohortCoordinatorService,
  COHORT_PROGRAMME_LABELS,
  type CohortProgrammeKind,
  type CoordinatorAppointment,
  type CoordinatorsOverview,
  type ProgrammeOverview,
} from '@/lib/services/cohort-core/cohort-coordinator-service';

interface PendingAppointment {
  programmeKind: CohortProgrammeKind;
  cohortId: string | null;
  cohortName: string | null;
}

interface PendingRemoval {
  appointmentId: string;
  name: string;
  where: string;
}

export function CoordinatorsConsole() {
  const [overview, setOverview] = useState<CoordinatorsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAppointment, setPendingAppointment] = useState<PendingAppointment | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setOverview(await CohortCoordinatorService.overview());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const appoint = async (member: MemberPickerResult) => {
    if (!pendingAppointment) return;
    setBusy(true);
    try {
      await CohortCoordinatorService.appoint({
        userId: member.id,
        programmeKind: pendingAppointment.programmeKind,
        cohortId: pendingAppointment.cohortId,
      });
      toast.success(
        pendingAppointment.cohortId
          ? `${member.full_name ?? 'They'} now coordinate ${pendingAppointment.cohortName}.`
          : `${member.full_name ?? 'They'} now coordinate ${
              COHORT_PROGRAMME_LABELS[pendingAppointment.programmeKind]
            } — every cohort in it.`
      );
      setPendingAppointment(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    setBusy(true);
    try {
      await CohortCoordinatorService.remove(pendingRemoval.appointmentId);
      toast.success(`${pendingRemoval.name} no longer coordinates ${pendingRemoval.where}.`);
      setPendingRemoval(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reinstate = async (appointmentId: string, name: string) => {
    setBusy(true);
    try {
      await CohortCoordinatorService.reinstate(appointmentId);
      toast.success(`${name} has been re-appointed.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Could not load coordinators
          </CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const programmes = overview?.programmes ?? [];
  const totalCoordinators = programmes.reduce(
    (sum, p) =>
      sum +
      p.programme_coordinators.length +
      p.cohorts.reduce((n, c) => n + c.coordinators.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-primary" /> Cohort Coordinators
          </CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">
              Every cohort in MyJKKN, and who runs it. Appointing someone to a{' '}
              <strong>programme</strong> puts them over all of its cohorts, including ones
              created later. Pin them to a single cohort instead when they should run just
              that one.
            </span>
            <span className="block">
              Only super administrators can appoint or remove. When someone stops being
              active at JKKN their appointments end automatically — and the reason is
              recorded and shown below, so nobody has to guess why their access changed.
            </span>
            {totalCoordinators === 0 && (
              <span className="block font-medium text-foreground">
                Nobody coordinates anything yet — no appointment has ever been made.
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {programmes.map((programme) => (
        <ProgrammeCard
          key={programme.kind}
          programme={programme}
          onAppoint={setPendingAppointment}
          onRemove={setPendingRemoval}
          onReinstate={reinstate}
          busy={busy}
        />
      ))}

      {/* Appoint — searchable person picker, never a raw identifier field. */}
      <Dialog
        open={pendingAppointment !== null}
        onOpenChange={(open) => !open && setPendingAppointment(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAppointment?.cohortId
                ? `Appoint a coordinator — ${pendingAppointment.cohortName}`
                : `Appoint a coordinator — ${
                    pendingAppointment
                      ? COHORT_PROGRAMME_LABELS[pendingAppointment.programmeKind]
                      : ''
                  }`}
            </DialogTitle>
            <DialogDescription>
              {pendingAppointment?.cohortId
                ? 'They will run this one cohort only. Everything else in the programme is unaffected.'
                : 'They will run every cohort in this programme, including any created later.'}
            </DialogDescription>
          </DialogHeader>
          <MemberPicker
            onSelect={(m) => void appoint(m)}
            disabled={busy}
            placeholder="Search by name or email…"
          />
        </DialogContent>
      </Dialog>

      {/* Remove — always confirmed. */}
      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemoval?.name} as coordinator?</AlertDialogTitle>
            <AlertDialogDescription>
              They will stop coordinating {pendingRemoval?.where}. The removal is recorded
              with who did it and when, and it can be undone in one click from the
              &ldquo;No longer coordinating&rdquo; list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep them</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void confirmRemoval()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CoordinatorBadge({
  coordinator,
  scope,
  where,
  onRemove,
}: {
  coordinator: CoordinatorAppointment;
  scope: 'programme' | 'cohort';
  where: string;
  onRemove: (r: PendingRemoval) => void;
}) {
  const name = coordinator.full_name ?? coordinator.email ?? 'Unnamed user';
  return (
    <Badge variant={scope === 'programme' ? 'default' : 'secondary'} className="gap-1 pr-1">
      {scope === 'programme' ? (
        <Globe2 className="h-3 w-3" aria-hidden />
      ) : (
        <Pin className="h-3 w-3" aria-hidden />
      )}
      <span className="truncate">{name}</span>
      <span className="opacity-70">
        {scope === 'programme' ? '· whole programme' : '· this cohort only'}
      </span>
      <button
        type="button"
        aria-label={`Remove ${name} from ${where}`}
        onClick={() =>
          onRemove({ appointmentId: coordinator.appointment_id, name, where })
        }
        className="ml-0.5 rounded hover:text-destructive"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function ProgrammeCard({
  programme,
  onAppoint,
  onRemove,
  onReinstate,
  busy,
}: {
  programme: ProgrammeOverview;
  onAppoint: (p: PendingAppointment) => void;
  onRemove: (r: PendingRemoval) => void;
  onReinstate: (appointmentId: string, name: string) => void;
  busy: boolean;
}) {
  const label = COHORT_PROGRAMME_LABELS[programme.kind] ?? programme.kind;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>
              {programme.cohorts.length === 0
                ? 'No cohorts have been created for this programme yet. You can still appoint a coordinator now — they will cover every cohort created later.'
                : `${programme.cohorts.length} cohort${programme.cohorts.length === 1 ? '' : 's'}.`}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              onAppoint({ programmeKind: programme.kind, cohortId: null, cohortName: null })
            }
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Appoint for the whole programme
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Programme-wide appointments */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Globe2 className="h-4 w-4 text-muted-foreground" /> Runs the whole programme
          </div>
          {programme.programme_coordinators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is in charge of {label} as a whole.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {programme.programme_coordinators.map((c) => (
                <CoordinatorBadge
                  key={c.appointment_id}
                  coordinator={c}
                  scope="programme"
                  where={label}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Per-cohort */}
        {programme.cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to list here yet — {label} has no cohorts.
          </p>
        ) : (
          <div className="space-y-2">
            {programme.cohorts.map((cohort) => (
              <div key={cohort.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{cohort.name}</span>
                      <Badge variant="outline" className="capitalize">
                        {cohort.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {cohort.member_count === 0
                        ? 'No members yet'
                        : `${cohort.member_count} member${cohort.member_count === 1 ? '' : 's'}`}
                      {cohort.academic_year ? ` · ${cohort.academic_year}` : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      onAppoint({
                        programmeKind: programme.kind,
                        cohortId: cohort.id,
                        cohortName: cohort.name,
                      })
                    }
                  >
                    <Pin className="mr-1 h-3.5 w-3.5" /> Pin someone to this cohort
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {programme.programme_coordinators.map((c) => (
                    <CoordinatorBadge
                      key={`prog-${c.appointment_id}`}
                      coordinator={c}
                      scope="programme"
                      where={label}
                      onRemove={onRemove}
                    />
                  ))}
                  {cohort.coordinators.map((c) => (
                    <CoordinatorBadge
                      key={c.appointment_id}
                      coordinator={c}
                      scope="cohort"
                      where={cohort.name}
                      onRemove={onRemove}
                    />
                  ))}
                  {programme.programme_coordinators.length === 0 &&
                    cohort.coordinators.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        Nobody is in charge of this cohort.
                      </span>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Why someone lost access — and the one-click way back. */}
        {programme.removed.length > 0 && (
          <div className="rounded-lg border border-dashed p-3">
            <div className="mb-2 text-sm font-medium">No longer coordinating</div>
            <ul className="space-y-2">
              {programme.removed.map((r) => {
                const name = r.full_name ?? r.email ?? 'Unnamed user';
                return (
                  <li
                    key={r.appointment_id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">{name}</strong>{' '}
                      {r.automatic ? 'was removed automatically' : 'was removed'} —{' '}
                      {r.removal_reason ?? 'no reason recorded'}
                      {r.evidence_field
                        ? ` (evidence: ${r.evidence_field} = ${r.evidence_value ?? 'unknown'})`
                        : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReinstate(r.appointment_id, name)}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Re-appoint
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
