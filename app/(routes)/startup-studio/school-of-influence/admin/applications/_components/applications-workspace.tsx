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
//     When the programme keeps a waiting list instead of turning people away,
//     the people on it appear here — per batch, oldest first, with when they
//     joined — and a coordinator promotes somebody by ACCEPTING them, which is
//     the same path as any other acceptance (including the A3/A7 full-batch
//     confirmation below). Nothing is promoted automatically: an application on
//     the waiting list has never been read by anybody, and this programme
//     admits people by decision (D3), not by queue order.
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
  ClipboardList,
  ListOrdered,
  Loader2,
  RefreshCw,
  UserCheck,
  Users,
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

import { ApplicationsTable, audienceLabel, whenParts } from './applications-table';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';
import {
  SoiReviewService,
  type SoiApplicationRow,
  type SoiReviewBatch,
  type SoiReviewContext,
  type SoiReviewScope,
  type SoiWaitingCount,
  type SoiWaitingListEntry,
} from '@/lib/services/school-of-influence/review-service';

function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? 'Something went wrong.';
}

function isDenied(error: unknown): boolean {
  return (error as { status?: number })?.status === 403;
}

// whenText / audienceLabel / answerText moved to applications-table.tsx along
// with the per-applicant rendering they existed for. They are not re-exported:
// the table is their only caller, and a shared copy here would be a second
// definition of JKKN's own vocabulary waiting to drift from it.

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
  /** D5 — who is on the waiting list, in the order the database read it. */
  const [waitingList, setWaitingList] = useState<SoiWaitingListEntry[]>([]);
  const [scope, setScope] = useState<SoiReviewScope>('awaiting');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  /** Bumped to make ApplicationsTable refetch after a decision lands. */
  const [tableRefetchKey, setTableRefetchKey] = useState(0);

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
        setBatches([]);
        setWaiting([]);
        setWaitingList([]);
        return;
      }

      // The APPLICATION rows are not fetched here — ApplicationsTable owns that
      // call, so the table's own search, sort and pagination drive it. This
      // refresh covers everything AROUND the queue (the batch strip, the waiting
      // counts, the waiting list itself, the scope tallies) and then bumps the
      // table's refetch key so they all stay in step after a decision.
      const [batchRows, waitingRows, waitingListRows] = await Promise.all([
        SoiReviewService.listBatches(eventId),
        SoiReviewService.listWaitingCounts(eventId),
        SoiReviewService.listWaitingList(eventId),
      ]);
      setBatches(batchRows);
      setWaiting(waitingRows);
      setWaitingList(waitingListRows);
      setTableRefetchKey((k) => k + 1);
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
      setBatches([]);
      setWaiting([]);
      setWaitingList([]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

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

  /**
   * How many places are free across the programme right now, and whether any
   * batch is over its capacity.
   *
   * Both come from the database's own occupancy count, never from anything
   * counted here. Over-capacity is surfaced rather than hidden: two coordinators
   * can accept into the last free seat at the same moment — each one's check
   * passes before the other's enrolment lands — and the honest thing is to name
   * it so somebody moves a person to another batch, not to quietly show 51 of 50.
   */
  const seatsFree = useMemo(
    () => batches.reduce((total, b) => total + Math.max(b.capacity - b.occupancy, 0), 0),
    [batches]
  );
  const overFilled = useMemo(
    () => batches.filter((b) => b.occupancy > b.capacity),
    [batches]
  );

  /** The waiting list, split into the queues the database grouped it into. */
  const waitingGroups = useMemo(() => {
    const groups: { key: string; batchName: string | null; entries: SoiWaitingListEntry[] }[] = [];
    for (const entry of waitingList) {
      const key = entry.requested_batch_id ?? '__unassigned';
      const found = groups.find((g) => g.key === key);
      if (found) found.entries.push(entry);
      else groups.push({ key, batchName: entry.requested_batch_name, entries: [entry] });
    }
    return groups;
  }, [waitingList]);

  /**
   * A waiting-list entry IS an application, so offering a place goes through
   * the same handleAccept as the queue — including the A3/A7 full-batch
   * confirmation. The entry is shaped into the row that handler reads
   * (application_id, requested_batch_id, applicant_name); nothing else on the
   * row is consulted on the accept path.
   */
  const rowForWaitingEntry = useCallback(
    (entry: SoiWaitingListEntry): SoiApplicationRow => ({
      application_id: entry.application_id,
      applicant_name: entry.applicant_name,
      applicant_email: entry.applicant_email,
      profile_id: entry.profile_id,
      institution_name: entry.institution_name,
      audiences: entry.audiences,
      requested_batch_id: entry.requested_batch_id,
      requested_batch_name: entry.requested_batch_name,
      application_status: 'waitlisted',
      submitted_at: entry.joined_waiting_list_at,
      decision: null,
      decision_reason: null,
      decided_at: null,
      decided_by_name: null,
      answers: [],
    }),
    []
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

  /**
   * The three handlers ApplicationsTable is given, and the error reporter.
   *
   * All memoised deliberately. The table builds its columns in a useMemo keyed
   * on these, so an inline arrow here would rebuild every column on every
   * render — which remounts the batch <Select> inside the actions cell and can
   * close the dropdown under a coordinator mid-choice.
   */
  const handleChooseBatch = useCallback((applicationId: string, cohortId: string) => {
    setChosenBatch((prev) => ({ ...prev, [applicationId]: cohortId }));
  }, []);

  const handleAcceptFromTable = useCallback(
    (row: SoiApplicationRow) => {
      void handleAccept(row);
    },
    [handleAccept]
  );

  const handleRejectFromTable = useCallback((row: SoiApplicationRow) => {
    setRejecting(row);
    setReason('');
  }, []);

  const reportError = useCallback((message: string) => {
    toast.error(message);
  }, []);

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

  // Defensive only. The page shell resolves the programme before rendering this
  // workspace, so reaching here means the resolver found none. It used to tell
  // the reader to "add ?event= and the programme's event id to the address" —
  // an instruction none of the coordinators it was shown to could follow, and
  // the platform's own appointment notification linked here without it
  // (BUG-005799 / BUG-005800). No uuid is asked of anybody now.
  if (!eventId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">No programme to review</CardTitle>
          <CardDescription>
            This screen reviews applications for one School of Influencer
            programme, and none was found for you. Open it from the School of
            Influence menu, or ask a coordinator to appoint you.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (denied) return <AccessPanel message={denied} />;

  // Gated on `context` alone now that the table owns the application rows: this
  // skeleton covers the FIRST load, before the review context says whether this
  // person may see anything at all. The table renders its own loading state.
  if (loading && !context) {
    return <Skeleton className="mt-4 h-64 w-full rounded-xl" />;
  }

  // ── The queue ─────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {soiDisplayName(context?.event_name)} — applications
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
                <span className="text-sm font-medium">{soiDisplayName(b.batch_name)}</span>
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

      {/* D5 — the waiting list. Shown only when somebody is actually on it, so a
          programme that turns full-batch applicants away never grows an empty
          card explaining a queue it does not keep. */}
      {waitingList.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="h-4 w-4 text-amber-600" /> Waiting list (
              {waitingList.length})
            </CardTitle>
            <CardDescription>
              These applications were held because every batch they could join was
              full — nobody was turned away. Offer a place by accepting somebody
              below; that is the same acceptance as any other, and nothing is
              promoted on its own. The order is by when each person applied, and a
              coordinator may accept out of it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overFilled.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-medium">More people than places</p>
                <p className="mt-1">
                  {overFilled
                    .map(
                      (b) => `${soiDisplayName(b.batch_name)} holds ${b.occupancy} of ${b.capacity}`
                    )
                    .join('; ')}
                  . Two coordinators can accept into the same last place at the same
                  moment. Move somebody to another batch to put this right.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {seatsFree > 0
                ? `${seatsFree} ${seatsFree === 1 ? 'place is' : 'places are'} free across the batches right now.`
                : 'No place is free in any batch at the moment. Accepting somebody from this list goes over a batch limit, which has to be confirmed separately and is recorded — or raise the capacity of a batch in the programme settings.'}
            </p>

            {waitingGroups.map((group) => (
              <div key={group.key} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.batchName
                    ? `${soiDisplayName(group.batchName)} — ${group.entries.length} waiting`
                    : `No batch chosen — a coordinator assigns one · ${group.entries.length} waiting`}
                </p>
                {group.entries.map((entry) => {
                  const busy = busyId === entry.application_id;
                  const picked = chosenBatch[entry.application_id];
                  const blocked = !!entry.already_placed_batch_name;
                  const canAccept =
                    !blocked && (!reviewerPicksBatch || !!picked) && batches.length > 0;
                  const joined = whenParts(entry.joined_waiting_list_at);

                  return (
                    <div
                      key={entry.application_id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-2.5"
                    >
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {entry.waiting_position} of {entry.waiting_group_size}
                      </Badge>
                      <div className="min-w-[180px] flex-1 space-y-0.5">
                        <p className="text-sm font-medium">
                          {entry.applicant_name ?? 'Unnamed applicant'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.applicant_email ?? 'no address on record'}
                          {entry.institution_name ? ` · ${entry.institution_name}` : ''} · joined
                          the list {joined.day}
                          {joined.time ? `, ${joined.time}` : ''}
                        </p>
                      </div>

                      {entry.audiences.map((a) => (
                        <Badge key={a} variant="outline" className="text-[10px] font-normal">
                          {audienceLabel(a)}
                        </Badge>
                      ))}

                      {blocked ? (
                        // D10 — one place per person per programme. Say so before
                        // the click, not after the database refuses it.
                        <p className="text-xs text-amber-700">
                          Already has a place in {soiDisplayName(entry.already_placed_batch_name)},
                          so they cannot be given a second one. Take them off this list,
                          or move them between batches.
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {reviewerPicksBatch && (
                            <Select
                              value={picked ?? ''}
                              onValueChange={(v) => handleChooseBatch(entry.application_id, v)}
                            >
                              <SelectTrigger className="h-8 w-[220px]">
                                <SelectValue placeholder="Choose a batch" />
                              </SelectTrigger>
                              <SelectContent>
                                {/* A3 — full batches stay listed and marked; picking one
                                    routes through the over-limit confirmation. */}
                                {batches.map((b) => (
                                  <SelectItem key={b.cohort_id} value={b.cohort_id}>
                                    {soiDisplayName(b.batch_name)} —{' '}
                                    {b.is_full
                                      ? `full (${b.occupancy} of ${b.capacity})`
                                      : `${b.capacity - b.occupancy} of ${b.capacity} left`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Button
                            size="sm"
                            disabled={!canAccept || busy}
                            onClick={() => void handleAccept(rowForWaitingEntry(entry))}
                          >
                            {busy ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <UserCheck className="mr-1.5 h-4 w-4" />
                            )}
                            Offer a place
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* The queue itself. Advanced data table (2026-08-17) — it replaced a
          one-card-per-applicant list that put each person on most of a screen,
          so two applicants could not be compared without scrolling and the
          queue could not be sorted or exported at all.

          Every DECISION still belongs to this file: the table renders the batch
          picker and the two buttons, then hands the original row straight back
          to handleAccept / setRejecting below, so the over-capacity
          confirmation (A3/A7) and the rejection-reason dialog are unchanged and
          unbypassed. The table also renders its own empty state, which is why
          the "nothing is waiting for you" card that used to live here is gone. */}
      <ApplicationsTable
        eventId={eventId}
        scope={scope}
        batches={batches}
        reviewerPicksBatch={reviewerPicksBatch}
        chosenBatch={chosenBatch}
        onChooseBatch={handleChooseBatch}
        busyId={busyId}
        onAccept={handleAcceptFromTable}
        onReject={handleRejectFromTable}
        refetchKey={tableRefetchKey}
        onDenied={setDenied}
        onError={reportError}
      />

      {/* A3 + A7 — the batch is full. Say so in words, say how many people are
          already waiting, and make going over the limit a separate, deliberate
          click. Proceeding is allowed; the database records who did it. */}
      <Dialog open={!!overLimit} onOpenChange={(open) => !open && setOverLimit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {soiDisplayName(overLimit?.batch.batch_name)} is full
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
                {openBatches.map((b) => soiDisplayName(b.batch_name)).join(', ')}.
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
