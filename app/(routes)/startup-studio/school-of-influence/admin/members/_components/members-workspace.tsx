'use client';

// School of Influence — the batch roster, and the screen a place is closed from.
//
// A1  Removal is SOFT and it is RECORDED. fn_soi_remove_member has enforced
//     "you may only take somebody out WITH a written reason" since 2026-08-23,
//     and SoiBatchService.removeMember has wrapped it since — with no screen
//     anywhere that drives either. This is that screen. The reason is required
//     in the form as well as in the database, so a coordinator is told what is
//     missing before a round trip, not after one.
// A1  The row is KEPT. 'removed' is the spine's archived-equivalent terminal
//     (cohort-core/lifecycle.ts) and nothing is deleted, so closed places stay
//     on this list with the reason that closed them. Hiding them would make a
//     screen that promises "the record stays" show a list where it plainly did
//     not, and would quietly bury the audit trail the decision exists to build.
// A6  A batch is a label. Somebody appointed to coordinate one batch may act on
//     its siblings, which is why the verdict below asks the database rather than
//     inferring anything from a permission key.
//
// PERMISSION FAILURES ARE EXPLICIT (CLAUDE.md rule 27). The subtree's route
// guard lets programme MEMBERS in (decision 6), so a learner who holds a place
// can reach this URL. SoiBatchService.listMembers therefore asks the database
// for a verdict BEFORE it reads a single name, and a refusal renders a panel
// that says who to ask. Nothing redirects, and no empty roster is ever shown
// where a refusal belongs — on a table read those two look identical.
//
// NOTHING IS DECIDED HERE. Who may remove somebody is fn_soi_can_manage_batch /
// fn_is_cohort_programme_coordinator, evaluated in the database on every call;
// this file renders whichever answer comes back. There is no capacity claim on
// this screen either — admitting people is the applications queue's job, and two
// screens quoting one limit is how they come to disagree.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardList,
  History,
  Loader2,
  RefreshCw,
  UserMinus,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import {
  SoiBatchService,
  type SoiBatchMember,
  type SoiBatchRoster,
} from '@/lib/services/school-of-influence/batch-service';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';
import type { Cohort, MembershipStatus } from '@/lib/types/cohort-core';

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
      });
}

/**
 * School of Influence writes 'learner' or 'staff' (SoiMemberType), but the
 * spine's own MembershipType also carries the older 'student' and 'team'
 * tokens, and rows written before the rename still hold them. Both are shown in
 * JKKN's vocabulary — a learner is never called a student on screen
 * (.claude/skills/jkkn-terminologies). An unrecognised token is shown as-is
 * rather than guessed at.
 */
function memberTypeLabel(token: string): string {
  if (token === 'learner' || token === 'student') return 'Learner';
  if (token === 'staff' || token === 'team') return 'Team member';
  return token;
}

/**
 * Plain words for the spine's membership statuses. An unknown value is shown
 * raw — a coordinator should see what is actually on the record.
 */
function statusLabel(status: MembershipStatus | string): string {
  switch (status) {
    case 'invited':
      return 'Invited';
    case 'enrolled':
      return 'Enrolled';
    case 'active':
      return 'Taking part';
    case 'paused':
      return 'Paused';
    case 'graduated':
      return 'Finished';
    case 'removed':
      return 'Removed';
    default:
      return String(status);
  }
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
  'You do not have access to manage members here. Managing who holds a place in ' +
  'a School of Influencer batch needs the "cohort.manage" permission for the ' +
  'institution that runs the programme, or an appointment as one of its ' +
  'coordinators. Ask the COO — or a MyJKKN administrator — to grant it, then ' +
  'reload this page.';

interface Props {
  /** The programme event whose batches this screen lists. */
  eventId: string | null;
}

export function MembersWorkspace({ eventId }: Props) {
  const [batches, setBatches] = useState<Cohort[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<SoiBatchRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  // A read that FAILED must never fall through to the empty state. "No learner
  // has been accepted yet" and "the roster could not be loaded" look identical
  // from an empty array, and only one of them is true.
  const [problem, setProblem] = useState<string | null>(null);

  const [removing, setRemoving] = useState<SoiBatchMember | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Loads ─────────────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setDenied(null);
    try {
      const rows = await SoiBatchService.listBatches(eventId);
      setBatches(rows);
      setSelectedId((current) =>
        current && rows.some((b) => b.id === current) ? current : (rows[0]?.id ?? null)
      );
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
      setBatches([]);
    } finally {
      setBatchesLoaded(true);
      setLoading(false);
    }
  }, [eventId]);

  const loadRoster = useCallback(async () => {
    if (!selectedId) {
      setRoster(null);
      return;
    }
    setLoading(true);
    setDenied(null);
    setProblem(null);
    try {
      const next = await SoiBatchService.listMembers(selectedId);
      setRoster(next);
      // The verdict comes back as a value, not an exception, so the refusal is
      // rendered as a sentence rather than as a blank roster.
      if (!next.canManage) setDenied(NO_ACCESS_MESSAGE);
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else {
        setProblem(messageOf(error));
        toast.error(messageOf(error));
      }
      setRoster(null);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedId) ?? null,
    [batches, selectedId]
  );

  /** Places that still take up a seat, then the closed ones, as history. */
  const current = useMemo(
    () => (roster?.members ?? []).filter((m) => m.occupiesSeat),
    [roster]
  );
  const closed = useMemo(
    () => (roster?.members ?? []).filter((m) => !m.occupiesSeat),
    [roster]
  );

  const reasonIsBlank = reason.trim().length === 0;

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRemove = useCallback(async () => {
    if (!removing || reason.trim().length === 0) return;
    setBusyId(removing.membershipId);
    try {
      const outcome = await SoiBatchService.removeMember(removing.membershipId, reason);
      toast.success(outcome.message);
      setRemoving(null);
      setReason('');
      await loadRoster();
    } catch (error) {
      if (isDenied(error)) setDenied(messageOf(error));
      else toast.error(messageOf(error));
    } finally {
      setBusyId(null);
    }
  }, [loadRoster, reason, removing]);

  // ── Shell states ──────────────────────────────────────────────────────────

  if (!eventId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Pick a programme</CardTitle>
          <CardDescription>
            This screen lists the people in one School of Influencer programme&rsquo;s
            batches. Open it from the programme&rsquo;s batch admin so it knows which one,
            or add
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">?event=</code>
            and the programme&rsquo;s event id to the address.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (denied) return <AccessPanel message={denied} />;

  // Skeleton until the FIRST roster arrives — not just until the batch list
  // does. Without the `!roster` test the empty state paints for a moment
  // between the two loads, telling the coordinator "nobody is in this batch"
  // before anyone has looked. A refresh keeps the table (roster is non-null)
  // and spins the button instead.
  if (loading && !roster) {
    return <Skeleton className="mt-4 h-64 w-full rounded-xl" />;
  }

  // A read that failed is NOT an empty batch. Say which one it was.
  if (problem) {
    return (
      <Card className="mt-4 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> The batch could not be
            loaded
          </CardTitle>
          <CardDescription>
            {problem} Nobody has been added or removed — this is a reading problem, not
            a change to the batch. Try again, and tell a MyJKKN administrator if it
            keeps happening.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => void loadRoster()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // A batch list that comes back empty has two very different causes, and the
  // difference is not visible from here — an RLS refusal on cohorts reads as
  // zero rows exactly like a programme with no batches. So say both, and say
  // who to ask (rule 27), rather than assert the cheerful one.
  if (batchesLoaded && batches.length === 0) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">No batch is showing here</CardTitle>
          <CardDescription>
            Either this programme has no batch yet — create one from the batch admin
            first — or your account cannot see its batches, which needs the
            &ldquo;cohort.view&rdquo; permission for the institution that runs the
            programme. Ask the COO or a MyJKKN administrator if you expected to see
            one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── The roster ────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Who is in this batch</h2>
          <p className="text-sm text-muted-foreground">
            Taking somebody off a batch closes their place; it does not delete
            anything. The row stays here as history with the reason you write.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedId ?? undefined}
            onValueChange={(v) => setSelectedId(v)}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {soiDisplayName(b.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadRoster()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {roster && !roster.identitiesResolved && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Names could not be
              loaded
            </CardTitle>
            <CardDescription>
              Every place in this batch is listed below, but the directory did not
              answer, so nobody&rsquo;s name is shown. Reload the page before removing
              anyone — you should be able to see who you are acting on.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            {selectedBatch?.name ?? 'Batch'} — {current.length}{' '}
            {current.length === 1 ? 'person holds a place' : 'people hold a place'}
          </CardTitle>
          <CardDescription>
            These are the places that are still open. Everyone here can be taken off
            the batch, and doing so always asks you why.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {current.length === 0 ? (
            // THE STATE THIS SCREEN SHIPS IN. No learner has been accepted into any
            // School of Influence batch yet, so an unexplained empty table would be
            // read as a broken page. Say what is true and point at the one screen
            // that changes it.
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No learner has been accepted into this batch yet, so there is nobody to
                show. A name appears here the moment a coordinator accepts an
                application into it — this list is not something you add to directly.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/startup-studio/school-of-influence/admin/applications?event=${encodeURIComponent(eventId)}`}
                >
                  <ClipboardList className="mr-1.5 h-4 w-4" /> Open the applications
                  queue
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Joined as</TableHead>
                    <TableHead>Standing</TableHead>
                    <TableHead>Since</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.map((m) => (
                    <TableRow key={m.membershipId}>
                      <TableCell>
                        <div className="font-medium">
                          {m.fullName ?? 'Name not on record'}
                        </div>
                        {m.email && (
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {memberTypeLabel(m.memberType)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {statusLabel(m.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {whenText(m.joinedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === m.membershipId}
                          onClick={() => {
                            setRemoving(m);
                            setReason('');
                          }}
                        >
                          <UserMinus className="mr-1.5 h-4 w-4" /> Take off batch
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* A1 — the record stays, and so does the reason. Showing it here is what
          makes "removal is recorded" something a coordinator can actually read
          back, rather than a promise buried in an audit table. */}
      {closed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" /> Closed places (
              {closed.length})
            </CardTitle>
            <CardDescription>
              Nothing was deleted. These people held a place in this batch and no
              longer do, with the reason recorded at the time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Standing</TableHead>
                    <TableHead>Closed on</TableHead>
                    <TableHead>Reason given</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closed.map((m) => (
                    <TableRow key={m.membershipId}>
                      <TableCell>
                        <div className="font-medium">
                          {m.fullName ?? 'Name not on record'}
                        </div>
                        {m.email && (
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {statusLabel(m.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>{whenText(m.removal?.removedAt ?? null)}</div>
                        {m.removedByName && (
                          <div className="text-xs">by {m.removedByName}</div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[26rem] text-sm">
                        {m.removal?.reason ? (
                          <span>&ldquo;{m.removal.reason}&rdquo;</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {m.status === 'graduated'
                              ? 'Finished the programme'
                              : 'No reason on this record'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* A1 — the reason is MANDATORY, and it is blocked in the form rather than
          only by the 400 the service already throws. A coordinator should be told
          what is missing before a round trip, not after one. */}
      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Take {removing?.fullName ?? 'this person'} off{' '}
              {selectedBatch?.name ?? 'this batch'}
            </DialogTitle>
            <DialogDescription>
              Their place is closed, not deleted. The record stays in this batch as
              history, and the words you write here are kept on it along with your
              name and today&rsquo;s date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="soi-remove-reason">Why are they being taken off?</Label>
            <Textarea
              id="soi-remove-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. Asked to step out for this round because of a placement schedule clash; welcome back next intake."
            />
            <p className="text-xs text-muted-foreground">
              {reasonIsBlank
                ? 'A reason is required. Write one before you can remove somebody.'
                : 'Anyone reviewing this batch later will read exactly these words.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!busyId || reasonIsBlank}
              onClick={() => void handleRemove()}
            >
              {busyId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Remove and record the reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
