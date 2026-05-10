// ============================================================================
// HR — My Shift (T1.6 Phase 2a foundation; Phase 2b adds swap workflow)
// Updated: 2026-05-10.
//
// Employee read-only view of their current shift assignment + Phase 2b swap
// workflow surfaces:
//   1. Current shift card (Phase 2a)
//   2. "Request swap" dialog — functional in Phase 2b
//   3. Incoming swap requests (where I'm the named counterparty) — Option B
//      from spec (single page surface, no /hr/shifts/incoming-swaps page)
//   4. My outgoing swap requests (last 10) with cancel button for active ones
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useAcceptSwapRequest,
  useCancelSwapRequest,
  useShiftAssignment,
  useSubmitSwapRequest,
  useSwapRequestsAsCounterparty,
  useSwapRequestsAsRequester,
} from '@/hooks/hr/use-shifts';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  SWAP_STATUS_LABEL,
  type HRShiftSwapRequestWithStaff,
  type HRShiftSwapStatus,
} from '@/types/hr-shifts';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusVariant(status: HRShiftSwapStatus):
  'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'counterparty_accepted':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'approved':
      return 'outline';
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Swap Request Dialog
// ---------------------------------------------------------------------------
function RequestSwapDialog({
  staffId,
  assignmentId,
  open,
  onOpenChange,
}: {
  staffId: string;
  assignmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = createClientSupabaseClient();
  const submit = useSubmitSwapRequest();
  const [swapDate, setSwapDate] = useState<string>(isoDatePlusDays(1));
  const [counterpartyStaffId, setCounterpartyStaffId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [resolving, setResolving] = useState(false);

  const today = todayIso();
  const maxDate = isoDatePlusDays(30);

  const reset = () => {
    setSwapDate(isoDatePlusDays(1));
    setCounterpartyStaffId('');
    setReason('');
  };

  const onSubmit = async () => {
    if (!swapDate || swapDate < today) {
      toast.error('Pick a swap date today or later.');
      return;
    }
    if (swapDate > maxDate) {
      toast.error('Swap date must be within the next 30 days.');
      return;
    }

    setResolving(true);
    try {
      // Resolve counterparty's active assignment if a counterparty was named.
      let cpAssignmentId: string | null = null;
      const cpStaffId = counterpartyStaffId.trim() || null;
      if (cpStaffId) {
        if (cpStaffId === staffId) {
          toast.error('Cannot swap with yourself.');
          setResolving(false);
          return;
        }
        const { data: cpAssignments, error: cpErr } = await supabase
          .from('hr_shift_assignments')
          .select('id')
          .eq('staff_id', cpStaffId)
          .lte('effective_from', swapDate)
          .or(`effective_until.is.null,effective_until.gte.${swapDate}`)
          .order('effective_from', { ascending: false })
          .limit(1);
        if (cpErr) {
          toast.error(`Could not look up counterparty's shift: ${cpErr.message}`);
          setResolving(false);
          return;
        }
        const found = (cpAssignments ?? [])[0] as { id: string } | undefined;
        if (!found) {
          toast.error('Counterparty has no active shift on that date.');
          setResolving(false);
          return;
        }
        cpAssignmentId = found.id;
      }

      await submit.mutateAsync({
        requester_assignment_id: assignmentId,
        requester_staff_id: staffId,
        counterparty_assignment_id: cpAssignmentId,
        counterparty_staff_id: cpStaffId,
        swap_date: swapDate,
        reason: reason.trim() || null,
      });
      toast.success('Swap request filed.');
      reset();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to file swap request.');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a shift swap</DialogTitle>
          <DialogDescription className="text-xs">
            File a swap with a colleague. The counterparty must accept; HR
            reviews after that. Open swaps (no counterparty named) go to HR
            directly — useful for swap-to-day-off scenarios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="swap-date">Swap date</Label>
            <Input
              id="swap-date"
              type="date"
              min={today}
              max={maxDate}
              value={swapDate}
              onChange={(e) => setSwapDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Within the next 30 days.
            </p>
          </div>

          <div>
            <Label htmlFor="cp-staff-id">Counterparty staff ID (optional)</Label>
            <Input
              id="cp-staff-id"
              type="text"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={counterpartyStaffId}
              onChange={(e) => setCounterpartyStaffId(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank for an open swap (HR reviews directly). Picker UI
              comes in a future phase — paste the staff UUID for now.
            </p>
          </div>

          <div>
            <Label htmlFor="swap-reason">Reason (optional)</Label>
            <Textarea
              id="swap-reason"
              placeholder="Family event, medical, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={resolving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={resolving}>
            {resolving ? 'Filing…' : 'File swap request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Incoming swap requests (where I'm the named counterparty) — Option B inline.
// ---------------------------------------------------------------------------
function IncomingSwapsSection({ staffId }: { staffId: string }) {
  const { data, isLoading, error } = useSwapRequestsAsCounterparty(staffId);
  const accept = useAcceptSwapRequest();

  // Only surface incoming items still actionable.
  const actionable = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => r.status === 'pending');
  }, [data]);

  // Past requests where I was the counterparty (history).
  const history = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => r.status !== 'pending').slice(0, 5);
  }, [data]);

  const onAccept = async (row: HRShiftSwapRequestWithStaff) => {
    try {
      await accept.mutateAsync(row.id);
      toast.success('Swap accepted. HR will review next.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept swap.');
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Loading incoming swap requests…
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="border-destructive/30 p-4 text-sm">
        Could not load incoming swap requests: {error instanceof Error ? error.message : 'Unknown error'}
      </Card>
    );
  }
  if (actionable.length === 0 && history.length === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Swap requests for you</h2>
        <p className="text-xs text-muted-foreground">
          Colleagues asking to swap shifts with you. Accept and HR will review next.
        </p>
      </div>
      <div className="space-y-3">
        {actionable.map((row) => (
          <div key={row.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div>
                  <span className="font-medium">{row.requester_name ?? 'A colleague'}</span>{' '}
                  wants to swap shifts on{' '}
                  <span className="font-mono">{row.swap_date}</span>
                </div>
                {row.reason && (
                  <div className="text-xs text-muted-foreground">
                    Reason: {row.reason}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Filed {row.requested_at.slice(0, 10)}
                </div>
              </div>
              <Button size="sm" onClick={() => onAccept(row)} disabled={accept.isPending}>
                {accept.isPending ? 'Accepting…' : 'Accept'}
              </Button>
            </div>
          </div>
        ))}
        {history.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {history.length} past request{history.length === 1 ? '' : 's'} where you were the counterparty
            </summary>
            <div className="mt-2 space-y-2">
              {history.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-xs">
                  <span>
                    {row.requester_name ?? '—'} · {row.swap_date}
                  </span>
                  <Badge variant={statusVariant(row.status)} className="capitalize">
                    {SWAP_STATUS_LABEL[row.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// My outgoing swap requests (last 10).
// ---------------------------------------------------------------------------
function MyOutgoingSwapsSection({ staffId }: { staffId: string }) {
  const { data, isLoading, error } = useSwapRequestsAsRequester(staffId);
  const cancel = useCancelSwapRequest();

  const onCancel = async (row: HRShiftSwapRequestWithStaff) => {
    try {
      await cancel.mutateAsync(row.id);
      toast.success('Swap request cancelled.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel swap request.');
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Loading your swap requests…
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="border-destructive/30 p-4 text-sm">
        Could not load your swap requests: {error instanceof Error ? error.message : 'Unknown error'}
      </Card>
    );
  }

  const recent = (data ?? []).slice(0, 10);
  if (recent.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        You haven&apos;t filed any swap requests yet.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">My swap requests</h2>
        <p className="text-xs text-muted-foreground">
          Last {recent.length} request{recent.length === 1 ? '' : 's'} you&apos;ve filed.
        </p>
      </div>
      <div className="space-y-2">
        {recent.map((row) => {
          const cancellable =
            row.status === 'pending' || row.status === 'counterparty_accepted';
          return (
            <div key={row.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div>
                    Swap on <span className="font-mono">{row.swap_date}</span>
                    {row.counterparty_name ? (
                      <> with <span className="font-medium">{row.counterparty_name}</span></>
                    ) : (
                      <span className="italic text-muted-foreground"> (open swap)</span>
                    )}
                  </div>
                  {row.reason && (
                    <div className="text-xs text-muted-foreground">
                      Reason: {row.reason}
                    </div>
                  )}
                  {row.hr_review_notes && (
                    <div className="text-xs text-muted-foreground">
                      HR notes: {row.hr_review_notes}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={statusVariant(row.status)} className="capitalize">
                    {SWAP_STATUS_LABEL[row.status]}
                  </Badge>
                  {cancellable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCancel(row)}
                      disabled={cancel.isPending}
                    >
                      {cancel.isPending ? 'Cancelling…' : 'Cancel'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MyShiftPage() {
  const { profile } = useAuth();
  const supabase = createClientSupabaseClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffLookupError, setStaffLookupError] = useState<string | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);

  // Resolve current user's staff.id from staff.profile_id = profile.id.
  useEffect(() => {
    if (!profile?.id) {
      setStaffId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('id')
          .eq('profile_id', profile.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setStaffLookupError(error.message);
          setStaffId(null);
          return;
        }
        setStaffLookupError(null);
        setStaffId((data as { id: string } | null)?.id ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          setStaffLookupError(e instanceof Error ? e.message : 'Lookup failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, supabase]);

  const { data: assignment, isLoading, error } = useShiftAssignment(staffId ?? undefined);

  return (
    <ContentLayout title="My Shift">
      <div className="space-y-6">
        {!profile?.id ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Sign in to view your shift assignment.
          </Card>
        ) : staffLookupError ? (
          <Card className="border-destructive/30 p-6 text-sm">
            <div className="font-medium">Could not load your staff record.</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {staffLookupError}
            </div>
          </Card>
        ) : !staffId ? (
          <Card className="p-6 text-sm text-muted-foreground">
            We could not find a staff record linked to your account. Contact HR
            if you believe this is wrong.
          </Card>
        ) : isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Loading your shift…
          </Card>
        ) : error ? (
          <Card className="border-destructive/30 p-6 text-sm">
            <div className="font-medium">Could not load your shift.</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </Card>
        ) : !assignment ? (
          <Card className="p-6 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">No active shift</div>
            <div className="mt-1">
              You don&apos;t have a shift assignment right now. Contact HR if
              you expected one.
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Current shift
                  </div>
                  <div className="mt-1 text-xl font-semibold">
                    {assignment.template?.template_name ?? 'Custom hours'}
                  </div>
                  {assignment.template?.template_code && (
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {assignment.template.template_code}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Hours
                    </div>
                    <div className="mt-1 font-mono text-sm">
                      {assignment.effective.start_time.slice(0, 5)} –{' '}
                      {assignment.effective.end_time.slice(0, 5)}
                    </div>
                    {assignment.effective.source !== 'template' && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        ({assignment.effective.source})
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Effective from
                    </div>
                    <div className="mt-1 text-sm">{assignment.effective_from}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Effective until
                    </div>
                    <div className="mt-1 text-sm">
                      {assignment.effective_until ?? (
                        <span className="text-muted-foreground">Ongoing</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pattern
                    </div>
                    <div className="mt-1 text-sm">
                      {assignment.rotation_weeks === 1
                        ? 'Single-week'
                        : `${assignment.rotation_weeks}-week rotation`}
                    </div>
                  </div>

                  {assignment.template?.category && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Category
                      </div>
                      <div className="mt-1 text-sm capitalize">
                        {assignment.template.category}
                      </div>
                    </div>
                  )}
                </div>

                {assignment.notes && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Notes
                    </div>
                    <div className="mt-1">{assignment.notes}</div>
                  </div>
                )}

                <div className="flex items-center gap-3 border-t pt-4">
                  <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">Request swap</Button>
                    </DialogTrigger>
                  </Dialog>
                  {staffId && (
                    <RequestSwapDialog
                      staffId={staffId}
                      assignmentId={assignment.id}
                      open={swapDialogOpen}
                      onOpenChange={setSwapDialogOpen}
                    />
                  )}
                  <span className="text-xs text-muted-foreground">
                    Counterparty must accept; HR reviews next.
                  </span>
                </div>
              </div>
            </Card>

            {/* Phase 2b: Incoming + outgoing swap requests. */}
            <IncomingSwapsSection staffId={staffId} />
            <MyOutgoingSwapsSection staffId={staffId} />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
