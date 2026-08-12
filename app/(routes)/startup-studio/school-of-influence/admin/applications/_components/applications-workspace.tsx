'use client';

// School of Influence — the coordinator review & accept queue (spec §7 S5).
//
// D3  Applying is not enrolling. This screen is where somebody decides.
// D2  Who names the batch is read at runtime from soi.batch_choice_mode. Under
//     'staff_assign' the reviewer picks a batch here; under 'participant_choose'
//     the applicant already picked and the reviewer only confirms it. This file
//     never assumes either mode — it renders whichever the database reports.
// D5  A batch that filled between apply and accept refuses with a sentence
//     naming the batches that still have room. Nothing over-fills silently.
// A3  A coordinator MAY go over soi.batch_capacity — but only from a separate,
//     deliberate confirmation, and the database records who did it and how full
//     the batch already was. Full batches are therefore listed and selectable
//     rather than hidden: filtering them out did not prevent an over-fill, it
//     only made the decision unreachable from this screen.
// A7  Before that confirmation, the coordinator is shown how many people are
//     already on the waiting list. Counted by the database (a browser-side count
//     would need cohort.view and would read 0). It WARNS; it never blocks.
// D12 A rejection needs the coordinator's actual words, and those words land on
//     the applicant's own application record.
//
// PERMISSION FAILURES ARE EXPLICIT (CLAUDE.md rule 27). The subtree's route guard
// lets programme MEMBERS in (decision 6), so a learner in a batch can reach this
// URL. Every call here is an RPC that re-checks cohort.manage for itself and
// raises 42501; that becomes an access panel naming who to ask. Nothing redirects,
// and no empty list is ever rendered where a refusal belongs.
//
// NOTHING IS COUNTED HERE. Occupancy, capacity and full-behaviour come from the
// database, which sees every membership; counting them in the browser would need
// cohort.view and would otherwise return 0 — a batch that reads as empty is how
// somebody gets admitted past a full one.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Loader2,
  RefreshCw,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { usePermissions } from '@/hooks/use-permissions';

import {
  SoiReviewService,
  type SoiApplicationRow,
  type SoiReviewBatch,
  type SoiReviewContext,
  type SoiReviewScope,
  type SoiWaitingCount,
} from '@/lib/services/school-of-influence/review-service';

function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? 'Something went wrong.';
}

function isDenied(error: unknown): boolean {
  return (error as { status?: number })?.status === 403;
}

function whenText(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/**
 * The stored token is 'learner' / 'staff' (SoiMemberType, written by S4 from the
 * applicant's own records); the words on screen are JKKN's own vocabulary for
 * the same two groups (.claude/skills/jkkn-terminologies). An unrecognised token
 * is shown as-is rather than guessed at — a reviewer should see what is actually
 * on the record.
 */
function audienceLabel(token: string): string {
  if (token === 'learner') return 'Learner';
  if (token === 'staff') return 'Team member';
  return token;
}

/** Render one stored answer without pretending to know its shape. */
function answerText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Explicit refusal panel — never a redirect, never an empty list (rule 27). */
function AccessPanel({ message }: { message: string }) {
  return (
    <Card className="mt-4 border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> You do not have access
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

const NO_ACCESS_MESSAGE =
  'Reviewing applications for this programme needs the "cohort.manage" permission ' +
  'for the institution that runs it. Ask the programme coordinator or a MyJKKN ' +
  'administrator to grant it, then reload this page.';

interface Props {
  /** The programme event whose applications this screen reviews. */
  eventId: string | null;
}

export function ApplicationsWorkspace({ eventId }: Props) {
  const { userProfile } = usePermissions();

  const [context, setContext] = useState<SoiReviewContext | null>(null);
  const [batches, setBatches] = useState<SoiReviewBatch[]>([]);
  const [waiting, setWaiting] = useState<SoiWaitingCount[]>([]);
  const [rows, setRows] = useState<SoiApplicationRow[]>([]);
  const [scope, setScope] = useState<SoiReviewScope>('awaiting');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);

  /** applicationId → the batch the reviewer picked (staff-assign mode only). */
  const [chosenBatch, setChosenBatch] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SoiApplicationRow | null>(null);
  const [reason, setReason] = useState('');
  /**
   * A3/A7 — the application and the full batch a coordinator has asked to accept
   * into, held here until they confirm they mean to go over the limit. Nothing
   * is sent while this is set.
   */
  const [overLimit, setOverLimit] = useState<{
    row: SoiApplicationRow;
    batch: SoiReviewBatch;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setDenied(null);
    try {
      const ctx = await SoiReviewService.getContext(eventId);
      setContext(ctx);

      // The verdict comes back as a value, not an exception, so the refusal is
      // rendered as a sentence rather than as a blank screen.
      if (!ctx.can_review) {
        setDenied(NO_ACCESS_MESSAGE);
        setRows([]);
        setBatches([]);
        setWaiting([]);
        return;
      }

      const [batchRows, applicationRows, waitingRows] = await Promise.all([
        SoiReviewService.listBatches(eventId),
        SoiReviewService.listApplications(eventId, scope),
        SoiReviewService.listWaitingCounts(eventId),
      ]);
      setBatches(batchRows);
      setRows(applicationRows);
      setWaiting(waitingRows);
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
      setRows([]);
      setBatches([]);
      setWaiting([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reviewerPicksBatch = context?.batch_choice_mode === 'staff_assign';

  /**
   * A3 — FULL batches stay in the picker, clearly marked. They used to be
   * filtered out, which made an over-limit accept unreachable from the screen at
   * all. They are selectable now, but choosing one routes through the
   * confirmation below rather than straight to the database.
   */
  const openBatches = useMemo(() => batches.filter((b) => !b.is_full), [batches]);

  /** Waiting-list numbers for one batch (A7). */
  const waitingFor = useCallback(
    (cohortId: string | null | undefined) =>
      waiting.find((w) => w.cohort_id === cohortId) ?? null,
    [waiting]
  );

  const doAccept = useCallback(
    async (row: SoiApplicationRow, overrideCapacity: boolean) => {
      setBusyId(row.application_id);
      try {
        const outcome = await SoiReviewService.accept({
          applicationId: row.application_id,
          // Under participant-choose the database uses the applicant's own
          // choice and refuses a different one, so sending nothing is correct.
          batchCohortId: reviewerPicksBatch
            ? (chosenBatch[row.application_id] ?? null)
            : null,
          joinedBy: userProfile?.id ?? null,
          overrideCapacity,
        });
        // An over-limit accept is never reported as an ordinary one.
        if (outcome.capacityOverridden) toast.warning(outcome.message);
        else toast.success(outcome.message);
        await refresh();
      } catch (error) {
        if (isDenied(error)) setDenied(messageOf(error));
        else toast.error(messageOf(error));
      } finally {
        setBusyId(null);
      }
    },
    [chosenBatch, refresh, reviewerPicksBatch, userProfile?.id]
  );

  /**
   * The batch this accept would land in — the one the reviewer picked under
   * staff-assign, or the one the applicant asked for under participant-choose.
   * Resolved here so the full-batch warning is driven by the SAME batch the
   * database will use, not by whichever one happens to be on screen.
   */
  const targetBatchFor = useCallback(
    (row: SoiApplicationRow): SoiReviewBatch | null => {
      const id = reviewerPicksBatch
        ? chosenBatch[row.application_id]
        : row.requested_batch_id;
      return batches.find((b) => b.cohort_id === id) ?? null;
    },
    [batches, chosenBatch, reviewerPicksBatch]
  );

  const handleAccept = useCallback(
    async (row: SoiApplicationRow) => {
      const target = targetBatchFor(row);
      // A7 — a full batch must be confirmed, with the waiting list in view,
      // before anything is sent. Proceeding is allowed; doing it unknowingly is
      // not.
      if (target?.is_full) {
        setOverLimit({ row, batch: target });
        return;
      }
      await doAccept(row, false);
    },
    [doAccept, targetBatchFor]
  );

  const handleReject = useCallback(async () => {
    if (!rejecting) return;
    setBusyId(rejecting.application_id);
    try {
      const outcome = await SoiReviewService.reject({
        applicationId: rejecting.application_id,
        reason,
      });
      toast.success(outcome.message);
      setRejecting(null);
      setReason('');
      await refresh();
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
    } finally {
      setBusyId(null);
    }
  }, [refresh, rejecting, reason]);

  // ── Shell states ──────────────────────────────────────────────────────────

  if (!eventId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Pick a programme</CardTitle>
          <CardDescription>
            This screen reviews applications for one School of Influence programme.
            Open it from the programme&rsquo;s batch admin so it knows which one, or add
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">?event=</code>
            and the programme&rsquo;s event id to the address.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (denied) return <AccessPanel message={denied} />;

  if (loading && rows.length === 0 && !context) {
    return <Skeleton className="mt-4 h-64 w-full rounded-xl" />;
  }

  // ── The queue ─────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {context?.event_name ?? 'School of Influence'} — applications
          </h2>
          <p className="text-sm text-muted-foreground">
            {reviewerPicksBatch
              ? 'This programme is set so a coordinator assigns the batch. Choose one before accepting.'
              : 'This programme lets applicants choose their own batch. Accepting confirms the batch they asked for.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as SoiReviewScope)}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="awaiting">
                Awaiting review ({context?.awaiting_count ?? 0})
              </SelectItem>
              <SelectItem value="decided">
                Already decided ({context?.decided_count ?? 0})
              </SelectItem>
              <SelectItem value="all">Everyone who applied</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Places left, counted by the database — the same numbers the accept
          path enforces, so the screen cannot promise a seat that is gone. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" /> Batches
          </CardTitle>
          <CardDescription>
            Batches run at the same time. A full batch has to be confirmed before
            anybody goes over its limit, and going over is recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No batch has been set up for this programme yet, so there is nowhere to
              accept anybody. Create one from the batch admin first.
            </p>
          ) : (
            batches.map((b) => (
              <div
                key={b.cohort_id}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
              >
                <span className="text-sm font-medium">{b.batch_name}</span>
                <Badge
                  variant={b.accepting_now ? 'secondary' : 'outline'}
                  className="text-[10px] font-normal"
                >
                  {b.is_full
                    ? `Full — ${b.occupancy} of ${b.capacity}`
                    : `${b.capacity - b.occupancy} of ${b.capacity} places left`}
                </Badge>
                {!b.intake_open && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Applications closed
                  </Badge>
                )}
                {/* A7 — say how many are waiting, wherever the batch is shown. */}
                {(waitingFor(b.cohort_id)?.waiting_total ?? 0) > 0 && (
                  <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                    <Users className="h-3 w-3" />
                    {waitingFor(b.cohort_id)!.waiting_total} waiting
                  </Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              {scope === 'awaiting'
                ? 'Nothing is waiting for you'
                : scope === 'decided'
                  ? 'Nothing has been decided yet'
                  : 'Nobody has applied yet'}
            </CardTitle>
            <CardDescription>
              {scope === 'awaiting'
                ? 'Every application to this programme has been dealt with. New ones will appear here as soon as somebody applies.'
                : 'Applications will show up here once a coordinator has accepted or turned one down.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const awaiting = SoiReviewService.isAwaitingReview(row.application_status);
            const busy = busyId === row.application_id;
            const picked = chosenBatch[row.application_id];
            const canAccept = awaiting && (!reviewerPicksBatch || !!picked);

            return (
              <Card key={row.application_id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {row.applicant_name ?? 'Unnamed applicant'}
                      </CardTitle>
                      <CardDescription className="space-x-2">
                        <span>{row.applicant_email ?? 'no address on record'}</span>
                        {row.institution_name && <span>· {row.institution_name}</span>}
                        <span>· applied {whenText(row.submitted_at)}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.audiences.map((a) => (
                        <Badge key={a} variant="outline" className="text-[10px] font-normal">
                          {audienceLabel(a)}
                        </Badge>
                      ))}
                      <Badge
                        variant={awaiting ? 'secondary' : 'outline'}
                        className="text-[10px] font-normal"
                      >
                        {SoiReviewService.labelFor(row.application_status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Batch: </span>
                    {row.requested_batch_name ? (
                      <span className="font-medium">{row.requested_batch_name}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        none chosen — a coordinator assigns one
                      </span>
                    )}
                  </p>

                  {row.answers.length > 0 && (
                    <dl className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                      {row.answers.map((a) => (
                        <div key={a.key} className="space-y-0.5">
                          <dt className="text-xs text-muted-foreground">{a.label}</dt>
                          <dd className="text-sm">{answerText(a.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {/* The decision, once made — including the exact words the
                      applicant is shown. A reviewer must be able to see what was
                      said in their name. */}
                  {row.decision && (
                    <div
                      className={`rounded-md border p-3 text-sm ${
                        row.decision === 'accepted'
                          ? 'border-green-200 bg-green-50 text-green-900'
                          : 'border-red-200 bg-red-50 text-red-900'
                      }`}
                    >
                      <p className="font-medium">
                        {row.decision === 'accepted' ? 'Accepted' : 'Not accepted'}
                        {row.decided_by_name ? ` by ${row.decided_by_name}` : ''} ·{' '}
                        {whenText(row.decided_at)}
                      </p>
                      {row.decision_reason && (
                        <p className="mt-1">
                          Reason shown to the applicant: &ldquo;{row.decision_reason}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {awaiting && (
                    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                      {reviewerPicksBatch && (
                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`batch-${row.application_id}`}>
                            Batch
                          </Label>
                          <Select
                            value={picked ?? ''}
                            onValueChange={(v) =>
                              setChosenBatch((prev) => ({ ...prev, [row.application_id]: v }))
                            }
                          >
                            <SelectTrigger
                              id={`batch-${row.application_id}`}
                              className="h-9 w-[220px]"
                            >
                              <SelectValue placeholder="Choose a batch" />
                            </SelectTrigger>
                            <SelectContent>
                              {batches.length === 0 ? (
                                <SelectItem value="__none" disabled>
                                  No batch has been set up yet
                                </SelectItem>
                              ) : (
                                /* Full batches are listed and selectable (A3) —
                                   picking one leads to the over-limit
                                   confirmation, not straight to an accept. */
                                batches.map((b) => (
                                  <SelectItem key={b.cohort_id} value={b.cohort_id}>
                                    {b.batch_name} —{' '}
                                    {b.is_full
                                      ? `FULL, ${b.occupancy} of ${b.capacity}`
                                      : `${b.capacity - b.occupancy} of ${b.capacity} left`}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <Button size="sm" disabled={!canAccept || busy} onClick={() => void handleAccept(row)}>
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : reviewerPicksBatch ? (
                          <UserCheck className="mr-1.5 h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        )}
                        {reviewerPicksBatch ? 'Accept into batch' : 'Confirm their batch'}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRejecting(row);
                          setReason('');
                        }}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" /> Turn down
                      </Button>

                      {reviewerPicksBatch && !picked && (
                        <p className="text-xs text-muted-foreground">
                          Choose a batch first.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* A3 + A7 — the batch is full. Say so in words, say how many people are
          already waiting, and make going over the limit a separate, deliberate
          click. Proceeding is allowed; the database records who did it. */}
      <Dialog open={!!overLimit} onOpenChange={(open) => !open && setOverLimit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {overLimit?.batch.batch_name} is full
            </DialogTitle>
            <DialogDescription>
              This exceeds the batch limit of {overLimit?.batch.capacity}. It already
              holds {overLimit?.batch.occupancy} of {overLimit?.batch.capacity} places,
              and accepting {overLimit?.row.applicant_name ?? 'this applicant'} puts it
              over.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {(() => {
              const w = waitingFor(overLimit?.batch.cohort_id);
              const total = w?.waiting_total ?? 0;
              if (total === 0) {
                return (
                  <p className="text-muted-foreground">
                    Nobody is on the waiting list for this programme.
                  </p>
                );
              }
              return (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <Users className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {total === 1
                      ? '1 person is already on the waiting list'
                      : `${total} people are already on the waiting list`}{' '}
                    for this programme. Accepting somebody now puts them ahead of
                    everyone waiting.
                  </p>
                </div>
              );
            })()}

            {openBatches.length > 0 && (
              <p className="text-muted-foreground">
                These batches still have room:{' '}
                {openBatches.map((b) => b.batch_name).join(', ')}.
              </p>
            )}

            <p className="text-muted-foreground">
              If you go ahead, your name and this batch are recorded against the
              override.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverLimit(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!busyId}
              onClick={() => {
                const pending = overLimit;
                setOverLimit(null);
                if (pending) void doAccept(pending.row, true);
              }}
            >
              {busyId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Accept over the limit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* D12 — the coordinator writes the actual reason, and the applicant is
          shown exactly what is typed here. */}
      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Turn down {rejecting?.applicant_name ?? 'this application'}
            </DialogTitle>
            <DialogDescription>
              {context?.rejection_reason_required
                ? 'Write why. The applicant is shown exactly these words, so make them something the person can act on.'
                : 'You can add a reason. If you do, the applicant is shown exactly these words.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="soi-reject-reason">Reason</Label>
            <Textarea
              id="soi-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. This round is for second-year and above; please apply again next intake."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !!busyId || (!!context?.rejection_reason_required && reason.trim().length === 0)
              }
              onClick={() => void handleReject()}
            >
              {busyId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Turn down and tell them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
